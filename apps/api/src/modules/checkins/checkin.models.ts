import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CHECKIN_KINDS, QUESTION_TYPES, REVIEW_STATUSES, SYMPTOM_SEVERITIES, SYMPTOM_TRENDS, TEMPLATE_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

const questionSubSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: QUESTION_TYPES, required: true },
    label: { type: String, required: true },
    helpText: String,
    required: { type: Boolean, default: true },
    options: [{ _id: false, value: String, label: String }],
    min: Number,
    max: Number,
    translations: { type: Schema.Types.Mixed },
  },
  { _id: false },
);

/**
 * Check-in templates are configured by the hospital's clinical team. A template must be
 * approved (status ACTIVE) before patients receive it. Editing an active template
 * creates a new version — submitted check-ins always reference the exact version.
 */
const checkInTemplateSchema = createSchema(
  {
    ...tenantField,
    name: { type: String, required: true },
    kind: { type: String, enum: CHECKIN_KINDS, required: true },
    description: String,
    version: { type: Number, default: 1 },
    familyId: { type: Schema.Types.ObjectId, index: true },
    questions: { type: [questionSubSchema], required: true },
    status: { type: String, enum: TEMPLATE_STATUSES, default: 'DRAFT' },
    createdBy: ref('User'),
    approvedBy: ref('User'),
    approvedAt: Date,
  },
  { tenant: true },
);
export type CheckInTemplate = InferSchemaType<typeof checkInTemplateSchema>;
export type CheckInTemplateDocument = HydratedDocument<CheckInTemplate>;
export const CheckInTemplateModel = model('CheckInTemplate', checkInTemplateSchema);

/** Patient-reported check-in. Clinician observations are stored separately (reviewNotes). */
const checkInSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    templateId: ref('CheckInTemplate', true),
    templateVersion: { type: Number, required: true },
    taskId: ref('RecoveryTask'),
    answers: { type: Schema.Types.Mixed, required: true },
    notes: String,
    attachmentIds: [ref('Document')],
    submittedBy: ref('User', true),
    reporterKind: { type: String, enum: ['PATIENT', 'CAREGIVER'], required: true },
    clientSubmittedAt: Date,
    idempotencyKey: { type: String, required: true },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: 'PENDING_REVIEW', index: true },
    reviewedBy: ref('User'),
    reviewedAt: Date,
    /** Clinician-entered observation — kept separate from patient-reported answers. */
    clinicianNotes: String,
    alertIds: [ref('Alert')],
  },
  { tenant: true },
);
checkInSchema.index({ hospitalId: 1, idempotencyKey: 1 }, { unique: true });
checkInSchema.index({ hospitalId: 1, episodeId: 1, createdAt: -1 });
export type CheckIn = InferSchemaType<typeof checkInSchema>;
export const CheckInModel = model('CheckIn', checkInSchema);

const symptomReportSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    symptomCode: String,
    description: { type: String, required: true },
    severity: { type: String, enum: SYMPTOM_SEVERITIES, required: true },
    onsetAt: Date,
    durationText: String,
    trend: { type: String, enum: SYMPTOM_TRENDS, required: true },
    attachmentIds: [ref('Document')],
    notes: String,
    submittedBy: ref('User', true),
    reporterKind: { type: String, enum: ['PATIENT', 'CAREGIVER'], required: true },
    idempotencyKey: { type: String, required: true },
    reviewStatus: { type: String, enum: REVIEW_STATUSES, default: 'PENDING_REVIEW', index: true },
    reviewedBy: ref('User'),
    reviewedAt: Date,
    clinicianNotes: String,
    alertIds: [ref('Alert')],
    /** AI-assisted structuring (optional, validated, never used for diagnosis). */
    aiClassificationId: ref('AiInteraction'),
  },
  { tenant: true },
);
symptomReportSchema.index({ hospitalId: 1, idempotencyKey: 1 }, { unique: true });
symptomReportSchema.index({ hospitalId: 1, episodeId: 1, createdAt: -1 });
export type SymptomReport = InferSchemaType<typeof symptomReportSchema>;
export const SymptomReportModel = model('SymptomReport', symptomReportSchema);
