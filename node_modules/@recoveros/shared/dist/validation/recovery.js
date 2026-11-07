"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.taskListQuery = exports.completeTaskSchema = exports.recordUnderstandingSchema = exports.approveDischargePlanSchema = exports.submitDischargePlanSchema = exports.updateDischargePlanSchema = exports.createDischargePlanSchema = exports.dischargeContentSchema = exports.scheduledActivitySchema = exports.followUpSchema = exports.instructionItemSchema = exports.medicationInstructionSchema = exports.recurrenceSchema = exports.assignCareTeamSchema = exports.episodeTransitionSchema = exports.updateEpisodeSchema = exports.createEpisodeSchema = exports.patientSearchQuery = exports.updatePatientSchema = exports.createPatientSchema = void 0;
const zod_1 = require("zod");
const domain_1 = require("../constants/domain");
const common_1 = require("./common");
/* ------------------------------ Patients ------------------------------ */
exports.createPatientSchema = zod_1.z.object({
    hospitalPatientRef: zod_1.z.string().trim().min(1).max(64).describe('Hospital number / MRN'),
    firstName: common_1.shortText,
    lastName: common_1.shortText,
    dateOfBirth: common_1.isoDate,
    sex: zod_1.z.enum(['FEMALE', 'MALE', 'OTHER', 'UNDISCLOSED']),
    phone: common_1.phone.optional(),
    email: common_1.email.optional(),
    preferredLanguage: common_1.language.default('en'),
    timezone: common_1.timezone.default('Africa/Lagos'),
    contactPreferences: zod_1.z
        .object({
        channels: zod_1.z.array(zod_1.z.enum(domain_1.CONTACT_CHANNELS)).min(1).default(['PUSH', 'SMS']),
        quietHoursStart: common_1.timeOfDay.optional(),
        quietHoursEnd: common_1.timeOfDay.optional(),
    })
        .default({ channels: ['PUSH', 'SMS'] }),
    emergencyContact: zod_1.z
        .object({
        name: common_1.shortText,
        relationship: common_1.shortText,
        phone: common_1.phone,
    })
        .optional(),
    address: zod_1.z.object({ city: common_1.shortText.optional(), state: common_1.shortText.optional() }).optional(),
    /** Send an activation invitation to the patient's phone/email. */
    invitePatient: zod_1.z.boolean().default(false),
});
exports.updatePatientSchema = exports.createPatientSchema
    .omit({ hospitalPatientRef: true, invitePatient: true })
    .partial()
    .extend({ status: zod_1.z.enum(domain_1.PATIENT_STATUSES).optional() });
