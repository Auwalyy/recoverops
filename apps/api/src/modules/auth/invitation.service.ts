import { Types, type ClientSession } from 'mongoose';
import type { AcceptInvitationInput, CaregiverScope, InvitationType, RoleCode } from '@recoveros/shared';
import { withTransaction } from '../../database/connection';
import { AppError, errors } from '../../utils/errors';
import { generateToken, hashPassword, sha256, verifyPassword } from '../../utils/crypto';
import { audit } from '../audit/audit.service';
import { UserModel, type UserDocument } from '../users/user.model';
import { UserRoleModel } from '../access/access.models';
import { PatientModel } from '../patients/patient.model';
import { CaregiverConsentModel, CaregiverModel } from '../caregivers/caregiver.models';
import { HospitalModel } from '../hospitals/hospital.models';
import { notify, devExpose } from '../notifications/notification.service';
import { InvitationModel } from './auth.models';

export interface CreateInvitationInput {
  type: InvitationType;
  hospitalId: Types.ObjectId | string;
  email?: string;
  phone?: string;
  firstName?: string;
  lastName?: string;
  roles?: RoleCode[];
  departmentIds?: string[];
  patientId?: Types.ObjectId | string;
  caregiverConsentId?: Types.ObjectId | string;
  scopes?: CaregiverScope[];
  createdBy?: string;
  expiresInDays?: number;
  vars?: Record<string, string>;
}

/** Create an invitation and deliver its one-time activation token out-of-band. */
export async function createInvitation(input: CreateInvitationInput, session?: ClientSession) {
  if (!input.email && !input.phone) throw errors.validation('Email or phone is required for an invitation');
  const token = generateToken(24);
  const [invitation] = await InvitationModel.create(
    [
      {
        type: input.type,
        hospitalId: input.hospitalId,
        email: input.email,
        phone: input.phone,
        firstName: input.firstName,
        lastName: input.lastName,
        roles: input.roles ?? [],
        departmentIds: input.departmentIds ?? [],
        patientId: input.patientId,
        caregiverConsentId: input.caregiverConsentId,
        scopes: input.scopes ?? [],
        tokenHash: sha256(token),
        expiresAt: new Date(Date.now() + (input.expiresInDays ?? 7) * 24 * 3600 * 1000),
        createdBy: input.createdBy,
      },
    ],
    session ? { session } : {},
  );

  const hospital = await HospitalModel.findById(input.hospitalId).select('name');
  const channels = [...(input.email ? (['EMAIL'] as const) : []), ...(input.phone ? (['SMS'] as const) : [])];
  await notify({
    hospitalId: input.hospitalId,
    template: input.type === 'CAREGIVER' ? 'CAREGIVER_INVITATION' : 'INVITATION',
    vars: { token, hospitalName: hospital?.name, ...(input.vars ?? {}) },
    channels: [...channels],
    destination: { email: input.email, phone: input.phone },
    idempotencyKey: `invitation:${String(invitation!._id)}`,
  });

  return { invitation: invitation!, ...devExpose({ devToken: token }) };
}

/** Peek at an invitation (for the activation screen) without consuming it. */
export async function describeInvitation(token: string) {
  const inv = await InvitationModel.findOne({ tokenHash: sha256(token) });
  if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
    throw new AppError('NOT_FOUND', 'This invitation is invalid or has expired');
  }
  const hospital = await HospitalModel.findById(inv.hospitalId).select('name');
  const existing = await findUserByContact(inv.email ?? undefined, inv.phone ?? undefined);
  return {
    type: inv.type,
    hospitalName: hospital?.name,
    firstName: inv.firstName,
    lastName: inv.lastName,
    email: inv.email,
    phone: inv.phone,
    hasExistingAccount: !!existing?.passwordHash,
  };
}

async function findUserByContact(email?: string, phone?: string): Promise<UserDocument | null> {
  const or = [...(email ? [{ email }] : []), ...(phone ? [{ phone }] : [])];
  if (!or.length) return null;
  return UserModel.findOne({ $or: or }).select('+passwordHash');
}

