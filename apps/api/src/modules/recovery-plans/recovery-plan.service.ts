import { Types, type ClientSession } from 'mongoose';
import { DateTime } from 'luxon';
import type { DischargeContent } from '@recoveros/shared';
import { logger } from '../../config/logger';
import { registerProcessor } from '../../jobs/queue';
import { HospitalModel } from '../hospitals/hospital.models';
import { MedicationScheduleModel, type MedicationOrderDocument } from '../medications/medication.models';
import type { RecoveryEpisodeDocument } from '../recovery-episodes/episode.model';
import type { DischargePlanVersionDocument } from '../discharge/discharge.models';
import { RecoveryPlanModel, RecoveryTaskModel, type RecoveryPlanDocument } from './recovery-plan.models';
import { buildActivities, expandOccurrences, planEndDate, taskDedupeKey } from './engine';

/**
 * Create a RecoveryPlan from an approved discharge version and materialise the first
 * window of tasks. Runs inside the discharge-approval transaction.
 */
export async function generatePlanFromVersion(args: {
  episode: RecoveryEpisodeDocument;
  version: DischargePlanVersionDocument;
  medicationOrders: MedicationOrderDocument[];
  startDate: string;
  timezone: string;
  session: ClientSession;
}): Promise<RecoveryPlanDocument> {
  const { episode, version, medicationOrders, startDate, timezone, session } = args;
  const hospital = await HospitalModel.findById(episode.hospitalId).session(session);
  const content = version.content as DischargeContent;
  const drafts = buildActivities(content, { startDate, defaultCheckInTime: hospital?.settings?.defaultCheckInTime ?? '09:00' });

  const activities = drafts.map((d) => {
    const order = d.medicationIndex !== undefined ? medicationOrders.find((o) => o.sourceIndex === d.medicationIndex) : undefined;
    if (d.type === 'MEDICATION' && !order) {
      // Should be impossible: every scheduled medication activity must map to an approved order.
      throw new Error(`Medication activity ${d.key} has no approved medication order`);
    }
    return {
      key: d.key,
      type: d.type,
      title: d.title,
      instructions: d.instructions,
      recurrence: d.recurrence,
      medicationOrderId: order?._id,
      checkInTemplateId: d.checkInTemplateId ? new Types.ObjectId(d.checkInTemplateId) : undefined,
      sourceSection: d.sourceSection,
    };
  });

  // Supersede any previous active plan (amendments) and cancel its future tasks.
  const previous = await RecoveryPlanModel.find({ hospitalId: episode.hospitalId, episodeId: episode._id, status: 'ACTIVE' }).session(session);
  for (const prev of previous) {
    prev.status = 'SUPERSEDED';
    await prev.save({ session });
    await RecoveryTaskModel.updateMany(
      { hospitalId: episode.hospitalId, planId: prev._id, status: 'PENDING', dueAt: { $gt: new Date() } },
      { $set: { status: 'CANCELLED' } },
      { session },
    );
  }

  const [plan] = await RecoveryPlanModel.create(
    [
      {
        hospitalId: episode.hospitalId,
        episodeId: episode._id,
        patientId: episode.patientId,
        dischargePlanVersionId: version._id,
        status: 'ACTIVE',
        timezone,
        startDate,
        endDate: planEndDate(content, startDate),
        activities,
      },
    ],
    { session },
  );

  for (const a of activities) {
    if (a.type !== 'MEDICATION' || !a.medicationOrderId) continue;
    await MedicationScheduleModel.create(
      [
        {
          hospitalId: episode.hospitalId,
          medicationOrderId: a.medicationOrderId,
          episodeId: episode._id,
          kind: a.recurrence.kind,
          timesOfDay: a.recurrence.timesOfDay,
          daysOfWeek: a.recurrence.daysOfWeek,
          intervalDays: a.recurrence.intervalDays,
          startDate: a.recurrence.startDate,
          endDate: a.recurrence.endDate,
          timezone,
        },
      ],
      { session },
    );
  }

  const windowDays = hospital?.settings?.taskGenerationWindowDays ?? 7;
  await materializeTasks(plan!, DateTime.now().plus({ days: windowDays }).toJSDate(), session);
  return plan!;
}

/**
 * Materialise tasks for a plan up to `until`. Idempotent: upserts by dedupeKey, so
 * re-running (job retries, overlapping windows, concurrent workers) never duplicates.
 */
export async function materializeTasks(plan: RecoveryPlanDocument, until: Date, session?: ClientSession): Promise<number> {
  if (plan.status !== 'ACTIVE') return 0;
  // Start from the plan's start of day so tasks earlier on the activation day are visible.
  const planStartInstant = DateTime.fromISO(plan.startDate, { zone: plan.timezone }).startOf('day').toJSDate();
  const from = plan.generatedUntil && plan.generatedUntil > planStartInstant ? plan.generatedUntil : planStartInstant;
  if (from >= until) return 0;

  const ops = [];
  for (const a of plan.activities) {
    const occurrences = expandOccurrences(
      {
        kind: a.recurrence.kind,
        timesOfDay: a.recurrence.timesOfDay ?? ['09:00'],
        daysOfWeek: a.recurrence.daysOfWeek ?? undefined,
        intervalDays: a.recurrence.intervalDays ?? undefined,
        startDate: a.recurrence.startDate,
        endDate: a.recurrence.endDate,
      },
      plan.timezone,
      from,
      until,
    );
    for (const o of occurrences) {
      const dedupeKey = taskDedupeKey(String(plan._id), a.key, o);
      ops.push({
        updateOne: {
          filter: { hospitalId: plan.hospitalId, dedupeKey },
          update: {
            $setOnInsert: {
              hospitalId: plan.hospitalId,
              episodeId: plan.episodeId,
              patientId: plan.patientId,
              planId: plan._id,
              activityKey: a.key,
              type: a.type,
              title: a.title,
              instructions: a.instructions,
              dueAt: o.dueAt,
              localDate: o.localDate,
              localTime: o.localTime,
              timezone: plan.timezone,
              recurrence: a.recurrence,
              medicationOrderId: a.medicationOrderId,
              checkInTemplateId: a.checkInTemplateId,
              appointmentId: a.appointmentId,
              status: 'PENDING',
              dedupeKey,
            },
          },
          upsert: true,
        },
      });
    }
  }
  let inserted = 0;
  if (ops.length) {
    const res = await RecoveryTaskModel.bulkWrite(ops as never, { ordered: false, session });
    inserted = res.upsertedCount;
  }
  plan.generatedUntil = until;
  await plan.save({ session });
  return inserted;
}

/** Daily job: extend every active plan's task window. */
export async function extendAllTaskWindows(): Promise<void> {
  const plans = await RecoveryPlanModel.find({ status: 'ACTIVE' }).setOptions({ skipTenantGuard: true });
  for (const plan of plans) {
    try {
      const hospital = await HospitalModel.findById(plan.hospitalId).select('settings.taskGenerationWindowDays');
      const days = hospital?.settings?.taskGenerationWindowDays ?? 7;
      await materializeTasks(plan, DateTime.now().plus({ days }).toJSDate());
    } catch (err) {
      logger.error({ err, planId: String(plan._id) }, 'Task window extension failed');
    }
  }
}

registerProcessor('tasks.generate-window', async () => extendAllTaskWindows());
