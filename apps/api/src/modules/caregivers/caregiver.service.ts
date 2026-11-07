import { Types } from 'mongoose';
import type { CaregiverScope, ConsentType } from '@recoveros/shared';
import { errors } from '../../utils/errors';
import { audit } from '../audit/audit.service';
import { AuditLogModel } from '../audit/audit.model';
import { requireTenant, type Principal } from '../access/principal';
import { assertPermission, loadPatient } from '../access/access.service';
import { createInvitation } from '../auth/invitation.service';
import { InvitationModel } from '../auth/auth.models';
import { PatientModel } from '../patients/patient.model';
import { CaregiverConsentModel, CaregiverModel, ConsentModel, type CaregiverConsentDocument } from './caregiver.models';

/** Resolve the patient a caregiver-management action targets and who is acting. */
async function resolveTargetPatient(p: Principal, patientId?: string) {
  if (p.kind === 'PATIENT') {
    const own = patientId ?? p.patientIds[0];
    if (!own || !p.patientIds.includes(own)) throw errors.notFound('Patient');
    const patient = await PatientModel.findOne({ _id: own, hospitalId: requireTenant(p) });
    if (!patient) throw errors.notFound('Patient');
    return { patient, via: 'PATIENT_APP' as const };
  }
  if (p.kind === 'STAFF') {
    if (!patientId) throw errors.validation('patientId is required');
    assertPermission(p, 'patients.update');
    return { patient: await loadPatient(p, patientId, 'patients.update'), via: 'STAFF_ON_BEHALF' as const };
  }
  throw errors.forbidden();
}

async function loadConsent(p: Principal, consentId: string): Promise<CaregiverConsentDocument> {
  const hospitalId = requireTenant(p);
  if (!Types.ObjectId.isValid(consentId)) throw errors.notFound('Caregiver access');
  const consent = await CaregiverConsentModel.findOne({ _id: consentId, hospitalId });
  if (!consent) throw errors.notFound('Caregiver access');
  if (p.kind === 'PATIENT' && !p.patientIds.includes(String(consent.patientId))) throw errors.notFound('Caregiver access');
  if (p.kind === 'CAREGIVER' && String(consent.caregiverUserId) !== p.userId) throw errors.notFound('Caregiver access');
  if (p.kind === 'STAFF') await loadPatient(p, consent.patientId as Types.ObjectId, 'patients.update');
  if (p.kind === 'PLATFORM') throw errors.forbidden();
  return consent;
}

export async function inviteCaregiver(
  p: Principal,
  input: { patientId?: string; name: string; relationship: string; email?: string; phone?: string; scopes: string[]; expiresInDays: number },
) {
  const { patient, via } = await resolveTargetPatient(p, input.patientId);
  const hospitalId = requireTenant(p);
  const caregiver = await CaregiverModel.create({ name: input.name, email: input.email, phone: input.phone });
  const consent = await CaregiverConsentModel.create({
    hospitalId,
    patientId: patient._id,
    caregiverId: caregiver._id,
    relationship: input.relationship,
    scopes: input.scopes,
    status: 'INVITED',
    grantedByUserId: p.userId,
    grantedVia: via,
    expiresAt: new Date(Date.now() + input.expiresInDays * 24 * 3600_000),
    scopeHistory: [{ scopes: input.scopes, changedAt: new Date(), changedBy: p.userId }],
  });
  const [first, ...rest] = input.name.trim().split(/\s+/);
  const inv = await createInvitation({
    type: 'CAREGIVER',
    hospitalId,
    email: input.email,
    phone: input.phone,
    firstName: first,
    lastName: rest.join(' ') || undefined,
    patientId: patient._id,
    caregiverConsentId: consent._id,
    scopes: input.scopes as CaregiverScope[],
    createdBy: p.userId,
    expiresInDays: 14,
    vars: { patientFirstName: patient.firstName },
  });
  await audit({ action: 'CAREGIVER_INVITED', resourceType: 'CaregiverConsent', resourceId: String(consent._id), patientId: String(patient._id), metadata: { scopes: input.scopes, via } });
  return { consent, ...('devToken' in inv ? { devToken: inv.devToken } : {}) };
}

export async function listCaregivers(p: Principal, patientId?: string) {
  const { patient } = await resolveTargetPatient(p, patientId);
  const consents = await CaregiverConsentModel.find({ hospitalId: requireTenant(p), patientId: patient._id }).populate('caregiverId', 'name email phone').sort({ createdAt: -1 });
  // Lazily mark expired grants (principal resolution already ignores them).
  const now = new Date();
  for (const c of consents) {
    if ((c.status === 'ACTIVE' || c.status === 'INVITED') && c.expiresAt < now) {
      c.status = 'EXPIRED';
      await c.save();
    }
  }
  return consents;
}

/** Only the patient (or staff recording on their behalf) can change scopes. */
export async function updateScopes(p: Principal, consentId: string, scopes: string[]) {
  if (p.kind === 'CAREGIVER') throw errors.forbidden('Caregivers cannot change their own access');
  const consent = await loadConsent(p, consentId);
  if (!['ACTIVE', 'INVITED'].includes(consent.status)) throw errors.validation('This access is no longer active');
  const before = [...consent.scopes];
  consent.scopes = scopes as CaregiverScope[];
  consent.scopeHistory.push({ scopes, changedAt: new Date(), changedBy: new Types.ObjectId(p.userId) });
  await consent.save();
  await InvitationModel.updateMany({ hospitalId: consent.hospitalId, caregiverConsentId: consent._id, acceptedAt: { $exists: false } }, { $set: { scopes } });
  await audit({ action: 'CAREGIVER_SCOPES_CHANGED', resourceType: 'CaregiverConsent', resourceId: consentId, patientId: String(consent.patientId), metadata: { before, after: scopes } });
  return consent;
}

