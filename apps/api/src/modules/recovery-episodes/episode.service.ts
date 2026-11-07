import { Types, type ClientSession } from 'mongoose';
import { DateTime } from 'luxon';
import {
  EPISODE_CLINICAL_DECISION_STATUSES,
  EPISODE_TRANSITIONS,
  canTransition,
  type CareTeamRole,
  type CreateEpisodeInput,
  type EpisodeStatus,
  type EpisodeTransitionInput,
} from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeListFilter, loadEpisode, loadPatient } from '../access/access.service';
import { RecoveryAssignmentModel, UserRoleModel } from '../access/access.models';
import { DepartmentModel, HospitalModel } from '../hospitals/hospital.models';
import { RecoveryTaskModel, RecoveryPlanModel } from '../recovery-plans/recovery-plan.models';
import { MedicationOrderModel } from '../medications/medication.models';
import { RecoveryEpisodeModel, type RecoveryEpisodeDocument } from './episode.model';

/** Care-team role → staff roles allowed to hold it. */
const CARE_TEAM_ELIGIBILITY: Record<CareTeamRole, string[]> = {
  RESPONSIBLE_DOCTOR: ['DOCTOR', 'MEDICAL_DIRECTOR'],
  DOCTOR: ['DOCTOR', 'MEDICAL_DIRECTOR'],
  DISCHARGE_NURSE: ['DISCHARGE_NURSE'],
  RECOVERY_NURSE: ['RECOVERY_NURSE'],
  RECOVERY_COORDINATOR: ['RECOVERY_COORDINATOR'],
  PHARMACIST: ['PHARMACIST'],
  PHYSIOTHERAPIST: ['PHYSIOTHERAPIST'],
};

async function assertStaffEligible(hospitalId: Types.ObjectId, userId: string, role: CareTeamRole) {
  const m = await UserRoleModel.findOne({ hospitalId, userId, status: 'ACTIVE' });
  if (!m || !m.roles.some((r) => CARE_TEAM_ELIGIBILITY[role].includes(r))) {
    throw errors.validation(`Selected staff member cannot be assigned as ${role.replace(/_/g, ' ').toLowerCase()}`);
  }
}

export async function createEpisode(p: Principal, input: CreateEpisodeInput) {
  assertPermission(p, 'recovery.create');
  const hospitalId = requireTenant(p);
  const patient = await loadPatient(p, input.patientId, 'patients.read');
  if (!(await DepartmentModel.exists({ _id: input.departmentId, hospitalId, active: true }))) {
    throw errors.validation('Department not found in this hospital');
  }
  await assertStaffEligible(hospitalId, input.responsibleDoctorId, 'RESPONSIBLE_DOCTOR');
  const open = await RecoveryEpisodeModel.exists({
    hospitalId,
    patientId: patient._id,
    status: { $in: ['DRAFT', 'DISCHARGE_PENDING', 'ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD'] },
  });
  if (open) throw errors.conflict('This patient already has an open recovery episode');

  const episode = await RecoveryEpisodeModel.create({
    ...input,
    hospitalId,
    patientId: patient._id,
    status: 'DRAFT',
    createdBy: p.userId,
    statusHistory: [{ to: 'DRAFT', changedBy: p.userId, reason: 'Episode created' }],
  });
  await RecoveryAssignmentModel.create({
    hospitalId,
    episodeId: episode._id,
    patientId: patient._id,
    userId: input.responsibleDoctorId,
    role: 'RESPONSIBLE_DOCTOR',
    assignedBy: p.userId,
  });
  // The creator joins the care team so they keep access to what they started.
  if (p.userId !== input.responsibleDoctorId && p.kind === 'STAFF') {
    const creatorRole = p.roles.includes('DISCHARGE_NURSE')
      ? 'DISCHARGE_NURSE'
      : p.roles.includes('RECOVERY_COORDINATOR')
        ? 'RECOVERY_COORDINATOR'
        : p.roles.includes('RECOVERY_NURSE')
          ? 'RECOVERY_NURSE'
          : p.roles.includes('DOCTOR')
            ? 'DOCTOR'
            : undefined;
    if (creatorRole) {
      await RecoveryAssignmentModel.create({ hospitalId, episodeId: episode._id, patientId: patient._id, userId: p.userId, role: creatorRole, assignedBy: p.userId });
    }
  }
  await audit({ action: 'EPISODE_CREATED', resourceType: 'RecoveryEpisode', resourceId: String(episode._id), patientId: String(patient._id) });
  return episode;
}

