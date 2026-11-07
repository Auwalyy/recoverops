import { z } from 'zod';
import {
  CARE_TEAM_ROLES,
  CONTACT_CHANNELS,
  EPISODE_STATUSES,
  PATIENT_STATUSES,
  RECURRENCE_KINDS,
  TASK_TYPES,
} from '../constants/domain';
import { email, isoDate, isoDateTime, language, objectId, optionalLongText, phone, shortText, timeOfDay, timezone, longText } from './common';

/* ------------------------------ Patients ------------------------------ */

export const createPatientSchema = z.object({
  hospitalPatientRef: z.string().trim().min(1).max(64).describe('Hospital number / MRN'),
  firstName: shortText,
  lastName: shortText,
  dateOfBirth: isoDate,
  sex: z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']),
  phone: phone.optional(),
  email: email.optional(),
  preferredLanguage: language.default('en'),
  timezone: timezone.default('Africa/Lagos'),
  contactPreferences: z
    .object({
      channels: z.array(z.enum(CONTACT_CHANNELS)).min(1).default(['PUSH', 'SMS']),
      quietHoursStart: timeOfDay.optional(),
      quietHoursEnd: timeOfDay.optional(),
    })
    .default({ channels: ['PUSH', 'SMS'] }),
  emergencyContact: z
    .object({
      name: shortText,
      relationship: shortText,
      phone,
    })
    .optional(),
  address: z.object({ city: shortText.optional(), state: shortText.optional() }).optional(),
  /** Send an activation invitation to the patient's phone/email. */
  invitePatient: z.boolean().default(false),
});
export type CreatePatientInput = z.infer<typeof createPatientSchema>;

export const updatePatientSchema = createPatientSchema
  .omit({ hospitalPatientRef: true, invitePatient: true })
  .partial()
  .extend({ status: z.enum(PATIENT_STATUSES).optional() });
export type UpdatePatientInput = z.infer<typeof updatePatientSchema>;

