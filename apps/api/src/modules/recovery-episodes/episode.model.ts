import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { EPISODE_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * RecoveryEpisode — the central aggregate of RecoverOS. Every discharge plan, task,
 * check-in, alert, appointment and rehabilitation session hangs off an episode.
 * Status changes go through `episode.service.transition()` (state machine) only.
 */
const episodeSchema = createSchema(
  {
    ...tenantField,
    patientId: { ...ref('Patient', true), index: true },
    departmentId: { ...ref('Department', true), index: true },
    admissionReference: String,
    diagnosisReference: String,
    procedureReference: String,
    admissionDate: { type: String, required: true },
    plannedDischargeDate: String,
    dischargeDate: String,
    responsibleDoctorId: { ...ref('User', true), index: true },
    programmeName: String,
    status: { type: String, enum: EPISODE_STATUSES, default: 'DRAFT', index: true },
    startDate: String,
    expectedReviewDate: String,
    actualCompletionDate: String,
    currentDischargePlanId: ref('DischargePlan'),
    currentRecoveryPlanId: ref('RecoveryPlan'),
    transfer: {
      destination: String,
      destinationType: { type: String, enum: ['OTHER_HOSPITAL', 'OTHER_DEPARTMENT', 'PRIMARY_CARE', 'OTHER_PATHWAY'] },
      notes: String,
      transferredAt: Date,
      transferredBy: ref('User'),
    },
    statusHistory: [
      {
        from: String,
        to: { type: String, required: true },
        reason: String,
        changedBy: ref('User'),
        changedBySystem: { type: Boolean, default: false },
        at: { type: Date, default: Date.now },
      },
    ],
    /** Denormalised counters for dashboards (kept in sync by services). */
    stats: {
      openAlerts: { type: Number, default: 0 },
      missedTasks: { type: Number, default: 0 },
      lastCheckInAt: Date,
    },
    createdBy: ref('User'),
  },
  { tenant: true },
);
episodeSchema.index({ hospitalId: 1, status: 1, departmentId: 1 });
episodeSchema.index({ hospitalId: 1, patientId: 1, createdAt: -1 });

export type RecoveryEpisode = InferSchemaType<typeof episodeSchema>;
export type RecoveryEpisodeDocument = HydratedDocument<RecoveryEpisode>;
export const RecoveryEpisodeModel = model('RecoveryEpisode', episodeSchema);
