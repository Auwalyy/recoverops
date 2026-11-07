import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { APPOINTMENT_MODES, APPOINTMENT_STATUSES, APPOINTMENT_TYPES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

const appointmentSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    clinicianId: { ...ref('User'), index: true },
    type: { type: String, enum: APPOINTMENT_TYPES, required: true },
    mode: { type: String, enum: APPOINTMENT_MODES, default: 'IN_PERSON' },
    scheduledAt: { type: Date, required: true, index: true },
    durationMinutes: { type: Number, default: 30 },
    location: String,
    instructions: String,
    status: { type: String, enum: APPOINTMENT_STATUSES, default: 'SCHEDULED', index: true },
    reminderOffsetsMinutes: { type: [Number], default: [1440, 120] },
    patientConfirmedAt: Date,
    rescheduleRequest: { requestedAt: Date, reason: String, preferredDates: [String], requestedBy: ref('User') },
    cancellation: { cancelledAt: Date, cancelledBy: ref('User'), reason: String },
    attendance: { recordedAt: Date, recordedBy: ref('User'), attended: Boolean },
    followUpNotes: [{ note: String, authorId: ref('User'), at: { type: Date, default: Date.now } }],
    history: [{ _id: false, from: String, to: String, at: Date, by: ref('User'), reason: String }],
    createdBy: ref('User'),
  },
  { tenant: true },
);
appointmentSchema.index({ hospitalId: 1, scheduledAt: 1, status: 1 });
export type Appointment = InferSchemaType<typeof appointmentSchema>;
export type AppointmentDocument = HydratedDocument<Appointment>;
export const AppointmentModel = model('Appointment', appointmentSchema);
