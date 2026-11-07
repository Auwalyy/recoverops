import type { Permission } from './permissions';

/* ------------------------------------------------------------------ */
/* Generic state machine helper                                        */
/* ------------------------------------------------------------------ */

export type TransitionMap<S extends string> = Readonly<Record<S, readonly S[]>>;

export function canTransition<S extends string>(map: TransitionMap<S>, from: S, to: S): boolean {
  return map[from]?.includes(to) ?? false;
}

/* ------------------------------------------------------------------ */
/* Recovery episodes                                                   */
/* ------------------------------------------------------------------ */

export const EPISODE_STATUSES = [
  'DRAFT',
  'DISCHARGE_PENDING',
  'ACTIVE',
  'NEEDS_ATTENTION',
  'UNDER_REVIEW',
  'ON_HOLD',
  'COMPLETED',
  'TRANSFERRED',
  'CANCELLED',
] as const;
export type EpisodeStatus = (typeof EPISODE_STATUSES)[number];

/**
 * Allowed episode transitions. Terminal states have no outgoing transitions.
 * Transitions into ACTIVE from DISCHARGE_PENDING happen only via discharge-plan approval.
 */
export const EPISODE_TRANSITIONS: TransitionMap<EpisodeStatus> = {
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
export const EPISODE_CLINICAL_DECISION_STATUSES: readonly EpisodeStatus[] = ['COMPLETED', 'TRANSFERRED', 'ON_HOLD'];

export const EPISODE_OPEN_STATUSES: readonly EpisodeStatus[] = ['ACTIVE', 'NEEDS_ATTENTION', 'UNDER_REVIEW', 'ON_HOLD'];

export const CARE_TEAM_ROLES = [
  'RESPONSIBLE_DOCTOR',
  'DOCTOR',
  'DISCHARGE_NURSE',
  'RECOVERY_NURSE',
  'RECOVERY_COORDINATOR',
  'PHARMACIST',
  'PHYSIOTHERAPIST',
] as const;
export type CareTeamRole = (typeof CARE_TEAM_ROLES)[number];

/* ------------------------------------------------------------------ */
/* Discharge plans                                                     */
/* ------------------------------------------------------------------ */

export const DISCHARGE_PLAN_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const;
export type DischargePlanStatus = (typeof DISCHARGE_PLAN_STATUSES)[number];

export const DISCHARGE_VERSION_STATUSES = ['DRAFT', 'SUBMITTED', 'APPROVED', 'REJECTED', 'SUPERSEDED'] as const;
export type DischargeVersionStatus = (typeof DISCHARGE_VERSION_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Recovery tasks                                                      */
/* ------------------------------------------------------------------ */

export const TASK_TYPES = [
  'MEDICATION',
  'CHECK_IN',
  'WEEKLY_REVIEW',
  'APPOINTMENT_REMINDER',
  'REHABILITATION',
  'WOUND_CARE',
  'EDUCATION',
  'MILESTONE',
  'CUSTOM',
] as const;
export type TaskType = (typeof TASK_TYPES)[number];

export const TASK_STATUSES = ['PENDING', 'COMPLETED', 'MISSED', 'SKIPPED', 'CANCELLED'] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];

export const TASK_COMPLETION_SOURCES = ['PATIENT', 'CAREGIVER', 'STAFF', 'SYSTEM'] as const;
export type TaskCompletionSource = (typeof TASK_COMPLETION_SOURCES)[number];

export const RECURRENCE_KINDS = ['ONCE', 'DAILY', 'WEEKLY', 'EVERY_N_DAYS'] as const;
export type RecurrenceKind = (typeof RECURRENCE_KINDS)[number];

/* ------------------------------------------------------------------ */
/* Medication                                                          */
/* ------------------------------------------------------------------ */

export const MEDICATION_ORDER_STATUSES = ['ACTIVE', 'DISCONTINUED', 'COMPLETED', 'SUPERSEDED'] as const;
export type MedicationOrderStatus = (typeof MEDICATION_ORDER_STATUSES)[number];

/**
 * Patient-reported dose statuses. These are REPORTS, never physical verification.
 * UI and API must always describe them as patient/caregiver-reported.
 */
export const MEDICATION_EVENT_STATUSES = [
  'REPORTED_TAKEN',
  'REPORTED_MISSED',
  'REPORTED_DELAYED',
  'UNABLE_TO_OBTAIN',
  'NOT_RESPONDED',
  'REQUIRES_REVIEW',
] as const;
export type MedicationEventStatus = (typeof MEDICATION_EVENT_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Check-ins & symptoms                                                */
/* ------------------------------------------------------------------ */

export const CHECKIN_KINDS = ['GENERAL', 'PAIN', 'MOBILITY', 'WOUND', 'MEDICATION', 'WELLBEING', 'CONDITION_SPECIFIC'] as const;
export type CheckInKind = (typeof CHECKIN_KINDS)[number];

export const QUESTION_TYPES = ['SCALE', 'BOOLEAN', 'SINGLE_CHOICE', 'MULTI_CHOICE', 'TEXT', 'NUMBER'] as const;
export type QuestionType = (typeof QUESTION_TYPES)[number];

export const TEMPLATE_STATUSES = ['DRAFT', 'ACTIVE', 'RETIRED'] as const;
export type TemplateStatus = (typeof TEMPLATE_STATUSES)[number];

export const SYMPTOM_SEVERITIES = ['MILD', 'MODERATE', 'SEVERE'] as const;
export type SymptomSeverity = (typeof SYMPTOM_SEVERITIES)[number];

export const SYMPTOM_TRENDS = ['IMPROVING', 'UNCHANGED', 'WORSENING', 'NEW'] as const;
export type SymptomTrend = (typeof SYMPTOM_TRENDS)[number];

export const REVIEW_STATUSES = ['PENDING_REVIEW', 'REVIEWED', 'NO_REVIEW_REQUIRED'] as const;
export type ReviewStatus = (typeof REVIEW_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Alerts                                                              */
/* ------------------------------------------------------------------ */

export const ALERT_STATUSES = [
  'GENERATED',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'ESCALATED',
  'RESOLVED',
  'CLOSED',
] as const;
export type AlertStatus = (typeof ALERT_STATUSES)[number];

export const ALERT_TRANSITIONS: TransitionMap<AlertStatus> = {
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
export const ALERT_UNACKNOWLEDGED_STATUSES: readonly AlertStatus[] = ['GENERATED', 'ASSIGNED', 'ESCALATED'];
export const ALERT_OPEN_STATUSES: readonly AlertStatus[] = [
  'GENERATED',
  'ASSIGNED',
  'ACKNOWLEDGED',
  'UNDER_REVIEW',
  'ACTION_REQUIRED',
  'ESCALATED',
];

export const ALERT_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;
export type AlertPriority = (typeof ALERT_PRIORITIES)[number];

export const ALERT_SOURCES = [
  'CHECK_IN',
  'SYMPTOM_REPORT',
  'MEDICATION_EVENT',
  'TASK_MISSED',
  'APPOINTMENT_MISSED',
  'MESSAGE',
  'MANUAL',
] as const;
export type AlertSource = (typeof ALERT_SOURCES)[number];

export const ALERT_ACTION_TYPES = [
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
] as const;
export type AlertActionType = (typeof ALERT_ACTION_TYPES)[number];

export const ALERT_RULE_STATUSES = ['DRAFT', 'PENDING_APPROVAL', 'ACTIVE', 'RETIRED'] as const;
export type AlertRuleStatus = (typeof ALERT_RULE_STATUSES)[number];

export const RULE_OPERATORS = ['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'contains', 'exists'] as const;
export type RuleOperator = (typeof RULE_OPERATORS)[number];

/* ------------------------------------------------------------------ */
/* Appointments & rehabilitation                                       */
/* ------------------------------------------------------------------ */

export const APPOINTMENT_TYPES = ['FOLLOW_UP', 'REVIEW', 'INVESTIGATION', 'WOUND_CHECK', 'REHABILITATION', 'OTHER'] as const;
export type AppointmentType = (typeof APPOINTMENT_TYPES)[number];

export const APPOINTMENT_MODES = ['IN_PERSON', 'PHONE', 'VIDEO'] as const;
export type AppointmentMode = (typeof APPOINTMENT_MODES)[number];

export const APPOINTMENT_STATUSES = [
  'SCHEDULED',
  'CONFIRMED',
  'RESCHEDULE_REQUESTED',
  'CANCELLED',
  'ATTENDED',
  'MISSED',
] as const;
export type AppointmentStatus = (typeof APPOINTMENT_STATUSES)[number];

export const APPOINTMENT_TRANSITIONS: TransitionMap<AppointmentStatus> = {
  SCHEDULED: ['CONFIRMED', 'RESCHEDULE_REQUESTED', 'CANCELLED', 'ATTENDED', 'MISSED', 'SCHEDULED'],
  CONFIRMED: ['RESCHEDULE_REQUESTED', 'CANCELLED', 'ATTENDED', 'MISSED', 'SCHEDULED'],
  RESCHEDULE_REQUESTED: ['SCHEDULED', 'CANCELLED', 'CONFIRMED'],
  CANCELLED: [],
  ATTENDED: [],
  MISSED: ['SCHEDULED'],
};

export const REHAB_SESSION_STATUSES = ['SCHEDULED', 'ATTENDED', 'MISSED', 'CANCELLED'] as const;
export type RehabSessionStatus = (typeof REHAB_SESSION_STATUSES)[number];

export const REHAB_PLAN_STATUSES = ['DRAFT', 'ACTIVE', 'COMPLETED', 'DISCONTINUED'] as const;
export type RehabPlanStatus = (typeof REHAB_PLAN_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Caregivers & consent                                                */
/* ------------------------------------------------------------------ */

/**
 * Scopes a patient can grant to a caregiver. Each scope unlocks a specific set of
 * platform permissions for that caregiver *for that patient only*.
 */
export const CAREGIVER_SCOPES = {
  VIEW_RECOVERY_PLAN: ['recovery.read'],
  VIEW_MEDICATIONS: ['medication.read'],
  REPORT_MEDICATION_EVENTS: ['medication.read', 'checkins.create'],
  SUBMIT_CHECKINS: ['checkins.create'],
  VIEW_APPOINTMENTS: ['appointments.read'],
  MESSAGE_CARE_TEAM: ['messages.read', 'messages.send'],
  VIEW_DOCUMENTS: ['documents.read'],
} as const satisfies Record<string, readonly Permission[]>;

export type CaregiverScope = keyof typeof CAREGIVER_SCOPES;
export const CAREGIVER_SCOPE_KEYS = Object.keys(CAREGIVER_SCOPES) as CaregiverScope[];

export const CAREGIVER_CONSENT_STATUSES = ['INVITED', 'ACTIVE', 'REVOKED', 'EXPIRED', 'DECLINED'] as const;
export type CaregiverConsentStatus = (typeof CAREGIVER_CONSENT_STATUSES)[number];

export const CONSENT_TYPES = [
  'RECOVERY_PROGRAMME_PARTICIPATION',
  'DATA_PROCESSING',
  'AI_ASSISTED_FEATURES',
  'SMS_NOTIFICATIONS',
  'WHATSAPP_NOTIFICATIONS',
  'VOICE_RECORDING_RETENTION',
] as const;
export type ConsentType = (typeof CONSENT_TYPES)[number];

export const CONSENT_STATUSES = ['GRANTED', 'REVOKED'] as const;
export type ConsentStatus = (typeof CONSENT_STATUSES)[number];

/* ------------------------------------------------------------------ */
/* Users, hospitals, patients                                          */
/* ------------------------------------------------------------------ */

export const USER_STATUSES = ['PENDING_ACTIVATION', 'ACTIVE', 'SUSPENDED', 'DEACTIVATED'] as const;
export type UserStatus = (typeof USER_STATUSES)[number];

export const HOSPITAL_VERIFICATION_STATUSES = ['PENDING_VERIFICATION', 'VERIFIED', 'REJECTED', 'SUSPENDED'] as const;
export type HospitalVerificationStatus = (typeof HOSPITAL_VERIFICATION_STATUSES)[number];

export const PATIENT_STATUSES = ['ACTIVE', 'INACTIVE', 'DECEASED', 'TRANSFERRED_OUT'] as const;
export type PatientStatus = (typeof PATIENT_STATUSES)[number];

export const LANGUAGES = ['en', 'ha', 'pcm'] as const;
export type Language = (typeof LANGUAGES)[number];
export const LANGUAGE_LABELS: Record<Language, string> = { en: 'English', ha: 'Hausa', pcm: 'Nigerian Pidgin' };

export const CONTACT_CHANNELS = ['PUSH', 'SMS', 'EMAIL', 'WHATSAPP', 'PHONE_CALL'] as const;
export type ContactChannel = (typeof CONTACT_CHANNELS)[number];

export const INVITATION_TYPES = ['STAFF', 'PATIENT', 'CAREGIVER'] as const;
export type InvitationType = (typeof INVITATION_TYPES)[number];

/* ------------------------------------------------------------------ */
/* Notifications, messaging, documents, billing                        */
/* ------------------------------------------------------------------ */

export const NOTIFICATION_CHANNELS = ['IN_APP', 'PUSH', 'SMS', 'EMAIL', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'READ'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const CONVERSATION_TYPES = ['PATIENT_CARE_TEAM', 'STAFF'] as const;
export type ConversationType = (typeof CONVERSATION_TYPES)[number];

export const MESSAGE_CATEGORIES = ['GENERAL', 'MEDICATION', 'SYMPTOM', 'APPOINTMENT', 'REHABILITATION', 'ADMINISTRATIVE', 'OTHER'] as const;
export type MessageCategory = (typeof MESSAGE_CATEGORIES)[number];

export const DOCUMENT_TYPES = ['DISCHARGE_SUMMARY', 'RECOVERY_INSTRUCTIONS', 'PRESCRIPTION_PLAN', 'PATIENT_DOCUMENT', 'ATTACHMENT'] as const;
export type DocumentType = (typeof DOCUMENT_TYPES)[number];

export const SUBSCRIPTION_STATUSES = ['TRIALING', 'ACTIVE', 'PAST_DUE', 'EXPIRED', 'CANCELLED'] as const;
export type SubscriptionStatus = (typeof SUBSCRIPTION_STATUSES)[number];

export const INVOICE_STATUSES = ['DRAFT', 'OPEN', 'PAID', 'VOID', 'OVERDUE'] as const;
export type InvoiceStatus = (typeof INVOICE_STATUSES)[number];

export const FEATURES = ['AI_ASSIST', 'REHABILITATION', 'MESSAGING', 'ANALYTICS', 'SMS_NOTIFICATIONS', 'WHATSAPP', 'DOCUMENTS'] as const;
export type Feature = (typeof FEATURES)[number];
