import { Types } from 'mongoose';
import {
  CAREGIVER_SCOPES,
  ROLE_DEFINITIONS,
  type AccessScope,
  type CaregiverScope,
  type Permission,
  type PlatformRoleCode,
  type RoleCode,
} from '@recoveros/shared';
import { UserRoleModel } from './access.models';
import { PatientModel } from '../patients/patient.model';
import { CaregiverConsentModel } from '../caregivers/caregiver.models';
import { HospitalModel } from '../hospitals/hospital.models';
import type { UserDocument } from '../users/user.model';
import { AppError } from '../../utils/errors';

export type PrincipalKind = 'PLATFORM' | 'STAFF' | 'PATIENT' | 'CAREGIVER';

export interface CaregiverGrant {
  consentId: string;
  patientId: string;
  scopes: CaregiverScope[];
  permissions: Set<Permission>;
}

/**
 * The authenticated actor for a request, fully resolved server-side from the user's
 * identity and current authorised relationships (never from client-asserted claims).
 */
export interface Principal {
  userId: string;
  sessionId: string;
  kind: PrincipalKind;
  platformRoles: PlatformRoleCode[];
  /** Active tenant. Undefined only for platform principals. */
  hospitalId?: string;
  roles: RoleCode[];
  departmentIds: string[];
  permissions: Set<Permission>;
  accessScope: AccessScope;
  canBreakGlass: boolean;
  /** PATIENT kind: the user's own patient record(s) in the active hospital. */
  patientIds: string[];
  /** CAREGIVER kind: active, unexpired consents in the active hospital. */
  caregiverGrants: CaregiverGrant[];
  /** Per-request memo (accessible episode ids for list filters, etc.). */
  cache: Map<string, unknown>;
}

const SCOPE_RANK: Record<AccessScope, number> = { NONE: 0, SELF: 1, CONSENT: 1, ASSIGNED: 2, DEPARTMENT: 3, HOSPITAL: 4 };

export interface AvailableContexts {
  staff: Array<{ hospitalId: string; roles: RoleCode[]; departmentIds: string[]; title?: string | null }>;
  patient: Array<{ hospitalId: string; patientId: string }>;
  caregiver: Array<{ hospitalId: string; consentId: string; patientId: string; scopes: CaregiverScope[] }>;
}

/** Load every hospital relationship the user is currently authorised for. */
export async function loadAvailableContexts(userId: string): Promise<AvailableContexts> {
  const uid = new Types.ObjectId(userId);
  const now = new Date();
  const [memberships, patients, consents] = await Promise.all([
    UserRoleModel.find({ userId: uid, status: 'ACTIVE' }).setOptions({ skipTenantGuard: true }).lean(),
    PatientModel.find({ userId: uid, status: { $ne: 'DECEASED' } }).setOptions({ skipTenantGuard: true }).select('_id hospitalId').lean(),
    CaregiverConsentModel.find({ caregiverUserId: uid, status: 'ACTIVE', expiresAt: { $gt: now } })
      .setOptions({ skipTenantGuard: true })
      .lean(),
  ]);

  // Exclude memberships of suspended / rejected hospitals.
  const hospitalIds = [...new Set([...memberships, ...patients, ...consents].map((m) => String(m.hospitalId)))];
  const blocked = new Set(
    (
      await HospitalModel.find({ _id: { $in: hospitalIds }, verificationStatus: { $in: ['SUSPENDED', 'REJECTED'] } })
        .select('_id')
        .lean()
    ).map((h) => String(h._id)),
  );

  return {
    staff: memberships
      .filter((m) => !blocked.has(String(m.hospitalId)))
      .map((m) => ({
        hospitalId: String(m.hospitalId),
        roles: m.roles as RoleCode[],
        departmentIds: (m.departmentIds ?? []).map(String),
        title: m.title,
      })),
    patient: patients
      .filter((p) => !blocked.has(String(p.hospitalId)))
      .map((p) => ({ hospitalId: String(p.hospitalId), patientId: String(p._id) })),
    caregiver: consents
      .filter((c) => !blocked.has(String(c.hospitalId)))
      .map((c) => ({
        hospitalId: String(c.hospitalId),
        consentId: String(c._id),
        patientId: String(c.patientId),
        scopes: c.scopes as CaregiverScope[],
      })),
  };
}

export function permissionsForRoles(roles: readonly RoleCode[]): Set<Permission> {
  const set = new Set<Permission>();
  for (const r of roles) for (const p of ROLE_DEFINITIONS[r].permissions) set.add(p);
  return set;
}

