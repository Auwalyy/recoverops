import type {
  AlertPriority,
  AlertStatus,
  AppointmentStatus,
  DischargeContent,
  EpisodeStatus,
  MedicationEventStatus,
  TaskStatus,
  TaskType,
  CheckInQuestion,
} from '@recoveros/shared';

/** Client-side shapes of API responses (subset of server documents). */
export interface Ref<T = { id: string }> {
  id: string;
  [k: string]: unknown;
}
export interface PersonRef {
  id: string;
  firstName: string;
  lastName: string;
}
export interface PatientRef extends PersonRef {
  hospitalPatientRef?: string;
  phone?: string;
}

export interface Patient extends PatientRef {
  dateOfBirth: string;
  sex: string;
  email?: string;
  preferredLanguage: string;
  status: string;
  consentStatus: string;
  userId?: string;
  emergencyContact?: { name: string; relationship: string; phone: string };
}

export interface Episode {
  id: string;
  patientId: PatientRef | string;
  departmentId: { id: string; name: string; code: string } | string;
  responsibleDoctorId: PersonRef | string;
  status: EpisodeStatus;
  admissionDate: string;
  dischargeDate?: string;
  startDate?: string;
  expectedReviewDate?: string;
  procedureReference?: string;
  diagnosisReference?: string;
  programmeName?: string;
  currentDischargePlanId?: string;
  currentRecoveryPlanId?: string;
  stats?: { openAlerts: number; missedTasks: number; lastCheckInAt?: string };
  statusHistory?: Array<{ from?: string; to: string; reason?: string; at: string; changedBySystem?: boolean }>;
  createdAt: string;
  updatedAt: string;
}

export interface EpisodeDetail {
  episode: Episode;
  careTeam: Array<{ id: string; role: string; user: PersonRef }>;
  plan: { id: string; startDate: string; endDate: string; status: string; timezone: string } | null;
  today: { total: number; completed: number; pending: number; missed: number };
  activeMedicationCount?: number;
}

export interface Task {
  id: string;
  episodeId: string;
  type: TaskType;
  title: string;
  instructions?: string;
  dueAt: string;
  localDate: string;
  localTime?: string;
  status: TaskStatus;
  medicationOrderId?: string;
  checkInTemplateId?: string;
  completedAt?: string;
  completionSource?: string;
}

export interface MedicationOrder {
  id: string;
  name: string;
  strength?: string;
  dose: string;
  route: string;
  frequencyText: string;
  instructions?: string;
  isPrn: boolean;
  startDate: string;
  endDate?: string;
  status: string;
  schedule: { timesOfDay: string[]; kind: string } | null;
  disclaimer: string;
  pharmacistReview?: { status: string };
}

export interface MedicationEvent {
  id: string;
  status: MedicationEventStatus;
  medicationOrderId: { id: string; name: string; strength?: string; dose: string } | string;
  scheduledFor?: string;
  reportedTakenAt?: string;
  reporterKind: string;
  accessProblem?: string;
  sideEffects?: string;
  reason?: string;
  reviewStatus: string;
  createdAt: string;
  patientId?: PatientRef;
}

export interface DischargeVersion {
  id: string;
  versionNumber: number;
  status: string;
  content: DischargeContent;
  approvedAt?: string;
  patientUnderstanding?: Array<{ method: string; understood: boolean; recordedAt: string }>;
}

export interface DischargePlanView {
  plan: { id: string; episodeId: string; status: string; currentVersionId?: string; approvedVersionId?: string };
  currentVersion?: DischargeVersion;
  approvedVersion?: DischargeVersion;
  versions?: Array<{ id: string; versionNumber: number; status: string; createdAt: string; approvedAt?: string }>;
  approvals?: Array<{ id: string; decision: string; comment?: string; decidedBy: PersonRef; createdAt: string }>;
}

export interface CheckInTemplate {
  id: string;
  name: string;
  kind: string;
  version: number;
  questions: Array<CheckInQuestion & { translations?: Record<string, { label: string; helpText?: string }> }>;
}

export interface SafetyMessage {
  priority: AlertPriority;
  message?: string;
  showEmergencyGuidance: boolean;
  emergencyInstructions?: string;
  emergencyPhone?: string;
}

