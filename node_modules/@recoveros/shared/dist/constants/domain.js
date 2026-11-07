"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MESSAGE_CATEGORIES = exports.CONVERSATION_TYPES = exports.NOTIFICATION_STATUSES = exports.NOTIFICATION_CHANNELS = exports.INVITATION_TYPES = exports.CONTACT_CHANNELS = exports.LANGUAGE_LABELS = exports.LANGUAGES = exports.PATIENT_STATUSES = exports.HOSPITAL_VERIFICATION_STATUSES = exports.USER_STATUSES = exports.CONSENT_STATUSES = exports.CONSENT_TYPES = exports.CAREGIVER_CONSENT_STATUSES = exports.CAREGIVER_SCOPE_KEYS = exports.CAREGIVER_SCOPES = exports.REHAB_PLAN_STATUSES = exports.REHAB_SESSION_STATUSES = exports.APPOINTMENT_TRANSITIONS = exports.APPOINTMENT_STATUSES = exports.APPOINTMENT_MODES = exports.APPOINTMENT_TYPES = exports.RULE_OPERATORS = exports.ALERT_RULE_STATUSES = exports.ALERT_ACTION_TYPES = exports.ALERT_SOURCES = exports.ALERT_PRIORITIES = exports.ALERT_OPEN_STATUSES = exports.ALERT_UNACKNOWLEDGED_STATUSES = exports.ALERT_TRANSITIONS = exports.ALERT_STATUSES = exports.REVIEW_STATUSES = exports.SYMPTOM_TRENDS = exports.SYMPTOM_SEVERITIES = exports.TEMPLATE_STATUSES = exports.QUESTION_TYPES = exports.CHECKIN_KINDS = exports.MEDICATION_EVENT_STATUSES = exports.MEDICATION_ORDER_STATUSES = exports.RECURRENCE_KINDS = exports.TASK_COMPLETION_SOURCES = exports.TASK_STATUSES = exports.TASK_TYPES = exports.DISCHARGE_VERSION_STATUSES = exports.DISCHARGE_PLAN_STATUSES = exports.CARE_TEAM_ROLES = exports.EPISODE_OPEN_STATUSES = exports.EPISODE_CLINICAL_DECISION_STATUSES = exports.EPISODE_TRANSITIONS = exports.EPISODE_STATUSES = void 0;
exports.FEATURES = exports.INVOICE_STATUSES = exports.SUBSCRIPTION_STATUSES = exports.DOCUMENT_TYPES = void 0;
exports.canTransition = canTransition;
function canTransition(map, from, to) {
    return map[from]?.includes(to) ?? false;
}
/* ------------------------------------------------------------------ */
/* Recovery episodes                                                   */
/* ------------------------------------------------------------------ */
exports.EPISODE_STATUSES = [
    'DRAFT',
    'DISCHARGE_PENDING',
    'ACTIVE',
    'NEEDS_ATTENTION',
    'UNDER_REVIEW',
    'ON_HOLD',
    'COMPLETED',
    'TRANSFERRED',
    'CANCELLED',
];
/**
 * Allowed episode transitions. Terminal states have no outgoing transitions.
 * Transitions into ACTIVE from DISCHARGE_PENDING happen only via discharge-plan approval.
 */
exports.EPISODE_TRANSITIONS = {
    DRAFT: ['DISCHARGE_PENDING', 'CANCELLED'],
    DISCHARGE_PENDING: ['ACTIVE', 'DRAFT', 'CANCELLED'],
    ACTIVE: ['NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD', 'COMPLETED', 'TRANSFERRED'],
    NEEDS_ATTENTION: ['UNDER_REVIEW', 'ACTIVE', 'TRANSFERRED'],
    UNDER_REVIEW: ['ACTIVE', 'ON_HOLD', 'COMPLETED', 'TRANSFERRED'],
    ON_HOLD: ['ACTIVE', 'TRANSFERRED', 'CANCELLED'],
    COMPLETED: [],
    TRANSFERRED: [],
    CANCELLED: [],
};
/** Statuses that require `recovery.approve` (a clinical decision) to enter manually. */
exports.EPISODE_CLINICAL_DECISION_STATUSES = ['COMPLETED', 'TRANSFERRED', 'ON_HOLD'];
exports.EPISODE_OPEN_STATUSES = ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD'];
exports.CARE_TEAM_ROLES = [
    'RESPONSIBLE_DOCTOR',
    'DOCTOR',
    'DISCHARGE_NURSE',
    'RECOVERY_NURSE',
    'RECOVERY_COORDINATOR',
    'PHARMACIST',
    'PHYSIOTHERAPIST',
];
/* ------------------------------------------------------------------ */
/* Discharge plans                                                     */
/* ------------------------------------------------------------------ */
exports.DISCHARGE_PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED'];
exports.DISCHARGE_VERSION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED'];
/* ------------------------------------------------------------------ */
/* Recovery tasks                                                      */
/* ------------------------------------------------------------------ */
exports.TASK_TYPES = [
    'MEDICATION',
    'CHECK_IN',
    'WEEKLY_REVIEW',
    'APPOINTMENT_REMINDER',
    'REHABILITATION',
    'WOUND_CARE',
    'EDUCATION',
    'MILESTONE',
    'CUSTOM',
];
exports.TASK_STATUSES = ['PENDING', 'COMPLETED', 'MISSED', 'SKIPPED', 'CANCELLED'];
exports.TASK_COMPLETION_SOURCES = ['PATIENT', 'CAREGIVER', 'STAFF', 'SYSTEM'];
exports.RECURRENCE_KINDS = ['ONCE', 'DAILY', 'WEEKLY', 'EVERY_N_DAYS'];
/* ------------------------------------------------------------------ */
/* Medication                                                          */
/* ------------------------------------------------------------------ */
exports.MEDICATION_ORDER_STATUSES = ['ACTIVE', 'DISCONTINUED', 'COMPLETED', 'SUPERSEDED'];
/**
 * Patient-reported dose statuses. These are REPORTS, never physical verification.
 * UI and API must always describe them as patient/caregiver-reported.
 */
