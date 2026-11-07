"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.satisfactionSchema = exports.analyticsQuery = exports.aiSummariseSchema = exports.aiClassifySchema = exports.aiExplainSchema = exports.breakGlassSchema = exports.updateHospitalSchema = exports.createDepartmentSchema = exports.updateStaffSchema = exports.inviteStaffSchema = exports.assignConversationSchema = exports.sendMessageSchema = exports.createConversationSchema = exports.revokeConsentSchema = exports.grantConsentSchema = exports.updateCaregiverScopesSchema = exports.inviteCaregiverSchema = exports.achieveMilestoneSchema = exports.rehabDifficultySchema = exports.recordRehabSessionSchema = exports.createRehabSessionSchema = exports.createRehabPlanSchema = exports.exerciseSchema = exports.appointmentResponseSchema = exports.updateAppointmentSchema = exports.createAppointmentSchema = exports.createManualAlertSchema = exports.resolveAlertSchema = exports.alertActionSchema = exports.assignAlertSchema = exports.alertListQuery = exports.createAlertRuleSchema = exports.ruleConditionSchema = exports.medicationEventSchema = exports.reviewSchema = exports.submitSymptomSchema = exports.submitCheckInSchema = exports.answerValue = exports.createCheckInTemplateSchema = exports.questionSchema = void 0;
const zod_1 = require("zod");
const domain_1 = require("../constants/domain");
const roles_1 = require("../constants/roles");
const common_1 = require("./common");
/* --------------------------- Check-in templates --------------------------- */
exports.questionSchema = zod_1.z.object({
    key: zod_1.z.string().regex(/^[a-z][a-z0-9_]{1,40}$/, 'Use snake_case keys'),
    type: zod_1.z.enum(domain_1.QUESTION_TYPES),
    label: common_1.shortText,
    helpText: zod_1.z.string().max(500).optional(),
    required: zod_1.z.boolean().default(true),
    options: zod_1.z.array(zod_1.z.object({ value: zod_1.z.string().min(1).max(64), label: common_1.shortText })).max(20).optional(),
    min: zod_1.z.number().optional(),
    max: zod_1.z.number().optional(),
    translations: zod_1.z.record(zod_1.z.string(), zod_1.z.object({ label: common_1.shortText, helpText: zod_1.z.string().max(500).optional() })).optional(),
});
exports.createCheckInTemplateSchema = zod_1.z.object({
    name: common_1.shortText,
    kind: zod_1.z.enum(domain_1.CHECKIN_KINDS),
    description: common_1.optionalLongText,
    questions: zod_1.z.array(exports.questionSchema).min(1).max(40),
});
/* ------------------------------ Check-ins ------------------------------ */
exports.answerValue = zod_1.z.union([zod_1.z.string().max(2000), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.array(zod_1.z.string().max(64)).max(20)]);
exports.submitCheckInSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    templateId: common_1.objectId,
    taskId: common_1.objectId.optional(),
    answers: zod_1.z.record(zod_1.z.string(), exports.answerValue),
    notes: zod_1.z.string().trim().max(2000).optional(),
    attachmentIds: zod_1.z.array(common_1.objectId).max(5).optional(),
    /** Client-generated key to make offline/queued submissions idempotent. */
    idempotencyKey: zod_1.z.string().min(8).max(100),
    clientSubmittedAt: common_1.isoDateTime.optional(),
});
/* ------------------------------ Symptoms ------------------------------ */
exports.submitSymptomSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    symptomCode: zod_1.z.string().regex(/^[a-z][a-z0-9_]{1,40}$/).optional(),
    description: zod_1.z.string().trim().min(2).max(2000),
    severity: zod_1.z.enum(domain_1.SYMPTOM_SEVERITIES),
    onsetAt: common_1.isoDateTime.optional(),
    durationText: zod_1.z.string().trim().max(200).optional(),
    trend: zod_1.z.enum(domain_1.SYMPTOM_TRENDS),
    attachmentIds: zod_1.z.array(common_1.objectId).max(5).optional(),
    notes: zod_1.z.string().trim().max(2000).optional(),
    idempotencyKey: zod_1.z.string().min(8).max(100),
});
exports.reviewSchema = zod_1.z.object({ notes: common_1.optionalLongText });
/* --------------------------- Medication events --------------------------- */
exports.medicationEventSchema = zod_1.z.object({
    medicationOrderId: common_1.objectId,
    taskId: common_1.objectId.optional(),
    scheduledFor: common_1.isoDateTime.optional(),
    status: zod_1.z.enum(domain_1.MEDICATION_EVENT_STATUSES).exclude(['NOT_RESPONDED', 'REQUIRES_REVIEW']),
    reportedTakenAt: common_1.isoDateTime.optional(),
    reason: zod_1.z.string().trim().max(1000).optional(),
    sideEffects: zod_1.z.string().trim().max(1000).optional(),
    accessProblem: zod_1.z.enum(['COST', 'OUT_OF_STOCK', 'PHARMACY_ACCESS', 'LOST', 'OTHER']).optional(),
    requestPharmacistReview: zod_1.z.boolean().default(false),
    idempotencyKey: zod_1.z.string().min(8).max(100),
});
/* ------------------------------ Alert rules ------------------------------ */
exports.ruleConditionSchema = zod_1.z.object({
    field: zod_1.z.string().regex(/^[a-zA-Z][a-zA-Z0-9_.]{0,80}$/),
    op: zod_1.z.enum(domain_1.RULE_OPERATORS),
    value: zod_1.z.union([zod_1.z.string(), zod_1.z.number(), zod_1.z.boolean(), zod_1.z.array(zod_1.z.union([zod_1.z.string(), zod_1.z.number()]))]).optional(),
});
exports.createAlertRuleSchema = zod_1.z.object({
    name: common_1.shortText,
    description: common_1.longText,
    source: zod_1.z.enum(domain_1.ALERT_SOURCES).exclude(['MANUAL']),
    /** All conditions in `all` must match, plus at least one in `any` (if provided). */
    conditions: zod_1.z.object({
        all: zod_1.z.array(exports.ruleConditionSchema).max(20).default([]),
        any: zod_1.z.array(exports.ruleConditionSchema).max(20).default([]),
    }),
    checkInTemplateId: common_1.objectId.optional(),
    priority: zod_1.z.enum(domain_1.ALERT_PRIORITIES),
    title: common_1.shortText,
    /** Patient-facing safety message — must be text approved by the clinical team. */
    patientSafetyMessage: zod_1.z.string().trim().max(1000).optional(),
    showEmergencyGuidance: zod_1.z.boolean().default(false),
    routing: zod_1.z.object({
        careTeamRoles: zod_1.z.array(zod_1.z.enum(domain_1.CARE_TEAM_ROLES)).min(1),
        acknowledgeWithinMinutes: zod_1.z.number().int().min(1).max(10080),
        escalateToRoles: zod_1.z.array(zod_1.z.enum(roles_1.ROLES)).min(1),
        maxEscalationLevel: zod_1.z.number().int().min(1).max(5).default(2),
    }),
    evidenceReference: zod_1.z.string().trim().max(500).optional().describe('Protocol / guideline the rule is based on'),
});
/* -------------------------------- Alerts -------------------------------- */
exports.alertListQuery = zod_1.z.object({
    status: zod_1.z.enum(domain_1.ALERT_STATUSES).optional(),
    open: zod_1.z.coerce.boolean().optional(),
    priority: zod_1.z.enum(domain_1.ALERT_PRIORITIES).optional(),
    assignedToMe: zod_1.z.coerce.boolean().optional(),
    patientId: common_1.objectId.optional(),
    episodeId: common_1.objectId.optional(),
    page: zod_1.z.coerce.number().int().min(1).default(1),
    limit: zod_1.z.coerce.number().int().min(1).max(100).default(20),
});
exports.assignAlertSchema = zod_1.z.object({ userId: common_1.objectId, note: zod_1.z.string().trim().max(1000).optional() });
exports.alertActionSchema = zod_1.z.object({
    type: zod_1.z.enum(domain_1.ALERT_ACTION_TYPES).exclude(['STATUS_CHANGE', 'ASSIGNMENT', 'ESCALATION']),
    notes: common_1.longText,
    contactOutcome: zod_1.z.enum(['REACHED', 'NO_ANSWER', 'WRONG_NUMBER', 'VOICEMAIL', 'CALLBACK_REQUESTED']).optional(),
    setStatus: zod_1.z.enum(['UNDER_REVIEW', 'ACTION_REQUIRED']).optional(),
});
exports.resolveAlertSchema = zod_1.z.object({
    outcome: zod_1.z.enum([
        'ADVICE_GIVEN',
        'APPOINTMENT_ARRANGED',
        'REFERRED_TO_EMERGENCY',
        'MEDICATION_REVIEWED',
        'NO_ACTION_REQUIRED',
        'PATIENT_UNREACHABLE',
        'OTHER',
    ]),
    notes: common_1.longText,
});
exports.createManualAlertSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    priority: zod_1.z.enum(domain_1.ALERT_PRIORITIES),
    title: common_1.shortText,
    summary: common_1.longText,
});
/* ------------------------------ Appointments ------------------------------ */
exports.createAppointmentSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    clinicianId: common_1.objectId.optional(),
    type: zod_1.z.enum(domain_1.APPOINTMENT_TYPES),
    mode: zod_1.z.enum(domain_1.APPOINTMENT_MODES).default('IN_PERSON'),
    scheduledAt: common_1.isoDateTime,
    durationMinutes: zod_1.z.number().int().min(5).max(480).default(30),
    location: zod_1.z.string().trim().max(200).optional(),
    instructions: common_1.optionalLongText,
    reminderOffsetsMinutes: zod_1.z.array(zod_1.z.number().int().min(15).max(10080)).max(5).default([1440, 120]),
});
exports.updateAppointmentSchema = zod_1.z.object({
    clinicianId: common_1.objectId.optional(),
    scheduledAt: common_1.isoDateTime.optional(),
    durationMinutes: zod_1.z.number().int().min(5).max(480).optional(),
    location: zod_1.z.string().trim().max(200).optional(),
    instructions: common_1.optionalLongText,
    mode: zod_1.z.enum(domain_1.APPOINTMENT_MODES).optional(),
    status: zod_1.z.enum(['CANCELLED', 'ATTENDED', 'MISSED']).optional(),
    reason: zod_1.z.string().trim().max(1000).optional(),
    followUpNote: zod_1.z.string().trim().max(5000).optional(),
});
exports.appointmentResponseSchema = zod_1.z.object({
    action: zod_1.z.enum(['CONFIRM', 'REQUEST_RESCHEDULE']),
    reason: zod_1.z.string().trim().max(1000).optional(),
    preferredDates: zod_1.z.array(common_1.isoDate).max(5).optional(),
});
/* ----------------------------- Rehabilitation ----------------------------- */
exports.exerciseSchema = zod_1.z.object({
    name: common_1.shortText,
    instructions: common_1.longText.describe('Clinician-authored exercise instructions'),
    sets: zod_1.z.number().int().min(1).max(50).optional(),
    repetitions: zod_1.z.number().int().min(1).max(500).optional(),
    holdSeconds: zod_1.z.number().int().min(1).max(600).optional(),
    frequencyText: common_1.shortText,
    timesOfDay: zod_1.z.array(common_1.timeOfDay).max(6).optional(),
});
exports.createRehabPlanSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    physiotherapistId: common_1.objectId,
    goals: zod_1.z.array(common_1.shortText).min(1).max(20),
    exercises: zod_1.z.array(exports.exerciseSchema).max(30).default([]),
    milestones: zod_1.z.array(zod_1.z.object({ title: common_1.shortText, targetDate: common_1.isoDate.optional() })).max(20).default([]),
    startDate: common_1.isoDate,
    endDate: common_1.isoDate.optional(),
});
exports.createRehabSessionSchema = zod_1.z.object({
    planId: common_1.objectId,
    scheduledAt: common_1.isoDateTime,
    durationMinutes: zod_1.z.number().int().min(5).max(240).default(45),
    location: zod_1.z.string().trim().max(200).optional(),
    mode: zod_1.z.enum(domain_1.APPOINTMENT_MODES).default('IN_PERSON'),
});
exports.recordRehabSessionSchema = zod_1.z.object({
    status: zod_1.z.enum(['ATTENDED', 'MISSED', 'CANCELLED']),
    progressNotes: common_1.optionalLongText,
    assessment: zod_1.z
        .object({
        painScore: zod_1.z.number().int().min(0).max(10).optional(),
        mobilityNotes: common_1.optionalLongText,
        functionalScore: zod_1.z.number().min(0).max(100).optional(),
    })
        .optional(),
});
exports.rehabDifficultySchema = zod_1.z.object({
    difficulty: zod_1.z.number().int().min(0).max(10),
    notes: zod_1.z.string().trim().max(2000).optional(),
    idempotencyKey: zod_1.z.string().min(8).max(100),
});
exports.achieveMilestoneSchema = zod_1.z.object({ notes: common_1.optionalLongText });
/* ------------------------------ Caregivers ------------------------------ */
exports.inviteCaregiverSchema = zod_1.z
    .object({
    patientId: common_1.objectId.optional().describe('Required when staff invite on behalf of a patient'),
    name: common_1.shortText,
    relationship: common_1.shortText,
    email: common_1.email.optional(),
    phone: common_1.phone.optional(),
    scopes: zod_1.z.array(zod_1.z.enum(domain_1.CAREGIVER_SCOPE_KEYS)).min(1),
    expiresInDays: zod_1.z.number().int().min(1).max(365).default(90),
})
    .refine((v) => v.email || v.phone, { message: 'Email or phone is required', path: ['email'] });
