import { model, type HydratedDocument, type InferSchemaType } from 'mongoose';
import { ALL_PERMISSIONS, CARE_TEAM_ROLES, ROLES } from '@recoveros/shared';
import { createSchema, ref, tenantField } from '../../database/schema';

/**
 * Permission and Role collections mirror the code registry (packages/shared) so that
 * administrators and auditors can query them. The code registry is authoritative;
 * `syncAccessRegistry()` upserts on startup.
 */
const permissionSchema = createSchema({
  code: { type: String, required: true, unique: true, enum: ALL_PERMISSIONS },
  description: { type: String, required: true },
});
export const PermissionModel = model('Permission', permissionSchema);

const roleSchema = createSchema({
  code: { type: String, required: true, unique: true, enum: ROLES },
  name: { type: String, required: true },
  kind: { type: String, required: true },
  accessScope: { type: String, required: true },
  permissions: { type: [String], enum: ALL_PERMISSIONS, default: [] },
  system: { type: Boolean, default: true },
});
export const RoleModel = model('Role', roleSchema);

/**
 * UserRole = staff membership of a hospital. A user may hold memberships in several
 * hospitals (explicitly authorised multi-hospital staff). Department scoping narrows
 * DEPARTMENT-scoped roles.
 */
const userRoleSchema = createSchema(
  {
    ...tenantField,
    userId: { ...ref('User', true), index: true },
    roles: { type: [String], enum: ROLES, required: true },
    departmentIds: [ref('Department')],
    title: String,
    status: { type: String, enum: ['ACTIVE', 'SUSPENDED', 'REVOKED'], default: 'ACTIVE' },
    grantedBy: ref('User'),
    revokedAt: Date,
    revokedBy: ref('User'),
  },
  { tenant: true },
);
userRoleSchema.index({ hospitalId: 1, userId: 1 }, { unique: true });
export type UserRole = InferSchemaType<typeof userRoleSchema>;
export type UserRoleDocument = HydratedDocument<UserRole>;
export const UserRoleModel = model('UserRole', userRoleSchema);

/** Care-team membership for a specific recovery episode. */
const recoveryAssignmentSchema = createSchema(
  {
    ...tenantField,
    episodeId: { ...ref('RecoveryEpisode', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    userId: { ...ref('User', true), index: true },
    role: { type: String, enum: CARE_TEAM_ROLES, required: true },
    active: { type: Boolean, default: true },
    assignedBy: ref('User'),
    endedAt: Date,
  },
  { tenant: true },
);
recoveryAssignmentSchema.index(
  { hospitalId: 1, episodeId: 1, userId: 1, role: 1 },
  { unique: true, partialFilterExpression: { active: true } },
);
export type RecoveryAssignment = InferSchemaType<typeof recoveryAssignmentSchema>;
export const RecoveryAssignmentModel = model('RecoveryAssignment', recoveryAssignmentSchema);

/** Break-glass emergency access grant; time-boxed, justified and always audited. */
const breakGlassSchema = createSchema(
  {
    ...tenantField,
    userId: { ...ref('User', true), index: true },
    patientId: { ...ref('Patient', true), index: true },
    reason: { type: String, required: true },
    expiresAt: { type: Date, required: true },
    reviewedBy: ref('User'),
    reviewedAt: Date,
  },
  { tenant: true },
);
export const BreakGlassGrantModel = model('BreakGlassGrant', breakGlassSchema);
