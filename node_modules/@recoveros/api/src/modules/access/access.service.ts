import { Types, type FilterQuery } from 'mongoose';
import type { Permission } from '@recoveros/shared';
import { AppError, errors } from '../../utils/errors';
import { audit } from '../audit/audit.service';
import { RecoveryEpisodeModel, type RecoveryEpisodeDocument } from '../recovery-episodes/episode.model';
import { PatientModel, type PatientDocument } from '../patients/patient.model';
import { BreakGlassGrantModel, RecoveryAssignmentModel } from './access.models';
import { requireTenant, type Principal } from './principal';

/**
 * Record-level access control.
 *
 * Every read/write of patient-linked data goes through one of these functions. Layers:
 *  1. Permission check (registry-derived permission set).
 *  2. Tenant check — queries always include principal.hospitalId; records from another
 *     hospital are reported as NOT_FOUND (no existence disclosure).
 *  3. Relationship check:
 *     STAFF     HOSPITAL scope → any patient in tenant
 *               DEPARTMENT     → episode in user's departments, OR care-team member,
 *                                OR responsible doctor
 *               ASSIGNED       → care-team member or responsible doctor only
 *               + active break-glass grant (if hospital enables it)
 *     PATIENT   → own patient record only
 *     CAREGIVER → active, unexpired consent whose scopes grant the permission
 *     PLATFORM  → never (no routine clinical access)
 */

export function assertPermission(p: Principal, permission: Permission): void {
  if (!p.permissions.has(permission)) {
    throw errors.forbidden();
  }
}

const oid = (id: string | Types.ObjectId) => (typeof id === 'string' ? new Types.ObjectId(id) : id);

async function activeBreakGlass(p: Principal, patientId: Types.ObjectId): Promise<boolean> {
  if (!p.canBreakGlass || !p.hospitalId) return false;
  const key = `bg:${String(patientId)}`;
  if (p.cache.has(key)) return p.cache.get(key) as boolean;
  const grant = await BreakGlassGrantModel.exists({
    hospitalId: oid(p.hospitalId),
    userId: oid(p.userId),
    patientId,
    expiresAt: { $gt: new Date() },
  });
  p.cache.set(key, !!grant);
  return !!grant;
}

/** Episode ids where the staff user is on the active care team (memoised per request). */
async function assignedEpisodeIds(p: Principal): Promise<Types.ObjectId[]> {
  const key = 'assignedEpisodes';
  if (p.cache.has(key)) return p.cache.get(key) as Types.ObjectId[];
  const ids = (await RecoveryAssignmentModel.distinct('episodeId', {
    hospitalId: oid(p.hospitalId!),
    userId: oid(p.userId),
    active: true,
  })) as Types.ObjectId[];
  p.cache.set(key, ids);
  return ids;
}

/** Mongo filter selecting the episodes a STAFF principal may see. */
async function staffEpisodeFilter(p: Principal): Promise<FilterQuery<unknown>> {
  const hospitalId = requireTenant(p);
  if (p.accessScope === 'HOSPITAL') return { hospitalId };
  const assigned = await assignedEpisodeIds(p);
  const or: FilterQuery<unknown>[] = [{ _id: { $in: assigned } }, { responsibleDoctorId: oid(p.userId) }];
  if (p.accessScope === 'DEPARTMENT' && p.departmentIds.length) {
    or.push({ departmentId: { $in: p.departmentIds.map(oid) } });
  }
  return { hospitalId, $or: or };
}

/** Filter on RecoveryEpisode for list endpoints. */
export async function episodeListFilter(p: Principal, permission: Permission): Promise<FilterQuery<unknown>> {
  assertPermission(p, permission);
  const hospitalId = requireTenant(p);
  switch (p.kind) {
    case 'STAFF':
      return staffEpisodeFilter(p);
    case 'PATIENT':
      return { hospitalId, patientId: { $in: p.patientIds.map(oid) } };
    case 'CAREGIVER':
      return { hospitalId, patientId: { $in: caregiverPatientIds(p, permission) } };
    default:
      throw errors.forbidden();
  }
}

function caregiverPatientIds(p: Principal, permission: Permission): Types.ObjectId[] {
  return p.caregiverGrants.filter((g) => g.permissions.has(permission)).map((g) => oid(g.patientId));
}

/**
 * Filter for collections that carry {hospitalId, episodeId, patientId} — tasks,
 * check-ins, alerts, appointments, medication events, etc.
 */
export async function episodeScopedFilter(p: Principal, permission: Permission): Promise<FilterQuery<unknown>> {
  assertPermission(p, permission);
  const hospitalId = requireTenant(p);
  switch (p.kind) {
    case 'STAFF': {
      if (p.accessScope === 'HOSPITAL') return { hospitalId };
      const key = 'visibleEpisodeIds';
      let ids = p.cache.get(key) as Types.ObjectId[] | undefined;
      if (!ids) {
        ids = (await RecoveryEpisodeModel.distinct('_id', await staffEpisodeFilter(p))) as Types.ObjectId[];
        p.cache.set(key, ids);
      }
      return { hospitalId, episodeId: { $in: ids } };
    }
    case 'PATIENT':
      return { hospitalId, patientId: { $in: p.patientIds.map(oid) } };
    case 'CAREGIVER':
      return { hospitalId, patientId: { $in: caregiverPatientIds(p, permission) } };
    default:
      throw errors.forbidden();
  }
}

async function staffCanAccessEpisode(p: Principal, episode: RecoveryEpisodeDocument): Promise<boolean> {
  if (p.accessScope === 'HOSPITAL') return true;
  if (String(episode.responsibleDoctorId) === p.userId) return true;
  if (p.accessScope === 'DEPARTMENT' && p.departmentIds.includes(String(episode.departmentId))) return true;
  const assigned = await assignedEpisodeIds(p);
  return assigned.some((id) => id.equals(episode._id));
}

