export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;
export declare function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean;
export declare const EPISODE_STATUSES: readonly ["DRAFT", "DISCHARGE_PENDING", "ACTIVE", "NEEDS_ATTENTION", "UNDER_REVIEW", "ON_HOLD", "COMPLETED", "TRANSFERRED", "CANCELLED"];
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];
/**
 * Allowed episode transitions. Terminal states have no outgoing transitions.
 * Transitions into ACTIVE from DISCHARGE_PENDING happen only via discharge-plan approval.
 */
export declare const EPISODE_TRANSITIONS: TransitionMap<EpisodeStatus>;
/** Statuses that require `recovery.approve` (a clinical decision) to enter manually. */
export declare const EPISODE_CLINICAL_DECISION_STATUSES: readonly EpisodeStatus[];
export declare const EPISODE_OPEN_STATUSES: readonly EpisodeStatus[];
export declare const CARE_TEAM_ROLES: readonly ["RESPONSIBLE_DOCTOR", "DOCTOR", "DISCHARGE_NURSE", "RECOVERY_NURSE", "RECOVERY_COORDINATOR", "PHARMACIST", "PHYSIOTHERAPIST"];
export type CareTeamRole = (typeof CARE_TEAM_ROLES)[number];
export declare const DISCHARGE_PLAN_STATUSES: readonly ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SUPERSEDED"];
export type DischargePlanStatus = (typeof DISCHARGE_PLAN_STATUSES)[number];
export declare const DISCHARGE_VERSION_STATUSES: readonly ["DRAFT", "SUBMITTED", "APPROVED", "REJECTED", "SUPERSEDED"];
export type DischargeVersionStatus = (typeof DISCHARGE_VERSION_STATUSES)[number];
export declare const TASK_TYPES: readonly ["MEDICATION", "CHECK_IN", "WEEKLY_REVIEW", "APPOINTMENT_REMINDER", "REHABILITATION", "WOUND_CARE", "EDUCATION", "MILESTONE", "CUSTOM"];
export type TaskType = (typeof TASK_TYPES)[number];
export declare const TASK_STATUSES: readonly ["PENDING", "COMPLETED", "MISSED", "SKIPPED", "CANCELLED"];
export type TaskStatus = (typeof TASK_STATUSES)[number];
export declare const TASK_COMPLETION_SOURCES: readonly ["PATIENT", "CAREGIVER", "STAFF", "SYSTEM"];
export type TaskCompletionSource = (typeof TASK_COMPLETION_SOURCES)[number];
export declare const RECURRENCE_KINDS: readonly ["ONCE", "DAILY", "WEEKLY", "EVERY_N_DAYS"];
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];
export declare const MEDICATION_ORDER_STATUSES: readonly ["ACTIVE", "DISCONTINUED", "COMPLETED", "SUPERSEDED"];
export type MedicationOrderStatus = (typeof MEDICATION_ORDER_STATUSES)[number];
/**
 * Patient-reported dose statuses. These are REPORTS, never physical verification.
 * UI and API must always describe them as patient/caregiver-reported.
 */
