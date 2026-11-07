import { z } from 'zod';
import {
  ALERT_ACTION_TYPES,
  ALERT_PRIORITIES,
  ALERT_SOURCES,
  ALERT_STATUSES,
  APPOINTMENT_MODES,
  APPOINTMENT_TYPES,
  CAREGIVER_SCOPE_KEYS,
  CHECKIN_KINDS,
  CONSENT_TYPES,
  MEDICATION_EVENT_STATUSES,
  MESSAGE_CATEGORIES,
  QUESTION_TYPES,
  RULE_OPERATORS,
  SYMPTOM_SEVERITIES,
  SYMPTOM_TRENDS,
  CARE_TEAM_ROLES,
} from '../constants/domain';
import { ROLES } from '../constants/roles';
import { email, isoDateTime, objectId, optionalLongText, phone, shortText, longText, isoDate, timeOfDay } from './common';

/* --------------------------- Check-in templates --------------------------- */

export const questionSchema = z.object({
  key: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use snake_case keys'),
  type: z.enum(QUESTION_TYPES),
  label: shortText,
  helpText: z.string().max(500).optional(),
  required: z.boolean().default(true),
  options: z.array(z.object({ value: z.string().min(1).max(64), label: shortText })).max(20).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
  translations: z.record(z.string(), z.object({ label: shortText, helpText: z.string().max(500).optional() })).optional(),
});
export type CheckInQuestion = z.infer<typeof questionSchema>;

export const createCheckInTemplateSchema = z.object({
  name: shortText,
  kind: z.enum(CHECKIN_KINDS),
  description: optionalLongText,
  questions: z.array(questionSchema).min(1).max(40),
});

/* ------------------------------ Check-ins ------------------------------ */

export const answerValue = z.union([z.string().max(2000), z.number(), z.boolean(), z.array(z.string().max(64)).max(20)]);

export const submitCheckInSchema = z.object({
  episodeId: objectId,
  templateId: objectId,
  taskId: objectId.optional(),
  answers: z.record(z.string(), answerValue),
  notes: z.string().trim().max(2000).optional(),
  attachmentIds: z.array(objectId).max(5).optional(),
  /** Client-generated key to make offline/queued submissions idempotent. */
  idempotencyKey: z.string().min(8).max(100),
  clientSubmittedAt: isoDateTime.optional(),
});
export type SubmitCheckInInput = z.infer<typeof submitCheckInSchema>;

/* ------------------------------ Symptoms ------------------------------ */

export const submitSymptomSchema = z.object({
  episodeId: objectId,
  symptomCode: z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional(),
  description: z.string().trim().min(2).max(2000),
  severity: z.enum(SYMPTOM_SEVERITIES),
  onsetAt: isoDateTime.optional(),
  durationText: z.string().trim().max(200).optional(),
  trend: z.enum(SYMPTOM_TRENDS),
  attachmentIds: z.array(objectId).max(5).optional(),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export type SubmitSymptomInput = z.infer<typeof submitSymptomSchema>;

export const reviewSchema = z.object({ notes: optionalLongText });

/* --------------------------- Medication events --------------------------- */

export const medicationEventSchema = z.object({
  medicationOrderId: objectId,
  taskId: objectId.optional(),
  scheduledFor: isoDateTime.optional(),
  status: z.enum(MEDICATION_EVENT_STATUSES).exclude(['NOT_RESPONDED', 'REQUIRES_REVIEW']),
  reportedTakenAt: isoDateTime.optional(),
  reason: z.string().trim().max(1000).optional(),
  sideEffects: z.string().trim().max(1000).optional(),
  accessProblem: z.enum(['COST', 'OUT_OF_STOCK', 'PHARMACY_ACCESS', 'LOST', 'OTHER']).optional(),
  requestPharmacistReview: z.boolean().default(false),
  idempotencyKey: z.string().min(8).max(100),
});
export type MedicationEventInput = z.infer<typeof medicationEventSchema>;

/* ------------------------------ Alert rules ------------------------------ */

export const ruleConditionSchema = z.object({
  field: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,80}$/),
  op: z.enum(RULE_OPERATORS),
  value: z.union([z.string(), z.number(), z.boolean(), z.array(z.union([z.string(), z.number()]))]).optional(),
});
export type RuleCondition = z.infer<typeof ruleConditionSchema>;

export const createAlertRuleSchema = z.object({
  name: shortText,
  description: longText,
  source: z.enum(ALERT_SOURCES).exclude(['MANUAL']),
  /** All conditions in `all` must match, plus at least one in `any` (if provided). */
  conditions: z.object({
    all: z.array(ruleConditionSchema).max(20).default([]),
    any: z.array(ruleConditionSchema).max(20).default([]),
  }),
  checkInTemplateId: objectId.optional(),
  priority: z.enum(ALERT_PRIORITIES),
  title: shortText,
  /** Patient-facing safety message — must be text approved by the clinical team. */
  patientSafetyMessage: z.string().trim().max(1000).optional(),
  showEmergencyGuidance: z.boolean().default(false),
  routing: z.object({
    careTeamRoles: z.array(z.enum(CARE_TEAM_ROLES)).min(1),
    acknowledgeWithinMinutes: z.number().int().min(1).max(10080),
    escalateToRoles: z.array(z.enum(ROLES)).min(1),
    maxEscalationLevel: z.number().int().min(1).max(5).default(2),
  }),
  evidenceReference: z.string().trim().max(500).optional().describe('Protocol / guideline the rule is based on'),
});
export type CreateAlertRuleInput = z.infer<typeof createAlertRuleSchema>;