exports.MEDICATION_EVENT_STATUSES = [
    'REPORTED_TAKEN',
    'REPORTED_MISSED',
    'REPORTED_DELAYED',
    'UNABLE_TO_OBTAIN',
    'NOT_RESPONDED',
    'REQUIRES_REVIEW',
];
/* ------------------------------------------------------------------ */
/* Check-ins & symptoms                                                */
/* ------------------------------------------------------------------ */
exports.CHECKIN_KINDS = ['GENERAL', 'PAIN', 'MOBILITY', 'WOUND', 'MEDICATION', 'WELLBEING', 'CONDITION_SPECIFIC'];
exports.QUESTION_TYPES = ['SCALE', 'BOOLEAN', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'TEXT', 'NUMBER'];
exports.TEMPLATE_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'];
exports.SYMPTOM_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'];
exports.SYMPTOM_TRENDS = ['IMPROVING', 'UNCHANGED', 'WORSENING', 'NEW'];
exports.REVIEW_STATUSES = ['PENDING_REVIEW', 'REVIEWED', 'NO_REVIEW_REQUIRED'];
/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */
exports.ALERT_STATUSES = [
    'GENERATED',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'UNDER_REVIEW',
    'ACTION_REQUIRED',
    'ESCALATED',
    'RESOLVED',
    'CLOSED',
];
exports.ALERT_TRANSITIONS = {
    GENERATED: ['ASSIGNED', 'ACKNOWLEDGED', 'ESCALATED'],
    ASSIGNED: ['ASSIGNED', 'ACKNOWLEDGED', 'ESCALATED'],
    ACKNOWLEDGED: ['UNDER_REVIEW', 'ACTION_REQUIRED', 'ASSIGNED', 'ESCALATED', 'RESOLVED'],
    UNDER_REVIEW: ['ACTION_REQUIRED', 'ASSIGNED', 'ESCALATED', 'RESOLVED'],
    ACTION_REQUIRED: ['UNDER_REVIEW', 'ASSIGNED', 'ESCALATED', 'RESOLVED'],
    ESCALATED: ['ASSIGNED', 'ACKNOWLEDGED', 'ESCALATED'],
    RESOLVED: ['CLOSED', 'UNDER_REVIEW'],
    CLOSED: [],
};
/** Alerts in these statuses are "open" and may escalate if not acknowledged. */
exports.ALERT_UNACKNOWLEDGED_STATUSES = ['GENERATED', 'ASSIGNED', 'ESCALATED'];
exports.ALERT_OPEN_STATUSES = [
    'GENERATED',
    'ASSIGNED',
    'ACKNOWLEDGED',
    'UNDER_REVIEW',
    'ACTION_REQUIRED',
    'ESCALATED',
];
exports.ALERT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
exports.ALERT_SOURCES = [
    'CHECK_IN',
    'SYMPTOM_REPORT',
    'MEDICATION_EVENT',
    'TASK_MISSED',
    'APPOINTMENT_MISSED',
    'MESSAGE',
    'MANUAL',
];
exports.ALERT_ACTION_TYPES = [
    'NOTE',
    'PATIENT_CONTACT_ATTEMPT',
    'PATIENT_CONTACTED',
    'CLINICAL_REVIEW',
    'ADVICE_GIVEN',
    'APPOINTMENT_ARRANGED',
    'REFERRED',
    'STATUS_CHANGE',
    'ASSIGNMENT',
    'ESCALATION',
];
exports.ALERT_RULE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED'];
exports.RULE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'];
/* ------------------------------------------------------------------ */
/* Appointments & rehabilitation                                       */
/* ------------------------------------------------------------------ */
exports.APPOINTMENT_TYPES = ['FOLLOW_UP', 'REVIEW', 'INVESTIGATION', 'WOUND_CHECK', 'REHABILITATION', 'OTHER'];
exports.APPOINTMENT_MODES = ['IN_PERSON', 'PHONE', 'VIDEO'];
exports.APPOINTMENT_STATUSES = [
    'SCHEDULED',
    'CONFIRMED',
    'RESCHEDULE_REQUESTED',
    'CANCELLED',
    'ATTENDED',
    'MISSED',
];
exports.APPOINTMENT_TRANSITIONS = {
    SCHEDULED: ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'ATTENDED', 'MISSED', 'SCHEDULED'],
    CONFIRMED: ['RESCHEDULE_REQUESTED', 'CANCELLED', 'ATTENDED', 'MISSED', 'SCHEDULED'],
    RESCHEDULE_REQUESTED: ['SCHEDULED', 'CANCELLED', 'CONFIRMED'],
    CANCELLED: [],
    ATTENDED: [],
    MISSED: ['SCHEDULED'],
};
exports.REHAB_SESSION_STATUSES = ['SCHEDULED', 'ATTENDED', 'MISSED', 'CANCELLED'];
exports.REHAB_PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'DISCONTINUED'];
/* ------------------------------------------------------------------ */
/* Caregivers & consent                                                */
/* ------------------------------------------------------------------ */
/**
 * Scopes a patient can grant to a caregiver. Each scope unlocks a specific set of
 * platform permissions for that caregiver *for that patient only*.
 */
