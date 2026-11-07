import { Types } from 'mongoose';
import { ROLE_DEFINITIONS, type RegisterHospitalInput, type RoleCode } from '@recoveros/shared';
import { withTransaction } from '../../database/connection';
import { AppError, errors } from '../../utils/errors';
import { hashPassword } from '../../utils/crypto';
import { audit } from '../audit/audit.service';
import { UserModel } from '../users/user.model';
import { BreakGlassGrantModel, UserRoleModel } from '../access/access.models';
import { requireTenant, type Principal } from '../access/principal';
import { PatientModel } from '../patients/patient.model';
import { createInvitation } from '../auth/invitation.service';
import { revokeAllSessions } from '../auth/auth.service';
import { startTrial } from '../billing/billing.service';
import { DepartmentModel, HospitalModel } from './hospital.models';

function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50);
}

/**
 * Public hospital registration. Creates the hospital (PENDING_VERIFICATION), its first
 * HOSPITAL_ADMIN and a trial subscription atomically. Patient onboarding stays blocked
 * until a platform operator verifies the hospital.
 */
export async function registerHospital(input: RegisterHospitalInput) {
  const existing = await UserModel.findOne({ email: input.admin.email });
  if (existing) throw errors.conflict('An account already exists for this administrator email. Sign in and contact support to add a hospital.');

  return withTransaction(async (session) => {
    let slug = slugify(input.hospital.name);
    if (await HospitalModel.exists({ slug }).session(session)) slug = `${slug}-${new Types.ObjectId().toString().slice(-5)}`;

    const [hospital] = await HospitalModel.create(
      [{ ...input.hospital, slug, verificationStatus: 'PENDING_VERIFICATION' }],
      { session },
    );
    const [admin] = await UserModel.create(
      [
        {
          firstName: input.admin.firstName,
          lastName: input.admin.lastName,
          email: input.admin.email,
          phone: input.admin.phone,
          passwordHash: await hashPassword(input.admin.password),
          passwordChangedAt: new Date(),
          status: 'ACTIVE',
        },
      ],
      { session },
    );
    await UserRoleModel.create([{ hospitalId: hospital!._id, userId: admin!._id, roles: ['HOSPITAL_ADMIN'], status: 'ACTIVE' }], { session });
    await startTrial(hospital!._id, session);
    await audit(
      { action: 'HOSPITAL_REGISTERED', resourceType: 'Hospital', resourceId: String(hospital!._id), hospitalId: String(hospital!._id), actor: { userId: String(admin!._id), kind: 'STAFF', roles: ['HOSPITAL_ADMIN'] } },
      session,
    );
    return { hospital: hospital!, adminUserId: String(admin!._id) };
  });
}

export async function getHospital(p: Principal) {
  const hospital = await HospitalModel.findById(requireTenant(p));
  if (!hospital) throw errors.notFound('Hospital');
  return hospital;
}

export async function updateHospital(p: Principal, patch: Record<string, unknown>) {
  const hospital = await getHospital(p);
  const { settings, address, ...rest } = patch as { settings?: Record<string, unknown>; address?: Record<string, unknown> };
  hospital.set(rest);
  if (address) for (const [k, v] of Object.entries(address)) hospital.set(`address.${k}`, v);
  if (settings) for (const [k, v] of Object.entries(settings)) hospital.set(`settings.${k}`, v);
  if (patch.timezone) {
    try {
      new Intl.DateTimeFormat('en', { timeZone: String(patch.timezone) });
    } catch {
      throw errors.validation('Unknown timezone');
    }
  }
  await hospital.save();
  await audit({ action: 'HOSPITAL_SETTINGS_UPDATED', resourceType: 'Hospital', resourceId: String(hospital._id), metadata: { fields: Object.keys(patch), settings: settings ? Object.keys(settings) : undefined } });
  return hospital;
}

/** Hospital public info a patient/caregiver needs (emergency guidance, contact). */
export async function getHospitalPublicInfo(p: Principal) {
  const h = await getHospital(p);
  return {
    id: String(h._id),
    name: h.name,
    phone: h.phone,
    emergencyPhone: h.emergencyPhone ?? h.phone,
    emergencyInstructions: h.settings?.emergencyInstructions,
    timezone: h.timezone,
  };
}

/* ------------------------------ Departments ------------------------------ */

