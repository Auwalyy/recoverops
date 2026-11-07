import { Types } from 'mongoose';
import {
  ALERT_OPEN_STATUSES,
  ALERT_TRANSITIONS,
  canTransition,
  type AlertStatus,
  type CreateAlertRuleInput,
} from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { eventBus } from '../../events/event-bus';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, episodeScopedFilter, loadEpisode } from '../access/access.service';
import { UserRoleModel } from '../access/access.models';
import { notify } from '../notifications/notification.service';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { applyTransition } from '../recovery-episodes/episode.service';
import { AlertActionModel, AlertAssignmentModel, AlertModel, AlertRuleModel, type AlertDocument } from './alert.models';
import { createAlert } from './alert-engine';

async function loadAlert(p: Principal, alertId: string, permission: 'alerts.read' | 'alerts.acknowledge' | 'alerts.assign' | 'alerts.resolve'): Promise<AlertDocument> {
  assertPermission(p, permission);
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(alertId)) throw errors.notFound('Alert');
  const alert = await AlertModel.findOne({ _id: alertId, hospitalId });
  if (!alert) throw errors.notFound('Alert');
  // Quality officers have hospital-wide alert read for governance; others need episode access.
  await loadEpisode(p, alert.episodeId as Types.ObjectId, 'alerts.read');
  return alert;
}

async function setStatus(p: Principal, alert: AlertDocument, to: AlertStatus, notes?: string): Promise<void> {
  const from = alert.status as AlertStatus;
  if (from === to) return;
  if (!canTransition(ALERT_TRANSITIONS, from, to)) throw errors.invalidTransition(from, to, 'alert');
  alert.status = to;
  await AlertActionModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, type: 'STATUS_CHANGE', actorId: p.userId, fromStatus: from, toStatus: to, notes });
}

function emitUpdate(alert: AlertDocument, extra: string[] = []) {
  eventBus.emit('alert.updated', {
    hospitalId: String(alert.hospitalId),
    alertId: String(alert._id),
    status: alert.status,
    recipientUserIds: [...new Set([...(alert.assignedToUserId ? [String(alert.assignedToUserId)] : []), ...extra])],
  });
}

export async function listAlerts(
  p: Principal,
  q: { status?: AlertStatus; open?: boolean; priority?: string; assignedToMe?: boolean; patientId?: string; episodeId?: string; page: number; limit: number },
) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const filter: Record<string, unknown> = await episodeScopedFilter(p, 'alerts.read');
  if (q.status) filter.status = q.status;
  else if (q.open) filter.status = { $in: ALERT_OPEN_STATUSES };
  if (q.priority) filter.priority = q.priority;
  if (q.assignedToMe) filter.assignedToUserId = new Types.ObjectId(p.userId);
  if (q.patientId) filter.patientId = new Types.ObjectId(q.patientId);
  if (q.episodeId) filter.episodeId = new Types.ObjectId(q.episodeId);
  const [items, total] = await Promise.all([
    AlertModel.find(filter)
      .populate({ path: 'patientId', select: 'firstName lastName hospitalPatientRef', options: { skipTenantGuard: true } })
      .populate('assignedToUserId', 'firstName lastName')
      .sort({ status: 1, createdAt: -1 })
      .skip((q.page - 1) * q.limit)
      .limit(q.limit),
    AlertModel.countDocuments(filter),
  ]);
  // Sort open alerts by priority then age for the work queue.
  const rank: Record<string, number> = { CRITICAL: 0, HIGH: 1, MEDIUM: 2, LOW: 3 };
  items.sort((a, b) => (rank[a.priority]! - rank[b.priority]!) || b.get('createdAt').getTime() - a.get('createdAt').getTime());
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