exports.patientSearchQuery = zod_1.z.object({
    q: zod_1.z.string().trim().max(100).optional(),
    status: zod_1.z.enum(domain_1.PATIENT_STATUSES).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
/* --------------------------- Recovery episodes --------------------------- */
exports.createEpisodeSchema = zod_1.z.object({
    patientId: common_1.objectId,
    departmentId: common_1.objectId,
    admissionReference: zod_1.z.string().trim().max(64).optional(),
    diagnosisReference: zod_1.z.string().trim().max(200).optional(),
    procedureReference: zod_1.z.string().trim().max(200).optional(),
    admissionDate: common_1.isoDate,
    plannedDischargeDate: common_1.isoDate.optional(),
    responsibleDoctorId: common_1.objectId,
    expectedReviewDate: common_1.isoDate.optional(),
    programmeName: zod_1.z.string().trim().max(120).optional(),
});
exports.updateEpisodeSchema = zod_1.z.object({
    admissionReference: zod_1.z.string().trim().max(64).optional(),
    diagnosisReference: zod_1.z.string().trim().max(200).optional(),
    procedureReference: zod_1.z.string().trim().max(200).optional(),
    expectedReviewDate: common_1.isoDate.optional(),
    programmeName: zod_1.z.string().trim().max(120).optional(),
});
exports.episodeTransitionSchema = zod_1.z.object({
    toStatus: zod_1.z.enum(domain_1.EPISODE_STATUSES),
    reason: zod_1.z.string().trim().min(3).max(1000),
    transfer: zod_1.z
        .object({
        destination: common_1.shortText,
        destinationType: zod_1.z.enum(['OTHER_HOSPITAL', 'OTHER_DEPARTMENT', 'PRIMARY_CARE', 'OTHER_PATHWAY']),
        notes: common_1.optionalLongText,
    })
        .optional(),
    extendedReviewDate: common_1.isoDate.optional(),
});
exports.assignCareTeamSchema = zod_1.z.object({
    userId: common_1.objectId,
    role: zod_1.z.enum(domain_1.CARE_TEAM_ROLES),
});
/* ---------------------------- Discharge plans ---------------------------- */
exports.recurrenceSchema = zod_1.z
    .object({
    kind: zod_1.z.enum(domain_1.RECURRENCE_KINDS),
    timesOfDay: zod_1.z.array(common_1.timeOfDay).min(1).max(12).default(['09:00']),
    daysOfWeek: zod_1.z.array(zod_1.z.number().int().min(1).max(7)).max(7).optional().describe('ISO weekday 1=Mon … 7=Sun'),
    intervalDays: zod_1.z.number().int().min(2).max(90).optional(),
    startDate: common_1.isoDate.optional().describe('Defaults to the discharge date'),
    durationDays: zod_1.z.number().int().min(1).max(365).optional(),
    endDate: common_1.isoDate.optional(),
})
    .refine((r) => r.kind !== 'WEEKLY' || (r.daysOfWeek && r.daysOfWeek.length > 0), {
    message: 'Weekly recurrence requires daysOfWeek',
    path: ['daysOfWeek'],
})
    .refine((r) => r.kind !== 'EVERY_N_DAYS' || !!r.intervalDays, {
    message: 'EVERY_N_DAYS recurrence requires intervalDays',
    path: ['intervalDays'],
});
exports.medicationInstructionSchema = zod_1.z.object({
    name: common_1.shortText,
    strength: zod_1.z.string().trim().max(64).optional(),
    dose: common_1.shortText.describe('Exactly as prescribed, e.g. "1 tablet"'),
    route: zod_1.z.enum(['ORAL', 'TOPICAL', 'INHALED', 'SUBCUTANEOUS', 'INTRAMUSCULAR', 'OTHER']),
    frequencyText: common_1.shortText.describe('Prescriber wording, e.g. "Twice daily after meals"'),
    schedule: exports.recurrenceSchema,
    instructions: common_1.optionalLongText,
    isPrn: zod_1.z.boolean().default(false).describe('As-needed medication; no fixed reminders generated'),
});
exports.instructionItemSchema = zod_1.z.object({
    title: common_1.shortText,
    details: common_1.longText,
});
exports.followUpSchema = zod_1.z.object({
    type: zod_1.z.enum(['FOLLOW_UP', 'REVIEW', 'INVESTIGATION', 'WOUND_CHECK', 'REHABILITATION', 'OTHER']),
    description: common_1.shortText,
    dueDate: common_1.isoDate.optional(),
    clinicianId: common_1.objectId.optional(),
});
exports.scheduledActivitySchema = zod_1.z.object({
    type: zod_1.z.enum(domain_1.TASK_TYPES),
    title: common_1.shortText,
    instructions: common_1.optionalLongText,
    recurrence: exports.recurrenceSchema,
});
exports.dischargeContentSchema = zod_1.z.object({
    summary: zod_1.z.string().trim().max(10000).default(''),
    clinicalInstructions: zod_1.z.array(exports.instructionItemSchema).max(50).default([]),
    medications: zod_1.z.array(exports.medicationInstructionSchema).max(50).default([]),
    woundCare: zod_1.z.array(exports.instructionItemSchema).max(20).default([]),
    activityRestrictions: zod_1.z.array(exports.instructionItemSchema).max(20).default([]),
    dietaryInstructions: zod_1.z.array(exports.instructionItemSchema).max(20).default([]),
    warningSigns: zod_1.z.array(exports.instructionItemSchema).max(30).default([]),
    followUps: zod_1.z.array(exports.followUpSchema).max(20).default([]),
    rehabilitationRequirements: zod_1.z.array(exports.instructionItemSchema).max(20).default([]),
    education: zod_1.z.array(exports.instructionItemSchema).max(20).default([]),
    /** Additional clinician-defined recurring activities (wound-care reminders, check-ins, etc.). */
    activities: zod_1.z.array(exports.scheduledActivitySchema).max(50).default([]),
    checkInTemplateId: common_1.objectId.optional(),
    checkInSchedule: exports.recurrenceSchema.optional(),
    programmeDurationDays: zod_1.z.number().int().min(1).max(365).default(30),
});
exports.createDischargePlanSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    content: exports.dischargeContentSchema,
});
exports.updateDischargePlanSchema = zod_1.z.object({ content: exports.dischargeContentSchema });
exports.submitDischargePlanSchema = zod_1.z.object({ comment: zod_1.z.string().trim().max(2000).optional() });
exports.approveDischargePlanSchema = zod_1.z.object({
    decision: zod_1.z.enum(['APPROVED', 'REJECTED']),
    comment: zod_1.z.string().trim().max(2000).optional(),
    /** ISO date of the discharge (defaults to today in hospital timezone). */
    dischargeDate: common_1.isoDate.optional(),
    /** Activate the recovery programme immediately on approval. */
    activate: zod_1.z.boolean().default(true),
});
exports.recordUnderstandingSchema = zod_1.z.object({
    method: zod_1.z.enum(['TEACH_BACK', 'VERBAL_CONFIRMATION', 'WRITTEN', 'INTERPRETER_ASSISTED', 'CAREGIVER_CONFIRMED']),
    understood: zod_1.z.boolean(),
    notes: common_1.optionalLongText,
});
/* ------------------------------ Tasks ------------------------------ */
exports.completeTaskSchema = zod_1.z.object({
    status: zod_1.z.enum(['COMPLETED', 'SKIPPED']).default('COMPLETED'),
    response: zod_1.z.string().trim().max(2000).optional(),
    completedAt: common_1.isoDateTime.optional(),
    idempotencyKey: zod_1.z.string().min(8).max(100).optional(),
});
exports.taskListQuery = zod_1.z.object({
    from: common_1.isoDateTime.optional(),
    to: common_1.isoDateTime.optional(),
    status: zod_1.z.enum(['PENDING', 'COMPLETED', 'MISSED', 'SKIPPED', 'CANCELLED']).optional(),
    type: zod_1.z.enum(domain_1.TASK_TYPES).optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(200).default(50),
});