exports.CAREGIVER_SCOPES = {
    VIEW_RECOVERY_PLAN: ['recovery.read'],
    VIEW_MEDICATIONS: ['medication.read'],
    REPORT_MEDICATION_EVENTS: ['medication.read', 'checkins.create'],
    SUBMIT_CHECKINS: ['checkins.create'],
    VIEW_APPOINTMENTS: ['appointments.read'],
    MESSAGE_CARE_TEAM: ['messages.read', 'messages.send'],
    VIEW_DOCUMENTS: ['documents.read'],
};
exports.CAREGIVER_SCOPE_KEYS = Object.keys(exports.CAREGIVER_SCOPES);
exports.CAREGIVER_CONSENT_STATUSES = ['INVITED', 'ACTIVE', 'REVOKED', 'EXPIRED', 'DECLINED'];
exports.CONSENT_TYPES = [
    'RECOVERY_PROGRAMME_PARTICIPATION',
    'DATA_PROCESSING',
    'AI_ASSISTED_FEATURES',
    'SMS_NOTIFICATIONS',
    'WHATSAPP_NOTIFICATIONS',
    'VOICE_RECORDING_RETENTION',
];
exports.CONSENT_STATUSES = ['GRANTED', 'REVOKED'];
/* ------------------------------------------------------------------ */
/* Users, hospitals, patients                                          */
/* ------------------------------------------------------------------ */
exports.USER_STATUSES = ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'];
exports.HOSPITAL_VERIFICATION_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED'];
exports.PATIENT_STATUSES = ['ACTIVE', 'INACTIVE', 'DECEASED', 'TRANSFERRED_OUT'];
exports.LANGUAGES = ['en', 'ha', 'pcm'];
exports.LANGUAGE_LABELS = { en: 'English', ha: 'Hausa', pcm: 'Nigerian Pidgin' };
exports.CONTACT_CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'PHONE_CALL'];
exports.INVITATION_TYPES = ['STAFF', 'PATIENT', 'CAREGIVER'];
/* ------------------------------------------------------------------ */
/* Notifications, messaging, documents, billing                        */
/* ------------------------------------------------------------------ */
exports.NOTIFICATION_CHANNELS = ['IN_APP', 'PUSH', 'SMS', 'EMAIL', 'WHATSAPP'];
exports.NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ'];
exports.CONVERSATION_TYPES = ['PATIENT_CARE_TEAM', 'STAFF'];
exports.MESSAGE_CATEGORIES = ['GENERAL', 'MEDICATION', 'SYMPTOM', 'APPOINTMENT', 'REHABILITATION', 'ADMINISTRATIVE', 'OTHER'];
exports.DOCUMENT_TYPES = ['DISCHARGE_SUMMARY', 'RECOVERY_INSTRUCTIONS', 'PRESCRIPTION_PLAN', 'PATIENT_DOCUMENT', 'ATTACHMENT'];
exports.SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED'];
exports.INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE'];
exports.FEATURES = ['AI_ASSIST', 'REHABILITATION', 'MESSAGING', 'ANALYTICS', 'SMS_NOTIFICATIONS', 'WHATSAPP', 'DOCUMENTS'];