/* -------------------------------- Alerts -------------------------------- */

export const alertListQuery = z.object({
  status: z.enum(ALERT_STATUSES).optional(),
  open: z.coerce.boolean().optional(),
  priority: z.enum(ALERT_PRIORITIES).optional(),
  assignedToMe: z.coerce.boolean().optional(),
  patientId: objectId.optional(),
  episodeId: objectId.optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});

export const assignAlertSchema = z.object({ userId: objectId, note: z.string().trim().max(1000).optional() });
export const alertActionSchema = z.object({
  type: z.enum(ALERT_ACTION_TYPES).exclude(['STATUS_CHANGE', 'ASSIGNMENT', 'ESCALATION']),
  notes: longText,
  contactOutcome: z.enum(['REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'VOICEMAIL', 'CALLBACK_REQUESTED']).optional(),
  setStatus: z.enum(['UNDER_REVIEW', 'ACTION_REQUIRED']).optional(),
});
export const resolveAlertSchema = z.object({
  outcome: z.enum([
    'ADVICE_GIVEN',
    'APPOINTMENT_ARRANGED',
    'REFERRED_TO_EMERGENCY',
    'MEDICATION_REVIEWED',
    'NO_ACTION_REQUIRED',
    'PATIENT_UNREACHABLE',
    'OTHER',
  ]),
  notes: longText,
});
export const createManualAlertSchema = z.object({
  episodeId: objectId,
  priority: z.enum(ALERT_PRIORITIES),
  title: shortText,
  summary: longText,
});

/* ------------------------------ Appointments ------------------------------ */

export const createAppointmentSchema = z.object({
  episodeId: objectId,
  clinicianId: objectId.optional(),
  type: z.enum(APPOINTMENT_TYPES),
  mode: z.enum(APPOINTMENT_MODES).default('IN_PERSON'),
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(5).max(480).default(30),
  location: z.string().trim().max(200).optional(),
  instructions: optionalLongText,
  reminderOffsetsMinutes: z.array(z.number().int().min(15).max(10080)).max(5).default([1440, 120]),
});
export const updateAppointmentSchema = z.object({
  clinicianId: objectId.optional(),
  scheduledAt: isoDateTime.optional(),
  durationMinutes: z.number().int().min(5).max(480).optional(),
  location: z.string().trim().max(200).optional(),
  instructions: optionalLongText,
  mode: z.enum(APPOINTMENT_MODES).optional(),
  status: z.enum(['CANCELLED', 'ATTENDED', 'MISSED']).optional(),
  reason: z.string().trim().max(1000).optional(),
  followUpNote: z.string().trim().max(5000).optional(),
});
export const appointmentResponseSchema = z.object({
  action: z.enum(['CONFIRM', 'REQUEST_RESCHEDULE']),
  reason: z.string().trim().max(1000).optional(),
  preferredDates: z.array(isoDate).max(5).optional(),
});

/* ----------------------------- Rehabilitation ----------------------------- */

export const exerciseSchema = z.object({
  name: shortText,
  instructions: longText.describe('Clinician-authored exercise instructions'),
  sets: z.number().int().min(1).max(50).optional(),
  repetitions: z.number().int().min(1).max(500).optional(),
  holdSeconds: z.number().int().min(1).max(600).optional(),
  frequencyText: shortText,
  timesOfDay: z.array(timeOfDay).max(6).optional(),
});
export const createRehabPlanSchema = z.object({
  episodeId: objectId,
  physiotherapistId: objectId,
  goals: z.array(shortText).min(1).max(20),
  exercises: z.array(exerciseSchema).max(30).default([]),
  milestones: z.array(z.object({ title: shortText, targetDate: isoDate.optional() })).max(20).default([]),
  startDate: isoDate,
  endDate: isoDate.optional(),
});
export const createRehabSessionSchema = z.object({
  planId: objectId,
  scheduledAt: isoDateTime,
  durationMinutes: z.number().int().min(5).max(240).default(45),
  location: z.string().trim().max(200).optional(),
  mode: z.enum(APPOINTMENT_MODES).default('IN_PERSON'),
});
export const recordRehabSessionSchema = z.object({
  status: z.enum(['ATTENDED', 'MISSED', 'CANCELLED']),
  progressNotes: optionalLongText,
  assessment: z
    .object({
      painScore: z.number().int().min(0).max(10).optional(),
      mobilityNotes: optionalLongText,
      functionalScore: z.number().min(0).max(100).optional(),
    })
    .optional(),
});
export const rehabDifficultySchema = z.object({
  difficulty: z.number().int().min(0).max(10),
  notes: z.string().trim().max(2000).optional(),
  idempotencyKey: z.string().min(8).max(100),
});
export const achieveMilestoneSchema = z.object({ notes: optionalLongText });

/* ------------------------------ Caregivers ------------------------------ */

export const inviteCaregiverSchema = z
  .object({
    patientId: objectId.optional().describe('Required when staff invite on behalf of a patient'),
    name: shortText,
    relationship: shortText,
    email: email.optional(),
    phone: phone.optional(),
    scopes: z.array(z.enum(CAREGIVER_SCOPE_KEYS as [string, ...string[]])).min(1),
    expiresInDays: z.number().int().min(1).max(365).default(90),
  })
  .refine((v) => v.email || v.phone, { message: 'Email or phone is required', path: ['email'] });

export const updateCaregiverScopesSchema = z.object({
  scopes: z.array(z.enum(CAREGIVER_SCOPE_KEYS as [string, ...string[]])).min(1),
});

/* -------------------------------- Consent -------------------------------- */

export const grantConsentSchema = z.object({
  patientId: objectId.optional(),
  type: z.enum(CONSENT_TYPES),
  version: z.string().trim().min(1).max(20),
  method: z.enum(['IN_APP', 'WRITTEN', 'VERBAL_RECORDED_BY_STAFF']).default('IN_APP'),
});
export const revokeConsentSchema = z.object({ reason: z.string().trim().max(1000).optional() });

/* ------------------------------- Messaging ------------------------------- */

export const createConversationSchema = z.object({
  patientId: objectId.optional(),
  episodeId: objectId.optional(),
  subject: shortText,
  category: z.enum(MESSAGE_CATEGORIES).default('GENERAL'),
  initialMessage: longText,
});
export const sendMessageSchema = z.object({
  body: longText,
  type: z.enum(['TEXT', 'CALLBACK_REQUEST']).default('TEXT'),
  attachmentIds: z.array(objectId).max(5).optional(),
  idempotencyKey: z.string().min(8).max(100).optional(),
});
export const assignConversationSchema = z.object({ userId: objectId });

/* ------------------------------ Staff & hospital ------------------------------ */

export const inviteStaffSchema = z.object({
  email,
  phone: phone.optional(),
  firstName: shortText,
  lastName: shortText,
  roles: z.array(z.enum(ROLES)).min(1),
  departmentIds: z.array(objectId).default([]),
  title: z.string().trim().max(60).optional(),
});
export const updateStaffSchema = z.object({
  roles: z.array(z.enum(ROLES)).min(1).optional(),
  departmentIds: z.array(objectId).optional(),
  title: z.string().trim().max(60).optional(),
});
export const createDepartmentSchema = z.object({
  name: shortText,
  code: z.string().trim().regex(/^[A-Z0-9_-]{2,20}$/),
  description: z.string().trim().max(500).optional(),
});
export const updateHospitalSchema = z.object({
  name: shortText.optional(),
  email: email.optional(),
  phone: phone.optional(),
  emergencyPhone: phone.optional(),
  address: z.object({ line1: shortText, city: shortText, state: shortText, country: z.string().length(2) }).partial().optional(),
  timezone: z.string().optional(),
  settings: z
    .object({
      defaultCheckInTime: timeOfDay.optional(),
      taskGenerationWindowDays: z.number().int().min(1).max(30).optional(),
      missedTaskGraceMinutes: z.number().int().min(15).max(1440).optional(),
      breakGlassEnabled: z.boolean().optional(),
      aiFeaturesEnabled: z.boolean().optional(),
      defaultLanguage: z.enum(['en', 'ha', 'pcm']).optional(),
      emergencyInstructions: z.string().trim().max(1000).optional(),
      notificationChannels: z.array(z.enum(['PUSH', 'SMS', 'EMAIL', 'WHATSAPP'])).optional(),
    })
    .optional(),
});
export const breakGlassSchema = z.object({
  patientId: objectId,
  reason: z.string().trim().min(10).max(1000),
  durationMinutes: z.number().int().min(5).max(240).default(60),
});

/* ---------------------------------- AI ---------------------------------- */

export const aiExplainSchema = z.object({
  dischargePlanVersionId: objectId,
  section: z.enum(['clinicalInstructions', 'medications', 'woundCare', 'activityRestrictions', 'dietaryInstructions', 'warningSigns', 'education']),
  itemIndex: z.number().int().min(0).max(100),
  language: z.enum(['en', 'ha', 'pcm']).default('en'),
});
export const aiClassifySchema = z.object({ messageId: objectId });
export const aiSummariseSchema = z.object({
  episodeId: objectId,
  periodDays: z.number().int().min(1).max(30).default(7),
});

/* ------------------------------- Analytics ------------------------------- */

export const analyticsQuery = z.object({
  from: isoDate.optional(),
  to: isoDate.optional(),
  departmentId: objectId.optional(),
});

export const satisfactionSchema = z.object({
  episodeId: objectId,
  score: z.number().int().min(1).max(5),
  comment: z.string().trim().max(2000).optional(),
});
