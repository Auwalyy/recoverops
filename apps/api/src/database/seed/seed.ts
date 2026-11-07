/**
 * RecoverOS development seed — SYNTHETIC DATA ONLY.
 *
 * Every person, patient and clinical detail here is fictional. Alert rules created by
 * this script are flagged `isDemoRule` and are NOT clinically validated protocols.
 * Refuses to run in production.
 *
 *   npm run seed            (adds demo data if the demo hospital does not exist)
 *   npm run seed -- --reset (removes the previous demo hospital's data first)
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import mongoose, { Types } from 'mongoose';
import { DateTime } from 'luxon';
import type { RoleCode } from '@recoveros/shared';
import { env, isProduction } from '../../config/env';
import { logger } from '../../config/logger';
import { connectDatabase } from '../connection';
import { hashPassword } from '../../utils/crypto';
import { syncAccessRegistry } from '../../modules/access/registry-sync';
import { ensureDefaultPlans, startTrial } from '../../modules/billing/billing.service';
import { resolvePrincipal, type Principal } from '../../modules/access/principal';
import { UserModel } from '../../modules/users/user.model';
import { UserRoleModel } from '../../modules/access/access.models';
import { DepartmentModel, HospitalModel } from '../../modules/hospitals/hospital.models';
import { PatientModel } from '../../modules/patients/patient.model';
import { CaregiverConsentModel, CaregiverModel, ConsentModel } from '../../modules/caregivers/caregiver.models';
import { CheckInTemplateModel } from '../../modules/checkins/checkin.models';
import { AlertRuleModel } from '../../modules/alerts/alert.models';
import { RecoveryTaskModel } from '../../modules/recovery-plans/recovery-plan.models';
import * as episodes from '../../modules/recovery-episodes/episode.service';
import * as discharge from '../../modules/discharge/discharge.service';
import * as checkins from '../../modules/checkins/checkin.service';
import * as meds from '../../modules/medications/medication.service';
import * as appointments from '../../modules/appointments/appointment.service';
import * as rehab from '../../modules/rehabilitation/rehabilitation.service';
import * as messaging from '../../modules/messaging/messaging.service';
import { registerJobProcessors } from '../../jobs/processors';

const DEMO_SLUG = 'demo-recovery-teaching-hospital';
const DEMO_PASSWORD = 'RecoverOS-Demo-2026';

interface SeedUser {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  roles?: RoleCode[];
  departments?: string[];
  title?: string;
}

async function resetDemo(): Promise<void> {
  const hospital = await HospitalModel.findOne({ slug: DEMO_SLUG });
  if (!hospital) return;
  const hospitalId = hospital._id;
  for (const model of Object.values(mongoose.models)) {
    if (model.schema.path('hospitalId') && model.modelName !== 'AuditLog') {
      await model.collection.deleteMany({ hospitalId });
    }
  }
  await mongoose.connection.collection('auditlogs').deleteMany({ hospitalId });
  await UserModel.deleteMany({ isDemoAccount: true });
  await CaregiverModel.collection.deleteMany({ email: /@demo\.recoveros\.test$/ });
  await HospitalModel.deleteOne({ _id: hospitalId });
  logger.info('Previous demo data removed');
}

async function main(): Promise<void> {
  if (isProduction) throw new Error('Refusing to seed demo data in production');
  await connectDatabase();
  registerJobProcessors();
  await syncAccessRegistry();
  await ensureDefaultPlans();
  if (process.argv.includes('--reset')) await resetDemo();
  if (await HospitalModel.exists({ slug: DEMO_SLUG })) {
    logger.info('Demo hospital already exists. Use `npm run seed -- --reset` to recreate.');
    await mongoose.disconnect();
    return;
  }

  /* ----------------------------- Hospital ----------------------------- */
  const hospital = await HospitalModel.create({
    name: 'Demo Recovery Teaching Hospital (Synthetic)',
    slug: DEMO_SLUG,
    registrationNumber: 'DEMO-0000',
    type: 'TEACHING',
    email: 'info@demo.recoveros.test',
    phone: '+2348000000001',
    emergencyPhone: '+2348000000112',
    address: { line1: '1 Synthetic Avenue', city: 'Kano', state: 'Kano', country: 'NG' },
    timezone: 'Africa/Lagos',
    verificationStatus: 'VERIFIED',
    verifiedAt: new Date(),
    settings: { breakGlassEnabled: true, aiFeaturesEnabled: true },
    isDemo: true,
  });
  const hospitalId = hospital._id;
  await startTrial(hospitalId);
  const depts: Record<string, Types.ObjectId> = {};
  for (const [code, name] of [
    ['SURG', 'General Surgery'],
    ['ORTH', 'Orthopaedics'],
    ['OBG', 'Obstetrics & Gynaecology'],
    ['MED', 'Internal Medicine'],
  ] as const) {
    depts[code] = (await DepartmentModel.create({ hospitalId, code, name }))._id;
  }

  /* ------------------------------- Staff ------------------------------- */
  const passwordHash = await hashPassword(DEMO_PASSWORD);
  const staff: SeedUser[] = [
    { key: 'admin', firstName: 'Hauwa', lastName: 'Abdullahi', email: 'admin@demo.recoveros.test', roles: ['HOSPITAL_ADMIN'], title: 'Hospital Administrator' },
    { key: 'director', firstName: 'Yusuf', lastName: 'Garba', email: 'director@demo.recoveros.test', roles: ['MEDICAL_DIRECTOR'], title: 'Medical Director' },
    { key: 'doctor1', firstName: 'Fatima', lastName: 'Lawal', email: 'dr.lawal@demo.recoveros.test', roles: ['DOCTOR'], departments: ['SURG', 'OBG'], title: 'Consultant Surgeon' },
    { key: 'doctor2', firstName: 'Chinedu', lastName: 'Okafor', email: 'dr.okafor@demo.recoveros.test', roles: ['DOCTOR'], departments: ['ORTH'], title: 'Consultant Orthopaedic Surgeon' },
    { key: 'nurse1', firstName: 'Aisha', lastName: 'Mohammed', email: 'nurse.aisha@demo.recoveros.test', roles: ['RECOVERY_NURSE'], departments: ['SURG', 'ORTH', 'OBG'], title: 'Recovery Nurse' },
    { key: 'nurse2', firstName: 'Grace', lastName: 'Adeyemi', email: 'nurse.grace@demo.recoveros.test', roles: ['DISCHARGE_NURSE'], departments: ['SURG', 'ORTH', 'OBG'], title: 'Discharge Nurse' },
    { key: 'coordinator', firstName: 'Bashir', lastName: 'Idris', email: 'coordinator@demo.recoveros.test', roles: ['RECOVERY_COORDINATOR'], departments: ['SURG', 'ORTH', 'OBG', 'MED'], title: 'Recovery Coordinator' },
    { key: 'pharmacist', firstName: 'Ngozi', lastName: 'Eze', email: 'pharmacist@demo.recoveros.test', roles: ['PHARMACIST'], title: 'Pharmacist' },
    { key: 'physio', firstName: 'Samuel', lastName: 'Bako', email: 'physio@demo.recoveros.test', roles: ['PHYSIOTHERAPIST'], title: 'Physiotherapist' },
    { key: 'quality', firstName: 'Zainab', lastName: 'Umar', email: 'quality@demo.recoveros.test', roles: ['QUALITY_OFFICER'], title: 'Quality Officer' },
  ];
  const ids: Record<string, Types.ObjectId> = {};
  for (const s of staff) {
    const u = await UserModel.create({ firstName: s.firstName, lastName: s.lastName, email: s.email, passwordHash, status: 'ACTIVE', emailVerifiedAt: new Date(), isDemoAccount: true });
    ids[s.key] = u._id;
    await UserRoleModel.create({ hospitalId, userId: u._id, roles: s.roles, departmentIds: (s.departments ?? []).map((d) => depts[d]), title: s.title, status: 'ACTIVE' });
  }
  const platform = await UserModel.create({ firstName: 'Platform', lastName: 'Operator', email: 'platform@demo.recoveros.test', passwordHash, status: 'ACTIVE', platformRoles: ['PLATFORM_SUPER_ADMIN'], isDemoAccount: true });
  void platform;

  const principalFor = async (key: string, kind?: 'STAFF' | 'PATIENT' | 'CAREGIVER'): Promise<Principal> => {
    const user = await UserModel.findById(ids[key]);
    return resolvePrincipal(user!, 'seed', { requestedHospitalId: String(hospitalId), requestedKind: kind });
  };
  const doctor1 = await principalFor('doctor1');
  const doctor2 = await principalFor('doctor2');
  const nurse2 = await principalFor('nurse2');

  /* ------------------ Clinical configuration (DEMO ONLY) ------------------ */
  const template = await CheckInTemplateModel.create({
    hospitalId,
    name: 'Post-discharge daily check-in',
    kind: 'GENERAL',
    description: 'Synthetic demo template — review with your clinical governance team before use.',
    status: 'ACTIVE',
    createdBy: ids.admin,
    approvedBy: ids.director,
    approvedAt: new Date(),
    questions: [
      { key: 'overall', type: 'SINGLE_CHOICE', label: 'How are you feeling today?', required: true, options: [{ value: 'better', label: 'Better' }, { value: 'same', label: 'About the same' }, { value: 'worse', label: 'Worse' }], translations: { ha: { label: 'Yaya kake ji yau?' } } },
      { key: 'pain_score', type: 'SCALE', label: 'Pain level (0 = none, 10 = worst)', required: true, min: 0, max: 10, translations: { ha: { label: 'Matakin zafi (0 – 10)' } } },
      { key: 'wound_fluid', type: 'BOOLEAN', label: 'Is any fluid coming from your wound?', required: true },
      { key: 'fever', type: 'BOOLEAN', label: 'Have you felt feverish or had chills?', required: true },
      { key: 'took_medicines', type: 'BOOLEAN', label: 'Were you able to take your medicines as prescribed?', required: true },
      { key: 'notes', type: 'TEXT', label: 'Anything else you want your care team to know?', required: false },
    ],
  });
  template.familyId = template._id;
  await template.save();

  const demoRule = (r: Record<string, unknown>) => ({
    hospitalId,
    status: 'ACTIVE',
    isDemoRule: true,
    createdBy: ids.admin,
    clinicalApproval: { approvedBy: ids.director, approvedAt: new Date(), comment: 'DEMO ONLY — not a validated clinical protocol' },
    ...r,
  });
  await AlertRuleModel.create([
    demoRule({
      name: 'DEMO: Wound fluid with fever',
      description: 'DEMONSTRATION RULE ONLY. Thresholds are placeholders and must be replaced by the hospital clinical team.',
      source: 'CHECK_IN',
      checkInTemplateId: template._id,
      conditions: { all: [{ field: 'answers.wound_fluid', op: 'eq', value: true }, { field: 'answers.fever', op: 'eq', value: true }], any: [] },
      priority: 'HIGH',
      title: 'Wound concern with fever reported',
      patientSafetyMessage: 'Thank you. Your care team has been alerted and will contact you.',
      showEmergencyGuidance: true,
      routing: { careTeamRoles: ['RECOVERY_NURSE', 'RESPONSIBLE_DOCTOR'], acknowledgeWithinMinutes: 30, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 2 },
    }),
    demoRule({
      name: 'DEMO: High reported pain',
      description: 'DEMONSTRATION RULE ONLY.',
      source: 'CHECK_IN',
      checkInTemplateId: template._id,
      conditions: { all: [{ field: 'answers.pain_score', op: 'gte', value: 8 }], any: [] },
      priority: 'MEDIUM',
      title: 'High pain score reported',
      patientSafetyMessage: 'Your care team will review your report.',
      routing: { careTeamRoles: ['RECOVERY_NURSE'], acknowledgeWithinMinutes: 120, escalateToRoles: ['DOCTOR', 'MEDICAL_DIRECTOR'], maxEscalationLevel: 2 },
    }),
    demoRule({
      name: 'DEMO: Severe symptom report',
      description: 'DEMONSTRATION RULE ONLY.',
      source: 'SYMPTOM_REPORT',
      conditions: { all: [{ field: 'severity', op: 'eq', value: 'SEVERE' }], any: [] },
      priority: 'HIGH',
      title: 'Severe symptom reported',
      patientSafetyMessage: 'Your care team has been alerted.',
      showEmergencyGuidance: true,
      routing: { careTeamRoles: ['RECOVERY_NURSE', 'RESPONSIBLE_DOCTOR'], acknowledgeWithinMinutes: 30, escalateToRoles: ['MEDICAL_DIRECTOR'], maxEscalationLevel: 2 },
    }),
    demoRule({
      name: 'DEMO: Unable to obtain medication',
      description: 'DEMONSTRATION RULE ONLY.',
      source: 'MEDICATION_EVENT',
      conditions: { all: [{ field: 'status', op: 'eq', value: 'UNABLE_TO_OBTAIN' }], any: [] },
      priority: 'MEDIUM',
      title: 'Patient unable to obtain medication',
      routing: { careTeamRoles: ['PHARMACIST', 'RECOVERY_COORDINATOR'], acknowledgeWithinMinutes: 240, escalateToRoles: ['PHARMACIST', 'MEDICAL_DIRECTOR'], maxEscalationLevel: 1 },
    }),
    demoRule({
      name: 'DEMO: Two consecutive missed check-ins',
      description: 'DEMONSTRATION RULE ONLY.',
      source: 'TASK_MISSED',
      conditions: { all: [{ field: 'taskType', op: 'eq', value: 'CHECK_IN' }, { field: 'consecutiveMissed', op: 'gte', value: 2 }], any: [] },
      priority: 'LOW',
      title: 'Repeated missed check-ins',
      routing: { careTeamRoles: ['RECOVERY_COORDINATOR', 'RECOVERY_NURSE'], acknowledgeWithinMinutes: 720, escalateToRoles: ['RECOVERY_NURSE'], maxEscalationLevel: 1 },
    }),
  ]);

  /* ------------------------------ Patients ------------------------------ */
  const patientsSeed = [
    { key: 'p1', firstName: 'Ibrahim', lastName: 'Sani', email: 'ibrahim.sani@demo.recoveros.test', phone: '+2348100000001', dob: '1968-04-12', sex: 'MALE', lang: 'ha', ref: 'DRTH-100231' },
    { key: 'p2', firstName: 'Blessing', lastName: 'Okonkwo', email: 'blessing.okonkwo@demo.recoveros.test', phone: '+2348100000002', dob: '1979-09-03', sex: 'FEMALE', lang: 'en', ref: 'DRTH-100232' },
    { key: 'p3', firstName: 'Musa', lastName: 'Danjuma', email: 'musa.danjuma@demo.recoveros.test', phone: '+2348100000003', dob: '1955-01-22', sex: 'MALE', lang: 'pcm', ref: 'DRTH-100233' },
  ] as const;
  const patients: Record<string, Types.ObjectId> = {};
  for (const ps of patientsSeed) {
    const u = await UserModel.create({ firstName: ps.firstName, lastName: ps.lastName, email: ps.email, phone: ps.phone, passwordHash, status: 'ACTIVE', preferredLanguage: ps.lang, isDemoAccount: true, phoneVerifiedAt: new Date() });
    ids[ps.key] = u._id;
    const p = await PatientModel.create({
      hospitalId,
      userId: u._id,
      hospitalPatientRef: ps.ref,
      firstName: ps.firstName,
      lastName: ps.lastName,
      dateOfBirth: ps.dob,
      sex: ps.sex,
      phone: ps.phone,
      email: ps.email,
      preferredLanguage: ps.lang,
      emergencyContact: { name: 'Synthetic Contact', relationship: 'Sibling', phone: '+2348100009999' },
      createdBy: ids.nurse2,
      isSynthetic: true,
      consentStatus: 'GRANTED',
    });
    patients[ps.key] = p._id;
    for (const type of ['RECOVERY_PROGRAMME_PARTICIPATION', 'DATA_PROCESSING', 'AI_ASSISTED_FEATURES', 'SMS_NOTIFICATIONS'] as const) {
      await ConsentModel.create({ hospitalId, patientId: p._id, type, version: '2026.1', status: 'GRANTED', method: 'WRITTEN', recordedBy: ids.nurse2, grantedAt: new Date() });
    }
  }

  /* ---------------------- Episodes & discharge plans ---------------------- */
  const today = DateTime.now().setZone('Africa/Lagos');
  const iso = (d: DateTime) => d.toISODate()!;

  // Patient 1 — surgery, active programme.
  const ep1 = await episodes.createEpisode(nurse2, {
    patientId: String(patients.p1),
    departmentId: String(depts.SURG),
    admissionDate: iso(today.minus({ days: 6 })),
    admissionReference: 'ADM-55120',
    diagnosisReference: 'Synthetic: acute appendicitis',
    procedureReference: 'Synthetic: laparoscopic appendicectomy',
    responsibleDoctorId: String(ids.doctor1),
    programmeName: 'Post-surgical recovery (14 days)',
  });
  for (const [key, role] of [['nurse1', 'RECOVERY_NURSE'], ['coordinator', 'RECOVERY_COORDINATOR'], ['pharmacist', 'PHARMACIST']] as const) {
    await episodes.assignCareTeam(doctor1, String(ep1._id), { userId: String(ids[key]), role });
  }
  const plan1 = await discharge.createDischargePlan(doctor1, {
    episodeId: String(ep1._id),
    content: {
      summary: 'SYNTHETIC: Uncomplicated laparoscopic appendicectomy. Discharged in stable condition.',
      clinicalInstructions: [
        { title: 'Rest and recovery', details: 'Rest at home for the first 7 days. Short walks around the house 3 times a day are encouraged.' },
        { title: 'Driving', details: 'Do not drive for 14 days after your operation.' },
      ],
      medications: [
        { name: 'Paracetamol', strength: '500mg', dose: '2 tablets', route: 'ORAL', frequencyText: 'Three times daily after meals', schedule: { kind: 'DAILY', timesOfDay: ['08:00', '14:00', '20:00'], durationDays: 7 }, instructions: 'Do not take more than 8 tablets in 24 hours.', isPrn: false },
        { name: 'Amoxicillin', strength: '500mg', dose: '1 capsule', route: 'ORAL', frequencyText: 'Every 8 hours for 5 days', schedule: { kind: 'DAILY', timesOfDay: ['06:00', '14:00', '22:00'], durationDays: 5 }, instructions: 'Complete the full course.', isPrn: false },
      ],
      woundCare: [{ title: 'Dressing', details: 'Keep the dressing clean and dry for 48 hours. You may shower after 48 hours; pat the wound dry.' }],
      activityRestrictions: [{ title: 'Lifting', details: 'Do not lift anything heavier than 5 kg for 4 weeks.' }],
      dietaryInstructions: [{ title: 'Diet', details: 'Start with light meals and plenty of fluids; return to normal diet as tolerated.' }],
      warningSigns: [
        { title: 'Wound problems', details: 'Increasing redness, swelling, pus or fluid from the wound.' },
        { title: 'Fever', details: 'A temperature of 38°C or higher, or shivering.' },
        { title: 'Severe pain', details: 'Pain that is getting worse and is not relieved by your medicines.' },
      ],
      followUps: [{ type: 'WOUND_CHECK', description: 'Wound check at surgical outpatient clinic', dueDate: iso(today.plus({ days: 5 })), clinicianId: String(ids.doctor1) }],
      education: [{ title: 'Caring for your wound at home', details: 'Wash your hands before touching the dressing. Keep the area clean and dry.' }],
      activities: [{ type: 'WOUND_CARE', title: 'Check your wound', instructions: 'Look at your wound for redness, swelling or fluid.', recurrence: { kind: 'DAILY', timesOfDay: ['18:00'], durationDays: 10 } }],
      checkInTemplateId: String(template._id),
      checkInSchedule: { kind: 'DAILY', timesOfDay: ['09:00'] },
      programmeDurationDays: 14,
    },
  });
  await discharge.submitPlan(doctor1, String(plan1.plan._id));
  await discharge.decidePlan(doctor1, String(plan1.plan._id), { decision: 'APPROVED', comment: 'Fit for discharge', dischargeDate: iso(today.minus({ days: 2 })), activate: true });
  await discharge.recordUnderstanding(nurse2, String(plan1.plan._id), { method: 'TEACH_BACK', understood: true, notes: 'Patient repeated key instructions in Hausa.' });

  // Patient 2 — orthopaedics, active with rehabilitation.
  const ep2 = await episodes.createEpisode(nurse2, {
    patientId: String(patients.p2),
    departmentId: String(depts.ORTH),
    admissionDate: iso(today.minus({ days: 10 })),
    procedureReference: 'Synthetic: open reduction internal fixation, right ankle',
    responsibleDoctorId: String(ids.doctor2),
    programmeName: 'Orthopaedic recovery (28 days)',
  });
  await episodes.assignCareTeam(doctor2, String(ep2._id), { userId: String(ids.nurse1), role: 'RECOVERY_NURSE' });
  await episodes.assignCareTeam(doctor2, String(ep2._id), { userId: String(ids.coordinator), role: 'RECOVERY_COORDINATOR' });
  const plan2 = await discharge.createDischargePlan(doctor2, {
    episodeId: String(ep2._id),
    content: {
      summary: 'SYNTHETIC: ORIF right ankle. Non-weight bearing for 6 weeks.',
      clinicalInstructions: [{ title: 'Weight bearing', details: 'Do not put weight on your right foot. Use your crutches at all times.' }],
      medications: [
        { name: 'Enoxaparin', strength: '40mg', dose: '1 injection', route: 'SUBCUTANEOUS', frequencyText: 'Once daily', schedule: { kind: 'DAILY', timesOfDay: ['18:00'], durationDays: 14 }, isPrn: false },
        { name: 'Ibuprofen', strength: '400mg', dose: '1 tablet', route: 'ORAL', frequencyText: 'Up to three times daily when needed for pain', schedule: { kind: 'DAILY', timesOfDay: ['09:00'] }, isPrn: true },
      ],
      woundCare: [{ title: 'Cast care', details: 'Keep the cast dry. Do not put anything inside the cast.' }],
      warningSigns: [{ title: 'Circulation', details: 'Toes become cold, blue or numb, or calf pain and swelling.' }],
      rehabilitationRequirements: [{ title: 'Physiotherapy', details: 'Attend physiotherapy twice weekly as arranged.' }],
      education: [{ title: 'Using crutches safely', details: 'Watch the crutches video and practise on flat ground first.' }],
      checkInTemplateId: String(template._id),
      checkInSchedule: { kind: 'DAILY', timesOfDay: ['10:00'] },
      programmeDurationDays: 28,
    },
  });
  await discharge.submitPlan(doctor2, String(plan2.plan._id));
  await discharge.decidePlan(doctor2, String(plan2.plan._id), { decision: 'APPROVED', dischargeDate: iso(today.minus({ days: 5 })), activate: true });

  // The physiotherapist joins the care team and authors the rehabilitation plan.
  await episodes.assignCareTeam(doctor2, String(ep2._id), { userId: String(ids.physio), role: 'PHYSIOTHERAPIST' });
  const physioP = await principalFor('physio');
  const rehabPlan = await rehab.createPlan(physioP, {
    episodeId: String(ep2._id),
    physiotherapistId: String(ids.physio),
    goals: ['Safe mobilisation with crutches', 'Maintain knee and hip range of motion'],
    exercises: [
      { name: 'Toe wiggles', instructions: 'Wiggle the toes of your right foot gently.', repetitions: 20, frequencyText: 'Every hour while awake' },
      { name: 'Straight leg raise', instructions: 'Lying on your back, keep the right leg straight and lift it 20 cm. Hold, then lower slowly.', sets: 3, repetitions: 10, holdSeconds: 5, frequencyText: 'Twice daily' },
    ],
    milestones: [{ title: 'Independent with crutches on stairs', targetDate: iso(today.plus({ days: 14 })) }],
    startDate: iso(today.minus({ days: 4 })),
  });
  const pastSession = await rehab.scheduleSession(physioP, { planId: String(rehabPlan._id), scheduledAt: today.minus({ days: 2 }).set({ hour: 10, minute: 0 }).toISO()!, durationMinutes: 45, location: 'Physiotherapy gym, Block C', mode: 'IN_PERSON' });
  await rehab.recordSession(physioP, String(pastSession._id), { status: 'ATTENDED', progressNotes: 'Mobilising safely on flat ground with crutches.', assessment: { painScore: 4, functionalScore: 55 } });
  await rehab.scheduleSession(physioP, { planId: String(rehabPlan._id), scheduledAt: today.plus({ days: 2 }).set({ hour: 10, minute: 0 }).toISO()!, durationMinutes: 45, location: 'Physiotherapy gym, Block C', mode: 'IN_PERSON' });

  // Patient 3 — plan submitted, awaiting doctor approval (demo of approval flow).
  const ep3 = await episodes.createEpisode(nurse2, {
    patientId: String(patients.p3),
    departmentId: String(depts.SURG),
    admissionDate: iso(today.minus({ days: 3 })),
    procedureReference: 'Synthetic: open inguinal hernia repair',
    responsibleDoctorId: String(ids.doctor1),
    plannedDischargeDate: iso(today),
  });
  await episodes.assignCareTeam(doctor1, String(ep3._id), { userId: String(ids.nurse1), role: 'RECOVERY_NURSE' });
  const plan3 = await discharge.createDischargePlan(doctor1, {
    episodeId: String(ep3._id),
    content: {
      summary: 'SYNTHETIC: Elective open inguinal hernia repair. Awaiting discharge approval.',
      clinicalInstructions: [{ title: 'Activity', details: 'Walk short distances several times a day. Avoid straining.' }],
      medications: [{ name: 'Paracetamol', strength: '500mg', dose: '2 tablets', route: 'ORAL', frequencyText: 'Four times daily', schedule: { kind: 'DAILY', timesOfDay: ['07:00', '12:00', '17:00', '22:00'], durationDays: 5 }, isPrn: false }],
      warningSigns: [{ title: 'Swelling', details: 'New hard swelling in the groin or scrotum.' }],
      checkInTemplateId: String(template._id),
      programmeDurationDays: 10,
    },
  });
  await discharge.submitPlan(doctor1, String(plan3.plan._id));

  /* --------------------- Patient activity (check-ins) --------------------- */
  const p1 = await principalFor('p1', 'PATIENT');
  const p2 = await principalFor('p2', 'PATIENT');
  await checkins.submitCheckIn(p1, { episodeId: String(ep1._id), templateId: String(template._id), answers: { overall: 'better', pain_score: 4, wound_fluid: false, fever: false, took_medicines: true }, idempotencyKey: 'seed-p1-checkin-1' });
  await checkins.submitCheckIn(p1, { episodeId: String(ep1._id), templateId: String(template._id), answers: { overall: 'worse', pain_score: 7, wound_fluid: true, fever: true, took_medicines: true, notes: 'The wound looks redder today.' }, idempotencyKey: 'seed-p1-checkin-2' });
  await checkins.submitCheckIn(p2, { episodeId: String(ep2._id), templateId: String(template._id), answers: { overall: 'same', pain_score: 5, wound_fluid: false, fever: false, took_medicines: false, notes: 'Could not get the injections from the pharmacy.' }, idempotencyKey: 'seed-p2-checkin-1' });

  // Medication events (patient-reported).
  const p1MedTask = await RecoveryTaskModel.findOne({ hospitalId, episodeId: ep1._id, type: 'MEDICATION', dueAt: { $lte: new Date() } }).sort({ dueAt: -1 });
  if (p1MedTask) await meds.reportMedicationEvent(p1, { medicationOrderId: String(p1MedTask.medicationOrderId), taskId: String(p1MedTask._id), status: 'REPORTED_TAKEN', idempotencyKey: 'seed-p1-med-1', requestPharmacistReview: false });
  const p2MedTask = await RecoveryTaskModel.findOne({ hospitalId, episodeId: ep2._id, type: 'MEDICATION' }).sort({ dueAt: 1 });
  if (p2MedTask) await meds.reportMedicationEvent(p2, { medicationOrderId: String(p2MedTask.medicationOrderId), status: 'UNABLE_TO_OBTAIN', accessProblem: 'OUT_OF_STOCK', reason: 'Local pharmacy out of stock', idempotencyKey: 'seed-p2-med-1', requestPharmacistReview: true });

  /* ----------------------------- Appointments ----------------------------- */
  const nurse1 = await principalFor('nurse1');
  await appointments.createAppointment(doctor1, { episodeId: String(ep1._id), clinicianId: String(ids.doctor1), type: 'WOUND_CHECK', mode: 'IN_PERSON', scheduledAt: today.plus({ days: 5 }).set({ hour: 9, minute: 30 }).toISO()!, durationMinutes: 20, location: 'Surgical Outpatients, Room 4', instructions: 'Bring your discharge letter.', reminderOffsetsMinutes: [1440, 120] });
  await appointments.createAppointment(nurse1, { episodeId: String(ep2._id), clinicianId: String(ids.doctor2), type: 'FOLLOW_UP', mode: 'IN_PERSON', scheduledAt: today.plus({ days: 9 }).set({ hour: 11, minute: 0 }).toISO()!, durationMinutes: 30, location: 'Fracture Clinic', instructions: 'X-ray before the appointment.', reminderOffsetsMinutes: [1440] });

  /* ------------------------------ Caregivers ------------------------------ */
  const caregivers = [
    { key: 'cg1', first: 'Halima', last: 'Sani', email: 'halima.sani@demo.recoveros.test', patient: 'p1', relationship: 'Daughter', scopes: ['VIEW_RECOVERY_PLAN', 'VIEW_MEDICATIONS', 'REPORT_MEDICATION_EVENTS', 'SUBMIT_CHECKINS', 'VIEW_APPOINTMENTS', 'MESSAGE_CARE_TEAM'] },
    { key: 'cg2', first: 'Emeka', last: 'Okonkwo', email: 'emeka.okonkwo@demo.recoveros.test', patient: 'p2', relationship: 'Husband', scopes: ['VIEW_APPOINTMENTS', 'VIEW_RECOVERY_PLAN'] },
  ];
  for (const c of caregivers) {
    const u = await UserModel.create({ firstName: c.first, lastName: c.last, email: c.email, passwordHash, status: 'ACTIVE', isDemoAccount: true });
    ids[c.key] = u._id;
    const profile = await CaregiverModel.create({ userId: u._id, name: `${c.first} ${c.last}`, email: c.email });
    await CaregiverConsentModel.create({
      hospitalId,
      patientId: patients[c.patient],
      caregiverId: profile._id,
      caregiverUserId: u._id,
      relationship: c.relationship,
      scopes: c.scopes,
      status: 'ACTIVE',
      grantedByUserId: ids[c.patient],
      grantedVia: 'PATIENT_APP',
      acceptedAt: new Date(),
      expiresAt: today.plus({ days: 90 }).toJSDate(),
      scopeHistory: [{ scopes: c.scopes, changedAt: new Date(), changedBy: ids[c.patient] }],
    });
  }

  /* -------------------------------- Messages -------------------------------- */
  await messaging.createConversation(p2, { subject: 'Injections not available', category: 'MEDICATION', initialMessage: 'Good morning. The pharmacy near me does not have the injections. What should I do?' });

  /* --------------------------- Credentials file --------------------------- */
  const lines = [
    '# RecoverOS demo credentials — DEVELOPMENT ONLY',
    '',
    '> Synthetic, fictional people and data. These accounts are flagged `isDemoAccount` and **cannot sign in when NODE_ENV=production**.',
    '> Demo alert rules are placeholders and are NOT clinically validated.',
    '',
    `Password for every account: \`${DEMO_PASSWORD}\``,
    '',
    '| Role | Name | Login |',
    '|---|---|---|',
    ...staff.map((s) => `| ${s.roles!.join(', ')} | ${s.firstName} ${s.lastName} | ${s.email} |`),
    '| PLATFORM_SUPER_ADMIN | Platform Operator | platform@demo.recoveros.test |',
    ...patientsSeed.map((p) => `| PATIENT | ${p.firstName} ${p.lastName} (${p.ref}) | ${p.email} / ${p.phone} |`),
    ...caregivers.map((c) => `| CAREGIVER | ${c.first} ${c.last} (${c.relationship} of ${c.patient.toUpperCase()}) | ${c.email} |`),
    '',
    '## Seeded scenarios',
    '- **Ibrahim Sani** — active post-surgical programme; latest check-in triggered a HIGH alert (wound fluid + fever) assigned to Nurse Aisha.',
    '- **Blessing Okonkwo** — active orthopaedic programme with rehabilitation plan; reported she could not obtain medication (pharmacist queue) and messaged the care team.',
    '- **Musa Danjuma** — discharge plan submitted and awaiting approval by Dr Fatima Lawal.',
    '',
  ];
  const out = path.resolve(__dirname, '../../../../../docs/DEMO_CREDENTIALS.md');
  await fs.writeFile(out, lines.join('\n'));
  logger.info({ file: out, db: env.MONGODB_URI.replace(/\/\/[^@]*@/, '//***@') }, 'Demo data seeded');
  await new Promise((r) => setTimeout(r, 300));
  await mongoose.disconnect();
}

main().catch(async (err) => {
  logger.error({ err }, 'Seed failed');
  await mongoose.disconnect().catch(() => undefined);
  process.exit(1);
});