export declare const MEDICATION_EVENT_STATUSES: readonly ["REPORTED_TAKEN", "REPORTED_MISSED", "REPORTED_DELAYED", "UNABLE_TO_OBTAIN", "NOT_RESPONDED", "REQUIRES_REVIEW"];
export type MedicationEventStatus = (typeof MEDICATION_EVENT_STATUSES)[number];
export declare const CHECKIN_KINDS: readonly ["GENERAL", "PAIN", "MOBILITY", "WOUND", "MEDICATION", "WELLBEING", "CONDITION_SPECIFIC"];
export type CheckInKind = (typeof CHECKIN_KINDS)[number];
export declare const QUESTION_TYPES: readonly ["SCALE", "BOOLEAN", "SINGLE_CHOICE", "MULTI_CHOICE", "TEXT", "NUMBER"];
export type QuestionType = (typeof QUESTION_TYPES)[number];
export declare const TEMPLATE_STATUSES: readonly ["DRAFT", "ACTIVE", "RETIRED"];
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];
export declare const SYMPTOM_SEVERITIES: readonly ["MILD", "MODERATE", "SEVERE"];
export type SymptomSeverity = (typeof SYMPTOM_SEVERITIES)[number];
export declare const SYMPTOM_TRENDS: readonly ["IMPROVING", "UNCHANGED", "WORSENING", "NEW"];
export type SymptomTrend = (typeof SYMPTOM_TRENDS)[number];
export declare const REVIEW_STATUSES: readonly ["PENDING_REVIEW", "REVIEWED", "NO_REVIEW_REQUIRED"];
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];
export declare const ALERT_STATUSES: readonly ["GENERATED", "ASSIGNED", "ACKNOWLEDGED", "UNDER_REVIEW", "ACTION_REQUIRED", "ESCALATED", "RESOLVED", "CLOSED"];
export type AlertStatus = (typeof ALERT_STATUSES)[number];
export declare const ALERT_TRANSITIONS: TransitionMap<AlertStatus>;
/** Alerts in these statuses are "open" and may escalate if not acknowledged. */
export declare const ALERT_UNACKNOWLEDGED_STATUSES: readonly AlertStatus[];
export declare const ALERT_OPEN_STATUSES: readonly AlertStatus[];
export declare const ALERT_PRIORITIES: readonly ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
export type AlertPriority = (typeof ALERT_PRIORITIES)[number];
export declare const ALERT_SOURCES: readonly ["CHECK_IN", "SYMPTOM_REPORT", "MEDICATION_EVENT", "TASK_MISSED", "APPOINTMENT_MISSED", "MESSAGE", "MANUAL"];
export type AlertSource = (typeof ALERT_SOURCES)[number];
export declare const ALERT_ACTION_TYPES: readonly ["NOTE", "PATIENT_CONTACT_ATTEMPT", "PATIENT_CONTACTED", "CLINICAL_REVIEW", "ADVICE_GIVEN", "APPOINTMENT_ARRANGED", "REFERRED", "STATUS_CHANGE", "ASSIGNMENT", "ESCALATION"];
export type AlertActionType = (typeof ALERT_ACTION_TYPES)[number];
export declare const ALERT_RULE_STATUSES: readonly ["DRAFT", "PENDING_APPROVAL", "ACTIVE", "RETIRED"];
export type AlertRuleStatus = (typeof ALERT_RULE_STATUSES)[number];
export declare const RULE_OPERATORS: readonly ["eq", "neq", "gt", "gte", "lt", "lte", "in", "contains", "exists"];
export type RuleOperator = (typeof RULE_OPERATORS)[number];
export declare const APPOINTMENT_TYPES: readonly ["FOLLOW_UP", "REVIEW", "INVESTIGATION", "WOUND_CHECK", "REHABILITATION", "OTHER"];
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];
export declare const APPOINTMENT_MODES: readonly ["IN_PERSON", "PHONE", "VIDEO"];
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];
export declare const APPOINTMENT_STATUSES: readonly ["SCHEDULED", "CONFIRMED", "RESCHEDULE_REQUESTED", "CANCELLED", "ATTENDED", "MISSED"];
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];
export declare const APPOINTMENT_TRANSITIONS: TransitionMap<AppointmentStatus>;
export declare const REHAB_SESSION_STATUSES: readonly ["SCHEDULED", "ATTENDED", "MISSED", "CANCELLED"];
export type RehabSessionStatus = (typeof REHAB_SESSION_STATUSES)[number];
export declare const REHAB_PLAN_STATUSES: readonly ["DRAFT", "ACTIVE", "COMPLETED", "DISCONTINUED"];
export type RehabPlanStatus = (typeof REHAB_PLAN_STATUSES)[number];
/**
 * Scopes a patient can grant to a caregiver. Each scope unlocks a specific set of
 * platform permissions for that caregiver *for that patient only*.
 */