export const patientSearchQuery = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(PATIENT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

/* --------------------------- Recovery episodes --------------------------- */

export const createEpisodeSchema = z.object({
  patientId: objectId,
  departmentId: objectId,
  admissionReference: z.string().trim().max(64).optional(),
  diagnosisReference: z.string().trim().max(200).optional(),
  procedureReference: z.string().trim().max(200).optional(),
  admissionDate: isoDate,
  plannedDischargeDate: isoDate.optional(),
  responsibleDoctorId: objectId,
  expectedReviewDate: isoDate.optional(),
  programmeName: z.string().trim().max(120).optional(),
});
export type CreateEpisodeInput = z.infer<typeof createEpisodeSchema>;

export const updateEpisodeSchema = z.object({
  admissionReference: z.string().trim().max(64).optional(),
  diagnosisReference: z.string().trim().max(200).optional(),
  procedureReference: z.string().trim().max(200).optional(),
  expectedReviewDate: isoDate.optional(),
  programmeName: z.string().trim().max(120).optional(),
});

export const episodeTransitionSchema = z.object({
  toStatus: z.enum(EPISODE_STATUSES),
  reason: z.string().trim().min(3).max(1000),
  transfer: z
    .object({
      destination: shortText,
      destinationType: z.enum(['OTHER_HOSPITAL', 'OTHER_DEPARTMENT', 'PRIMARY_CARE', 'OTHER_PATHWAY']),
      notes: optionalLongText,
    })
    .optional(),
  extendedReviewDate: isoDate.optional(),
});
export type EpisodeTransitionInput = z.infer<typeof episodeTransitionSchema>;

export const assignCareTeamSchema = z.object({
  userId: objectId,
  role: z.enum(CARE_TEAM_ROLES),
});

/* ---------------------------- Discharge plans ---------------------------- */

export const recurrenceSchema = z
  .object({
    kind: z.enum(RECURRENCE_KINDS),
    timesOfDay: z.array(timeOfDay).min(1).max(12).default(['09:00']),
    daysOfWeek: z.array(z.number().int().min(1).max(7)).max(7).optional().describe('ISO weekday 1=Mon … 7=Sun'),
    intervalDays: z.number().int().min(2).max(90).optional(),
    startDate: isoDate.optional().describe('Defaults to the discharge date'),
    durationDays: z.number().int().min(1).max(365).optional(),
    endDate: isoDate.optional(),
  })
  .refine((r) => r.kind !== 'WEEKLY' || (r.daysOfWeek && r.daysOfWeek.length > 0), {
    message: 'Weekly recurrence requires daysOfWeek',
    path: ['daysOfWeek'],
  })
  .refine((r) => r.kind !== 'EVERY_N_DAYS' || !!r.intervalDays, {
    message: 'EVERY_N_DAYS recurrence requires intervalDays',
    path: ['intervalDays'],
  });
export type RecurrenceInput = z.infer<typeof recurrenceSchema>;

export const medicationInstructionSchema = z.object({
  name: shortText,
  strength: z.string().trim().max(64).optional(),
  dose: shortText.describe('Exactly as prescribed, e.g. "1 tablet"'),
  route: z.enum(['ORAL', 'TOPICAL', 'INHALED', 'SUBCUTANEOUS', 'INTRAMUSCULAR', 'OTHER']),
  frequencyText: shortText.describe('Prescriber wording, e.g. "Twice daily after meals"'),
  schedule: recurrenceSchema,
  instructions: optionalLongText,
  isPrn: z.boolean().default(false).describe('As-needed medication; no fixed reminders generated'),
});

export const instructionItemSchema = z.object({
  title: shortText,
  details: longText,
});

export const followUpSchema = z.object({
  type: z.enum(['FOLLOW_UP', 'REVIEW', 'INVESTIGATION', 'WOUND_CHECK', 'REHABILITATION', 'OTHER']),
  description: shortText,
  dueDate: isoDate.optional(),
  clinicianId: objectId.optional(),
});

export const scheduledActivitySchema = z.object({
  type: z.enum(TASK_TYPES),
  title: shortText,
  instructions: optionalLongText,
  recurrence: recurrenceSchema,
});

export const dischargeContentSchema = z.object({
  summary: z.string().trim().max(10000).default(''),
  clinicalInstructions: z.array(instructionItemSchema).max(50).default([]),
  medications: z.array(medicationInstructionSchema).max(50).default([]),
  woundCare: z.array(instructionItemSchema).max(20).default([]),
  activityRestrictions: z.array(instructionItemSchema).max(20).default([]),
  dietaryInstructions: z.array(instructionItemSchema).max(20).default([]),
  warningSigns: z.array(instructionItemSchema).max(30).default([]),
  followUps: z.array(followUpSchema).max(20).default([]),
  rehabilitationRequirements: z.array(instructionItemSchema).max(20).default([]),
  education: z.array(instructionItemSchema).max(20).default([]),
  /** Additional clinician-defined recurring activities (wound-care reminders, check-ins, etc.). */
  activities: z.array(scheduledActivitySchema).max(50).default([]),
  checkInTemplateId: objectId.optional(),
  checkInSchedule: recurrenceSchema.optional(),
  programmeDurationDays: z.number().int().min(1).max(365).default(30),
});
export type DischargeContent = z.infer<typeof dischargeContentSchema>;

export const createDischargePlanSchema = z.object({
  episodeId: objectId,
  content: dischargeContentSchema,
});
export const updateDischargePlanSchema = z.object({ content: dischargeContentSchema });
export const submitDischargePlanSchema = z.object({ comment: z.string().trim().max(2000).optional() });
export const approveDischargePlanSchema = z.object({
  decision: z.enum(['APPROVED', 'REJECTED']),
  comment: z.string().trim().max(2000).optional(),
  /** ISO date of the discharge (defaults to today in hospital timezone). */
  dischargeDate: isoDate.optional(),
  /** Activate the recovery programme immediately on approval. */
  activate: z.boolean().default(true),
});
export const recordUnderstandingSchema = z.object({
  method: z.enum(['TEACH_BACK', 'VERBAL_CONFIRMATION', 'WRITTEN', 'INTERPRETER_ASSISTED', 'CAREGIVER_CONFIRMED']),
  understood: z.boolean(),
  notes: optionalLongText,
});

/* ------------------------------ Tasks ------------------------------ */

export const completeTaskSchema = z.object({
  status: z.enum(['COMPLETED', 'SKIPPED']).default('COMPLETED'),
  response: z.string().trim().max(2000).optional(),
  completedAt: isoDateTime.optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});

export const taskListQuery = z.object({
  from: isoDateTime.optional(),
  to: isoDateTime.optional(),
  status: z.enum(['PENDING', 'COMPLETED', 'MISSED', 'SKIPPED', 'CANCELLED']).optional(),
  type: z.enum(TASK_TYPES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