export async function getAlert(p: Principal, alertId: string) {
  const alert = await loadAlert(p, alertId, 'alerts.read');
  await alert.populate([
    { path: 'patientId', select: 'firstName lastName hospitalPatientRef phone preferredLanguage', options: { skipTenantGuard: true } },
    { path: 'assignedToUserId', select: 'firstName lastName' },
    { path: 'acknowledgedBy', select: 'firstName lastName' },
    { path: 'resolution.resolvedBy', select: 'firstName lastName' },
  ]);
  const [actions, assignments] = await Promise.all([
    AlertActionModel.find({ hospitalId: alert.hospitalId, alertId: alert._id }).sort({ createdAt: 1 }).populate('actorId', 'firstName lastName'),
    AlertAssignmentModel.find({ hospitalId: alert.hospitalId, alertId: alert._id }).sort({ createdAt: 1 }).populate('userId', 'firstName lastName'),
  ]);
  await audit({ action: 'ALERT_VIEWED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId?._id ?? alert.patientId) });
  return { alert, actions, assignments };
}

export async function acknowledgeAlert(p: Principal, alertId: string) {
  const alert = await loadAlert(p, alertId, 'alerts.acknowledge');
  if (alert.acknowledgedAt) return alert;
  await setStatus(p, alert, 'ACKNOWLEDGED');
  alert.acknowledgedBy = new Types.ObjectId(p.userId);
  alert.acknowledgedAt = new Date();
  alert.nextEscalationAt = undefined;
  if (!alert.assignedToUserId) {
    alert.assignedToUserId = new Types.ObjectId(p.userId);
    alert.assignedAt = new Date();
  }
  await alert.save();
  emitUpdate(alert);
  await audit({ action: 'ALERT_ACKNOWLEDGED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId) });
  return alert;
}

export async function assignAlert(p: Principal, alertId: string, input: { userId: string; note?: string }) {
  const alert = await loadAlert(p, alertId, 'alerts.assign');
  if (!ALERT_OPEN_STATUSES.includes(alert.status as AlertStatus)) throw errors.validation('Only open alerts can be reassigned');
  const member = await UserRoleModel.findOne({ hospitalId: alert.hospitalId, userId: input.userId, status: 'ACTIVE' });
  if (!member || !member.roles.some((r) => ['DOCTOR', 'MEDICAL_DIRECTOR', 'RECOVERY_NURSE', 'DISCHARGE_NURSE', 'RECOVERY_COORDINATOR', 'PHARMACIST'].includes(r))) {
    throw errors.validation('Alerts can only be assigned to clinical staff of this hospital');
  }
  const previous = alert.assignedToUserId ? String(alert.assignedToUserId) : undefined;
  if (alert.status === 'GENERATED' || alert.status === 'ESCALATED' || alert.status === 'ASSIGNED') {
    await setStatus(p, alert, 'ASSIGNED', input.note);
  }
  alert.assignedToUserId = new Types.ObjectId(input.userId);
  alert.assignedAt = new Date();
  await alert.save();
  await AlertAssignmentModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, userId: input.userId, assignedBy: p.userId, reason: 'MANUAL', note: input.note });
  await AlertActionModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, type: 'ASSIGNMENT', actorId: p.userId, notes: input.note });
  await notify({ userId: input.userId, hospitalId: alert.hospitalId, template: 'ALERT_ASSIGNED', vars: { priority: alert.priority }, data: { alertId }, idempotencyKey: `alert:${alertId}:manual:${input.userId}:${Date.now()}` });
  emitUpdate(alert, previous ? [previous] : []);
  await audit({ action: 'ALERT_ASSIGNED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId), metadata: { to: input.userId, from: previous } });
  return alert;
}

/** Record a professional action (contact attempt, review, advice…) on an alert. */
export async function addAlertAction(
  p: Principal,
  alertId: string,
  input: { type: string; notes: string; contactOutcome?: string; setStatus?: 'UNDER_REVIEW' | 'ACTION_REQUIRED' },
) {
  const alert = await loadAlert(p, alertId, 'alerts.acknowledge');
  if (!ALERT_OPEN_STATUSES.includes(alert.status as AlertStatus)) throw errors.validation('This alert is no longer open');
  if (!alert.acknowledgedAt) {
    // Acting on an alert implicitly acknowledges it.
    await setStatus(p, alert, 'ACKNOWLEDGED', 'Acknowledged by action');
    alert.acknowledgedAt = new Date();
    alert.acknowledgedBy = new Types.ObjectId(p.userId);
    alert.nextEscalationAt = undefined;
  }
  const action = await AlertActionModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, type: input.type, actorId: p.userId, notes: input.notes, contactOutcome: input.contactOutcome });
  if (input.setStatus) await setStatus(p, alert, input.setStatus);
  else if (alert.status === 'ACKNOWLEDGED' && input.type === 'CLINICAL_REVIEW') await setStatus(p, alert, 'UNDER_REVIEW');
  await alert.save();
  emitUpdate(alert);
  await audit({ action: 'ALERT_ACTION_RECORDED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId), metadata: { type: input.type, contactOutcome: input.contactOutcome } });
  return action;
}

export async function resolveAlert(p: Principal, alertId: string, input: { outcome: string; notes: string }) {
  const alert = await loadAlert(p, alertId, 'alerts.resolve');
  if (!alert.acknowledgedAt) throw errors.validation('Acknowledge the alert before resolving it');
  await setStatus(p, alert, 'RESOLVED', input.notes);
  alert.resolution = { outcome: input.outcome, notes: input.notes, resolvedBy: new Types.ObjectId(p.userId), resolvedAt: new Date() };
  alert.nextEscalationAt = undefined;
  await alert.save();

  // Update episode counters and leave NEEDS_ATTENTION when no high-priority alerts remain.
  await RecoveryEpisodeModel.updateOne({ _id: alert.episodeId, hospitalId: alert.hospitalId, 'stats.openAlerts': { $gt: 0 } }, { $inc: { 'stats.openAlerts': -1 } });
  const remaining = await AlertModel.countDocuments({ hospitalId: alert.hospitalId, episodeId: alert.episodeId, status: { $in: ALERT_OPEN_STATUSES }, priority: { $in: ['HIGH', 'CRITICAL'] } });
  if (remaining === 0) {
    const episode = await RecoveryEpisodeModel.findOne({ _id: alert.episodeId, hospitalId: alert.hospitalId });
    if (episode?.status === 'NEEDS_ATTENTION') await applyTransition(episode, 'ACTIVE', 'All high-priority alerts resolved', p.userId);
  }
  emitUpdate(alert);
  await audit({ action: 'ALERT_RESOLVED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId), metadata: { outcome: input.outcome } });
  return alert;
}

export async function closeAlert(p: Principal, alertId: string) {
  const alert = await loadAlert(p, alertId, 'alerts.resolve');
  await setStatus(p, alert, 'CLOSED');
  alert.closedAt = new Date();
  alert.closedBy = new Types.ObjectId(p.userId);
  await alert.save();
  await audit({ action: 'ALERT_CLOSED', resourceType: 'Alert', resourceId: alertId, patientId: String(alert.patientId) });
  return alert;
}

/** Staff-raised alert (e.g. concern from a phone call). */
export async function createManualAlert(p: Principal, input: { episodeId: string; priority: string; title: string; summary: string }) {
  assertPermission(p, 'alerts.acknowledge');
  const episode = await loadEpisode(p, input.episodeId, 'alerts.read');
  const alert = await createAlert({
    hospitalId: requireTenant(p),
    episode,
    source: 'MANUAL',
    priority: input.priority,
    title: input.title,
    summary: input.summary,
    routing: { careTeamRoles: ['RESPONSIBLE_DOCTOR', 'RECOVERY_NURSE'], acknowledgeWithinMinutes: 60, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 1 },
    dedupeKey: `manual:${p.userId}:${Date.now()}`,
    createdBy: p.userId,
  });
  return alert;
}

/* ------------------------------ Alert rules ------------------------------ */

export async function listRules(p: Principal, status?: string) {
  if (!p.permissions.has('alerts.rules.manage') && !p.permissions.has('alerts.rules.approve')) throw errors.forbidden();
  const filter: Record<string, unknown> = { hospitalId: requireTenant(p) };
  if (status) filter.status = status;
  return AlertRuleModel.find(filter).sort({ status: 1, name: 1 }).populate('createdBy clinicalApproval.approvedBy', 'firstName lastName');
}

export async function createRule(p: Principal, input: CreateAlertRuleInput) {
  assertPermission(p, 'alerts.rules.manage');
  const rule = await AlertRuleModel.create({ ...input, hospitalId: requireTenant(p), status: 'DRAFT', createdBy: p.userId });
  await audit({ action: 'ALERT_RULE_CREATED', resourceType: 'AlertRule', resourceId: String(rule._id), metadata: { name: input.name, priority: input.priority } });
  return rule;
}

export async function updateRule(p: Principal, ruleId: string, input: CreateAlertRuleInput) {
  assertPermission(p, 'alerts.rules.manage');
  const rule = await AlertRuleModel.findOne({ _id: ruleId, hospitalId: requireTenant(p) });
  if (!rule) throw errors.notFound('Alert rule');
  if (rule.status !== 'DRAFT') throw errors.immutable('Only draft rules can be edited; retire this rule and create a new version');
  rule.set(input);
  await rule.save();
  return rule;
}

export async function submitRule(p: Principal, ruleId: string) {
  assertPermission(p, 'alerts.rules.manage');
  const rule = await AlertRuleModel.findOne({ _id: ruleId, hospitalId: requireTenant(p) });
  if (!rule) throw errors.notFound('Alert rule');
  if (rule.status !== 'DRAFT') throw errors.validation('Only draft rules can be submitted');
  rule.status = 'PENDING_APPROVAL';
  rule.submittedBy = new Types.ObjectId(p.userId);
  await rule.save();
  await audit({ action: 'ALERT_RULE_SUBMITTED', resourceType: 'AlertRule', resourceId: ruleId });
  return rule;
}

/**
 * Clinical approval of an alert rule. Enforces separation of duties: the approver must
 * hold `alerts.rules.approve` and must not be the rule's author.
 */
export async function approveRule(p: Principal, ruleId: string, comment?: string) {
  assertPermission(p, 'alerts.rules.approve');
  const rule = await AlertRuleModel.findOne({ _id: ruleId, hospitalId: requireTenant(p) });
  if (!rule) throw errors.notFound('Alert rule');
  if (rule.status !== 'PENDING_APPROVAL') throw errors.validation('Only rules pending approval can be approved');
  if (rule.createdBy && String(rule.createdBy) === p.userId) throw errors.forbidden('A rule must be approved by a clinician other than its author');
  rule.status = 'ACTIVE';
  rule.clinicalApproval = { approvedBy: new Types.ObjectId(p.userId), approvedAt: new Date(), comment };
  await rule.save();
  await audit({ action: 'ALERT_RULE_APPROVED', resourceType: 'AlertRule', resourceId: ruleId, justification: comment });
  return rule;
}

export async function retireRule(p: Principal, ruleId: string) {
  if (!p.permissions.has('alerts.rules.approve') && !p.permissions.has('alerts.rules.manage')) throw errors.forbidden();
  const rule = await AlertRuleModel.findOne({ _id: ruleId, hospitalId: requireTenant(p) });
  if (!rule) throw errors.notFound('Alert rule');
  rule.status = 'RETIRED';
  rule.retiredAt = new Date();
  await rule.save();
  await audit({ action: 'ALERT_RULE_RETIRED', resourceType: 'AlertRule', resourceId: ruleId });
  return rule;
}
