import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { MEDICATION_EVENT_STATUSES, MEDICATION_ORDER_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * MedicationOrder — created ONLY from an approved discharge-plan version. It is a copy
 * of the prescriber's instruction; RecoverOS never alters dose or frequency itself.
 */
const medicationOrderSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    dischargePlanVersionId: ref('DischargePlanVersion', true),
    sourceIndex: { type: Number, required: true },
    name: { type: String, required: true },
    strength: String,
    dose: { type: String, required: true },
    route: { type: String, required: true },
    frequencyText: { type: String, required: true },
    instructions: String,
    isPrn: { type: Boolean, default: false },
    startDate: { type: String, required: true },
    endDate: String,
    status: { type: String, enum: MEDICATION_ORDER_STATUSES, default: 'ACTIVE', index: true },
    prescribedBy: ref('User'),
    approvedBy: ref('User', true),
    approvedAt: { type: Date, required: true },
    discontinuedAt: Date,
    discontinuedBy: ref('User'),
    discontinuedReason: String,
    pharmacistReview: {
      status: { type: String, enum: ['NONE', 'REQUESTED', 'IN_PROGRESS', 'COMPLETED'], default: 'NONE' },
      requestedAt: Date,
      requestedReason: String,
      reviewedBy: ref('User'),
      reviewedAt: Date,
      notes: String,
    },
  },
  { tenant: true },
);
medicationOrderSchema.index({ hospitalId: 1, episodeId: 1, status: 1 });
export type MedicationOrder = InferSchemaType<typeof medicationOrderSchema>;
export type MedicationOrderDocument = HydratedDocument<MedicationOrder>;
export const MedicationOrderModel = model('MedicationOrder', medicationOrderSchema);

/** The reminder schedule derived from a medication order (timezone-aware). */
const medicationScheduleSchema = createSchema(
  {
    ...tenantField,
    medicationOrderId: { ...ref('MedicationOrder', true), index: true },
    episodeId: ref('RecoveryEpisode', true),
    kind: { type: String, required: true },
    timesOfDay: [String],
    daysOfWeek: [Number],
    intervalDays: Number,
    startDate: { type: String, required: true },
    endDate: { type: String, required: true },
    timezone: { type: String, required: true },
    active: { type: Boolean, default: true },
  },
  { tenant: true },
);
export const MedicationScheduleModel = model('MedicationSchedule', medicationScheduleSchema);

/**
 * MedicationEvent — a PATIENT/CAREGIVER-REPORTED dose status. It is never evidence that
 * a dose was physically administered.
 */
const medicationEventSchema = createSchema(
  {
    ...tenantField,
    medicationOrderId: { ...ref('MedicationOrder', true), index: true },
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    taskId: ref('RecoveryTask'),
    scheduledFor: Date,
    status: { type: String, enum: MEDICATION_EVENT_STATUSES, required: true },
    reportedTakenAt: Date,
    reportedBy: ref('User'),
    reporterKind: { type: String, enum: ['PATIENT', 'CAREGIVER', 'STAFF', 'SYSTEM'], required: true },
    reason: String,
    sideEffects: String,
    accessProblem: { type: String, enum: ['COST', 'OUT_OF_STOCK', 'PHARMACY_ACCESS', 'LOST', 'OTHER'] },
    requiresReview: { type: Boolean, default: false },
    reviewStatus: { type: String, enum: ['PENDING_REVIEW', 'REVIEWED', 'NO_REVIEW_REQUIRED'], default: 'NO_REVIEW_REQUIRED' },
    reviewedBy: ref('User'),
    reviewedAt: Date,
    reviewNotes: String,
    idempotencyKey: { type: String, required: true },
  },
  { tenant: true },
);
medicationEventSchema.index({ hospitalId: 1, idempotencyKey: 1 }, { unique: true });
medicationEventSchema.index({ hospitalId: 1, episodeId: 1, createdAt: -1 });
export type MedicationEvent = InferSchemaType<typeof medicationEventSchema>;
export const MedicationEventModel = model('MedicationEvent', medicationEventSchema);
