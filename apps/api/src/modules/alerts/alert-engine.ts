import { Types } from 'mongoose';
import { ALERT_UNACKNOWLEDGED_STATUSES, ROLE_DEFINITIONS, type AlertSource, type RoleCode } from '@recoveros/shared';
import { logger } from '../../config/logger';
import { eventBus } from '../../events/event-bus';
import { enqueue, registerProcessor } from '../../jobs/queue';
import { audit } from '../audit/audit.service';
import { RecoveryAssignmentModel, UserRoleModel } from '../access/access.models';
import { HospitalModel, type HospitalDocument } from '../hospitals/hospital.models';
import { notify } from '../notifications/notification.service';
import { RecoveryEpisodeModel, type RecoveryEpisodeDocument } from '../recovery-episodes/episode.model';
import { applyTransition } from '../recovery-episodes/episode.service';
import { AlertActionModel, AlertAssignmentModel, AlertModel, AlertRuleModel, type AlertDocument } from './alert.models';
import { evaluateConditions, type Facts } from './rule-evaluator';

/**
 * ALERT & ESCALATION ENGINE
 *
 * - Only ACTIVE (clinically approved) hospital rules can fire. RecoverOS ships no
 *   clinical thresholds of its own.
 * - Patient-facing safety messages come verbatim from the approved rule and are
 *   returned to the patient IMMEDIATELY, independent of any staff acknowledgement.
 *   Emergency guidance never depends on someone reading a notification.
 * - Alerts are deduplicated per (rule, source record).
 * - Unacknowledged alerts escalate on a timer (delayed BullMQ job + periodic sweep as
 *   a safety net) to backup/supervisor roles, up to the rule's max level.
 * - Alerts are never closed automatically (not by timers, not by AI).
 */

export interface SafetyMessage {
  priority: string;
  message?: string;
  showEmergencyGuidance: boolean;
  emergencyInstructions?: string;
  emergencyPhone?: string;
}

export interface EvaluateInput {
  hospitalId: Types.ObjectId;
  episode: RecoveryEpisodeDocument;
  source: AlertSource;
  sourceRef: { kind: string; id: Types.ObjectId };
  facts: Facts;
  checkInTemplateId?: Types.ObjectId;
}

const PRIORITY_RANK: Record<string, number> = { LOW: 0, MEDIUM: 1, HIGH: 2, CRITICAL: 3 };

export async function evaluateRules(input: EvaluateInput): Promise<{ alerts: AlertDocument[]; safetyMessages: SafetyMessage[] }> {
  const rules = await AlertRuleModel.find({ hospitalId: input.hospitalId, source: input.source, status: 'ACTIVE' });
  const alerts: AlertDocument[] = [];
  const safetyMessages: SafetyMessage[] = [];
  let hospital: HospitalDocument | null | undefined;

  for (const rule of rules) {
    if (rule.checkInTemplateId && (!input.checkInTemplateId || !rule.checkInTemplateId.equals(input.checkInTemplateId))) continue;
    const result = evaluateConditions(
      { all: rule.conditions?.all as never, any: rule.conditions?.any as never },
      input.facts,
    );
    if (!result.matched) continue;

    if (rule.patientSafetyMessage || rule.showEmergencyGuidance) {
      hospital ??= await HospitalModel.findById(input.hospitalId);
      safetyMessages.push({
        priority: rule.priority,
        message: rule.patientSafetyMessage ?? undefined,
        showEmergencyGuidance: !!rule.showEmergencyGuidance,
        emergencyInstructions: rule.showEmergencyGuidance ? (hospital?.settings?.emergencyInstructions ?? undefined) : undefined,
        emergencyPhone: rule.showEmergencyGuidance ? (hospital?.emergencyPhone ?? hospital?.phone ?? undefined) : undefined,
      });
    }

    const dedupeKey = `${String(rule._id)}:${input.sourceRef.kind}:${String(input.sourceRef.id)}`;
    try {
      const alert = await createAlert({
        hospitalId: input.hospitalId,
        episode: input.episode,
        ruleId: rule._id,
        ruleVersion: rule.version,
        source: input.source,
        sourceRef: input.sourceRef,
        priority: rule.priority,
        title: rule.title,
        summary: `Matched hospital rule "${rule.name}"${rule.isDemoRule ? ' (DEMO RULE — not clinically validated)' : ''}.`,
        matchedConditions: result.details,
        routing: {
          careTeamRoles: rule.routing!.careTeamRoles,
          acknowledgeWithinMinutes: rule.routing!.acknowledgeWithinMinutes,
          escalateToRoles: rule.routing!.escalateToRoles,
          maxEscalationLevel: rule.routing!.maxEscalationLevel ?? 2,
        },
        dedupeKey,
      });
      if (alert) alerts.push(alert);
    } catch (err) {
      logger.error({ err, ruleId: String(rule._id) }, 'Alert creation failed');
      throw err;
    }
  }
  safetyMessages.sort((a, b) => PRIORITY_RANK[b.priority]! - PRIORITY_RANK[a.priority]!);
  return { alerts, safetyMessages };
}