export declare const CAREGIVER_SCOPES: {
    readonly VIEW_RECOVERY_PLAN: readonly ["recovery.read"];
    readonly VIEW_MEDICATIONS: readonly ["medication.read"];
    readonly REPORT_MEDICATION_EVENTS: readonly ["medication.read", "checkins.create"];
    readonly SUBMIT_CHECKINS: readonly ["checkins.create"];
    readonly VIEW_APPOINTMENTS: readonly ["appointments.read"];
    readonly MESSAGE_CARE_TEAM: readonly ["messages.read", "messages.send"];
    readonly VIEW_DOCUMENTS: readonly ["documents.read"];
};
export type CaregiverScope = keyof typeof CAREGIVER_SCOPES;
export declare const CAREGIVER_SCOPE_KEYS: CaregiverScope[];
export declare const CAREGIVER_CONSENT_STATUSES: readonly ["INVITED", "ACTIVE", "REVOKED", "EXPIRED", "DECLINED"];
export type CaregiverConsentStatus = (typeof CAREGIVER_CONSENT_STATUSES)[number];
export declare const CONSENT_TYPES: readonly ["RECOVERY_PROGRAMME_PARTICIPATION", "DATA_PROCESSING", "AI_ASSISTED_FEATURES", "SMS_NOTIFICATIONS", "WHATSAPP_NOTIFICATIONS", "VOICE_RECORDING_RETENTION"];
export type ConsentType = (typeof CONSENT_TYPES)[number];
export declare const CONSENT_STATUSES: readonly ["GRANTED", "REVOKED"];
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];
export declare const USER_STATUSES: readonly ["PENDING_ACTIVATION", "ACTIVE", "SUSPENDED", "DEACTIVATED"];
export type UserStatus = (typeof USER_STATUSES)[number];
export declare const HOSPITAL_VERIFICATION_STATUSES: readonly ["PENDING_VERIFICATION", "VERIFIED", "REJECTED", "SUSPENDED"];
export type HospitalVerificationStatus = (typeof HOSPITAL_VERIFICATION_STATUSES)[number];
export declare const PATIENT_STATUSES: readonly ["ACTIVE", "INACTIVE", "DECEASED", "TRANSFERRED_OUT"];
export type PatientStatus = (typeof PATIENT_STATUSES)[number];
export declare const LANGUAGES: readonly ["en", "ha", "pcm"];
export type Language = (typeof LANGUAGES)[number];
export declare const LANGUAGE_LABELS: Record<Language, string>;
export declare const CONTACT_CHANNELS: readonly ["PUSH", "SMS", "EMAIL", "WHATSAPP", "PHONE_CALL"];
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];
export declare const INVITATION_TYPES: readonly ["STAFF", "PATIENT", "CAREGIVER"];
export type InvitationType = (typeof INVITATION_TYPES)[number];
export declare const NOTIFICATION_CHANNELS: readonly ["IN_APP", "PUSH", "SMS", "EMAIL", "WHATSAPP"];
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];
export declare const NOTIFICATION_STATUSES: readonly ["QUEUED", "SENT", "DELIVERED", "FAILED", "READ"];
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];
export declare const CONVERSATION_TYPES: readonly ["PATIENT_CARE_TEAM", "STAFF"];
export type ConversationType = (typeof CONVERSATION_TYPES)[number];
export declare const MESSAGE_CATEGORIES: readonly ["GENERAL", "MEDICATION", "SYMPTOM", "APPOINTMENT", "REHABILITATION", "ADMINISTRATIVE", "OTHER"];
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];
export declare const DOCUMENT_TYPES: readonly ["DISCHARGE_SUMMARY", "RECOVERY_INSTRUCTIONS", "PRESCRIPTION_PLAN", "PATIENT_DOCUMENT", "ATTACHMENT"];
export type DocumentType = (typeof DOCUMENT_TYPES)[number];
export declare const SUBSCRIPTION_STATUSES: readonly ["TRIALING", "ACTIVE", "PAST_DUE", "EXPIRED", "CANCELLED"];
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];
export declare const INVOICE_STATUSES: readonly ["DRAFT", "OPEN", "PAID", "VOID", "OVERDUE"];
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];
export declare const FEATURES: readonly ["AI_ASSIST", "REHABILITATION", "MESSAGING", "ANALYTICS", "SMS_NOTIFICATIONS", "WHATSAPP", "DOCUMENTS"];
export type Feature = (typeof FEATURES)[number];