export async function listEpisodes(
  p: Principal,
  query: { status?: EpisodeStatus; patientId?: string; departmentId?: string; mine?: boolean; page: number; limit: number },
) {
  const filter: Record<string, unknown> = await episodeListFilter(p, 'recovery.read');
  if (query.status) filter.status = query.status;
  if (query.patientId) filter.patientId = new Types.ObjectId(query.patientId);
  if (query.departmentId) filter.departmentId = new Types.ObjectId(query.departmentId);
  if (query.mine && p.kind === 'STAFF') {
    const assigned = await RecoveryAssignmentModel.distinct('episodeId', { hospitalId: requireTenant(p), userId: new Types.ObjectId(p.userId), active: true });
    filter._id = { $in: assigned };
  }
  const [items, total] = await Promise.all([
    RecoveryEpisodeModel.find(filter)
      .select('-statusHistory')
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .populate({ path: 'departmentId', select: 'name code', options: { skipTenantGuard: true } })
      .populate('responsibleDoctorId', 'firstName lastName')
      .sort({ updatedAt: -1 })
      .skip((query.page - 1) * query.limit)
      .limit(query.limit),
    RecoveryEpisodeModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(query.page, query.limit, total) };
}

/** Episode detail incl. care team, current plan, today's task progress. */
export async function getEpisodeDetail(p: Principal, episodeId: string) {
  const episode = await loadEpisode(p, episodeId, 'recovery.read');
  const hospitalId = requireTenant(p);
  const hospital = await HospitalModel.findById(hospitalId).select('timezone');
  const tz = hospital?.timezone ?? 'Africa/Lagos';
  const startOfDay = DateTime.now().setZone(tz).startOf('day');

  const [careTeam, plan, today, medicationCount] = await Promise.all([
    RecoveryAssignmentModel.find({ hospitalId, episodeId: episode._id, active: true }).populate('userId', 'firstName lastName'),
    episode.currentRecoveryPlanId ? RecoveryPlanModel.findOne({ hospitalId, _id: episode.currentRecoveryPlanId }).select('startDate endDate status timezone') : null,
    RecoveryTaskModel.aggregate([
      { $match: { hospitalId, episodeId: episode._id, dueAt: { $gte: startOfDay.toJSDate(), $lt: startOfDay.plus({ days: 1 }).toJSDate() }, status: { $ne: 'CANCELLED' } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
    ]),
    p.permissions.has('medication.read') ? MedicationOrderModel.countDocuments({ hospitalId, episodeId: episode._id, status: 'ACTIVE' }) : Promise.resolve(undefined),
  ]);

  await episode.populate([
    { path: 'patientId', select: 'firstName lastName hospitalPatientRef dateOfBirth sex preferredLanguage', options: { skipTenantGuard: true } },
    { path: 'departmentId', select: 'name code', options: { skipTenantGuard: true } },
    { path: 'responsibleDoctorId', select: 'firstName lastName' },
  ]);
  const counts = Object.fromEntries(today.map((t: { _id: string; count: number }) => [t._id, t.count]));
  const statusHistory = p.kind === 'STAFF' ? episode.statusHistory : undefined;

  return {
    episode: { ...episode.toJSON(), statusHistory },
    careTeam: careTeam.map((a) => ({ id: String(a._id), role: a.role, user: a.userId })),
    plan,
    today: {
      total: Object.values(counts).reduce((a: number, b) => a + (b as number), 0),
      completed: counts.COMPLETED ?? 0,
      pending: counts.PENDING ?? 0,
      missed: counts.MISSED ?? 0,
    },
    activeMedicationCount: medicationCount,
  };
}

export async function updateEpisode(p: Principal, episodeId: string, patch: Record<string, unknown>) {
  const episode = await loadEpisode(p, episodeId, 'recovery.update');
  if (['COMPLETED', 'TRANSFERRED', 'CANCELLED'].includes(episode.status)) throw errors.immutable('Closed episodes cannot be edited');
  episode.set(patch);
  await episode.save();
  await audit({ action: 'EPISODE_UPDATED', resourceType: 'RecoveryEpisode', resourceId: episodeId, patientId: String(episode.patientId), metadata: { fields: Object.keys(patch) } });
  return episode;
}

/**
 * Apply a state-machine transition. Shared by user-initiated and system-initiated
 * changes; `actor === null` marks a system transition (e.g. alert → NEEDS_ATTENTION).
 */
export async function applyTransition(
  episode: RecoveryEpisodeDocument,
  to: EpisodeStatus,
  reason: string,
  actorId: string | null,
  session?: ClientSession,
): Promise<RecoveryEpisodeDocument> {
  const from = episode.status as EpisodeStatus;
  if (from === to) return episode;
  if (!canTransition(EPISODE_TRANSITIONS, from, to)) throw errors.invalidTransition(from, to, 'recovery episode');
  episode.status = to;
  episode.statusHistory.push({ from, to, reason, changedBy: actorId ?? undefined, changedBySystem: actorId === null, at: new Date() });
  await episode.save({ session });
  eventBus.emit('episode.status_changed', {
    hospitalId: String(episode.hospitalId),
    episodeId: String(episode._id),
    patientId: String(episode.patientId),
    from,
    to,
  });
  return episode;
}

export async function transitionEpisode(p: Principal, episodeId: string, input: EpisodeTransitionInput) {
  const episode = await loadEpisode(p, episodeId, 'recovery.update');
  const to = input.toStatus;
  if (to === 'ACTIVE' && episode.status === 'DISCHARGE_PENDING') {
    throw errors.validation('Episodes are activated by approving the discharge plan');
  }
  if (to === 'DISCHARGE_PENDING') throw errors.validation('Submit the discharge plan to move this episode to discharge pending');
  if (to === 'NEEDS_ATTENTION') throw errors.validation('NEEDS_ATTENTION is set automatically by the alert engine');
  if (EPISODE_CLINICAL_DECISION_STATUSES.includes(to)) assertPermission(p, 'recovery.approve');
  if (to === 'TRANSFERRED' && !input.transfer) throw errors.validation('Transfer details are required');

  const hospitalId = requireTenant(p);
  const tz = (await HospitalModel.findById(hospitalId).select('timezone'))?.timezone ?? 'Africa/Lagos';
  const today = DateTime.now().setZone(tz).toISODate()!;

  if (to === 'COMPLETED') episode.actualCompletionDate = today;
  if (to === 'TRANSFERRED' && input.transfer) {
    episode.transfer = { ...input.transfer, transferredAt: new Date(), transferredBy: new Types.ObjectId(p.userId) };
  }
  if (input.extendedReviewDate) episode.expectedReviewDate = input.extendedReviewDate;

  await applyTransition(episode, to, input.reason, p.userId);

  // Closing an episode cancels future pending tasks and closes the recovery plan.
  if (['COMPLETED', 'TRANSFERRED', 'CANCELLED'].includes(to)) {
    await RecoveryTaskModel.updateMany({ hospitalId, episodeId: episode._id, status: 'PENDING' }, { $set: { status: 'CANCELLED' } });
    await RecoveryPlanModel.updateMany({ hospitalId, episodeId: episode._id, status: 'ACTIVE' }, { $set: { status: to === 'COMPLETED' ? 'COMPLETED' : 'CANCELLED' } });
    await MedicationOrderModel.updateMany(
      { hospitalId, episodeId: episode._id, status: 'ACTIVE' },
      { $set: { status: to === 'COMPLETED' ? 'COMPLETED' : 'DISCONTINUED', discontinuedAt: new Date(), discontinuedReason: `Episode ${to.toLowerCase()}` } },
    );
  }
  await audit({
    action: 'EPISODE_STATUS_CHANGED',
    resourceType: 'RecoveryEpisode',
    resourceId: episodeId,
    patientId: String(episode.patientId),
    justification: input.reason,
    metadata: { to, extendedReviewDate: input.extendedReviewDate },
  });
  return episode;
}

export async function assignCareTeam(p: Principal, episodeId: string, input: { userId: string; role: CareTeamRole }) {
  assertPermission(p, 'patients.assign');
  const episode = await loadEpisode(p, episodeId, 'recovery.read');
  const hospitalId = requireTenant(p);
  await assertStaffEligible(hospitalId, input.userId, input.role);
  const existing = await RecoveryAssignmentModel.findOne({ hospitalId, episodeId: episode._id, userId: input.userId, role: input.role, active: true });
  if (existing) return existing;
  if (input.role === 'RESPONSIBLE_DOCTOR') {
    await RecoveryAssignmentModel.updateMany({ hospitalId, episodeId: episode._id, role: 'RESPONSIBLE_DOCTOR', active: true }, { $set: { active: false, endedAt: new Date() } });
    episode.responsibleDoctorId = new Types.ObjectId(input.userId);
    await episode.save();
  }
  const assignment = await RecoveryAssignmentModel.create({
    hospitalId,
    episodeId: episode._id,
    patientId: episode.patientId,
    userId: input.userId,
    role: input.role,
    assignedBy: p.userId,
  });
  await audit({ action: 'CARE_TEAM_ASSIGNED', resourceType: 'RecoveryAssignment', resourceId: String(assignment._id), patientId: String(episode.patientId), metadata: { role: input.role, userId: input.userId } });
  return assignment;
}

export async function removeCareTeamMember(p: Principal, episodeId: string, assignmentId: string) {
  assertPermission(p, 'patients.assign');
  const episode = await loadEpisode(p, episodeId, 'recovery.read');
  const hospitalId = requireTenant(p);
  const a = await RecoveryAssignmentModel.findOne({ _id: assignmentId, hospitalId, episodeId: episode._id, active: true });
  if (!a) throw errors.notFound('Care-team assignment');
  if (a.role === 'RESPONSIBLE_DOCTOR') throw errors.validation('Assign a new responsible doctor instead of removing the current one');
  a.active = false;
  a.endedAt = new Date();
  await a.save();
  await audit({ action: 'CARE_TEAM_REMOVED', resourceType: 'RecoveryAssignment', resourceId: assignmentId, patientId: String(episode.patientId) });
  return a;
}