export async function listDepartments(p: Principal) {
  return DepartmentModel.find({ hospitalId: requireTenant(p), active: true }).sort({ name: 1 });
}

export async function createDepartment(p: Principal, input: { name: string; code: string; description?: string }) {
  const dept = await DepartmentModel.create({ ...input, hospitalId: requireTenant(p) });
  await audit({ action: 'DEPARTMENT_CREATED', resourceType: 'Department', resourceId: String(dept._id), metadata: { code: input.code } });
  return dept;
}

export async function updateDepartment(p: Principal, id: string, input: { name?: string; description?: string; active?: boolean }) {
  const dept = await DepartmentModel.findOneAndUpdate({ _id: id, hospitalId: requireTenant(p) }, { $set: input }, { new: true });
  if (!dept) throw errors.notFound('Department');
  await audit({ action: 'DEPARTMENT_UPDATED', resourceType: 'Department', resourceId: id, metadata: { fields: Object.keys(input) } });
  return dept;
}

/* --------------------------------- Staff --------------------------------- */

function assertAssignableRoles(roles: RoleCode[]): void {
  for (const r of roles) {
    if (ROLE_DEFINITIONS[r].kind !== 'STAFF') {
      throw errors.validation(`Role ${r} cannot be assigned to hospital staff`);
    }
  }
}

async function assertDepartments(hospitalId: Types.ObjectId, ids: string[]) {
  if (!ids.length) return;
  const count = await DepartmentModel.countDocuments({ hospitalId, _id: { $in: ids } });
  if (count !== ids.length) throw errors.validation('One or more departments do not belong to this hospital');
}

export async function listStaff(p: Principal, query: { role?: string; departmentId?: string }) {
  const hospitalId = requireTenant(p);
  const filter: Record<string, unknown> = { hospitalId, status: { $ne: 'REVOKED' } };
  if (query.role) filter.roles = query.role;
  if (query.departmentId) filter.departmentIds = new Types.ObjectId(query.departmentId);
  const memberships = await UserRoleModel.find(filter).populate('userId', 'firstName lastName email phone status lastLoginAt');
  return memberships.map((m) => {
    const u = m.userId as unknown as { _id: Types.ObjectId; firstName: string; lastName: string; email?: string; phone?: string; status: string; lastLoginAt?: Date };
    return {
      membershipId: String(m._id),
      userId: String(u._id),
      firstName: u.firstName,
      lastName: u.lastName,
      email: u.email,
      phone: u.phone,
      accountStatus: u.status,
      membershipStatus: m.status,
      roles: m.roles,
      departmentIds: (m.departmentIds ?? []).map(String),
      title: m.title,
      lastLoginAt: u.lastLoginAt,
    };
  });
}

export async function inviteStaff(
  p: Principal,
  input: { email: string; phone?: string; firstName: string; lastName: string; roles: RoleCode[]; departmentIds: string[]; title?: string },
) {
  const hospitalId = requireTenant(p);
  assertAssignableRoles(input.roles);
  await assertDepartments(hospitalId, input.departmentIds);

  const existingUser = await UserModel.findOne({ email: input.email });
  if (existingUser && (await UserRoleModel.exists({ hospitalId, userId: existingUser._id, status: 'ACTIVE' }))) {
    throw errors.conflict('This person is already a staff member of this hospital');
  }
  const result = await createInvitation({
    type: 'STAFF',
    hospitalId,
    email: input.email,
    phone: input.phone,
    firstName: input.firstName,
    lastName: input.lastName,
    roles: input.roles,
    departmentIds: input.departmentIds,
    createdBy: p.userId,
  });
  await audit({ action: 'STAFF_INVITED', resourceType: 'Invitation', resourceId: String(result.invitation._id), metadata: { roles: input.roles } });
  return { invitationId: String(result.invitation._id), expiresAt: result.invitation.expiresAt, ...('devToken' in result ? { devToken: result.devToken } : {}) };
}

