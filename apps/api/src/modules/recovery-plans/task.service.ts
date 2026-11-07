import { Types } from 'mongoose';
import { DateTime } from 'luxon';
import type { TaskType } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { pageMeta } from '../../utils/http';
import { logger } from '../../config/logger';
import { eventBus } from '../../events/event-bus';
import { registerProcessor } from '../../jobs/queue';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { episodeScopedFilter, loadEpisode } from '../access/access.service';
import { HospitalModel } from '../hospitals/hospital.models';
import { PatientModel } from '../patients/patient.model';
import { MedicationEventModel } from '../medications/medication.models';
import { notify } from '../notifications/notification.service';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { RecoveryPlanModel, RecoveryTaskModel } from './recovery-plan.models';

/** Caregivers can only see task types their consent covers. */
function caregiverTaskTypes(p: Principal, patientId: string): TaskType[] | undefined {
  if (p.kind !== 'CAREGIVER') return undefined;
  const g = p.caregiverGrants.find((x) => x.patientId === patientId);
  if (!g) return [];
  const types: TaskType[] = [];
  if (g.scopes.includes('VIEW_RECOVERY_PLAN')) types.push('CHECK_IN', 'WEEKLY_REVIEW', 'REHABILITATION', 'WOUND_CARE', 'EDUCATION', 'MILESTONE', 'CUSTOM');
  if (g.scopes.includes('VIEW_MEDICATIONS') || g.scopes.includes('REPORT_MEDICATION_EVENTS')) types.push('MEDICATION');
  if (g.scopes.includes('VIEW_APPOINTMENTS')) types.push('APPOINTMENT_REMINDER');
  return types;
}