export interface CheckIn {
  id: string;
  episodeId: string;
  templateId: { id: string; name: string; kind?: string; questions?: CheckInQuestion[] } | string;
  answers: Record<string, unknown>;
  notes?: string;
  reviewStatus: string;
  reporterKind: string;
  clinicianNotes?: string;
  alertIds?: string[];
  createdAt: string;
  patientId?: PatientRef;
}

export interface SymptomReport {
  id: string;
  episodeId: string;
  description: string;
  severity: 'MILD' | 'MODERATE' | 'SEVERE';
  trend: string;
  durationText?: string;
  reviewStatus: string;
  createdAt: string;
  patientId?: PatientRef;
}

export interface Alert {
  id: string;
  episodeId: string;
  patientId: PatientRef;
  priority: AlertPriority;
  status: AlertStatus;
  title: string;
  summary?: string;
  source: string;
  matchedConditions?: Array<{ field: string; op: string; expected: unknown; actual: unknown }>;
  assignedToUserId?: PersonRef;
  acknowledgedAt?: string;
  acknowledgedBy?: PersonRef;
  escalationLevel: number;
  acknowledgeDeadline?: string;
  resolution?: { outcome: string; notes: string; resolvedAt: string; resolvedBy?: PersonRef };
  createdAt: string;
}

export interface AlertAction {
  id: string;
  type: string;
  notes?: string;
  contactOutcome?: string;
  fromStatus?: string;
  toStatus?: string;
  bySystem?: boolean;
  actorId?: PersonRef;
  createdAt: string;
}

export interface Appointment {
  id: string;
  episodeId: string;
  patientId: PatientRef | string;
  clinicianId?: PersonRef;
  type: string;
  mode: string;
  scheduledAt: string;
  durationMinutes: number;
  location?: string;
  instructions?: string;
  status: AppointmentStatus;
  patientConfirmedAt?: string;
  followUpNotes?: Array<{ note: string; at: string }>;
}

export interface RehabPlan {
  id: string;
  episodeId: string;
  patientId: PatientRef | string;
  physiotherapistId: PersonRef | string;
  goals: string[];
  exercises: Array<{ name: string; instructions: string; sets?: number; repetitions?: number; holdSeconds?: number; frequencyText?: string }>;
  milestones: Array<{ id: string; title: string; targetDate?: string; achievedAt?: string }>;
  startDate: string;
  endDate?: string;
  status: string;
  reviewNotes?: Array<{ note: string; at: string }>;
}

export interface RehabSession {
  id: string;
  planId: string;
  episodeId: string;
  patientId: PatientRef | string;
  scheduledAt: string;
  durationMinutes: number;
  location?: string;
  mode: string;
  status: string;
  progressNotes?: string;
  assessment?: { painScore?: number; functionalScore?: number; mobilityNotes?: string };
}

export interface Conversation {
  id: string;
  subject: string;
  category: string;
  type: string;
  status: string;
  patientId?: PersonRef;
  lastMessageAt?: string;
  lastMessagePreview?: string;
  unreadCount: number;
  callbackRequested?: boolean;
  escalated?: boolean;
}

export interface Message {
  id: string;
  body: string;
  type: string;
  senderKind: string;
  senderId: PersonRef;
  createdAt: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  body: string;
  template: string;
  data?: Record<string, string>;
  readAt?: string;
  createdAt: string;
}

export interface CaregiverConsent {
  id: string;
  caregiverId: { id: string; name: string; email?: string; phone?: string };
  relationship: string;
  scopes: string[];
  status: string;
  expiresAt: string;
  acceptedAt?: string;
}

export interface DocumentItem {
  id: string;
  title: string;
  type: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: string;
}

export interface StaffMember {
  userId: string;
  firstName: string;
  lastName: string;
  roles: string[];
  departmentIds: string[];
  title?: string;
}

export interface Department {
  id: string;
  name: string;
  code: string;
}

export interface Dashboard {
  period: { from: string; to: string };
  activity: {
    label: string;
    activeEpisodes: number;
    newDischarges: number;
    patientEngagementRate: number | null;
    checkIns: { due: number; completed: number; missed: number; completionRate: number | null };
    appointments: { missed: number; attended: number; attendanceRate: number | null };
    alerts: { total: number; open: number; critical: number; escalated: number; avgAcknowledgeMinutes: number | null; avgResolveMinutes: number | null };
    rehabilitation: { attendanceRate: number | null };
    satisfaction: { average: number | null; responses: number };
  };
  outcomes: { label: string; programmesCompleted: number; programmesTransferred: number; unplannedHospitalReturnsNote: string };
}
