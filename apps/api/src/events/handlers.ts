import { Types } from 'mongoose';
import { logger } from '../config/logger';
import { eventBus } from './event-bus';
import { emitToUsers } from '../services/realtime';
import { RecoveryAssignmentModel } from '../modules/access/access.models';
import { PatientModel } from '../modules/patients/patient.model';
import { RecoveryEpisodeModel } from '../modules/recovery-episodes/episode.model';
import { RecoveryTaskModel } from '../modules/recovery-plans/recovery-plan.models';
import { evaluateRules } from '../modules/alerts/alert-engine';
import { recordUsage } from '../modules/billing/billing.service';

let registered = false;

async function careTeamUserIds(hospitalId: string, episodeId: string): Promise<string[]> {
  const team = await RecoveryAssignmentModel.find({ hospitalId: new Types.ObjectId(hospitalId), episodeId: new Types.ObjectId(episodeId), active: true }).select('userId');
  return team.map((t) => String(t.userId));
}

async function patientUserId(hospitalId: string, patientId: string): Promise<string[]> {
  const p = await PatientModel.findOne({ hospitalId: new Types.ObjectId(hospitalId), _id: new Types.ObjectId(patientId) }).select('userId');
  return p?.userId ? [String(p.userId)] : [];
}

/**
 * Side-effect handlers for domain events. Realtime payloads contain ids/status only;
 * clients refetch through permission-checked REST endpoints.
 */
export function registerEventHandlers(): void {
  if (registered) return;
  registered = true;

  eventBus.on('alert.created', (e) => {
    emitToUsers(e.recipientUserIds, 'alert:new', { alertId: e.alertId, episodeId: e.episodeId, priority: e.priority });
  });
  eventBus.on('alert.updated', (e) => {
    emitToUsers(e.recipientUserIds, 'alert:updated', { alertId: e.alertId, status: e.status });
  });
  eventBus.on('message.created', (e) => {
    emitToUsers(e.recipientUserIds, 'message:new', { conversationId: e.conversationId, messageId: e.messageId });
  });
  eventBus.on('checkin.submitted', async (e) => {
    emitToUsers(await careTeamUserIds(e.hospitalId, e.episodeId), 'checkin:new', { episodeId: e.episodeId, checkInId: e.checkInId });
  });
  eventBus.on('task.completed', async (e) => {
    emitToUsers(await patientUserId(e.hospitalId, e.patientId), 'task:updated', { taskId: e.taskId, episodeId: e.episodeId });
  });
  eventBus.on('appointment.changed', async (e) => {
    emitToUsers(await patientUserId(e.hospitalId, e.patientId), 'appointment:updated', { appointmentId: e.appointmentId, status: e.status });
  });
  eventBus.on('episode.status_changed', async (e) => {
    const users = [...(await careTeamUserIds(e.hospitalId, e.episodeId)), ...(await patientUserId(e.hospitalId, e.patientId))];
    emitToUsers(users, 'episode:updated', { episodeId: e.episodeId, status: e.to });
  });
  eventBus.on('discharge.approved', async (e) => {
    await recordUsage(e.hospitalId, 'ACTIVE_EPISODES', 1);
  });

  // Missed tasks feed hospital-approved TASK_MISSED rules (e.g. repeated missed check-ins).
  eventBus.on('task.missed', async (e) => {
    const hospitalId = new Types.ObjectId(e.hospitalId);
    const episode = await RecoveryEpisodeModel.findOne({ _id: e.episodeId, hospitalId });
    if (!episode) return;
    const task = await RecoveryTaskModel.findOne({ _id: e.taskId, hospitalId });
    if (!task) return;
    // Consecutive misses of the same activity (most recent first).
    const recent = await RecoveryTaskModel.find({ hospitalId, episodeId: episode._id, activityKey: task.activityKey, dueAt: { $lte: task.dueAt }, status: { $in: ['COMPLETED', 'MISSED', 'SKIPPED'] } })
      .sort({ dueAt: -1 })
      .limit(14)
      .select('status');
    let consecutiveMissed = 0;
    for (const t of recent) {
      if (t.status !== 'MISSED') break;
      consecutiveMissed++;
    }
    const missedLast7Days = await RecoveryTaskModel.countDocuments({ hospitalId, episodeId: episode._id, type: task.type, status: 'MISSED', dueAt: { $gte: new Date(Date.now() - 7 * 24 * 3600_000) } });
    try {
      await evaluateRules({
        hospitalId,
        episode,
        source: 'TASK_MISSED',
        sourceRef: { kind: 'RecoveryTask', id: task._id },
        facts: { taskType: task.type, consecutiveMissed, missedLast7Days },
      });
    } catch (err) {
      logger.error({ err, taskId: e.taskId }, 'TASK_MISSED rule evaluation failed');
    }
  });
}
