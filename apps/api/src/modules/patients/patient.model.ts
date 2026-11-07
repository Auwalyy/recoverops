import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { CONTACT_CHANNELS, LANGUAGES, PATIENT_STATUSES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * Patient = a person enrolled for recovery coordination at ONE hospital. The same
 * person registered at two hospitals has two Patient records (each tenant-owned);
 * they may be linked to a single User login via `userId`.
 *
 * Data minimisation: this is not an EMR. Only details needed to coordinate recovery
 * are stored here.
 */
const patientSchema = createSchema(
  {
    ...tenantField,
    userId: { ...ref('User'), index: true },
    hospitalPatientRef: { type: String, required: true, trim: true },
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    dateOfBirth: { type: String, required: true },
    sex: { type: String, enum: ['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED'], required: true },
    phone: String,
    email: { type: String, lowercase: true },
    preferredLanguage: { type: String, enum: LANGUAGES, default: 'en' },
    timezone: { type: String, default: 'Africa/Lagos' },
    contactPreferences: {
      channels: { type: [String], enum: CONTACT_CHANNELS, default: ['PUSH', 'SMS'] },
      quietHoursStart: String,
      quietHoursEnd: String,
    },
    emergencyContact: { name: String, relationship: String, phone: String },
    address: { city: String, state: String },
    status: { type: String, enum: PATIENT_STATUSES, default: 'ACTIVE', index: true },
    consentStatus: {
      type: String,
      enum: ['NOT_RECORDED', 'GRANTED', 'PARTIAL', 'REVOKED'],
      default: 'NOT_RECORDED',
    },
    /** Lower-cased "first last ref" used for staff search (within tenant only). */
    searchText: { type: String, select: false },
    createdBy: ref('User'),
    isSynthetic: { type: Boolean, default: false },
  },
  { tenant: true },
);
patientSchema.index({ hospitalId: 1, hospitalPatientRef: 1 }, { unique: true });
patientSchema.index({ hospitalId: 1, searchText: 1 });
patientSchema.pre('save', function () {
  this.searchText = `${this.firstName} ${this.lastName} ${this.hospitalPatientRef}`.toLowerCase();
});

export type Patient = InferSchemaType<typeof patientSchema>;
export type PatientDocument = HydratedDocument<Patient>;
export const PatientModel = model('Patient', patientSchema);
