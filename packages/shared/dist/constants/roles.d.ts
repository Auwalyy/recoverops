import type { Permission } from './permissions';
export declare const ROLES: readonly ["PLATFORM_SUPER_ADMIN", "PLATFORM_SUPPORT", "HOSPITAL_ADMIN", "MEDICAL_DIRECTOR", "DOCTOR", "DISCHARGE_NURSE", "RECOVERY_NURSE", "RECOVERY_COORDINATOR", "PHARMACIST", "PHYSIOTHERAPIST", "QUALITY_OFFICER", "PATIENT", "CAREGIVER"];
export type RoleCode = (typeof ROLES)[number];
export type PlatformRoleCode = Extract<RoleCode, 'PLATFORM_SUPER_ADMIN' | 'PLATFORM_SUPPORT'>;
export type StaffRoleCode = Exclude<RoleCode, PlatformRoleCode | 'PATIENT' | 'CAREGIVER'>;
export declare const PLATFORM_ROLES: readonly PlatformRoleCode[];
export declare const STAFF_ROLES: readonly StaffRoleCode[];
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
export declare const ROLE_DEFINITIONS: Record<RoleCode, RoleDefinition>;
export declare function permissionsForRole(role: RoleCode): readonly Permission[];