exports.updateCaregiverScopesSchema = zod_1.z.object({
    scopes: zod_1.z.array(zod_1.z.enum(domain_1.CAREGIVER_SCOPE_KEYS)).min(1),
});
/* -------------------------------- Consent -------------------------------- */
exports.grantConsentSchema = zod_1.z.object({
    patientId: common_1.objectId.optional(),
    type: zod_1.z.enum(domain_1.CONSENT_TYPES),
    version: zod_1.z.string().trim().min(1).max(20),
    method: zod_1.z.enum(['IN_APP', 'WRITTEN', 'VERBAL_RECORDED_BY_STAFF']).default('IN_APP'),
});
exports.revokeConsentSchema = zod_1.z.object({ reason: zod_1.z.string().trim().max(1000).optional() });
/* ------------------------------- Messaging ------------------------------- */
exports.createConversationSchema = zod_1.z.object({
    patientId: common_1.objectId.optional(),
    episodeId: common_1.objectId.optional(),
    subject: common_1.shortText,
    category: zod_1.z.enum(domain_1.MESSAGE_CATEGORIES).default('GENERAL'),
    initialMessage: common_1.longText,
});
exports.sendMessageSchema = zod_1.z.object({
    body: common_1.longText,
    type: zod_1.z.enum(['TEXT', 'CALLBACK_REQUEST']).default('TEXT'),
    attachmentIds: zod_1.z.array(common_1.objectId).max(5).optional(),
    idempotencyKey: zod_1.z.string().min(8).max(100).optional(),
});
exports.assignConversationSchema = zod_1.z.object({ userId: common_1.objectId });
/* ------------------------------ Staff & hospital ------------------------------ */
exports.inviteStaffSchema = zod_1.z.object({
    email: common_1.email,
    phone: common_1.phone.optional(),
    firstName: common_1.shortText,
    lastName: common_1.shortText,
    roles: zod_1.z.array(zod_1.z.enum(roles_1.ROLES)).min(1),
    departmentIds: zod_1.z.array(common_1.objectId).default([]),
    title: zod_1.z.string().trim().max(60).optional(),
});
exports.updateStaffSchema = zod_1.z.object({
    roles: zod_1.z.array(zod_1.z.enum(roles_1.ROLES)).min(1).optional(),
    departmentIds: zod_1.z.array(common_1.objectId).optional(),
    title: zod_1.z.string().trim().max(60).optional(),
});
exports.createDepartmentSchema = zod_1.z.object({
    name: common_1.shortText,
    code: zod_1.z.string().trim().regex(/^[A-Z0-9_-]{2,20}$/),
    description: zod_1.z.string().trim().max(500).optional(),
});
exports.updateHospitalSchema = zod_1.z.object({
    name: common_1.shortText.optional(),
    email: common_1.email.optional(),
    phone: common_1.phone.optional(),
    emergencyPhone: common_1.phone.optional(),
    address: zod_1.z.object({ line1: common_1.shortText, city: common_1.shortText, state: common_1.shortText, country: zod_1.z.string().length(2) }).partial().optional(),
    timezone: zod_1.z.string().optional(),
    settings: zod_1.z
        .object({
        defaultCheckInTime: common_1.timeOfDay.optional(),
        taskGenerationWindowDays: zod_1.z.number().int().min(1).max(30).optional(),
        missedTaskGraceMinutes: zod_1.z.number().int().min(15).max(1440).optional(),
        breakGlassEnabled: zod_1.z.boolean().optional(),
        aiFeaturesEnabled: zod_1.z.boolean().optional(),
        defaultLanguage: zod_1.z.enum(['en', 'ha', 'pcm']).optional(),
        emergencyInstructions: zod_1.z.string().trim().max(1000).optional(),
        notificationChannels: zod_1.z.array(zod_1.z.enum(['PUSH', 'SMS', 'EMAIL', 'WHATSAPP'])).optional(),
    })
        .optional(),
});
exports.breakGlassSchema = zod_1.z.object({
    patientId: common_1.objectId,
    reason: zod_1.z.string().trim().min(10).max(1000),
    durationMinutes: zod_1.z.number().int().min(5).max(240).default(60),
});
/* ---------------------------------- AI ---------------------------------- */
exports.aiExplainSchema = zod_1.z.object({
    dischargePlanVersionId: common_1.objectId,
    section: zod_1.z.enum(['clinicalInstructions', 'medications', 'woundCare', 'activityRestrictions', 'dietaryInstructions', 'warningSigns', 'education']),
    itemIndex: zod_1.z.number().int().min(0).max(100),
    language: zod_1.z.enum(['en', 'ha', 'pcm']).default('en'),
});
exports.aiClassifySchema = zod_1.z.object({ messageId: common_1.objectId });
exports.aiSummariseSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    periodDays: zod_1.z.number().int().min(1).max(30).default(7),
});
/* ------------------------------- Analytics ------------------------------- */
exports.analyticsQuery = zod_1.z.object({
    from: common_1.isoDate.optional(),
    to: common_1.isoDate.optional(),
    departmentId: common_1.objectId.optional(),
});
exports.satisfactionSchema = zod_1.z.object({
    episodeId: common_1.objectId,
    score: zod_1.z.number().int().min(1).max(5),
    comment: zod_1.z.string().trim().max(2000).optional(),
});