/**
 * Accept an invitation. If the invited contact already has an account, the caller
 * must prove ownership with that account's password; otherwise a new account is
 * created and activated. Then the relationship (staff membership, patient link or
 * caregiver consent) is activated atomically.
 */
export async function acceptInvitation(input: AcceptInvitationInput): Promise<UserDocument> {
  return withTransaction(async (session) => {
    const inv = await InvitationModel.findOne({ tokenHash: sha256(input.token) }).session(session);
    if (!inv || inv.acceptedAt || inv.revokedAt || inv.expiresAt < new Date()) {
      throw new AppError('NOT_FOUND', 'This invitation is invalid or has expired');
    }

    let user = await findUserByContact(inv.email ?? undefined, inv.phone ?? undefined);
    if (user?.passwordHash) {
      if (!(await verifyPassword(input.password, user.passwordHash))) {
        throw new AppError('INVALID_CREDENTIALS', 'An account already exists for this contact. Enter its current password to link the invitation.');
      }
      if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 'This account is suspended');
    } else {
      const firstName = input.firstName ?? inv.firstName;
      const lastName = input.lastName ?? inv.lastName;
      if (!firstName || !lastName) throw errors.validation('First and last name are required');
      if (!user) {
        user = new UserModel({ firstName, lastName, email: inv.email, phone: inv.phone });
      }
      user.firstName = firstName;
      user.lastName = lastName;
      user.passwordHash = await hashPassword(input.password);
      user.passwordChangedAt = new Date();
    }
    if (input.preferredLanguage) user.preferredLanguage = input.preferredLanguage;
    user.status = 'ACTIVE';
    // Possession of the token delivered to that address/number verifies it.
    if (inv.email && !user.emailVerifiedAt) user.emailVerifiedAt = new Date();
    if (inv.phone && !inv.email && !user.phoneVerifiedAt) user.phoneVerifiedAt = new Date();
    await user.save({ session });

    const hospitalId = inv.hospitalId;
    if (inv.type === 'STAFF') {
      await UserRoleModel.findOneAndUpdate(
        { hospitalId, userId: user._id },
        { $set: { roles: inv.roles, departmentIds: inv.departmentIds, status: 'ACTIVE', grantedBy: inv.createdBy } },
        { upsert: true, session, new: true },
      );
    } else if (inv.type === 'PATIENT') {
      const patient = await PatientModel.findOne({ _id: inv.patientId, hospitalId }).session(session);
      if (!patient) throw errors.notFound('Patient');
      if (patient.userId && !patient.userId.equals(user._id)) throw errors.conflict('This patient record is already linked to another account');
      patient.userId = user._id;
      await patient.save({ session });
    } else if (inv.type === 'CAREGIVER') {
      const consent = await CaregiverConsentModel.findOne({ _id: inv.caregiverConsentId, hospitalId }).session(session);
      if (!consent || consent.status !== 'INVITED') throw new AppError('NOT_FOUND', 'This caregiver invitation is no longer valid');
      let caregiver = await CaregiverModel.findOne({ userId: user._id }).session(session);
      if (!caregiver) {
        caregiver = await CaregiverModel.findById(consent.caregiverId).session(session);
        if (caregiver && !caregiver.userId) {
          caregiver.userId = user._id;
          await caregiver.save({ session });
        }
      }
      consent.caregiverUserId = user._id;
      if (caregiver) consent.caregiverId = caregiver._id;
      consent.status = 'ACTIVE';
      consent.acceptedAt = new Date();
      await consent.save({ session });
    }

    inv.acceptedAt = new Date();
    inv.acceptedByUserId = user._id;
    await inv.save({ session });

    await audit(
      {
        action: 'INVITATION_ACCEPTED',
        resourceType: 'Invitation',
        resourceId: String(inv._id),
        hospitalId: String(hospitalId),
        patientId: inv.patientId ? String(inv.patientId) : undefined,
        actor: { userId: String(user._id), kind: inv.type },
        metadata: { type: inv.type, roles: inv.roles },
      },
      session,
    );
    return user;
  });
}
