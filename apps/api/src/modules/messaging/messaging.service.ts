import { Types } from 'mongoose';
import type { MessageCategory } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPatientRelationship, assertPermission, loadEpisode, toObjectId } from '../access/access.service';
import { RecoveryAssignmentModel, UserRoleModel } from '../access/access.models';
import { PatientModel } from '../patients/patient.model';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { CaregiverConsentModel } from '../caregivers/caregiver.models';
import { notify } from '../notifications/notification.service';
import { createAlert } from '../alerts/alert-engine';
import { ConversationModel, MessageModel, type ConversationDocument } from './messaging.models';

const senderKind = (p: Principal) => (p.kind === 'STAFF' ? 'STAFF' : p.kind === 'PATIENT' ? 'PATIENT' : 'CAREGIVER');

async function assertConversationAccess(p: Principal, conv: ConversationDocument, permission: 'messages.read' | 'messages.send') {
  assertPermission(p, permission);
  if (conv.type === 'STAFF') {
    if (p.kind !== 'STAFF' || !conv.participantUserIds.some((u) => String(u) === p.userId)) throw errors.notFound('Conversation');
    return;
  }
  if (!conv.patientId) throw errors.notFound('Conversation');
  await assertPatientRelationship(p, conv.patientId as Types.ObjectId, permission);
}

async function loadConversation(p: Principal, id: string, permission: 'messages.read' | 'messages.send') {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(id)) throw errors.notFound('Conversation');
  const conv = await ConversationModel.findOne({ _id: id, hospitalId });
  if (!conv) throw errors.notFound('Conversation');
  await assertConversationAccess(p, conv, permission);
  return conv;
}

/** Care-team recipients of patient messages: responsible doctor, nurses, coordinator. */
async function careTeamFor(hospitalId: Types.ObjectId, episodeId?: Types.ObjectId | null): Promise<Types.ObjectId[]> {
  if (!episodeId) return [];
  const team = await RecoveryAssignmentModel.find({ hospitalId, episodeId, active: true, role: { $in: ['RESPONSIBLE_DOCTOR', 'RECOVERY_NURSE', 'RECOVERY_COORDINATOR', 'DISCHARGE_NURSE'] } });
  return team.map((t) => t.userId as Types.ObjectId);
}

