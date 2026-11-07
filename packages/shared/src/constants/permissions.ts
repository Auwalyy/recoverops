/**
 * RecoverOS permission registry.
 *
 * This is the single source of truth for every permission the platform knows about.
 * Roles are mapped to permissions in `roles.ts`; the backend NEVER authorises on a
 * role name alone — it always resolves the principal's permission set and then applies
 * record-level (tenant, department, care-team, consent) checks on top.
 */
export const PERMISSIONS = {
  // Patients
  'patients.read': 'View patient recovery-coordination profiles',
  'patients.create': 'Register patients for recovery coordination',
  'patients.update': 'Update patient profile and contact details',
  'patients.assign': 'Assign care-team members to patients and episodes',

  // Recovery episodes & plans
  'recovery.read': 'View recovery episodes, plans and tasks',
  'recovery.create': 'Create recovery episodes',
  'recovery.update': 'Update recovery episodes and non-clinical task details',
  'recovery.approve': 'Approve recovery plan changes and complete/extend/transfer recovery programmes',

  // Discharge
  'discharge.create': 'Draft discharge plans',
  'discharge.review': 'Review discharge plans and record patient understanding',
  'discharge.approve': 'Approve discharge plans (authorised clinicians only)',

  // Medication
  'medication.read': 'View approved medication orders and patient-reported dose events',
  'medication.manage': 'Manage medication orders within an approved discharge plan',
  'medication.review': 'Review medication concerns (pharmacist review)',

  // Check-ins & symptoms
  'checkins.read': 'View patient check-ins and symptom reports',
  'checkins.create': 'Submit check-ins and symptom reports',
  'checkins.templates.manage': 'Create and approve check-in templates',

  // Alerts
  'alerts.read': 'View clinical alerts',
  'alerts.acknowledge': 'Acknowledge clinical alerts',
  'alerts.assign': 'Assign and reassign clinical alerts',
  'alerts.resolve': 'Record actions on and resolve clinical alerts',
  'alerts.rules.manage': 'Draft alert/escalation rules',
  'alerts.rules.approve': 'Clinically approve alert/escalation rules',

  // Appointments & rehabilitation
  'appointments.read': 'View appointments',
  'appointments.manage': 'Create, reschedule and record attendance for appointments',
  'rehabilitation.read': 'View rehabilitation plans and sessions',
  'rehabilitation.manage': 'Manage rehabilitation plans, sessions and assessments',

  // Messaging
  'messages.read': 'Read patient/care-team conversations',
  'messages.send': 'Send messages in authorised conversations',

  // Documents
  'documents.read': 'View recovery documents',
  'documents.manage': 'Upload and manage recovery documents',

  // Administration
  'reports.read': 'View hospital analytics and reports',
  'users.manage': 'Invite, suspend and manage hospital staff',
  'hospital.settings.manage': 'Manage hospital profile, departments and configuration',
  'audit.read': 'View audit trails',
  'billing.manage': 'View and manage hospital subscription and invoices',
  'ai.use': 'Use AI-assisted features',

  // Platform-level (RecoverOS operator) permissions — these never grant clinical access.
  'platform.hospitals.manage': 'Onboard, verify and suspend hospitals',
  'platform.subscriptions.manage': 'Manage subscription plans and hospital subscriptions',
  'platform.support.read': 'View non-clinical operational metadata for support',
} as const;

export type Permission = keyof typeof PERMISSIONS;

export const ALL_PERMISSIONS = Object.keys(PERMISSIONS) as Permission[];

/**
 * Permissions that grant access to clinical/patient information. Used to make sure
 * platform roles can never receive them and to flag sensitive access in audit logs.
 */
export const CLINICAL_PERMISSIONS: readonly Permission[] = [
  'patients.read',
  'recovery.read',
  'medication.read',
  'checkins.read',
  'alerts.read',
  'appointments.read',
  'rehabilitation.read',
  'messages.read',
  'documents.read',
];

export function isPermission(value: string): value is Permission {
  return Object.prototype.hasOwnProperty.call(PERMISSIONS, value);
}
