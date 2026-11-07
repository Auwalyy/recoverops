import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { RECURRENCE_KINDS, TASK_COMPLETION_SOURCES, TASK_STATUSES, TASK_TYPES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

const recurrenceSubSchema = new Schema(
  {
    kind: { type: String, enum: RECURRENCE_KINDS, required: true },
    timesOfDay: { type: [String], default: ['09:00'] },
    daysOfWeek: [Number],
    intervalDays: Number,
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
  },
  { _id: false },
);

/**
 * RecoveryPlan = structured activity definitions derived from ONE approved discharge
 * version. Tasks are materialised from these definitions for a rolling window.
 */
const activityDefinitionSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: TASK_TYPES, required: true },
    title: { type: String, required: true },
    instructions: String,
    recurrence: { type: recurrenceSubSchema, required: true },
    medicationOrderId: ref('MedicationOrder'),
    checkInTemplateId: ref('CheckInTemplate'),
    appointmentId: ref('Appointment'),
    assignedRole: String,
    sourceSection: String,
  },
  { _id: false },
);

const recoveryPlanSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    dischargePlanVersionId: ref('DischargePlanVersion', true),
    status: { type: String, enum: ['ACTIVE', 'SUPERSEDED', 'COMPLETED', 'CANCELLED'], default: 'ACTIVE' },
    timezone: { type: String, required: true },
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    activities: { type: [activityDefinitionSchema], default: [] },
    /** Tasks have been materialised up to (exclusive) this instant. */
    generatedUntil: Date,
    engineVersion: { type: String, default: '1' },
  },
  { tenant: true },
);
recoveryPlanSchema.index({ hospitalId: 1, episodeId: 1, status: 1 });
export type RecoveryPlan = InferSchemaType<typeof recoveryPlanSchema>;
export type RecoveryPlanDocument = HydratedDocument<RecoveryPlan>;
export type ActivityDefinition = InferSchemaType<typeof activityDefinitionSchema>;
export const RecoveryPlanModel = model('RecoveryPlan', recoveryPlanSchema);

const recoveryTaskSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    planId: { ...ref('RecoveryPlan', true) },
    activityKey: { type: String, required: true },
    type: { type: String, enum: TASK_TYPES, required: true },
    title: { type: String, required: true },
    instructions: String,
    dueAt: { type: Date, required: true },
    /** Local wall-clock date/time in the patient's timezone (for display & grouping). */
    localDate: { type: String, required: true },
    localTime: String,
    timezone: String,
    recurrence: { type: recurrenceSubSchema },
    medicationOrderId: ref('MedicationOrder'),
    checkInTemplateId: ref('CheckInTemplate'),
    appointmentId: ref('Appointment'),
    assignedToUserId: ref('User'),
    status: { type: String, enum: TASK_STATUSES, default: 'PENDING', index: true },
    completionSource: { type: String, enum: TASK_COMPLETION_SOURCES },
    completedAt: Date,
    completedBy: ref('User'),
    response: String,
    evidenceRef: { kind: String, id: Schema.Types.ObjectId },
    reminderSentAt: Date,
    missedProcessedAt: Date,
    /** Deterministic key preventing duplicate task materialisation. */
    dedupeKey: { type: String, required: true },
  },
  { tenant: true },
);
recoveryTaskSchema.index({ hospitalId: 1, dedupeKey: 1 }, { unique: true });
recoveryTaskSchema.index({ hospitalId: 1, episodeId: 1, dueAt: 1 });
recoveryTaskSchema.index({ status: 1, dueAt: 1 });
export type RecoveryTask = InferSchemaType<typeof recoveryTaskSchema>;
export type RecoveryTaskDocument = HydratedDocument<RecoveryTask>;
export const RecoveryTaskModel = model('RecoveryTask', recoveryTaskSchema);

/** Clinician-defined recovery milestones (e.g. "walks 200m unaided"). */
const milestoneSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: ref('Patient', true),
    title: { type: String, required: true },
    description: String,
    targetDate: String,
    status: { type: String, enum: ['PENDING', 'ACHIEVED', 'NOT_ACHIEVED', 'CANCELLED'], default: 'PENDING' },
    achievedAt: Date,
    confirmedBy: ref('User'),
    notes: String,
    createdBy: ref('User'),
  },
  { tenant: true },
);
export const RecoveryMilestoneModel = model('RecoveryMilestone', milestoneSchema);