export async function createConversation(
  p: Principal,
  input: { patientId?: string; episodeId?: string; subject: string; category: MessageCategory; initialMessage: string; participantUserIds?: string[] },
) {
  assertPermission(p, 'messages.send');
  const hospitalId = requireTenant(p);
  let patientId: Types.ObjectId | undefined;
  let episodeId: Types.ObjectId | undefined;

  if (p.kind === 'PATIENT' || p.kind === 'CAREGIVER') {
    const pid = input.patientId ?? (p.kind === 'PATIENT' ? p.patientIds[0] : p.caregiverGrants.find((g) => g.permissions.has('messages.send'))?.patientId);
    if (!pid) throw errors.validation('patientId is required');
    patientId = toObjectId(pid);
    await assertPatientRelationship(p, patientId, 'messages.send');
  } else if (p.kind === 'STAFF') {
    if (input.patientId) {
      patientId = toObjectId(input.patientId);
      const patient = await PatientModel.findOne({ _id: patientId, hospitalId });
      if (!patient) throw errors.notFound('Patient');
      await assertPatientRelationship(p, patientId, 'messages.send');
    }
  } else throw errors.forbidden();

  if (input.episodeId) {
    const ep = await loadEpisode(p, input.episodeId, 'messages.send');
    if (patientId && !ep.patientId.equals(patientId)) throw errors.validation('Episode does not belong to this patient');
    episodeId = ep._id;
    patientId = ep.patientId as Types.ObjectId;
  } else if (patientId) {
    const ep = await RecoveryEpisodeModel.findOne({ hospitalId, patientId, status: { $in: ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD'] } }).sort({ createdAt: -1 });
    episodeId = ep?._id;
  }

  const participants = new Set<string>([p.userId]);
  if (patientId) {
    const patient = await PatientModel.findOne({ _id: patientId, hospitalId }).select('userId');
    if (patient?.userId) participants.add(String(patient.userId));
    for (const u of await careTeamFor(hospitalId, episodeId)) participants.add(String(u));
    if (p.kind === 'CAREGIVER') participants.add(p.userId);
  }
  if (p.kind === 'STAFF' && input.participantUserIds?.length) {
    const valid = await UserRoleModel.find({ hospitalId, userId: { $in: input.participantUserIds }, status: 'ACTIVE' }).select('userId');
    for (const v of valid) participants.add(String(v.userId));
  }

  const conv = await ConversationModel.create({
    hospitalId,
    type: patientId ? 'PATIENT_CARE_TEAM' : 'STAFF',
    patientId,
    episodeId,
    subject: input.subject,
    category: input.category,
    participantUserIds: [...participants].map(toObjectId),
    createdBy: p.userId,
  });
  await sendMessage(p, String(conv._id), { body: input.initialMessage, type: 'TEXT' });
  await audit({ action: 'CONVERSATION_CREATED', resourceType: 'Conversation', resourceId: String(conv._id), patientId: patientId ? String(patientId) : undefined });
  return ConversationModel.findOne({ _id: conv._id, hospitalId });
}

export async function listConversations(p: Principal, q: { patientId?: string; status?: string; assignedToMe?: boolean; page: number; limit: number }) {
  assertPermission(p, 'messages.read');
  const hospitalId = requireTenant(p);
  const filter: Record<string, unknown> = { hospitalId };
  if (p.kind === 'PATIENT') {
    filter.type = 'PATIENT_CARE_TEAM';
    filter.patientId = { $in: p.patientIds.map(toObjectId) };
  } else if (p.kind === 'CAREGIVER') {
    filter.type = 'PATIENT_CARE_TEAM';
    filter.patientId = { $in: p.caregiverGrants.filter((g) => g.permissions.has('messages.read')).map((g) => toObjectId(g.patientId)) };
  } else if (p.kind === 'STAFF') {
    filter.participantUserIds = toObjectId(p.userId);
    if (q.patientId) {
      await assertPatientRelationship(p, toObjectId(q.patientId), 'messages.read');
      delete filter.participantUserIds;
      filter.patientId = toObjectId(q.patientId);
    }
    if (q.assignedToMe) filter.assignedToUserId = toObjectId(p.userId);
  } else throw errors.forbidden();
  if (q.status) filter.status = q.status;

  const [items, total] = await Promise.all([
    ConversationModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName', options: { skipTenantGuard: true } })
      .sort({ lastMessageAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    ConversationModel.countDocuments(filter),
  ]);
  const unread = await MessageModel.aggregate([
    { $match: { hospitalId, conversationId: { $in: items.map((i) => i._id) }, senderId: { $ne: toObjectId(p.userId) }, 'readBy.userId': { $ne: toObjectId(p.userId) } } },
    { $group: { _id: '$conversationId', count: { $sum: 1 } } },
  ]);
  const unreadMap = new Map(unread.map((u: { _id: Types.ObjectId; count: number }) => [String(u._id), u.count]));
  return { items: items.map((i) => ({ ...i.toJSON(), unreadCount: unreadMap.get(String(i._id)) ?? 0 })), meta: pageMeta(q.page, q.limit, total) };
}

export async function getMessages(p: Principal, conversationId: string, q: { page: number; limit: number }) {
  const conv = await loadConversation(p, conversationId, 'messages.read');
  const filter = { hospitalId: conv.hospitalId, conversationId: conv._id };
  const [items, total] = await Promise.all([
    MessageModel.find(filter).populate('senderId', 'firstName lastName').sort({ createdAt: -1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    MessageModel.countDocuments(filter),
  ]);
  // Mark as read.
  await MessageModel.updateMany(
    { ...filter, senderId: { $ne: toObjectId(p.userId) }, 'readBy.userId': { $ne: toObjectId(p.userId) } },
    { $push: { readBy: { userId: toObjectId(p.userId), at: new Date() } } },
  );
  return { conversation: conv, items: items.reverse(), meta: pageMeta(q.page, q.limit, total) };
}

export async function sendMessage(p: Principal, conversationId: string, input: { body: string; type: 'TEXT' | 'CALLBACK_REQUEST'; attachmentIds?: string[]; idempotencyKey?: string }) {
  const conv = await loadConversation(p, conversationId, 'messages.send');
  if (conv.status === 'CLOSED' && p.kind !== 'STAFF') {
    conv.status = 'OPEN'; // patient follow-up re-opens the thread
  }
  if (input.idempotencyKey) {
    const dup = await MessageModel.findOne({ hospitalId: conv.hospitalId, idempotencyKey: input.idempotencyKey });
    if (dup) return dup;
  }
  if (input.type === 'CALLBACK_REQUEST' && p.kind === 'STAFF') throw errors.validation('Call-back requests are made by patients or caregivers');
  const message = await MessageModel.create({
    hospitalId: conv.hospitalId,
    conversationId: conv._id,
    senderId: p.userId,
    senderKind: senderKind(p),
    type: input.type,
    body: input.body,
    attachmentIds: input.attachmentIds,
    idempotencyKey: input.idempotencyKey,
    readBy: [{ userId: toObjectId(p.userId), at: new Date() }],
  });
  if (!conv.participantUserIds.some((u) => String(u) === p.userId)) conv.participantUserIds.push(toObjectId(p.userId));
  conv.lastMessageAt = new Date();
  // Previews are non-clinical labels only (lists may be shown on lock-screen-like surfaces).
  conv.lastMessagePreview = input.type === 'CALLBACK_REQUEST' ? 'Call-back requested' : `New message from ${senderKind(p).toLowerCase()}`;
  if (input.type === 'CALLBACK_REQUEST') conv.callbackRequested = true;
  await conv.save();

  const recipients = conv.participantUserIds.map(String).filter((u) => u !== p.userId);
  for (const userId of recipients) {
    await notify({ userId, hospitalId: conv.hospitalId, template: 'NEW_MESSAGE', data: { conversationId: String(conv._id) }, idempotencyKey: `msg:${String(message._id)}:${userId}` });
  }
  eventBus.emit('message.created', { hospitalId: String(conv.hospitalId), conversationId: String(conv._id), messageId: String(message._id), recipientUserIds: recipients });
  return message;
}

export async function assignConversation(p: Principal, conversationId: string, userId: string) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const conv = await loadConversation(p, conversationId, 'messages.send');
  const member = await UserRoleModel.exists({ hospitalId: conv.hospitalId, userId, status: 'ACTIVE' });
  if (!member) throw errors.validation('Assignee must be staff of this hospital');
  conv.assignedToUserId = toObjectId(userId);
  if (!conv.participantUserIds.some((u) => String(u) === userId)) conv.participantUserIds.push(toObjectId(userId));
  await conv.save();
  await notify({ userId, hospitalId: conv.hospitalId, template: 'NEW_MESSAGE', data: { conversationId }, idempotencyKey: `conv-assign:${conversationId}:${userId}:${Date.now()}` });
  await audit({ action: 'CONVERSATION_ASSIGNED', resourceType: 'Conversation', resourceId: conversationId, metadata: { to: userId } });
  return conv;
}

/** Escalate a conversation into the alert workflow (staff decision). */
export async function escalateConversation(p: Principal, conversationId: string, input: { priority: string; reason: string }) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  assertPermission(p, 'alerts.acknowledge');
  const conv = await loadConversation(p, conversationId, 'messages.read');
  if (!conv.episodeId) throw errors.validation('This conversation is not linked to a recovery episode');
  const episode = await loadEpisode(p, conv.episodeId as Types.ObjectId, 'alerts.read');
  const alert = await createAlert({
    hospitalId: conv.hospitalId,
    episode,
    source: 'MESSAGE',
    sourceRef: { kind: 'Conversation', id: conv._id },
    priority: input.priority,
    title: `Escalated message: ${conv.subject}`,
    summary: input.reason,
    routing: { careTeamRoles: ['RESPONSIBLE_DOCTOR'], acknowledgeWithinMinutes: 60, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 1 },
    dedupeKey: `conv:${conversationId}:${Date.now()}`,
    createdBy: p.userId,
  });
  conv.escalated = true;
  conv.escalatedAlertId = alert?._id;
  await conv.save();
  return { conversation: conv, alert };
}

export async function closeConversation(p: Principal, conversationId: string) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const conv = await loadConversation(p, conversationId, 'messages.send');
  conv.status = 'CLOSED';
  conv.callbackRequested = false;
  await conv.save();
  return conv;
}

/** Caregivers with MESSAGE_CARE_TEAM scope are participants of the patient's threads. */
export async function caregiverCanMessage(hospitalId: Types.ObjectId, patientId: Types.ObjectId, userId: string) {
  return !!(await CaregiverConsentModel.exists({ hospitalId, patientId, caregiverUserId: userId, status: 'ACTIVE', scopes: 'MESSAGE_CARE_TEAM', expiresAt: { $gt: new Date() } }));
}