export async function listEpisodeTasks(
  p: Principal,
  episodeId: string,
  q: { from?: string; to?: string; status?: string; type?: TaskType; page: number; limit: number },
) {
  const episode = await loadEpisode(p, episodeId, 'recovery.read');
  const filter: Record<string, unknown> = { hospitalId: requireTenant(p), episodeId: episode._id };
  const due: Record<string, Date> = {};
  if (q.from) due.$gte = new Date(q.from);
  if (q.to) due.$lt = new Date(q.to);
  if (Object.keys(due).length) filter.dueAt = due;
  if (q.status) filter.status = q.status;
  const allowed = caregiverTaskTypes(p, String(episode.patientId));
  if (allowed) filter.type = q.type ? (allowed.includes(q.type) ? q.type : '__none__') : { $in: allowed };
  else if (q.type) filter.type = q.type;
  if (!p.permissions.has('medication.read') && p.kind === 'STAFF') filter.type = { ...(typeof filter.type === 'object' ? filter.type : {}), $ne: 'MEDICATION' };

  const [items, total] = await Promise.all([
    RecoveryTaskModel.find(filter).select('-dedupeKey -recurrence').sort({ dueAt: 1 }).skip((q.page - 1) * q.limit).limit(q.limit),
    RecoveryTaskModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(q.page, q.limit, total) };
}

/** Today's tasks for a patient/caregiver (or a staff member viewing an episode). */
export async function todayTasks(p: Principal, episodeId?: string) {
  const hospitalId = requireTenant(p);
  const filter: Record<string, unknown> = await episodeScopedFilter(p, 'recovery.read');
  if (episodeId) {
    const ep = await loadEpisode(p, episodeId, 'recovery.read');
    filter.episodeId = ep._id;
  } else {
    filter.episodeId = {
      $in: await RecoveryEpisodeModel.distinct('_id', { ...filterForEpisodes(filter, hospitalId), status: { $in: ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW'] } }),
    };
  }
  let tz = 'Africa/Lagos';
  if (p.kind === 'PATIENT' && p.patientIds[0]) {
    tz = (await PatientModel.findOne({ hospitalId, _id: p.patientIds[0] }).select('timezone'))?.timezone ?? tz;
  }
  const start = DateTime.now().setZone(tz).startOf('day');
  filter.dueAt = { $gte: start.toJSDate(), $lt: start.plus({ days: 1 }).toJSDate() };
  filter.status = { $ne: 'CANCELLED' };
  if (p.kind === 'CAREGIVER') {
    const types = new Set<TaskType>();
    for (const g of p.caregiverGrants) for (const t of caregiverTaskTypes(p, g.patientId) ?? []) types.add(t);
    filter.type = { $in: [...types] };
  }
  return RecoveryTaskModel.find(filter).select('-dedupeKey -recurrence').sort({ dueAt: 1 });
}

function filterForEpisodes(scoped: Record<string, unknown>, hospitalId: Types.ObjectId): Record<string, unknown> {
  const f: Record<string, unknown> = { hospitalId };
  if (scoped.patientId) f.patientId = scoped.patientId;
  if (scoped.episodeId) f._id = scoped.episodeId;
  return f;
}

/**
 * Complete or skip a task. Medication tasks record a PATIENT-REPORTED dose event (never
 * verification). Check-in tasks must be completed by submitting the check-in itself.
 */
export async function completeTask(
  p: Principal,
  taskId: string,
  input: { status: 'COMPLETED' | 'SKIPPED'; response?: string; completedAt?: string; idempotencyKey?: string },
) {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(taskId)) throw errors.notFound('Task');
  const task = await RecoveryTaskModel.findOne({ _id: taskId, hospitalId });
  if (!task) throw errors.notFound('Task');
  const permission = p.kind === 'STAFF' ? 'recovery.update' : 'checkins.create';
  const episode = await loadEpisode(p, task.episodeId as Types.ObjectId, permission);
  const allowed = caregiverTaskTypes(p, String(episode.patientId));
  if (allowed && !allowed.includes(task.type)) throw errors.forbidden('The patient has not granted you access to this activity');

  if (task.status === 'COMPLETED' || task.status === 'SKIPPED') return task; // idempotent
  if (task.status === 'CANCELLED') throw errors.validation('This activity was cancelled');
  if (task.type === 'CHECK_IN') throw errors.validation('Complete this activity by submitting the check-in');
  if (task.dueAt.getTime() - Date.now() > 12 * 3600_000) throw errors.validation('This activity is not due yet');

  const source = p.kind === 'PATIENT' ? 'PATIENT' : p.kind === 'CAREGIVER' ? 'CAREGIVER' : 'STAFF';
  task.status = input.status;
  task.completionSource = source;
  task.completedAt = input.completedAt ? new Date(input.completedAt) : new Date();
  task.completedBy = new Types.ObjectId(p.userId);
  task.response = input.response;

  if (task.type === 'MEDICATION' && task.medicationOrderId) {
    const key = input.idempotencyKey ?? `task:${taskId}`;
    const existing = await MedicationEventModel.findOne({ hospitalId, idempotencyKey: key });
    const event =
      existing ??
      (await MedicationEventModel.create({
        hospitalId,
        medicationOrderId: task.medicationOrderId,
        episodeId: task.episodeId,
        patientId: task.patientId,
        taskId: task._id,
        scheduledFor: task.dueAt,
        status: input.status === 'COMPLETED' ? 'REPORTED_TAKEN' : 'REPORTED_MISSED',
        reportedTakenAt: input.status === 'COMPLETED' ? task.completedAt : undefined,
        reportedBy: p.userId,
        reporterKind: source,
        reason: input.response,
        idempotencyKey: key,
      }));
    task.evidenceRef = { kind: 'MedicationEvent', id: event._id };
  }
  await task.save();
  eventBus.emit('task.completed', { hospitalId: String(hospitalId), episodeId: String(task.episodeId), patientId: String(task.patientId), taskId });
  await audit({ action: 'TASK_COMPLETED', resourceType: 'RecoveryTask', resourceId: taskId, patientId: String(task.patientId), metadata: { type: task.type, status: input.status, source } });
  return task;
}

/** Staff-only: reassign or annotate a task (non-clinical fields). */
export async function assignTask(p: Principal, taskId: string, userId: string) {
  const hospitalId = requireTenant(p);
  const task = await RecoveryTaskModel.findOne({ _id: taskId, hospitalId });
  if (!task) throw errors.notFound('Task');
  await loadEpisode(p, task.episodeId as Types.ObjectId, 'recovery.update');
  task.assignedToUserId = new Types.ObjectId(userId);
  await task.save();
  return task;
}

/* ------------------------------- Background ------------------------------- */

/**
 * Mark overdue tasks as MISSED (after the hospital grace period). Medication tasks get a
 * NOT_RESPONDED event. Each missed task emits `task.missed` for alert-rule evaluation.
 */
export async function markMissedTasks(now = new Date()): Promise<number> {
  const hospitals = await HospitalModel.find({}).select('settings.missedTaskGraceMinutes');
  let count = 0;
  for (const h of hospitals) {
    const grace = h.settings?.missedTaskGraceMinutes ?? 180;
    const cutoff = new Date(now.getTime() - grace * 60_000);
    const tasks = await RecoveryTaskModel.find({ hospitalId: h._id, status: 'PENDING', dueAt: { $lt: cutoff }, type: { $nin: ['EDUCATION', 'APPOINTMENT_REMINDER'] } }).limit(5000);
    for (const task of tasks) {
      const updated = await RecoveryTaskModel.findOneAndUpdate(
        { _id: task._id, hospitalId: h._id, status: 'PENDING' },
        { $set: { status: 'MISSED', missedProcessedAt: now, completionSource: 'SYSTEM' } },
        { new: true },
      );
      if (!updated) continue;
      count++;
      if (task.type === 'MEDICATION' && task.medicationOrderId) {
        await MedicationEventModel.updateOne(
          { hospitalId: h._id, idempotencyKey: `missed:${String(task._id)}` },
          {
            $setOnInsert: {
              hospitalId: h._id,
              medicationOrderId: task.medicationOrderId,
              episodeId: task.episodeId,
              patientId: task.patientId,
              taskId: task._id,
              scheduledFor: task.dueAt,
              status: 'NOT_RESPONDED',
              reporterKind: 'SYSTEM',
              idempotencyKey: `missed:${String(task._id)}`,
            },
          },
          { upsert: true },
        );
      }
      await RecoveryEpisodeModel.updateOne({ _id: task.episodeId, hospitalId: h._id }, { $inc: { 'stats.missedTasks': 1 } });
      eventBus.emit('task.missed', { hospitalId: String(h._id), episodeId: String(task.episodeId), patientId: String(task.patientId), taskId: String(task._id), type: task.type });
    }
  }
  return count;
}

/** Send reminders for tasks that are due now (±window), once per task. */
export async function sendDueReminders(now = new Date()): Promise<number> {
  const windowStart = new Date(now.getTime() - 10 * 60_000);
  const windowEnd = new Date(now.getTime() + 5 * 60_000);
  const tasks = await RecoveryTaskModel.find({
    status: 'PENDING',
    reminderSentAt: { $exists: false },
    dueAt: { $gte: windowStart, $lte: windowEnd },
  })
    .setOptions({ skipTenantGuard: true })
    .limit(2000);
  let sent = 0;
  for (const task of tasks) {
    const claimed = await RecoveryTaskModel.findOneAndUpdate(
      { _id: task._id, hospitalId: task.hospitalId, reminderSentAt: { $exists: false } },
      { $set: { reminderSentAt: now } },
    );
    if (!claimed) continue;
    const patient = await PatientModel.findOne({ _id: task.patientId, hospitalId: task.hospitalId }).select('userId');
    if (!patient?.userId) continue;
    const template = task.type === 'MEDICATION' ? 'MEDICATION_REMINDER' : task.type === 'CHECK_IN' ? 'CHECKIN_DUE' : 'TASK_REMINDER';
    try {
      await notify({
        userId: patient.userId,
        hospitalId: task.hospitalId,
        template,
        data: { taskId: String(task._id), episodeId: String(task.episodeId) },
        channels: ['IN_APP', 'PUSH'],
        idempotencyKey: `task-reminder:${String(task._id)}`,
      });
      sent++;
    } catch (err) {
      logger.error({ err, taskId: String(task._id) }, 'Task reminder failed');
    }
  }
  return sent;
}

registerProcessor('tasks.mark-missed', async () => {
  await markMissedTasks();
});
registerProcessor('tasks.send-reminders', async () => {
  await sendDueReminders();
});

export async function getRecoveryPlan(p: Principal, planId: string) {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(planId)) throw errors.notFound('Recovery plan');
  const plan = await RecoveryPlanModel.findOne({ _id: planId, hospitalId });
  if (!plan) throw errors.notFound('Recovery plan');
  await loadEpisode(p, plan.episodeId as Types.ObjectId, 'recovery.read');
  const canSeeMeds = p.permissions.has('medication.read');
  const json = plan.toJSON() as { activities: Array<{ type: string }> };
  if (!canSeeMeds) json.activities = json.activities.filter((a) => a.type !== 'MEDICATION');
  return json;
}
