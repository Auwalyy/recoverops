import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CAREGIVER_CONSENT_STATUSES, CAREGIVER_SCOPE_KEYS, CONSENT_STATUSES, CONSENT_TYPES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** Caregiver profile — a person (User) acting as caregiver for one or more patients. */
const caregiverSchema = createSchema({
  userId: { ...ref('User'), index: true },
  name: { type: String, required: true },
  email: { type: String, lowercase: true },
  phone: String,
});
caregiverSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { userId: { $exists: true } } });
export const CaregiverModel = model('Caregiver', caregiverSchema);

/**
 * CaregiverConsent = the patient's explicit, scoped, revocable, expiring grant of access
 * to a caregiver. The caregiver's effective permissions for that patient are the union
 * of the granted scopes' permissions, capped by the CAREGIVER role ceiling.
 */
const caregiverConsentSchema = createSchema(
  {
    ...tenantField,
    patientId: { ...ref('Patient', true), index: true },
    caregiverId: { ...ref('Caregiver', true), index: true },
    caregiverUserId: { ...ref('User'), index: true },
    relationship: { type: String, required: true },
    scopes: { type: [String], enum: CAREGIVER_SCOPE_KEYS, required: true },
    status: { type: String, enum: CAREGIVER_CONSENT_STATUSES, default: 'INVITED', index: true },
    grantedByUserId: ref('User'),
    grantedVia: { type: String, enum: ['PATIENT_APP', 'STAFF_ON_BEHALF'], required: true },
    invitedAt: { type: Date, default: Date.now },
    acceptedAt: Date,
    expiresAt: { type: Date, required: true },
    revokedAt: Date,
    revokedBy: ref('User'),
    revokedReason: String,
    scopeHistory: [
      {
        scopes: [String],
        changedAt: Date,
        changedBy: ref('User'),
      },
    ],
  },
  { tenant: true },
);
caregiverConsentSchema.index({ hospitalId: 1, caregiverUserId: 1, status: 1 });
export type CaregiverConsent = InferSchemaType<typeof caregiverConsentSchema>;
export type CaregiverConsentDocument = HydratedDocument<CaregiverConsent>;
export const CaregiverConsentModel = model('CaregiverConsent', caregiverConsentSchema);

/** Patient consents for processing activities (participation, AI, SMS, etc.). */
const consentSchema = createSchema(
  {
    ...tenantField,
    patientId: { ...ref('Patient', true), index: true },
    type: { type: String, enum: CONSENT_TYPES, required: true },
    version: { type: String, required: true },
    status: { type: String, enum: CONSENT_STATUSES, required: true },
    method: { type: String, enum: ['IN_APP', 'WRITTEN', 'VERBAL_RECORDED_BY_STAFF'], required: true },
    recordedBy: ref('User'),
    grantedAt: Date,
    revokedAt: Date,
    revokedReason: String,
  },
  { tenant: true },
);
consentSchema.index({ hospitalId: 1, patientId: 1, type: 1, status: 1 });
export const ConsentModel = model('Consent', consentSchema);