export async function updateStaff(p: Principal, userId: string, input: { roles?: RoleCode[]; departmentIds?: string[]; title?: string }) {
  const hospitalId = requireTenant(p);
  if (input.roles) assertAssignableRoles(input.roles);
  if (input.departmentIds) await assertDepartments(hospitalId, input.departmentIds);
  const membership = await UserRoleModel.findOne({ hospitalId, userId });
  if (!membership) throw errors.notFound('Staff member');
  if (userId === p.userId && input.roles && !input.roles.includes('HOSPITAL_ADMIN') && membership.roles.includes('HOSPITAL_ADMIN')) {
    throw errors.validation('You cannot remove your own administrator role');
  }
  const before = { roles: [...membership.roles], departmentIds: (membership.departmentIds ?? []).map(String) };
  membership.set(input);
  await membership.save();
  await audit({ action: 'STAFF_ROLES_UPDATED', resourceType: 'UserRole', resourceId: String(membership._id), metadata: { before, after: input } });
  return membership;
}

export async function setStaffStatus(p: Principal, userId: string, status: 'ACTIVE' | 'SUSPENDED' | 'REVOKED', reason?: string) {
  const hospitalId = requireTenant(p);
  if (userId === p.userId) throw errors.validation('You cannot change your own access');
  const membership = await UserRoleModel.findOne({ hospitalId, userId });
  if (!membership) throw errors.notFound('Staff member');
  membership.status = status;
  if (status === 'REVOKED') {
    membership.revokedAt = new Date();
    membership.revokedBy = new Types.ObjectId(p.userId);
  }
  await membership.save();
  if (status !== 'ACTIVE') {
    // Ends live sessions so the change takes effect immediately for this hospital.
    await revokeAllSessions(userId, `STAFF_${status}`);
  }
  await audit({ action: `STAFF_${status}`, resourceType: 'UserRole', resourceId: String(membership._id), metadata: { reason } });
  return membership;
}

/* ------------------------------ Break-glass ------------------------------ */

/**
 * Emergency access to a patient outside the user's normal scope. Only for roles with
 * `canBreakGlass`, only when the hospital enables it, always time-boxed, justified and
 * audited (and surfaced to quality officers via the audit log).
 */
export async function breakGlass(p: Principal, input: { patientId: string; reason: string; durationMinutes: number }) {
  const hospitalId = requireTenant(p);
  if (p.kind !== 'STAFF' || !p.canBreakGlass) throw errors.forbidden('Your role cannot use emergency access');
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital?.settings?.breakGlassEnabled) throw errors.forbidden('Emergency access is not enabled for this hospital');
  const patient = await PatientModel.findOne({ _id: input.patientId, hospitalId });
  if (!patient) throw errors.notFound('Patient');
  const grant = await BreakGlassGrantModel.create({
    hospitalId,
    userId: p.userId,
    patientId: patient._id,
    reason: input.reason,
    expiresAt: new Date(Date.now() + input.durationMinutes * 60_000),
  });
  await audit({
    action: 'BREAK_GLASS_GRANTED',
    resourceType: 'BreakGlassGrant',
    resourceId: String(grant._id),
    patientId: String(patient._id),
    justification: input.reason,
    breakGlass: true,
    metadata: { durationMinutes: input.durationMinutes },
  });
  return grant;
}

/* --------------------------- Platform operations --------------------------- */

export async function platformListHospitals(query: { status?: string }) {
  const filter: Record<string, unknown> = {};
  if (query.status) filter.verificationStatus = query.status;
  return HospitalModel.find(filter).sort({ createdAt: -1 }).select('name slug type verificationStatus address createdAt email phone');
}

export async function platformSetVerification(actorId: string, hospitalId: string, status: 'VERIFIED' | 'REJECTED' | 'SUSPENDED', notes?: string) {
  const hospital = await HospitalModel.findById(hospitalId);
  if (!hospital) throw errors.notFound('Hospital');
  const from = hospital.verificationStatus;
  hospital.verificationStatus = status;
  hospital.verificationNotes = notes;
  if (status === 'VERIFIED') {
    hospital.verifiedAt = new Date();
    hospital.verifiedBy = new Types.ObjectId(actorId);
  }
  await hospital.save();
  await audit({ action: 'HOSPITAL_VERIFICATION_CHANGED', resourceType: 'Hospital', resourceId: hospitalId, hospitalId, metadata: { from, to: status } });
  return hospital;
}

export async function assertHospitalVerified(hospitalId: Types.ObjectId): Promise<void> {
  const h = await HospitalModel.findById(hospitalId).select('verificationStatus');
  if (h?.verificationStatus !== 'VERIFIED') {
    throw new AppError('HOSPITAL_NOT_VERIFIED', 'Patient onboarding is available once RecoverOS has verified your hospital');
  }
}