interface CreateAlertArgs {
  hospitalId: Types.ObjectId;
  episode: RecoveryEpisodeDocument;
  ruleId?: Types.ObjectId;
  ruleVersion?: number;
  source: AlertSource;
  sourceRef?: { kind: string; id: Types.ObjectId };
  priority: string;
  title: string;
  summary?: string;
  matchedConditions?: Array<{ field: string; op: string; expected: unknown; actual: unknown }>;
  routing: { careTeamRoles: string[]; acknowledgeWithinMinutes: number; escalateToRoles: string[]; maxEscalationLevel: number };
  dedupeKey: string;
  createdBy?: string;
}

/** Create + route an alert. Returns null when an identical alert already exists. */
export async function createAlert(args: CreateAlertArgs): Promise<AlertDocument | null> {
  const now = new Date();
  const deadline = new Date(now.getTime() + args.routing.acknowledgeWithinMinutes * 60_000);
  let alert: AlertDocument;
  try {
    alert = await AlertModel.create({
      hospitalId: args.hospitalId,
      episodeId: args.episode._id,
      patientId: args.episode.patientId,
      departmentId: args.episode.departmentId,
      ruleId: args.ruleId,
      ruleVersion: args.ruleVersion,
      source: args.source,
      sourceRef: args.sourceRef,
      priority: args.priority,
      status: 'GENERATED',
      title: args.title,
      summary: args.summary,
      matchedConditions: args.matchedConditions,
      routing: args.routing,
      acknowledgeDeadline: deadline,
      nextEscalationAt: deadline,
      dedupeKey: args.dedupeKey,
      createdBy: args.createdBy,
    });
  } catch (err) {
    if ((err as { code?: number }).code === 11000) return null;
    throw err;
  }
  await AlertActionModel.create({ hospitalId: args.hospitalId, alertId: alert._id, type: 'STATUS_CHANGE', bySystem: !args.createdBy, actorId: args.createdBy, toStatus: 'GENERATED', notes: 'Alert generated' });

  // Route to the care team.
  const team = await RecoveryAssignmentModel.find({
    hospitalId: args.hospitalId,
    episodeId: args.episode._id,
    active: true,
    role: { $in: args.routing.careTeamRoles },
  }).sort({ createdAt: 1 });
  const ordered = args.routing.careTeamRoles.flatMap((r) => team.filter((t) => t.role === r));
  let recipients = [...new Set(ordered.map((t) => String(t.userId)))];
  if (!recipients.length) {
    // No matching care-team member → route straight to the escalation roles.
    recipients = await findEscalationUsers(args.hospitalId, args.routing.escalateToRoles, args.episode.departmentId as Types.ObjectId, []);
  }

  if (recipients.length) {
    alert.assignedToUserId = new Types.ObjectId(recipients[0]);
    alert.assignedAt = now;
    alert.status = 'ASSIGNED';
    await alert.save();
    await AlertAssignmentModel.create({ hospitalId: args.hospitalId, alertId: alert._id, userId: recipients[0], reason: 'INITIAL', escalationLevel: 0 });
  } else {
    logger.warn({ alertId: String(alert._id) }, 'Alert has no eligible recipients');
  }

  await RecoveryEpisodeModel.updateOne({ _id: args.episode._id, hospitalId: args.hospitalId }, { $inc: { 'stats.openAlerts': 1 } });
  if (PRIORITY_RANK[args.priority]! >= PRIORITY_RANK.HIGH! && args.episode.status === 'ACTIVE') {
    try {
      const fresh = await RecoveryEpisodeModel.findOne({ _id: args.episode._id, hospitalId: args.hospitalId });
      if (fresh?.status === 'ACTIVE') await applyTransition(fresh, 'NEEDS_ATTENTION', `${args.priority} alert generated`, null);
    } catch (err) {
      logger.warn({ err }, 'Could not set episode to NEEDS_ATTENTION');
    }
  }

  for (const userId of recipients) {
    await notify({
      userId,
      hospitalId: args.hospitalId,
      template: 'ALERT_ASSIGNED',
      vars: { priority: args.priority },
      data: { alertId: String(alert._id) },
      channels: PRIORITY_RANK[args.priority]! >= PRIORITY_RANK.HIGH! ? ['IN_APP', 'PUSH', 'SMS'] : ['IN_APP', 'PUSH'],
      idempotencyKey: `alert:${String(alert._id)}:assigned:${userId}`,
    });
  }
  await enqueue('alerts.escalate', { alertId: String(alert._id), hospitalId: String(args.hospitalId), level: 0 }, { delayMs: deadline.getTime() - now.getTime(), jobId: `alert-esc:${String(alert._id)}:0` });

  eventBus.emit('alert.created', {
    hospitalId: String(args.hospitalId),
    alertId: String(alert._id),
    episodeId: String(args.episode._id),
    patientId: String(args.episode.patientId),
    priority: args.priority,
    recipientUserIds: recipients,
  });
  await audit({ action: 'ALERT_GENERATED', resourceType: 'Alert', resourceId: String(alert._id), hospitalId: String(args.hospitalId), patientId: String(args.episode.patientId), actor: { kind: args.createdBy ? 'STAFF' : 'SYSTEM', userId: args.createdBy }, metadata: { priority: args.priority, source: args.source, ruleId: args.ruleId ? String(args.ruleId) : undefined } });
  return alert;
}