/** Revocation takes effect on the caregiver's very next request (principal re-resolved). */
export async function revokeCaregiver(p: Principal, consentId: string, reason?: string) {
  const consent = await loadConsent(p, consentId);
  if (consent.status === 'REVOKED') return consent;
  consent.status = 'REVOKED';
  consent.revokedAt = new Date();
  consent.revokedBy = new Types.ObjectId(p.userId);
  consent.revokedReason = reason;
  await consent.save();
  await InvitationModel.updateMany({ hospitalId: consent.hospitalId, caregiverConsentId: consent._id, acceptedAt: { $exists: false } }, { $set: { revokedAt: new Date() } });
  await audit({ action: 'CAREGIVER_ACCESS_REVOKED', resourceType: 'CaregiverConsent', resourceId: consentId, patientId: String(consent.patientId), metadata: { by: p.kind } });
  return consent;
}

/** Caregiver access history for the patient. */
export async function caregiverAccessHistory(p: Principal, consentId: string) {
  const consent = await loadConsent(p, consentId);
  if (!consent.caregiverUserId) return [];
  return AuditLogModel.find({ hospitalId: consent.hospitalId, patientId: consent.patientId, actorId: consent.caregiverUserId })
    .select('action resourceType createdAt')
    .sort({ createdAt: -1 })
    .limit(200);
}

/** For the caregiver app: patients I support and what I can see. */
export async function myCaregiverGrants(p: Principal) {
  if (p.kind !== 'CAREGIVER') throw errors.forbidden();
  const hospitalId = requireTenant(p);
  const patients = await PatientModel.find({ hospitalId, _id: { $in: p.caregiverGrants.map((g) => g.patientId) } }).select('firstName lastName preferredLanguage');
  return p.caregiverGrants.map((g) => ({
    consentId: g.consentId,
    scopes: g.scopes,
    permissions: [...g.permissions],
    patient: patients.find((x) => String(x._id) === g.patientId),
  }));
}

/* ------------------------- Patient processing consents ------------------------- */

export async function listConsents(p: Principal, patientId?: string) {
  const { patient } = p.kind === 'PATIENT' || p.kind === 'STAFF' ? await resolveTargetPatient(p, patientId) : { patient: null };
  if (!patient) throw errors.forbidden();
  return ConsentModel.find({ hospitalId: requireTenant(p), patientId: patient._id }).sort({ createdAt: -1 });
}

export async function grantConsent(p: Principal, input: { patientId?: string; type: ConsentType; version: string; method: string }) {
  const { patient } = await resolveTargetPatient(p, input.patientId);
  if (p.kind === 'PATIENT' && input.method !== 'IN_APP') throw errors.validation('Patients record consent in-app');
  const hospitalId = requireTenant(p);
  await ConsentModel.updateMany({ hospitalId, patientId: patient._id, type: input.type, status: 'GRANTED' }, { $set: { status: 'REVOKED', revokedAt: new Date(), revokedReason: 'Superseded by new consent' } });
  const consent = await ConsentModel.create({ hospitalId, patientId: patient._id, type: input.type, version: input.version, status: 'GRANTED', method: input.method, recordedBy: p.userId, grantedAt: new Date() });
  await refreshConsentStatus(hospitalId, patient._id);
  await audit({ action: 'CONSENT_GRANTED', resourceType: 'Consent', resourceId: String(consent._id), patientId: String(patient._id), metadata: { type: input.type, version: input.version, method: input.method } });
  return consent;
}

export async function revokeConsent(p: Principal, consentId: string, reason?: string) {
  const hospitalId = requireTenant(p);
  const consent = await ConsentModel.findOne({ _id: consentId, hospitalId });
  if (!consent) throw errors.notFound('Consent');
  await resolveTargetPatient(p, String(consent.patientId));
  if (consent.status === 'REVOKED') return consent;
  consent.status = 'REVOKED';
  consent.revokedAt = new Date();
  consent.revokedReason = reason;
  await consent.save();
  await refreshConsentStatus(hospitalId, consent.patientId as Types.ObjectId);
  await audit({ action: 'CONSENT_REVOKED', resourceType: 'Consent', resourceId: consentId, patientId: String(consent.patientId), metadata: { type: consent.type } });
  return consent;
}

async function refreshConsentStatus(hospitalId: Types.ObjectId, patientId: Types.ObjectId) {
  const granted = await ConsentModel.distinct('type', { hospitalId, patientId, status: 'GRANTED' });
  const status = granted.includes('RECOVERY_PROGRAMME_PARTICIPATION') && granted.includes('DATA_PROCESSING') ? 'GRANTED' : granted.length ? 'PARTIAL' : 'REVOKED';
  await PatientModel.updateOne({ _id: patientId, hospitalId }, { $set: { consentStatus: status } });
}

/** Whether a patient currently consents to a processing activity (e.g. AI features). */
export async function hasConsent(hospitalId: Types.ObjectId, patientId: Types.ObjectId, type: ConsentType): Promise<boolean> {
  return !!(await ConsentModel.exists({ hospitalId, patientId, type, status: 'GRANTED' }));
}
