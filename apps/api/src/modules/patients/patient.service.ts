import { Types } from 'mongoose';
import type { CreatePatientInput, UpdatePatientInput } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { escapeRegex, pageMeta } from '../../utils/http';
import { audit } from '../audit/audit.service';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, loadPatient, toObjectId } from '../access/access.service';
import { RecoveryAssignmentModel } from '../access/access.models';
import { RecoveryEpisodeModel } from '../recovery-episodes/episode.model';
import { createInvitation } from '../auth/invitation.service';
import { assertHospitalVerified } from '../hospitals/hospital.service';
import { PatientModel, type PatientDocument } from './patient.model';

/** Fields returned to staff lists — minimal by design. */
const LIST_FIELDS = 'firstName lastName hospitalPatientRef dateOfBirth sex status preferredLanguage phone userId consentStatus createdAt';

export async function createPatient(p: Principal, input: CreatePatientInput) {
  assertPermission(p, 'patients.create');
  const hospitalId = requireTenant(p);
  await assertHospitalVerified(hospitalId);
  if (await PatientModel.exists({ hospitalId, hospitalPatientRef: input.hospitalPatientRef })) {
    throw errors.conflict('A patient with this hospital number already exists');
  }
  const { invitePatient, ...data } = input;
  const patient = await PatientModel.create({ ...data, hospitalId, createdBy: p.userId });
  await audit({ action: 'PATIENT_REGISTERED', resourceType: 'Patient', resourceId: String(patient._id), patientId: String(patient._id) });

  let invitation: Record<string, unknown> | undefined;
  if (invitePatient) invitation = await invitePatientAccount(p, String(patient._id));
  return { patient, invitation };
}

export async function invitePatientAccount(p: Principal, patientId: string) {
  const patient = await loadPatient(p, patientId, 'patients.update');
  if (patient.userId) throw errors.conflict('This patient already has an active RecoverOS account');
  if (!patient.phone && !patient.email) throw errors.validation('Add a phone number or email before inviting the patient');
  const result = await createInvitation({
    type: 'PATIENT',
    hospitalId: requireTenant(p),
    email: patient.email ?? undefined,
    phone: patient.phone ?? undefined,
    firstName: patient.firstName,
    lastName: patient.lastName,
    patientId: patient._id,
    createdBy: p.userId,
    expiresInDays: 14,
  });
  await audit({ action: 'PATIENT_INVITED', resourceType: 'Patient', resourceId: patientId, patientId });
  return { invitationId: String(result.invitation._id), expiresAt: result.invitation.expiresAt, ...('devToken' in result ? { devToken: result.devToken } : {}) };
}

/** Patients visible to the principal (respecting department/assignment scope). */
async function visiblePatientFilter(p: Principal): Promise<Record<string, unknown>> {
  const hospitalId = requireTenant(p);
  if (p.kind === 'PATIENT') return { hospitalId, _id: { $in: p.patientIds.map(toObjectId) } };
  if (p.kind === 'CAREGIVER') return { hospitalId, _id: { $in: p.caregiverGrants.map((g) => toObjectId(g.patientId)) } };
  if (p.kind !== 'STAFF') throw errors.forbidden();
  if (p.accessScope === 'HOSPITAL') return { hospitalId };

  const assigned = await RecoveryAssignmentModel.distinct('episodeId', { hospitalId, userId: toObjectId(p.userId), active: true });
  const or: Record<string, unknown>[] = [{ _id: { $in: assigned } }, { responsibleDoctorId: toObjectId(p.userId) }];
  if (p.accessScope === 'DEPARTMENT' && p.departmentIds.length) or.push({ departmentId: { $in: p.departmentIds.map(toObjectId) } });
  const visible = await RecoveryEpisodeModel.distinct('patientId', { hospitalId, $or: or });

  if (p.accessScope === 'DEPARTMENT') {
    // Include newly registered patients without any episode yet (onboarding queue).
    const withEpisodes = await RecoveryEpisodeModel.distinct('patientId', { hospitalId });
    return { hospitalId, $or: [{ _id: { $in: visible } }, { _id: { $nin: withEpisodes } }] };
  }
  return { hospitalId, _id: { $in: visible } };
}

export async function listPatients(p: Principal, query: { q?: string; status?: string; page: number; limit: number }) {
  assertPermission(p, 'patients.read');
  const filter: Record<string, unknown> = await visiblePatientFilter(p);
  if (query.status) filter.status = query.status;
  if (query.q) filter.searchText = { $regex: escapeRegex(query.q.toLowerCase()) };
  const [items, total] = await Promise.all([
    PatientModel.find(filter).select(LIST_FIELDS).sort({ lastName: 1, firstName: 1 }).skip((query.page - 1) * query.limit).limit(query.limit),
    PatientModel.countDocuments(filter),
  ]);
  return { items, meta: pageMeta(query.page, query.limit, total) };
}

export async function getPatient(p: Principal, patientId: string) {
  const patient = await loadPatient(p, patientId, p.kind === 'STAFF' ? 'patients.read' : 'recovery.read');
  if (p.kind === 'STAFF') {
    await audit({ action: 'PATIENT_VIEWED', resourceType: 'Patient', resourceId: patientId, patientId });
  }
  const hospitalId = requireTenant(p);
  const episodes = await RecoveryEpisodeModel.find({ hospitalId, patientId: patient._id })
    .select('status departmentId admissionDate dischargeDate programmeName expectedReviewDate responsibleDoctorId createdAt')
    .sort({ createdAt: -1 });
  return { patient: serializePatient(patient, p), episodes };
}

/** Caregivers receive only the minimum identity information. */
function serializePatient(patient: PatientDocument, p: Principal) {
  const json = patient.toJSON() as Record<string, unknown>;
  if (p.kind === 'CAREGIVER') {
    return { id: json.id, firstName: json.firstName, lastName: json.lastName, preferredLanguage: json.preferredLanguage };
  }
  return json;
}

export async function updatePatient(p: Principal, patientId: string, input: UpdatePatientInput) {
  const patient = await loadPatient(p, patientId, 'patients.update');
  const changed = Object.keys(input);
  patient.set(input);
  await patient.save();
  await audit({ action: 'PATIENT_UPDATED', resourceType: 'Patient', resourceId: patientId, patientId, metadata: { fields: changed } });
  return patient;
}

export async function getCareTeam(p: Principal, patientId: string) {
  const patient = await loadPatient(p, patientId, 'patients.read');
  const hospitalId = requireTenant(p);
  return RecoveryAssignmentModel.find({ hospitalId, patientId: patient._id, active: true }).populate('userId', 'firstName lastName');
}

/** "My profile" endpoints for patients. */
export async function getMyPatientProfiles(p: Principal) {
  if (p.kind !== 'PATIENT') throw errors.forbidden();
  return PatientModel.find({ hospitalId: requireTenant(p), _id: { $in: p.patientIds.map((id) => new Types.ObjectId(id)) } });
}
