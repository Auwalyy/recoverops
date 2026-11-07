import { model, Types } from 'mongoose';
import { DateTime } from 'luxon';
import { createSchema, ref, tenantField } from '../../database/schema';
import { errors } from '../../utils/errors';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, loadEpisode } from '../access/access.service';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { RecoveryTaskModel } from '../recovery-plans/recovery-plan.models';
import { AppointmentModel } from '../appointments/appointment.model';
import { AlertModel } from '../alerts/alert.models';
import { RehabilitationSessionModel } from '../rehabilitation/rehabilitation.models';
import { HospitalModel } from '../hospitals/hospital.models';

/** Patient satisfaction (patient-reported experience measure). */
const satisfactionSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: ref('Patient', true),
    score: { type: Number, min: 1, max: 5, required: true },
    comment: String,
    submittedBy: ref('User', true),
  },
  { tenant: true },
);
satisfactionSchema.index({ hospitalId: 1, episodeId: 1, submittedBy: 1 }, { unique: true });
export const SatisfactionResponseModel = model('SatisfactionResponse', satisfactionSchema);

/**
 * Hospital-level dashboards. Aggregate counts only (no patient identifiers).
 * Platform ACTIVITY metrics (engagement, response times) are reported separately from
 * clinical OUTCOME metrics (completion, readmissions) and labelled as such.
 */
