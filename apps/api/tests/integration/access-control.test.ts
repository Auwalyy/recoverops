import { beforeAll, describe, expect, it } from 'vitest';
import { Types } from 'mongoose';
import { as, createHospital, createPatientRecord, createUser } from '../helpers';
import { PatientModel } from '../../src/modules/patients/patient.model';
import { RecoveryEpisodeModel } from '../../src/modules/recovery-episodes/episode.model';
import { RecoveryAssignmentModel } from '../../src/modules/access/access.models';
import { CaregiverConsentModel, CaregiverModel } from '../../src/modules/caregivers/caregiver.models';
import { AuditLogModel } from '../../src/modules/audit/audit.model';

/**
 * Tenant isolation + RBAC + record-level access. Hospital A and Hospital B share one
 * platform; nothing in A may be reachable from B.
 */
describe('multi-tenant isolation and access control', () => {
  let A: Awaited<ReturnType<typeof createHospital>>;
  let B: Awaited<ReturnType<typeof createHospital>>;
  let doctorA: string, doctorB: string, adminB: string, physioA: string, physioAssigned: string, nurseOrtho: string, platformAdmin: string;
  let patientAId: string, episodeAId: string, patientUserEmail: string, otherPatientEmail: string;
  let caregiverEmail: string;

  beforeAll(async () => {
    A = await createHospital('Hospital A', { breakGlass: true });
    B = await createHospital('Hospital B');
    doctorA = (await createUser({ firstName: 'DocA', hospitalId: A.hospitalId, roles: ['DOCTOR'], departmentIds: [A.surgery._id] })).email;
    const docAUser = await createUser({ firstName: 'DocA2', hospitalId: A.hospitalId, roles: ['DOCTOR'], departmentIds: [A.surgery._id] });
    doctorB = (await createUser({ firstName: 'DocB', hospitalId: B.hospitalId, roles: ['DOCTOR'], departmentIds: [B.surgery._id] })).email;
    adminB = (await createUser({ firstName: 'AdminB', hospitalId: B.hospitalId, roles: ['HOSPITAL_ADMIN'] })).email;
    physioA = (await createUser({ firstName: 'PhysioA', hospitalId: A.hospitalId, roles: ['PHYSIOTHERAPIST'] })).email;
    const physio2 = await createUser({ firstName: 'PhysioB', hospitalId: A.hospitalId, roles: ['PHYSIOTHERAPIST'] });
    physioAssigned = physio2.email;
    nurseOrtho = (await createUser({ firstName: 'NurseOrtho', hospitalId: A.hospitalId, roles: ['RECOVERY_NURSE'], departmentIds: [A.ortho._id] })).email;
    platformAdmin = (await createUser({ firstName: 'Platform', platformRoles: ['PLATFORM_SUPER_ADMIN'] })).email;

    const pu = await createUser({ firstName: 'PatientUser' });
    patientUserEmail = pu.email;
    const patient = await createPatientRecord(A.hospitalId, { userId: pu.userId });
    patientAId = String(patient._id);
    const op = await createUser({ firstName: 'OtherPatient' });
    otherPatientEmail = op.email;
    await createPatientRecord(A.hospitalId, { userId: op.userId, firstName: 'Other' });

    const episode = await RecoveryEpisodeModel.create({
      hospitalId: A.hospitalId,
      patientId: patient._id,
      departmentId: A.surgery._id,
      admissionDate: '2026-01-10',
      responsibleDoctorId: docAUser.userId,
      status: 'ACTIVE',
    });
    episodeAId = String(episode._id);
    await RecoveryAssignmentModel.create({ hospitalId: A.hospitalId, episodeId: episode._id, patientId: patient._id, userId: physio2.userId, role: 'PHYSIOTHERAPIST' });

    const cg = await createUser({ firstName: 'Caregiver' });
    caregiverEmail = cg.email;
    const profile = await CaregiverModel.create({ userId: cg.userId, name: 'Care Giver' });
    await CaregiverConsentModel.create({
      hospitalId: A.hospitalId,
      patientId: patient._id,
      caregiverId: profile._id,
      caregiverUserId: cg.userId,
      relationship: 'Daughter',
      scopes: ['VIEW_APPOINTMENTS'],
      status: 'ACTIVE',
      grantedVia: 'PATIENT_APP',
      expiresAt: new Date(Date.now() + 86400_000),
    });
  });

  it('a doctor in Hospital B cannot read, list or modify Hospital A patients', async () => {
    const b = await as(doctorB);
    expect((await b.get(`/api/v1/patients/${patientAId}`)).status).toBe(404);
    expect((await b.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(404);
    expect((await b.patch(`/api/v1/patients/${patientAId}`, { firstName: 'Hacked' })).status).toBe(404);
    const list = await b.get('/api/v1/patients');
    expect(list.body.data.find((p: { id: string }) => p.id === patientAId)).toBeUndefined();
    const admin = await as(adminB);
    expect((await admin.get(`/api/v1/patients/${patientAId}`)).status).toBe(404);
    expect((await PatientModel.findOne({ _id: patientAId, hospitalId: A.hospitalId }))!.firstName).toBe('Amina');
  });

  it('cannot switch into another hospital by forging X-Hospital-Id', async () => {
    const b = await as(doctorB, { 'X-Hospital-Id': A.hospitalId });
    const res = await b.get('/api/v1/patients');
    expect(res.status).toBe(403);
    expect(res.body.error.code).toBe('TENANT_ACCESS_DENIED');
  });

  it('client-supplied hospitalId in a body is ignored (tenant comes from identity)', async () => {
    const b = await as(doctorB);
    const res = await b.post('/api/v1/patients', { hospitalId: A.hospitalId, hospitalPatientRef: 'X-1', firstName: 'X', lastName: 'Y', dateOfBirth: '1990-01-01', sex: 'MALE' });
    expect(res.status).toBe(201);
    const created = await PatientModel.findOne({ _id: res.body.data.patient.id, hospitalId: B.hospitalId });
    expect(created).not.toBeNull();
  });

  it('the ODM tenant guard refuses queries without a hospitalId filter', async () => {
    await expect(PatientModel.find({ _id: new Types.ObjectId(patientAId) })).rejects.toThrow(/Tenant guard/);
  });

  it('department scope: a nurse from another department cannot open the episode', async () => {
    const n = await as(nurseOrtho);
    expect((await n.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(403);
    const da = await as(doctorA);
    expect((await da.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(200);
  });

  it('physiotherapists: only assigned episodes, and never medication or check-in data', async () => {
    expect((await (await as(physioA)).get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(403);
    const assigned = await as(physioAssigned);
    expect((await assigned.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(200);
    expect((await assigned.get(`/api/v1/recovery-episodes/${episodeAId}/medications`)).status).toBe(403);
    expect((await assigned.get(`/api/v1/recovery-episodes/${episodeAId}/check-ins`)).status).toBe(403);
  });

  it('patients only see their own records', async () => {
    const own = await as(patientUserEmail);
    expect((await own.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(200);
    const other = await as(otherPatientEmail);
    expect((await other.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(404);
    expect((await other.get(`/api/v1/patients/${patientAId}`)).status).toBe(404);
    expect((await own.get('/api/v1/patients')).status).toBe(403);
  });

  it('caregivers cannot exceed consented scopes, and revocation is immediate', async () => {
    const cg = await as(caregiverEmail);
    expect((await cg.get(`/api/v1/appointments?episodeId=${episodeAId}`)).status).toBe(200);
    const meds = await cg.get(`/api/v1/recovery-episodes/${episodeAId}/medications`);
    expect(meds.status).toBe(403);
    const plan = await cg.get(`/api/v1/recovery-episodes/${episodeAId}`);
    expect([403]).toContain(plan.status);
    expect((await cg.post('/api/v1/check-ins', { episodeId: episodeAId, templateId: episodeAId, answers: {}, idempotencyKey: 'abcdefgh1' })).status).toBe(403);

    // Patient revokes → caregiver loses access on the next request.
    const patient = await as(patientUserEmail);
    const list = await patient.get('/api/v1/caregivers');
    const consentId = list.body.data.caregivers[0].id;
    expect((await patient.post(`/api/v1/caregivers/${consentId}/revoke`, { reason: 'No longer needed' })).status).toBe(200);
    expect((await cg.get(`/api/v1/appointments?episodeId=${episodeAId}`)).status).toBe(403);
  });

  it('platform administrators have no routine access to clinical records', async () => {
    const p = await as(platformAdmin);
    expect((await p.get(`/api/v1/patients/${patientAId}`)).status).toBe(403);
    expect((await p.get('/api/v1/platform/hospitals')).status).toBe(200);
  });

  it('break-glass grants time-boxed, justified, audited access within the same hospital only', async () => {
    const n = await as(nurseOrtho);
    const res = await n.post('/api/v1/hospitals/break-glass', { patientId: patientAId, reason: 'Patient phoned ward in distress; care team unreachable', durationMinutes: 15 });
    expect(res.status).toBe(201);
    expect((await n.get(`/api/v1/recovery-episodes/${episodeAId}`)).status).toBe(200);
    expect(await AuditLogModel.exists({ action: 'BREAK_GLASS_ACCESS', breakGlass: true })).not.toBeNull();
    // Physiotherapists (canBreakGlass=false) cannot use it.
    expect((await (await as(physioA)).post('/api/v1/hospitals/break-glass', { patientId: patientAId, reason: 'Trying to see the medication list', durationMinutes: 15 })).status).toBe(403);
  });

  it('audit logs are append-only', async () => {
    await expect(AuditLogModel.updateOne({}, { $set: { action: 'X' } })).rejects.toThrow(/append-only/);
    await expect(AuditLogModel.deleteMany({})).rejects.toThrow(/append-only/);
  });
});
