import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { APPOINTMENT_MODES, REHAB_PLAN_STATUSES, REHAB_SESSION_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** Rehabilitation plan authored by a physiotherapist. Exercises are clinician-authored only. */
const rehabPlanSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    physiotherapistId: { ...ref('User', true), index: true },
    goals: [String],
    exercises: [
      {
        name: { type: String, required: true },
        instructions: { type: String, required: true },
        sets: Number,
        repetitions: Number,
        holdSeconds: Number,
        frequencyText: String,
        timesOfDay: [String],
      },
    ],
    milestones: [
      {
        title: { type: String, required: true },
        targetDate: String,
        achievedAt: Date,
        approvedBy: ref('User'),
        notes: String,
      },
    ],
    startDate: { type: String, required: true },
    endDate: String,
    status: { type: String, enum: REHAB_PLAN_STATUSES, default: 'ACTIVE' },
    reviewNotes: [{ note: String, authorId: ref('User'), at: { type: Date, default: Date.now } }],
    createdBy: ref('User'),
  },
  { tenant: true },
);
export type RehabilitationPlan = InferSchemaType<typeof rehabPlanSchema>;
export type RehabilitationPlanDocument = HydratedDocument<RehabilitationPlan>;
export const RehabilitationPlanModel = model('RehabilitationPlan', rehabPlanSchema);

const rehabSessionSchema = createSchema(
  {
    ...tenantField,
    planId: { ...ref('RehabilitationPlan', true), index: true },
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    physiotherapistId: ref('User'),
    scheduledAt: { type: Date, required: true },
    durationMinutes: { type: Number, default: 45 },
    location: String,
    mode: { type: String, enum: APPOINTMENT_MODES, default: 'IN_PERSON' },
    status: { type: String, enum: REHAB_SESSION_STATUSES, default: 'SCHEDULED', index: true },
    progressNotes: String,
    assessment: { painScore: Number, mobilityNotes: String, functionalScore: Number },
    /** Patient-reported difficulty (0–10) — reported, not assessed. */
    patientReports: [{ difficulty: Number, notes: String, reportedBy: ref('User'), at: Date, idempotencyKey: String }],
    recordedBy: ref('User'),
    recordedAt: Date,
  },
  { tenant: true },
);
rehabSessionSchema.index({ hospitalId: 1, scheduledAt: 1 });
export type RehabilitationSession = InferSchemaType<typeof rehabSessionSchema>;
export const RehabilitationSessionModel = model('RehabilitationSession', rehabSessionSchema);