export async function hospitalDashboard(p: Principal, q: { from?: string; to?: string; departmentId?: string }) {
  assertPermission(p, 'reports.read');
  const hospitalId = requireTenant(p);
  const tz = (await HospitalModel.findById(hospitalId).select('timezone'))?.timezone ?? 'Africa/Lagos';
  const to = q.to ? DateTime.fromISO(q.to, { zone: tz }).endOf('day') : DateTime.now().setZone(tz);
  const from = q.from ? DateTime.fromISO(q.from, { zone: tz }).startOf('day') : to.minus({ days: 30 }).startOf('day');
  const range = { $gte: from.toJSDate(), $lte: to.toJSDate() };
  const fromDate = from.toISODate()!;
  const toDate = to.toISODate()!;

  const epMatch: Record<string, unknown> = { hospitalId };
  if (q.departmentId) epMatch.departmentId = new Types.ObjectId(q.departmentId);
  const episodeIds = q.departmentId ? await RecoveryEpisodeModel.distinct('_id', epMatch) : undefined;
  const scoped = (extra: Record<string, unknown>) => ({ hospitalId, ...(episodeIds ? { episodeId: { $in: episodeIds } } : {}), ...extra });

  const [statusCounts, newDischarges, completed, transferred, tasks, appts, alertStats, rehab, satisfaction] = await Promise.all([
    RecoveryEpisodeModel.aggregate([{ $match: epMatch }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    RecoveryEpisodeModel.countDocuments({ ...epMatch, dischargeDate: { $gte: fromDate, $lte: toDate } }),
    RecoveryEpisodeModel.countDocuments({ ...epMatch, status: 'COMPLETED', actualCompletionDate: { $gte: fromDate, $lte: toDate } }),
    RecoveryEpisodeModel.countDocuments({ ...epMatch, status: 'TRANSFERRED', 'transfer.transferredAt': range }),
    RecoveryTaskModel.aggregate([{ $match: scoped({ dueAt: range, status: { $ne: 'CANCELLED' } }) }, { $group: { _id: { type: '$type', status: '$status' }, count: { $sum: 1 } } }]),
    AppointmentModel.aggregate([{ $match: scoped({ scheduledAt: range }) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    AlertModel.aggregate([
      { $match: scoped({ createdAt: range }) },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          open: { $sum: { $cond: [{ $in: ['$status', ['GENERATED', 'ASSIGNED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'ESCALATED']] }, 1, 0] } },
          escalated: { $sum: { $cond: [{ $gt: ['$escalationLevel', 0] }, 1, 0] } },
          avgAckMinutes: { $avg: { $cond: [{ $ifNull: ['$acknowledgedAt', false] }, { $divide: [{ $subtract: ['$acknowledgedAt', '$createdAt'] }, 60000] }, null] } },
          avgResolveMinutes: { $avg: { $cond: [{ $ifNull: ['$resolution.resolvedAt', false] }, { $divide: [{ $subtract: ['$resolution.resolvedAt', '$createdAt'] }, 60000] }, null] } },
          critical: { $sum: { $cond: [{ $eq: ['$priority', 'CRITICAL'] }, 1, 0] } },
        },
      },
    ]),
    RehabilitationSessionModel.aggregate([{ $match: scoped({ scheduledAt: range }) }, { $group: { _id: '$status', count: { $sum: 1 } } }]),
    SatisfactionResponseModel.aggregate([{ $match: scoped({ createdAt: range }) }, { $group: { _id: null, avg: { $avg: '$score' }, n: { $sum: 1 } } }]),
  ]);

  const byStatus = Object.fromEntries(statusCounts.map((s: { _id: string; count: number }) => [s._id, s.count]));
  const taskTotals = { total: 0, completed: 0, missed: 0, pending: 0 };
  const checkIns = { due: 0, completed: 0, missed: 0 };
  for (const t of tasks as Array<{ _id: { type: string; status: string }; count: number }>) {
    taskTotals.total += t.count;
    if (t._id.status === 'COMPLETED') taskTotals.completed += t.count;
    if (t._id.status === 'MISSED') taskTotals.missed += t.count;
    if (t._id.status === 'PENDING') taskTotals.pending += t.count;
    if (t._id.type === 'CHECK_IN') {
      checkIns.due += t.count;
      if (t._id.status === 'COMPLETED') checkIns.completed += t.count;
      if (t._id.status === 'MISSED') checkIns.missed += t.count;
    }
  }
  const apptBy = Object.fromEntries(appts.map((a: { _id: string; count: number }) => [a._id, a.count]));
  const rehabBy = Object.fromEntries(rehab.map((a: { _id: string; count: number }) => [a._id, a.count]));
  const a = (alertStats[0] ?? {}) as Record<string, number | null>;
  const pct = (n: number, d: number) => (d ? Math.round((n / d) * 1000) / 10 : null);

  return {
    period: { from: fromDate, to: toDate, timezone: tz },
    activity: {
      label: 'Platform activity metrics — measure engagement and team responsiveness, not clinical outcomes.',
      activeEpisodes: (byStatus.ACTIVE ?? 0) + (byStatus.NEEDS_ATTENTION ?? 0) + (byStatus.UNDER_REVIEW ?? 0),
      episodesByStatus: byStatus,
      newDischarges,
      patientEngagementRate: pct(taskTotals.completed, taskTotals.completed + taskTotals.missed),
      tasks: taskTotals,
      checkIns: { ...checkIns, completionRate: pct(checkIns.completed, checkIns.completed + checkIns.missed) },
      appointments: { byStatus: apptBy, missed: apptBy.MISSED ?? 0, attended: apptBy.ATTENDED ?? 0, attendanceRate: pct(apptBy.ATTENDED ?? 0, (apptBy.ATTENDED ?? 0) + (apptBy.MISSED ?? 0)) },
      alerts: {
        total: a.total ?? 0,
        open: a.open ?? 0,
        critical: a.critical ?? 0,
        escalated: a.escalated ?? 0,
        avgAcknowledgeMinutes: a.avgAckMinutes != null ? Math.round(a.avgAckMinutes) : null,
        avgResolveMinutes: a.avgResolveMinutes != null ? Math.round(a.avgResolveMinutes) : null,
      },
      rehabilitation: { byStatus: rehabBy, attendanceRate: pct(rehabBy.ATTENDED ?? 0, (rehabBy.ATTENDED ?? 0) + (rehabBy.MISSED ?? 0)) },
      satisfaction: satisfaction[0] ? { average: Math.round(satisfaction[0].avg * 10) / 10, responses: satisfaction[0].n } : { average: null, responses: 0 },
    },
    outcomes: {
      label: 'Recovery programme outcomes recorded by clinicians. Interpret with clinical context.',
      programmesCompleted: completed,
      programmesTransferred: transferred,
      unplannedHospitalReturns: null,
      unplannedHospitalReturnsNote: 'Not available: requires integration with the hospital admission system.',
    },
  };
}

/** Staff work-queue counters for role dashboards (scoped to the caller's visible episodes). */
export async function myWorkload(p: Principal) {
  if (p.kind !== 'STAFF') throw errors.forbidden();
  const hospitalId = requireTenant(p);
  const uid = new Types.ObjectId(p.userId);
  const [assignedAlerts, myAppointmentsToday] = await Promise.all([
    AlertModel.countDocuments({ hospitalId, assignedToUserId: uid, status: { $in: ['GENERATED', 'ASSIGNED', 'ACKNOWLEDGED', 'UNDER_REVIEW', 'ACTION_REQUIRED', 'ESCALATED'] } }),
    AppointmentModel.countDocuments({ hospitalId, clinicianId: uid, scheduledAt: { $gte: DateTime.now().startOf('day').toJSDate(), $lt: DateTime.now().endOf('day').toJSDate() } }),
  ]);
  return { assignedOpenAlerts: assignedAlerts, appointmentsToday: myAppointmentsToday };
}

export async function submitSatisfaction(p: Principal, input: { episodeId: string; score: number; comment?: string }) {
  if (p.kind !== 'PATIENT') throw errors.forbidden();
  const episode = await loadEpisode(p, input.episodeId, 'recovery.read');
  return SatisfactionResponseModel.findOneAndUpdate(
    { hospitalId: episode.hospitalId, episodeId: episode._id, submittedBy: new Types.ObjectId(p.userId) },
    { $set: { score: input.score, comment: input.comment, patientId: episode.patientId } },
    { upsert: true, new: true },
  );
}