export function caregiverPermissions(scopes: readonly CaregiverScope[]): Set<Permission> {
  const ceiling = new Set(ROLE_DEFINITIONS.CAREGIVER.permissions);
  const set = new Set<Permission>();
  for (const s of scopes) for (const p of CAREGIVER_SCOPES[s]) if (ceiling.has(p)) set.add(p);
  return set;
}

/**
 * Resolve the principal for a request.
 * `requestedHospitalId` / `requestedKind` come from headers and are only honoured when
 * they correspond to a relationship the user really holds.
 */
export async function resolvePrincipal(
  user: UserDocument,
  sessionId: string,
  opts: { requestedHospitalId?: string; requestedKind?: PrincipalKind; sessionHospitalId?: string },
): Promise<Principal> {
  const ctx = await loadAvailableContexts(String(user._id));
  const platformRoles = (user.platformRoles ?? []) as PlatformRoleCode[];

  const base = {
    userId: String(user._id),
    sessionId,
    platformRoles,
    cache: new Map<string, unknown>(),
  };

  const wantedHospital = opts.requestedHospitalId ?? opts.sessionHospitalId;
  const order: PrincipalKind[] = opts.requestedKind ? [opts.requestedKind] : ['STAFF', 'PATIENT', 'CAREGIVER'];

  const pick = <T extends { hospitalId: string }>(list: T[]): T[] => {
    if (wantedHospital) {
      const matches = list.filter((x) => x.hospitalId === wantedHospital);
      // A stale session hospital (e.g. membership revoked) falls back to the first available.
      if (matches.length || opts.requestedHospitalId) return matches;
    }
    const first = list[0];
    return first ? list.filter((x) => x.hospitalId === first.hospitalId) : [];
  };

  for (const kind of order) {
    if (kind === 'STAFF') {
      const m = pick(ctx.staff)[0];
      if (!m) continue;
      const roles = m.roles;
      const scope = roles.reduce<AccessScope>(
        (best, r) => (SCOPE_RANK[ROLE_DEFINITIONS[r].accessScope] > SCOPE_RANK[best] ? ROLE_DEFINITIONS[r].accessScope : best),
        'NONE',
      );
      return {
        ...base,
        kind: 'STAFF',
        hospitalId: m.hospitalId,
        roles,
        departmentIds: m.departmentIds,
        permissions: permissionsForRoles(roles),
        accessScope: scope,
        canBreakGlass: roles.some((r) => ROLE_DEFINITIONS[r].canBreakGlass),
        patientIds: [],
        caregiverGrants: [],
      };
    }
    if (kind === 'PATIENT') {
      const recs = pick(ctx.patient);
      if (!recs.length) continue;
      return {
        ...base,
        kind: 'PATIENT',
        hospitalId: recs[0]!.hospitalId,
        roles: ['PATIENT'],
        departmentIds: [],
        permissions: permissionsForRoles(['PATIENT']),
        accessScope: 'SELF',
        canBreakGlass: false,
        patientIds: recs.map((r) => r.patientId),
        caregiverGrants: [],
      };
    }
    if (kind === 'CAREGIVER') {
      const grants = pick(ctx.caregiver);
      if (!grants.length) continue;
      const caregiverGrants = grants.map((g) => ({ ...g, permissions: caregiverPermissions(g.scopes) }));
      const union = new Set<Permission>();
      for (const g of caregiverGrants) for (const p of g.permissions) union.add(p);
      return {
        ...base,
        kind: 'CAREGIVER',
        hospitalId: grants[0]!.hospitalId,
        roles: ['CAREGIVER'],
        departmentIds: [],
        permissions: union,
        accessScope: 'CONSENT',
        canBreakGlass: false,
        patientIds: [],
        caregiverGrants,
      };
    }
  }

  if (platformRoles.length && (!opts.requestedKind || opts.requestedKind === 'PLATFORM') && !opts.requestedHospitalId) {
    return {
      ...base,
      kind: 'PLATFORM',
      hospitalId: undefined,
      roles: platformRoles,
      departmentIds: [],
      permissions: permissionsForRoles(platformRoles),
      accessScope: 'NONE',
      canBreakGlass: false,
      patientIds: [],
      caregiverGrants: [],
    };
  }

  if (opts.requestedHospitalId || opts.requestedKind) {
    throw new AppError('TENANT_ACCESS_DENIED', 'You do not have access to the requested hospital context');
  }
  throw new AppError('FORBIDDEN', 'Your account has no active hospital access');
}

export function hasPermission(p: Principal, permission: Permission): boolean {
  return p.permissions.has(permission);
}

export function requireTenant(p: Principal): Types.ObjectId {
  if (!p.hospitalId) throw new AppError('TENANT_ACCESS_DENIED', 'A hospital context is required for this action');
  return new Types.ObjectId(p.hospitalId);
}