/**
 * Find staff holding any of `roles` who can see the episode's department.
 * HOSPITAL-scope roles qualify regardless of department.
 */
export async function findEscalationUsers(hospitalId: Types.ObjectId, roles: string[], departmentId: Types.ObjectId | undefined, exclude: string[]): Promise<string[]> {
  const members = await UserRoleModel.find({ hospitalId, status: 'ACTIVE', roles: { $in: roles } });
  const eligible = members.filter((m) => {
    if (exclude.includes(String(m.userId))) return false;
    const hospitalWide = m.roles.some((r) => roles.includes(r) && ROLE_DEFINITIONS[r as RoleCode].accessScope === 'HOSPITAL');
    if (hospitalWide) return true;
    return !departmentId || (m.departmentIds ?? []).some((d) => d.equals(departmentId));
  });
  // Order by the escalation role order given in the rule.
  eligible.sort((a, b) => Math.min(...a.roles.map((r) => roles.indexOf(r)).filter((i) => i >= 0)) - Math.min(...b.roles.map((r) => roles.indexOf(r)).filter((i) => i >= 0)));
  return eligible.map((m) => String(m.userId));
}

/** Escalate one alert if it is still unacknowledged and due. Safe to call repeatedly. */
export async function escalateAlert(alertId: string, hospitalId: string, now = new Date()): Promise<boolean> {
  const alert = await AlertModel.findOne({ _id: alertId, hospitalId });
  if (!alert) return false;
  if (!ALERT_UNACKNOWLEDGED_STATUSES.includes(alert.status as never)) return false;
  if (!alert.nextEscalationAt || alert.nextEscalationAt > now) return false;

  const maxLevel = alert.routing?.maxEscalationLevel ?? 2;
  const nextLevel = alert.escalationLevel + 1;
  if (nextLevel > maxLevel) {
    // Exhausted escalation chain: stop timers but keep the alert open and visible.
    await AlertModel.updateOne({ _id: alert._id, hospitalId: alert.hospitalId }, { $unset: { nextEscalationAt: 1 } });
    await AlertActionModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, type: 'ESCALATION', bySystem: true, notes: 'Maximum escalation level reached without acknowledgement' });
    logger.error({ alertId }, 'Alert reached maximum escalation level without acknowledgement');
    return false;
  }

  // Claim this escalation step atomically (prevents double escalation by job + sweep).
  const claimed = await AlertModel.findOneAndUpdate(
    { _id: alert._id, hospitalId: alert.hospitalId, escalationLevel: alert.escalationLevel, status: { $in: ALERT_UNACKNOWLEDGED_STATUSES } },
    { $set: { escalationLevel: nextLevel } },
    { new: true },
  );
  if (!claimed) return false;

  const previous = alert.assignedToUserId ? [String(alert.assignedToUserId)] : [];
  const priorAssignees = (await AlertAssignmentModel.find({ hospitalId: alert.hospitalId, alertId: alert._id }).select('userId')).map((a) => String(a.userId));
  const targets = await findEscalationUsers(alert.hospitalId, alert.routing?.escalateToRoles ?? [], alert.departmentId as Types.ObjectId, [...previous, ...priorAssignees]);
  const target = targets[0];
  const fromStatus = claimed.status;
  claimed.status = 'ESCALATED';
  if (target) {
    claimed.assignedToUserId = new Types.ObjectId(target);
    claimed.assignedAt = now;
  }
  const ackMinutes = alert.routing?.acknowledgeWithinMinutes ?? 30;
  claimed.nextEscalationAt = new Date(now.getTime() + ackMinutes * 60_000);
  await claimed.save();

  await AlertActionModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, type: 'ESCALATION', bySystem: true, fromStatus, toStatus: 'ESCALATED', notes: `Not acknowledged within ${ackMinutes} minutes — escalated to level ${nextLevel}` });
  if (target) await AlertAssignmentModel.create({ hospitalId: alert.hospitalId, alertId: alert._id, userId: target, reason: 'ESCALATION', escalationLevel: nextLevel });

  // Notify the new assignee AND keep the previous assignee informed.
  const recipients = [...new Set([...(target ? [target] : []), ...previous])];
  for (const userId of recipients) {
    await notify({
      userId,
      hospitalId: alert.hospitalId,
      template: 'ALERT_ESCALATED',
      vars: { priority: alert.priority },
      data: { alertId: String(alert._id) },
      channels: ['IN_APP', 'PUSH', 'SMS'],
      idempotencyKey: `alert:${String(alert._id)}:esc:${nextLevel}:${userId}`,
    });
  }
  await enqueue('alerts.escalate', { alertId: String(alert._id), hospitalId: String(alert.hospitalId), level: nextLevel }, { delayMs: ackMinutes * 60_000, jobId: `alert-esc:${String(alert._id)}:${nextLevel}` });
  eventBus.emit('alert.updated', { hospitalId: String(alert.hospitalId), alertId: String(alert._id), status: 'ESCALATED', recipientUserIds: recipients });
  await audit({ action: 'ALERT_ESCALATED', resourceType: 'Alert', resourceId: String(alert._id), hospitalId: String(alert.hospitalId), patientId: String(alert.patientId), actor: { kind: 'SYSTEM' }, metadata: { level: nextLevel, assignedTo: target } });
  return true;
}

/** Safety-net sweep: escalate any overdue unacknowledged alert (runs every 2 minutes). */
export async function escalationSweep(now = new Date()): Promise<number> {
  const due = await AlertModel.find({ status: { $in: ALERT_UNACKNOWLEDGED_STATUSES }, nextEscalationAt: { $lte: now } })
    .setOptions({ skipTenantGuard: true })
    .select('_id hospitalId')
    .limit(500);
  let n = 0;
  for (const a of due) if (await escalateAlert(String(a._id), String(a.hospitalId), now)) n++;
  return n;
}

registerProcessor('alerts.escalate', async (data) => {
  await escalateAlert(String(data.alertId), String(data.hospitalId));
});
registerProcessor('alerts.escalation-sweep', async () => {
  await escalationSweep();
});
