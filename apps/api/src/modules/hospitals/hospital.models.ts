import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { HOSPITAL_VERIFICATION_STATUSES, LANGUAGES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/** Hospital = tenant root. Not itself tenant-guarded (it IS the tenant). */
const hospitalSchema = createSchema({
  name: { type: String, required: true, trim: true, maxlength: 200 },
  slug: { type: String, required: true, unique: true, lowercase: true },
  registrationNumber: { type: String, required: true, trim: true },
  type: { type: String, required: true },
  email: { type: String, required: true, lowercase: true },
  phone: { type: String, required: true },
  emergencyPhone: String,
  address: {
    line1: String,
    city: String,
    state: String,
    country: { type: String, default: 'NG' },
  },
  timezone: { type: String, default: 'Africa/Lagos' },
  verificationStatus: { type: String, enum: HOSPITAL_VERIFICATION_STATUSES, default: 'PENDING_VERIFICATION', index: true },
  verifiedAt: Date,
  verifiedBy: ref('User'),
  verificationNotes: String,
  settings: {
    defaultCheckInTime: { type: String, default: '09:00' },
    /** Tasks are materialised for a rolling window; a daily job extends it. */
    taskGenerationWindowDays: { type: Number, default: 7 },
    /** After due time + grace, a pending task is marked MISSED. */
    missedTaskGraceMinutes: { type: Number, default: 180 },
    breakGlassEnabled: { type: Boolean, default: false },
    aiFeaturesEnabled: { type: Boolean, default: true },
    defaultLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    /**
     * Patient-facing emergency guidance shown in-app at all times. Must be approved
     * by the hospital's clinical governance. Default is deliberately generic.
     */
    emergencyInstructions: {
      type: String,
      default:
        'If you feel your condition is an emergency, do not wait for a reply in this app. Go to the nearest emergency department or call the hospital emergency line immediately.',
    },
    notificationChannels: { type: [String], default: ['PUSH', 'SMS'] },
  },
  isDemo: { type: Boolean, default: false },
});

export type Hospital = InferSchemaType<typeof hospitalSchema>;
export type HospitalDocument = HydratedDocument<Hospital>;
export const HospitalModel = model('Hospital', hospitalSchema);

const departmentSchema = createSchema(
  {
    ...tenantField,
    name: { type: String, required: true, trim: true },
    code: { type: String, required: true, uppercase: true, trim: true },
    description: String,
    active: { type: Boolean, default: true },
  },
  { tenant: true },
);
departmentSchema.index({ hospitalId: 1, code: 1 }, { unique: true });

export type Department = InferSchemaType<typeof departmentSchema>;
export const DepartmentModel = model('Department', departmentSchema);
