import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { INVITATION_TYPES, ROLES, CAREGIVER_SCOPE_KEYS } from '@recoveros/shared';
import { createSchema, ref } from '../../database/schema';

/**
 * Session = one refresh-token family on one device. Refresh tokens are rotated on every
 * use; only SHA-256 hashes are stored. Presenting an already-rotated token is treated
 * as token theft and revokes the whole session.
 */
const sessionSchema = createSchema({
  userId: { ...ref('User', true), index: true },
  refreshTokenHash: { type: String, required: true },
  previousTokenHashes: { type: [String], default: [], select: false },
  activeHospitalId: ref('Hospital'),
  device: {
    name: String,
    platform: { type: String, enum: ['android', 'ios', 'web', 'other'] },
    pushToken: String,
  },
  ip: String,
  userAgent: String,
  expiresAt: { type: Date, required: true },
  lastUsedAt: Date,
  revokedAt: Date,
  revokedReason: String,
});
sessionSchema.index({ refreshTokenHash: 1 }, { unique: true });
sessionSchema.index({ previousTokenHashes: 1 });
// Expired sessions are purged automatically 7 days after expiry.
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 7 * 24 * 3600 });

export type Session = InferSchemaType<typeof sessionSchema>;
export type SessionDocument = HydratedDocument<Session>;
export const SessionModel = model('Session', sessionSchema);

/** One-time tokens/codes for password reset and email/phone verification. */
const verificationTokenSchema = createSchema({
  userId: { ...ref('User', true), index: true },
  purpose: { type: String, enum: ['PASSWORD_RESET', 'VERIFY_EMAIL', 'VERIFY_PHONE'], required: true },
  tokenHash: { type: String, required: true, index: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
  usedAt: Date,
});
verificationTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 24 * 3600 });
export const VerificationTokenModel = model('VerificationToken', verificationTokenSchema);

/**
 * Invitation to join RecoverOS as staff, patient or caregiver. Accepting it creates or
 * links a User and activates the membership / patient link / caregiver consent.
 */
const invitationSchema = createSchema({
  type: { type: String, enum: INVITATION_TYPES, required: true },
  hospitalId: { ...ref('Hospital', true), index: true },
  email: { type: String, lowercase: true, trim: true },
  phone: String,
  firstName: String,
  lastName: String,
  roles: { type: [String], enum: ROLES, default: [] },
  departmentIds: [ref('Department')],
  patientId: ref('Patient'),
  caregiverConsentId: ref('CaregiverConsent'),
  scopes: { type: [String], enum: CAREGIVER_SCOPE_KEYS, default: [] },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true },
  acceptedAt: Date,
  acceptedByUserId: ref('User'),
  revokedAt: Date,
  createdBy: ref('User'),
});
export type Invitation = InferSchemaType<typeof invitationSchema>;
export const InvitationModel = model('Invitation', invitationSchema);
