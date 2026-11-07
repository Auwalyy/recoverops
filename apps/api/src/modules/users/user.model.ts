import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { LANGUAGES, PLATFORM_ROLES, USER_STATUSES } from '@recoveros/shared';
import { createSchema } from '../../database/schema';

/**
 * A User is an identity (login). What the user may do is defined by:
 *  - platformRoles (RecoverOS operators only),
 *  - UserRole memberships (hospital staff),
 *  - Patient records linked via Patient.userId,
 *  - CaregiverConsent records granted by patients.
 */
const userSchema = createSchema({
  firstName: { type: String, required: true, trim: true, maxlength: 100 },
  lastName: { type: String, required: true, trim: true, maxlength: 100 },
  email: { type: String, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 20 },
  passwordHash: { type: String, select: false },
  status: { type: String, enum: USER_STATUSES, default: 'PENDING_ACTIVATION', index: true },
  platformRoles: { type: [String], enum: PLATFORM_ROLES, default: [] },
  preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
  emailVerifiedAt: Date,
  phoneVerifiedAt: Date,
  passwordChangedAt: Date,
  lastLoginAt: Date,
  failedLoginAttempts: { type: Number, default: 0 },
  lockedUntil: Date,
  suspendedReason: String,
  /** MFA-ready: factors are stored but enforcement is a per-hospital policy (future). */
  mfa: {
    enabled: { type: Boolean, default: false },
    method: { type: String, enum: ['TOTP', 'SMS'] },
    secretEncrypted: { type: String, select: false },
    enrolledAt: Date,
  },
  isDemoAccount: { type: Boolean, default: false },
});

userSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string' } } });
userSchema.index({ phone: 1 }, { unique: true, partialFilterExpression: { phone: { $type: 'string' } } });

export type User = InferSchemaType<typeof userSchema>;
export type UserDocument = HydratedDocument<User>;
export const UserModel = model('User', userSchema);