export interface AccessResult<T> {
  record: T;
  viaBreakGlass: boolean;
}

/** Load an episode the principal may access with `permission`, or throw. */
export async function loadEpisode(
  p: Principal,
  episodeId: string | Types.ObjectId,
  permission: Permission,
): Promise<RecoveryEpisodeDocument> {
  return (await loadEpisodeWithAccess(p, episodeId, permission)).record;
}

export async function loadEpisodeWithAccess(
  p: Principal,
  episodeId: string | Types.ObjectId,
  permission: Permission,
): Promise<AccessResult<RecoveryEpisodeDocument>> {
  assertPermission(p, permission);
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(episodeId)) throw errors.notFound('Recovery episode');
  const episode = await RecoveryEpisodeModel.findOne({ _id: oid(episodeId), hospitalId });
  if (!episode) throw errors.notFound('Recovery episode');

  await assertPatientRelationship(p, episode.patientId as Types.ObjectId, permission, episode);
  const viaBreakGlass = p.kind === 'STAFF' && !(await staffCanAccessEpisode(p, episode));
  return { record: episode, viaBreakGlass };
}

/**
 * Asserts the principal's relationship with a patient (and optionally a specific
 * episode). Shared by patient-, episode- and child-resource checks.
 */
export async function assertPatientRelationship(
  p: Principal,
  patientId: Types.ObjectId,
  permission: Permission,
  episode?: RecoveryEpisodeDocument,
): Promise<void> {
  assertPermission(p, permission);
  switch (p.kind) {
    case 'PATIENT':
      if (!p.patientIds.includes(String(patientId))) throw errors.notFound('Record');
      return;
    case 'CAREGIVER': {
      const grant = p.caregiverGrants.find((g) => g.patientId === String(patientId));
      if (!grant) throw errors.notFound('Record');
      if (!grant.permissions.has(permission)) {
        throw new AppError('CONSENT_REQUIRED', 'The patient has not granted you access to this information');
      }
      // Caregiver access history (visible to the patient) — once per request per patient.
      const key = `cgaudit:${String(patientId)}:${permission}`;
      if (!p.cache.has(key)) {
        p.cache.set(key, true);
        await audit({ action: 'CAREGIVER_ACCESS', resourceType: episode ? 'RecoveryEpisode' : 'Patient', resourceId: episode ? String(episode._id) : String(patientId), patientId: String(patientId), metadata: { permission, consentId: grant.consentId } });
      }
      return;
    }
    case 'STAFF': {
      if (episode) {
        if (await staffCanAccessEpisode(p, episode)) return;
      } else if (await staffCanAccessPatient(p, patientId)) {
        return;
      }
      if (await activeBreakGlass(p, patientId)) {
        await audit({
          action: 'BREAK_GLASS_ACCESS',
          resourceType: episode ? 'RecoveryEpisode' : 'Patient',
          resourceId: episode ? String(episode._id) : String(patientId),
          patientId: String(patientId),
          breakGlass: true,
          metadata: { permission },
        });
        return;
      }
      await audit({
        action: 'ACCESS_DENIED',
        resourceType: episode ? 'RecoveryEpisode' : 'Patient',
        resourceId: episode ? String(episode._id) : String(patientId),
        patientId: String(patientId),
        outcome: 'DENIED',
        metadata: { permission },
      });
      throw errors.forbidden('You are not part of this patient\'s care team');
    }
    default:
      throw errors.forbidden('Platform accounts have no routine access to clinical records');
  }
}

async function staffCanAccessPatient(p: Principal, patientId: Types.ObjectId): Promise<boolean> {
  if (p.accessScope === 'HOSPITAL') return true;
  const hospitalId = requireTenant(p);
  const episodes = await RecoveryEpisodeModel.find({ hospitalId, patientId }).select('_id departmentId responsibleDoctorId');
  if (episodes.length === 0) {
    // Newly registered patient with no episode yet: visible to department-scoped staff
    // for onboarding; ASSIGNED-scope roles (e.g. physiotherapists) cannot see it.
    return p.accessScope === 'DEPARTMENT';
  }
  for (const e of episodes) if (await staffCanAccessEpisode(p, e)) return true;
  return false;
}

/** Load a patient the principal may access with `permission`, or throw. */
export async function loadPatient(
  p: Principal,
  patientId: string | Types.ObjectId,
  permission: Permission,
): Promise<PatientDocument> {
  assertPermission(p, permission);
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(patientId)) throw errors.notFound('Patient');
  const patient = await PatientModel.findOne({ _id: oid(patientId), hospitalId });
  if (!patient) throw errors.notFound('Patient');
  await assertPatientRelationship(p, patient._id, permission);
  return patient;
}

/**
 * For child records (task, alert, check-in…) loaded by id: verify tenant + relationship
 * via the record's episode. The record must already have been loaded with hospitalId.
 */
export async function assertChildAccess(
  p: Principal,
  record: { episodeId?: unknown; patientId?: unknown },
  permission: Permission,
): Promise<RecoveryEpisodeDocument> {
  return loadEpisode(p, String(record.episodeId), permission);
}

/** Patient ids a PATIENT/CAREGIVER principal acts for (for "my" endpoints). */
export function selfPatientIds(p: Principal, permission: Permission): Types.ObjectId[] {
  if (p.kind === 'PATIENT') return p.patientIds.map(oid);
  if (p.kind === 'CAREGIVER') return caregiverPatientIds(p, permission);
  return [];
}

export const toObjectId = oid;
