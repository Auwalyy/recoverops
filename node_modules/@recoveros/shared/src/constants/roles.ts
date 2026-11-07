import type { Permission } from './permissions';

export const ROLES = [
  'PLATFORM_SUPER_ADMIN',
  'PLATFORM_SUPPORT',
  'HOSPITAL_ADMIN',
  'MEDICAL_DIRECTOR',
  'DOCTOR',
  'DISCHARGE_NURSE',
  'RECOVERY_NURSE',
  'RECOVERY_COORDINATOR',
  'PHARMACIST',
  'PHYSIOTHERAPIST',
  'QUALITY_OFFICER',
  'PATIENT',
  'CAREGIVER',
] as const;

export type RoleCode = (typeof ROLES)[number];

export type PlatformRoleCode = Extract<RoleCode, 'PLATFORM_SUPER_ADMIN' | 'PLATFORM_SUPPORT'>;
export type StaffRoleCode = Exclude<RoleCode, PlatformRoleCode | 'PATIENT' | 'CAREGIVER'>;

export const PLATFORM_ROLES: readonly PlatformRoleCode[] = ['PLATFORM_SUPER_ADMIN', 'PLATFORM_SUPPORT'];
export const STAFF_ROLES: readonly StaffRoleCode[] = [
  'HOSPITAL_ADMIN',
  'MEDICAL_DIRECTOR',
  'DOCTOR',
  'DISCHARGE_NURSE',
  'RECOVERY_NURSE',
  'RECOVERY_COORDINATOR',
  'PHARMACIST',
  'PHYSIOTHERAPIST',
  'QUALITY_OFFICER',
];

/**
 * How far a staff role's patient access reaches inside its own hospital:
 * - HOSPITAL: any patient of the hospital (still limited by permissions)
 * - DEPARTMENT: patients whose episode belongs to one of the user's departments,
 *   or episodes where the user is an active care-team member
 * - ASSIGNED: only episodes where the user is an active care-team member
 * Cross-hospital access is never possible through any scope.
 */
export type AccessScope = 'HOSPITAL' | 'DEPARTMENT' | 'ASSIGNED' | 'SELF' | 'CONSENT' | 'NONE';

export interface RoleDefinition {
  code: RoleCode;
  name: string;
  kind: 'PLATFORM' | 'STAFF' | 'PATIENT' | 'CAREGIVER';
  accessScope: AccessScope;
  permissions: readonly Permission[];
  /** Whether this role may be used to break-glass (emergency access) when enabled by the hospital. */
  canBreakGlass: boolean;
}

const clinicalCore: Permission[] = [
  'patients.read',
  'recovery.read',
  'checkins.read',
  'alerts.read',
  'appointments.read',
  'messages.read',
  'messages.send',
  'documents.read',
  'ai.use',
];

