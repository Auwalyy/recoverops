import { model, Schema, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { DISCHARGE_PLAN_STATUSES, DISCHARGE_VERSION_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * DischargePlan is the container; DischargePlanVersion holds the clinical content.
 * Approved versions are immutable (enforced in the service and by the pre-save guard
 * below). Amending an approved plan creates a new version and supersedes the old one.
 */
const dischargePlanSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    status: { type: String, enum: DISCHARGE_PLAN_STATUSES, default: 'DRAFT', index: true },
    currentVersionId: ref('DischargePlanVersion'),
    currentVersionNumber: { type: Number, default: 1 },
    approvedVersionId: ref('DischargePlanVersion'),
    createdBy: ref('User'),
  },
  { tenant: true },
);
dischargePlanSchema.index({ hospitalId: 1, episodeId: 1 }, { unique: true });
export type DischargePlan = InferSchemaType<typeof dischargePlanSchema>;
export type DischargePlanDocument = HydratedDocument<DischargePlan>;
export const DischargePlanModel = model('DischargePlan', dischargePlanSchema);

const dischargeVersionSchema = createSchema(
  {
    ...tenantField,
    planId: { ...ref('DischargePlan', true), index: true },
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true) },
    versionNumber: { type: Number, required: true },
    status: { type: String, enum: DISCHARGE_VERSION_STATUSES, default: 'DRAFT' },
    /** Validated against `dischargeContentSchema` (packages/shared) before every write. */
    content: { type: Schema.Types.Mixed, required: true },
    contentHash: String,
    amendsVersionId: ref('DischargePlanVersion'),
    amendmentReason: String,
    authoredBy: ref('User'),
    submittedBy: ref('User'),
    submittedAt: Date,
    approvedBy: ref('User'),
    approvedAt: Date,
    patientUnderstanding: [
      {
        method: String,
        understood: Boolean,
        notes: String,
        recordedBy: ref('User'),
        recordedAt: Date,
      },
    ],
  },
  { tenant: true },
);
dischargeVersionSchema.index({ hospitalId: 1, planId: 1, versionNumber: 1 }, { unique: true });

// Defence in depth: content of an approved version can never change.
dischargeVersionSchema.pre('save', function () {
  if (!this.isNew && this.isModified('content')) {
    const original = (this as unknown as { $locals: { wasApproved?: boolean } }).$locals.wasApproved;
    if (original) throw new Error('IMMUTABLE: approved discharge content cannot be modified');
  }
});
dischargeVersionSchema.post('init', function () {
  (this as unknown as { $locals: { wasApproved?: boolean } }).$locals.wasApproved =
    this.status === 'APPROVED' || this.status === 'SUPERSEDED';
});

export type DischargePlanVersion = InferSchemaType<typeof dischargeVersionSchema>;
export type DischargePlanVersionDocument = HydratedDocument<DischargePlanVersion>;
export const DischargePlanVersionModel = model('DischargePlanVersion', dischargeVersionSchema);

/** Append-only record of every approval decision. */
const planApprovalSchema = createSchema(
  {
    ...tenantField,
    planId: { ...ref('DischargePlan', true), index: true },
    versionId: { ...ref('DischargePlanVersion', true) },
    episodeId: ref('RecoveryEpisode', true),
    decision: { type: String, enum: ['APPROVED', 'REJECTED'], required: true },
    decidedBy: ref('User', true),
    decidedByRoles: [String],
    comment: String,
    contentHash: String,
  },
  { tenant: true, appendOnly: true },
);
export const PlanApprovalModel = model('PlanApproval', planApprovalSchema);
