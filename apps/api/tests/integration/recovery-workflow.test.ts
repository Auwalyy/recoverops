import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { app, as, createHospital, createUser, PASSWORD, dischargeContent } from '../helpers';
import { HospitalModel } from '../../src/modules/hospitals/hospital.models';
import { RecoveryTaskModel } from '../../src/modules/recovery-plans/recovery-plan.models';
import { MedicationOrderModel } from '../../src/modules/medications/medication.models';
import { DischargePlanVersionModel } from '../../src/modules/discharge/discharge.models';
import { AlertModel } from '../../src/modules/alerts/alert.models';
import { AuditLogModel } from '../../src/modules/audit/audit.model';
import { escalationSweep } from '../../src/modules/alerts/alert-engine';
import { materializeTasks } from '../../src/modules/recovery-plans/recovery-plan.service';
import { RecoveryPlanModel } from '../../src/modules/recovery-plans/recovery-plan.models';

/**
 * End-to-end recovery journey (spec §15 scenarios 1–12) through the real HTTP API.
 */
describe('end-to-end recovery workflow', () => {
  it('runs the full patient-to-hospital recovery journey', async () => {
    /* 1. Hospital administrator registers a hospital and creates staff accounts */
    const reg = await request(app)
      .post('/api/v1/hospitals/register')
      .send({
        hospital: {
          name: 'Kano Specialist Hospital (Synthetic)',
          registrationNumber: 'SYN-001',
          type: 'SPECIALIST',
          email: 'info@kano-synthetic.test',
          phone: '+2348030000000',
          address: { line1: '1 Test Road', city: 'Kano', state: 'Kano' },
        },
        admin: { firstName: 'Hadiza', lastName: 'Admin', email: 'admin@kano-synthetic.test', password: PASSWORD },
      });
    expect(reg.status).toBe(201);
    const hospitalId = reg.body.data.hospital.id;
    const admin = await as('admin@kano-synthetic.test');

    // Patient onboarding is blocked until the platform verifies the hospital.
    const blocked = await admin.post('/api/v1/patients', { hospitalPatientRef: 'P1', firstName: 'A', lastName: 'B', dateOfBirth: '1970-01-01', sex: 'MALE' });
    expect(blocked.body.error.code).toBe('HOSPITAL_NOT_VERIFIED');
    const platform = await createUser({ firstName: 'Platform', platformRoles: ['PLATFORM_SUPER_ADMIN'] });
    const op = await as(platform.email);
    expect((await op.post(`/api/v1/platform/hospitals/${hospitalId}/verification`, { status: 'VERIFIED' })).status).toBe(200);

    const dept = await admin.post('/api/v1/hospitals/departments', { name: 'General Surgery', code: 'SURG' });
    expect(dept.status).toBe(201);
    const deptId = dept.body.data.department.id;

    const invite = async (email: string, firstName: string, roles: string[]) => {
      const r = await admin.post('/api/v1/hospitals/staff/invitations', { email, firstName, lastName: 'Staff', roles, departmentIds: [deptId] });
      expect(r.status).toBe(201);
      const accepted = await request(app).post('/api/v1/auth/invitations/accept').send({ token: r.body.data.devToken, password: PASSWORD });
      expect(accepted.status).toBe(201);
      return accepted.body.data.user.id as string;
    };
    const doctorId = await invite('dr.musa@kano-synthetic.test', 'Musa', ['DOCTOR']);
    const director = await invite('dr.director@kano-synthetic.test', 'Director', ['MEDICAL_DIRECTOR']);
    await invite('nurse.aisha@kano-synthetic.test', 'Aisha', ['RECOVERY_NURSE']);
    await invite('nurse.discharge@kano-synthetic.test', 'Grace', ['DISCHARGE_NURSE']);
    expect(director).toBeTruthy();

    const doctor = await as('dr.musa@kano-synthetic.test');
    const directorClient = await as('dr.director@kano-synthetic.test');
    const nurse = await as('nurse.aisha@kano-synthetic.test');
    const dischargeNurse = await as('nurse.discharge@kano-synthetic.test');

    // Hospital configures (and clinically approves) a check-in template and an alert rule.
    const tpl = await admin.post('/api/v1/check-in-templates', {
      name: 'Post-op daily check-in',
      kind: 'GENERAL',
      questions: [
        { key: 'pain_score', type: 'SCALE', label: 'Pain today (0-10)', min: 0, max: 10, required: true },
        { key: 'wound_fluid', type: 'BOOLEAN', label: 'Is fluid coming from the wound?', required: true },
      ],
    });
    expect(tpl.status).toBe(201);
    const templateId = tpl.body.data.template.id;
    expect((await doctor.post(`/api/v1/check-in-templates/${templateId}/approve`)).status).toBe(200);

    const rule = await admin.post('/api/v1/alerts/rules', {
      name: 'TEST RULE — wound fluid with high pain',
      description: 'Synthetic rule for automated testing only.',
      source: 'CHECK_IN',
      conditions: { all: [{ field: 'answers.wound_fluid', op: 'eq', value: true }, { field: 'answers.pain_score', op: 'gte', value: 7 }] },
      priority: 'HIGH',
      title: 'Wound concern reported',
      patientSafetyMessage: 'Your care team has been notified and will contact you.',
      showEmergencyGuidance: true,
      routing: { careTeamRoles: ['RECOVERY_NURSE', 'RESPONSIBLE_DOCTOR'], acknowledgeWithinMinutes: 30, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 2 },
    });
    expect(rule.status).toBe(201);
    const ruleId = rule.body.data.rule.id;
    // A rule cannot fire until approved, and the author cannot approve it.
    expect((await admin.post(`/api/v1/alerts/rules/${ruleId}/submit`)).status).toBe(200);
    expect((await admin.post(`/api/v1/alerts/rules/${ruleId}/approve`, {})).status).toBe(403);
    expect((await directorClient.post(`/api/v1/alerts/rules/${ruleId}/approve`, { comment: 'Approved for test' })).status).toBe(200);

    /* 3. Nurse onboards a patient (with app invitation) */
    const pat = await dischargeNurse.post('/api/v1/patients', {
      hospitalPatientRef: 'KSH-0001',
      firstName: 'Ibrahim',
      lastName: 'Sani',
      dateOfBirth: '1968-04-12',
      sex: 'MALE',
      phone: '+2348091112222',
      preferredLanguage: 'ha',
      invitePatient: true,
    });
    expect(pat.status).toBe(201);
    const patientId = pat.body.data.patient.id;
    const activation = await request(app).post('/api/v1/auth/invitations/accept').send({ token: pat.body.data.invitation.devToken, password: 'PatientPass2026' });
    expect(activation.status).toBe(201);
    const patientClient = await (async () => {
      const res = await request(app).post('/api/v1/auth/login').send({ identifier: '+2348091112222', password: 'PatientPass2026' });
      expect(res.status).toBe(200);
      const t = res.body.data.tokens.accessToken;
      return {
        get: (u: string) => request(app).get(u).set('Authorization', `Bearer ${t}`),
        post: (u: string, b?: object) => request(app).post(u).set('Authorization', `Bearer ${t}`).send(b ?? {}),
        patch: (u: string, b?: object) => request(app).patch(u).set('Authorization', `Bearer ${t}`).send(b ?? {}),
      };
    })();

    const ep = await dischargeNurse.post('/api/v1/recovery-episodes', {
      patientId,
      departmentId: deptId,
      admissionDate: '2026-11-01',
      procedureReference: 'Synthetic laparotomy',
      responsibleDoctorId: doctorId,
    });
    expect(ep.status).toBe(201);
    const episodeId = ep.body.data.episode.id;
    // Nurse joins care team as recovery nurse.
    const nurseId = (await nurse.get('/api/v1/auth/me')).body.data.user.id;
    expect((await doctor.post(`/api/v1/recovery-episodes/${episodeId}/care-team`, { userId: nurseId, role: 'RECOVERY_NURSE' })).status).toBe(201);

    /* 2. Doctor creates and approves a discharge plan */
    const plan = await doctor.post('/api/v1/discharge-plans', { episodeId, content: dischargeContent({ templateId }) });
    expect(plan.status).toBe(201);
    const planId = plan.body.data.plan.id;

    // Patients can never modify clinical instructions.
    expect((await patientClient.patch(`/api/v1/discharge-plans/${planId}`, { content: dischargeContent() })).status).toBe(403);
    // Nurses cannot approve.
    expect((await dischargeNurse.post(`/api/v1/discharge-plans/${planId}/approve`, { decision: 'APPROVED' })).status).toBe(403);
    expect((await doctor.post(`/api/v1/discharge-plans/${planId}/submit`, {})).status).toBe(200);
    const approved = await doctor.post(`/api/v1/discharge-plans/${planId}/approve`, { decision: 'APPROVED', comment: 'Fit for discharge' });
    expect(approved.status).toBe(200);
    expect(approved.body.data.activated).toBe(true);

    /* 4. Recovery episode becomes active, tasks + medication orders generated */
    const detail = await doctor.get(`/api/v1/recovery-episodes/${episodeId}`);
    expect(detail.body.data.episode.status).toBe('ACTIVE');
    const orders = await MedicationOrderModel.find({ hospitalId, episodeId });
    expect(orders).toHaveLength(2); // incl. PRN order (no reminders)
    const medTasks = await RecoveryTaskModel.countDocuments({ hospitalId, episodeId, type: 'MEDICATION' });
    expect(medTasks).toBeGreaterThan(0);
    expect(await RecoveryTaskModel.countDocuments({ hospitalId, episodeId, type: 'MEDICATION', medicationOrderId: orders.find((o) => o.isPrn)!._id })).toBe(0);

    // Approved content is immutable.
    expect((await doctor.patch(`/api/v1/discharge-plans/${planId}`, { content: dischargeContent() })).body.error.code).toBe('IMMUTABLE_RECORD');
    const version = await DischargePlanVersionModel.findOne({ hospitalId, planId, status: 'APPROVED' });
    version!.content = { tampered: true };
    await expect(version!.save()).rejects.toThrow(/IMMUTABLE/);

    // Re-running materialisation never duplicates tasks.
    const before = await RecoveryTaskModel.countDocuments({ hospitalId, episodeId });
    const rp = await RecoveryPlanModel.findOne({ hospitalId, episodeId, status: 'ACTIVE' });
    rp!.generatedUntil = undefined;
    await materializeTasks(rp!, new Date(Date.now() + 7 * 86400_000));
    expect(await RecoveryTaskModel.countDocuments({ hospitalId, episodeId })).toBe(before);

    /* 5. Patient views their recovery plan */
    const patientPlan = await patientClient.get(`/api/v1/recovery-episodes/${episodeId}/discharge-plan`);
    expect(patientPlan.status).toBe(200);
    expect(patientPlan.body.data.approvedVersion.content.medications[0].name).toBe('Paracetamol');
    expect(patientPlan.body.data.versions).toBeUndefined(); // no drafts/history for patients
    expect((await patientClient.get(`/api/v1/recovery-episodes/${episodeId}/medications`)).body.data.medications.length).toBe(2);

    // Patient reports a medication dose (patient-reported, idempotent).
    const medTask = await RecoveryTaskModel.findOne({ hospitalId, episodeId, type: 'MEDICATION' }).sort({ dueAt: 1 });
    const evt = { medicationOrderId: String(medTask!.medicationOrderId), taskId: String(medTask!._id), status: 'REPORTED_TAKEN', idempotencyKey: 'med-evt-0001' };
    expect((await patientClient.post('/api/v1/medication-events', evt)).status).toBe(201);
    expect((await patientClient.post('/api/v1/medication-events', evt)).status).toBe(200);

    /* 6–7. Patient submits a concerning check-in → alert + immediate safety message */
    const checkIn = await patientClient.post('/api/v1/check-ins', {
      episodeId,
      templateId,
      answers: { pain_score: 8, wound_fluid: true },
      idempotencyKey: 'checkin-0001',
    });
    expect(checkIn.status).toBe(201);
    expect(checkIn.body.data.safetyMessages[0].showEmergencyGuidance).toBe(true);
    expect(checkIn.body.data.safetyMessages[0].emergencyInstructions).toMatch(/emergency/i);
    // Idempotent resubmission (offline retry) creates nothing new.
    const dup = await patientClient.post('/api/v1/check-ins', { episodeId, templateId, answers: { pain_score: 8, wound_fluid: true }, idempotencyKey: 'checkin-0001' });
    expect(dup.body.data.duplicate).toBe(true);
    expect(await AlertModel.countDocuments({ hospitalId, episodeId })).toBe(1);
    // Invalid answers rejected.
    expect((await patientClient.post('/api/v1/check-ins', { episodeId, templateId, answers: { pain_score: 42, wound_fluid: true }, idempotencyKey: 'checkin-0002' })).status).toBe(400);

    const episodeAfter = await doctor.get(`/api/v1/recovery-episodes/${episodeId}`);
    expect(episodeAfter.body.data.episode.status).toBe('NEEDS_ATTENTION');

    /* 8. Recovery nurse acknowledges the alert */
    const queue = await nurse.get('/api/v1/alerts?open=true&assignedToMe=true');
    expect(queue.body.data).toHaveLength(1);
    const alertId = queue.body.data[0].id;
    expect(queue.body.data[0].priority).toBe('HIGH');
    // Resolving before acknowledging is not allowed.
    expect((await doctor.post(`/api/v1/alerts/${alertId}/resolve`, { outcome: 'ADVICE_GIVEN', notes: 'x' })).status).toBe(400);
    expect((await nurse.post(`/api/v1/alerts/${alertId}/acknowledge`)).status).toBe(200);
    expect((await nurse.post(`/api/v1/alerts/${alertId}/actions`, { type: 'PATIENT_CONTACT_ATTEMPT', notes: 'Called patient, no answer', contactOutcome: 'NO_ANSWER' })).status).toBe(201);
    expect((await nurse.post(`/api/v1/alerts/${alertId}/actions`, { type: 'PATIENT_CONTACTED', notes: 'Spoke to patient; wound review needed', contactOutcome: 'REACHED', setStatus: 'ACTION_REQUIRED' })).status).toBe(201);

    /* 9–10. Doctor reviews the concern and the action is recorded */
    expect((await doctor.post(`/api/v1/alerts/${alertId}/actions`, { type: 'CLINICAL_REVIEW', notes: 'Reviewed check-in; arrange wound clinic tomorrow' })).status).toBe(201);
    const appt = await doctor.post('/api/v1/appointments', { episodeId, clinicianId: doctorId, type: 'WOUND_CHECK', scheduledAt: new Date(Date.now() + 86400_000).toISOString(), location: 'Surgical OPD' });
    expect(appt.status).toBe(201);
    const resolved = await doctor.post(`/api/v1/alerts/${alertId}/resolve`, { outcome: 'APPOINTMENT_ARRANGED', notes: 'Wound clinic booked for tomorrow.' });
    expect(resolved.status).toBe(200);
    const alertDetail = await doctor.get(`/api/v1/alerts/${alertId}`);
    expect(alertDetail.body.data.actions.length).toBeGreaterThanOrEqual(5);
    expect((await doctor.get(`/api/v1/recovery-episodes/${episodeId}`)).body.data.episode.status).toBe('ACTIVE');

    /* 11. Patient confirms and attends the follow-up appointment */
    const apptId = appt.body.data.appointment.id;
    expect((await patientClient.post(`/api/v1/appointments/${apptId}/respond`, { action: 'CONFIRM' })).status).toBe(200);
    const attended = await doctor.patch(`/api/v1/appointments/${apptId}`, { status: 'ATTENDED', followUpNote: 'Wound healing; no infection signs.' });
    expect(attended.status).toBe(200);
    expect(attended.body.data.appointment.status).toBe('ATTENDED');

    /* 12. Authorised clinician completes the programme (nurse cannot) */
    expect((await nurse.post(`/api/v1/recovery-episodes/${episodeId}/transitions`, { toStatus: 'COMPLETED', reason: 'Recovered' })).status).toBe(403);
    const done = await doctor.post(`/api/v1/recovery-episodes/${episodeId}/transitions`, { toStatus: 'COMPLETED', reason: 'Recovery goals met at follow-up review.' });
    expect(done.status).toBe(200);
    expect(done.body.data.episode.status).toBe('COMPLETED');
    expect(await RecoveryTaskModel.countDocuments({ hospitalId, episodeId, status: 'PENDING' })).toBe(0);
    // Completed is terminal.
    expect((await doctor.post(`/api/v1/recovery-episodes/${episodeId}/transitions`, { toStatus: 'ACTIVE', reason: 'reopen' })).body.error.code).toBe('INVALID_STATE_TRANSITION');

    // Key actions are auditable.
    for (const action of ['HOSPITAL_REGISTERED', 'PATIENT_REGISTERED', 'DISCHARGE_PLAN_APPROVED', 'CHECKIN_SUBMITTED', 'ALERT_GENERATED', 'ALERT_ACKNOWLEDGED', 'ALERT_RESOLVED', 'EPISODE_STATUS_CHANGED']) {
      expect(await AuditLogModel.exists({ hospitalId, action }), action).not.toBeNull();
    }

    // Analytics reflect activity, separated from outcomes.
    const dash = await admin.get('/api/v1/analytics/dashboard');
    expect(dash.status).toBe(200);
    expect(dash.body.data.outcomes.programmesCompleted).toBe(1);
    expect(dash.body.data.activity.alerts.total).toBe(1);
    expect(await HospitalModel.exists({ _id: hospitalId })).not.toBeNull();
  });

  it('escalates unacknowledged alerts to the supervisor role and stops after acknowledgement', async () => {
    const { hospitalId, surgery } = await createHospital('Escalation Hospital');
    const doc = await createUser({ firstName: 'Doc', hospitalId, roles: ['DOCTOR'], departmentIds: [surgery._id] });
    const dir = await createUser({ firstName: 'Dir', hospitalId, roles: ['MEDICAL_DIRECTOR'] });
    const patientUser = await createUser({ firstName: 'Pat' });
    const { createPatientRecord } = await import('../helpers');
    const patient = await createPatientRecord(hospitalId, { userId: patientUser.userId });
    const { RecoveryEpisodeModel } = await import('../../src/modules/recovery-episodes/episode.model');
    const { RecoveryAssignmentModel } = await import('../../src/modules/access/access.models');
    const { createAlert } = await import('../../src/modules/alerts/alert-engine');
    const episode = await RecoveryEpisodeModel.create({ hospitalId, patientId: patient._id, departmentId: surgery._id, admissionDate: '2026-11-01', responsibleDoctorId: doc.userId, status: 'ACTIVE' });
    await RecoveryAssignmentModel.create({ hospitalId, episodeId: episode._id, patientId: patient._id, userId: doc.userId, role: 'RESPONSIBLE_DOCTOR' });

    const alert = await createAlert({
      hospitalId: episode.hospitalId,
      episode,
      source: 'MANUAL',
      priority: 'CRITICAL',
      title: 'Test escalation',
      routing: { careTeamRoles: ['RESPONSIBLE_DOCTOR'], acknowledgeWithinMinutes: 10, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 1 },
      dedupeKey: 'esc-test-1',
    });
    expect(alert!.assignedToUserId!.toString()).toBe(doc.userId);

    // Not yet due → nothing happens.
    expect(await escalationSweep(new Date())).toBe(0);
    // 11 minutes later → escalated to the medical director.
    expect(await escalationSweep(new Date(Date.now() + 11 * 60_000))).toBe(1);
    const escalated = await AlertModel.findOne({ _id: alert!._id, hospitalId });
    expect(escalated!.status).toBe('ESCALATED');
    expect(String(escalated!.assignedToUserId)).toBe(dir.userId);
    // Running the sweep again at the same instant does not double-escalate.
    expect(await escalationSweep(new Date(Date.now() + 11 * 60_000))).toBe(0);

    // Acknowledgement stops further escalation; alerts are never auto-closed.
    const director = await as(dir.email);
    expect((await director.post(`/api/v1/alerts/${String(alert!._id)}/acknowledge`)).status).toBe(200);
    expect(await escalationSweep(new Date(Date.now() + 60 * 60_000))).toBe(0);
    expect((await AlertModel.findOne({ _id: alert!._id, hospitalId }))!.status).toBe('ACKNOWLEDGED');
  });
});