export const ROLE_DEFINITIONS: Record<RoleCode, RoleDefinition> = {
  PLATFORM_SUPER_ADMIN: {
    code: 'PLATFORM_SUPER_ADMIN',
    name: 'Platform super administrator',
    kind: 'PLATFORM',
    accessScope: 'NONE',
    canBreakGlass: false,
    permissions: ['platform.hospitals.manage', 'platform.subscriptions.manage', 'platform.support.read'],
  },
  PLATFORM_SUPPORT: {
    code: 'PLATFORM_SUPPORT',
    name: 'Platform support',
    kind: 'PLATFORM',
    accessScope: 'NONE',
    canBreakGlass: false,
    permissions: ['platform.support.read'],
  },
  HOSPITAL_ADMIN: {
    code: 'HOSPITAL_ADMIN',
    name: 'Hospital administrator',
    kind: 'STAFF',
    accessScope: 'HOSPITAL',
    canBreakGlass: false,
    permissions: [
      'patients.read',
      'patients.create',
      'patients.update',
      'patients.assign',
      'recovery.read',
      'recovery.create',
      'appointments.read',
      'appointments.manage',
      'reports.read',
      'users.manage',
      'hospital.settings.manage',
      'audit.read',
      'billing.manage',
      'checkins.templates.manage',
      'alerts.rules.manage',
    ],
  },
  MEDICAL_DIRECTOR: {
    code: 'MEDICAL_DIRECTOR',
    name: 'Medical director',
    kind: 'STAFF',
    accessScope: 'HOSPITAL',
    canBreakGlass: true,
    permissions: [
      ...clinicalCore,
      'patients.assign',
      'recovery.create',
      'recovery.update',
      'recovery.approve',
      'discharge.create',
      'discharge.review',
      'discharge.approve',
      'medication.read',
      'medication.manage',
      'medication.review',
      'alerts.acknowledge',
      'alerts.assign',
      'alerts.resolve',
      'alerts.rules.manage',
      'alerts.rules.approve',
      'checkins.templates.manage',
      'appointments.manage',
      'rehabilitation.read',
      'reports.read',
      'audit.read',
    ],
  },
  DOCTOR: {
    code: 'DOCTOR',
    name: 'Doctor',
    kind: 'STAFF',
    accessScope: 'DEPARTMENT',
    canBreakGlass: true,
    permissions: [
      ...clinicalCore,
      'patients.create',
      'patients.update',
      'patients.assign',
      'recovery.create',
      'recovery.update',
      'recovery.approve',
      'discharge.create',
      'discharge.review',
      'discharge.approve',
      'medication.read',
      'medication.manage',
      'alerts.acknowledge',
      'alerts.assign',
      'alerts.resolve',
      'alerts.rules.approve',
      'appointments.manage',
      'rehabilitation.read',
      'documents.manage',
    ],
  },
  DISCHARGE_NURSE: {
    code: 'DISCHARGE_NURSE',
    name: 'Discharge nurse',
    kind: 'STAFF',
    accessScope: 'DEPARTMENT',
    canBreakGlass: true,
    permissions: [
      ...clinicalCore,
      'patients.create',
      'patients.update',
      'recovery.create',
      'recovery.update',
      'discharge.create',
      'discharge.review',
      'medication.read',
      'alerts.acknowledge',
      'appointments.manage',
      'documents.manage',
    ],
  },
  RECOVERY_NURSE: {
    code: 'RECOVERY_NURSE',
    name: 'Recovery nurse',
    kind: 'STAFF',
    accessScope: 'DEPARTMENT',
    canBreakGlass: true,
    permissions: [
      ...clinicalCore,
      'patients.update',
      'recovery.update',
      'medication.read',
      'alerts.acknowledge',
      'alerts.assign',
      'alerts.resolve',
      'appointments.manage',
      'rehabilitation.read',
    ],
  },
  RECOVERY_COORDINATOR: {
    code: 'RECOVERY_COORDINATOR',
    name: 'Recovery coordinator',
    kind: 'STAFF',
    accessScope: 'DEPARTMENT',
    canBreakGlass: false,
    permissions: [
      'patients.read',
      'patients.create',
      'patients.update',
      'patients.assign',
      'recovery.read',
      'recovery.create',
      'recovery.update',
      'checkins.read',
      'alerts.read',
      'alerts.acknowledge',
      'alerts.assign',
      'appointments.read',
      'appointments.manage',
      'messages.read',
      'messages.send',
      'documents.read',
      'rehabilitation.read',
      'reports.read',
      'ai.use',
    ],
  },
  PHARMACIST: {
    code: 'PHARMACIST',
    name: 'Pharmacist',
    kind: 'STAFF',
    accessScope: 'HOSPITAL',
    canBreakGlass: false,
    permissions: [
      'patients.read',
      'recovery.read',
      'medication.read',
      'medication.review',
      'alerts.read',
      'alerts.acknowledge',
      'messages.read',
      'messages.send',
    ],
  },
  PHYSIOTHERAPIST: {
    code: 'PHYSIOTHERAPIST',
    name: 'Physiotherapist',
    kind: 'STAFF',
    // Physiotherapists only see episodes they are assigned to, and receive no
    // medication or check-in permissions (principle of least privilege).
    accessScope: 'ASSIGNED',
    canBreakGlass: false,
    permissions: [
      'patients.read',
      'recovery.read',
      'rehabilitation.read',
      'rehabilitation.manage',
      'appointments.read',
      'messages.read',
      'messages.send',
    ],
  },
  QUALITY_OFFICER: {
    code: 'QUALITY_OFFICER',
    name: 'Quality officer',
    kind: 'STAFF',
    accessScope: 'HOSPITAL',
    canBreakGlass: false,
    permissions: ['reports.read', 'audit.read', 'alerts.read'],
  },
  PATIENT: {
    code: 'PATIENT',
    name: 'Patient',
    kind: 'PATIENT',
    accessScope: 'SELF',
    canBreakGlass: false,
    permissions: [
      'recovery.read',
      'medication.read',
      'checkins.read',
      'checkins.create',
      'appointments.read',
      'rehabilitation.read',
      'messages.read',
      'messages.send',
      'documents.read',
      'ai.use',
    ],
  },
  CAREGIVER: {
    code: 'CAREGIVER',
    name: 'Caregiver',
    kind: 'CAREGIVER',
    // Caregiver permissions are an upper bound — the effective set is the
    // intersection with the patient's active consent scopes.
    accessScope: 'CONSENT',
    canBreakGlass: false,
    permissions: [
      'recovery.read',
      'medication.read',
      'checkins.create',
      'appointments.read',
      'messages.read',
      'messages.send',
      'documents.read',
    ],
  },
};

export function permissionsForRole(role: RoleCode): readonly Permission[] {
  return ROLE_DEFINITIONS[role].permissions;
}
