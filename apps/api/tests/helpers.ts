import request from 'supertest';
import { Types } from 'mongoose';
import type { RoleCode } from '@recoveros/shared';
import { createApp } from '../src/app';
import { hashPassword } from '../src/utils/crypto';
import { UserModel } from '../src/modules/users/user.model';
import { UserRoleModel } from '../src/modules/access/access.models';
import { DepartmentModel, HospitalModel } from '../src/modules/hospitals/hospital.models';
import { startTrial } from '../src/modules/billing/billing.service';
import { PatientModel } from '../src/modules/patients/patient.model';
import { CheckInTemplateModel } from '../src/modules/checkins/checkin.models';

export const app = createApp();
export const PASSWORD = 'Recover2026pass';
let passwordHash: string | undefined;

let seq = 0;
const uniq = () => `${Date.now().toString(36)}${(seq++).toString(36)}`;

export async function createHospital(name = 'Test General Hospital', opts: { verified?: boolean; breakGlass?: boolean } = {}) {
  const hospital = await HospitalModel.create({
    name,
    slug: `h-${uniq()}`,
    registrationNumber: `REG-${uniq()}`,
    type: 'GENERAL',
    email: `info-${uniq()}@hospital.test`,
    phone: '+2348000000000',
    emergencyPhone: '+2348000000999',
    timezone: 'Africa/Lagos',
    verificationStatus: opts.verified === false ? 'PENDING_VERIFICATION' : 'VERIFIED',
    settings: { breakGlassEnabled: !!opts.breakGlass },
  });
  await startTrial(hospital._id);
  const surgery = await DepartmentModel.create({ hospitalId: hospital._id, name: 'General Surgery', code: 'SURG' });
  const ortho = await DepartmentModel.create({ hospitalId: hospital._id, name: 'Orthopaedics', code: 'ORTH' });
  return { hospital, hospitalId: String(hospital._id), surgery, ortho };
}

export async function createUser(opts: {
  firstName?: string;
  hospitalId?: string;
  roles?: RoleCode[];
  departmentIds?: Array<string | Types.ObjectId>;
  platformRoles?: Array<'PLATFORM_SUPER_ADMIN' | 'PLATFORM_SUPPORT'>;
  phone?: string;
}) {
  passwordHash ??= await hashPassword(PASSWORD);
  const email = `${(opts.firstName ?? 'user').toLowerCase()}-${uniq()}@test.local`;
  const user = await UserModel.create({
    firstName: opts.firstName ?? 'Test',
    lastName: 'User',
    email,
    phone: opts.phone,
    passwordHash,
    status: 'ACTIVE',
    platformRoles: opts.platformRoles ?? [],
  });
  if (opts.hospitalId && opts.roles) {
    await UserRoleModel.create({ hospitalId: opts.hospitalId, userId: user._id, roles: opts.roles, departmentIds: opts.departmentIds ?? [], status: 'ACTIVE' });
  }
  return { user, email, userId: String(user._id) };
}

export async function createPatientRecord(hospitalId: string, opts: { userId?: string; firstName?: string } = {}) {
  return PatientModel.create({
    hospitalId,
    userId: opts.userId,
    hospitalPatientRef: `MRN-${uniq()}`,
    firstName: opts.firstName ?? 'Amina',
    lastName: 'Bello',
    dateOfBirth: '1980-05-01',
    sex: 'FEMALE',
    phone: '+2348011111111',
    timezone: 'Africa/Lagos',
    isSynthetic: true,
  });
}

export async function createActiveTemplate(hospitalId: string, approvedBy: string) {
  return CheckInTemplateModel.create({
    hospitalId,
    name: 'Daily recovery check-in',
    kind: 'GENERAL',
    version: 1,
    status: 'ACTIVE',
    approvedBy,
    approvedAt: new Date(),
    questions: [
      { key: 'pain_score', type: 'SCALE', label: 'Pain (0-10)', required: true, min: 0, max: 10 },
      { key: 'wound_discharge', type: 'BOOLEAN', label: 'Any fluid from the wound?', required: true },
      { key: 'mood', type: 'SINGLE_CHOICE', label: 'Mood', required: false, options: [{ value: 'good', label: 'Good' }, { value: 'low', label: 'Low' }] },
      { key: 'notes', type: 'TEXT', label: 'Anything else?', required: false },
    ],
  });
}

export async function login(email: string, password = PASSWORD) {
  const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password });
  if (res.status !== 200) throw new Error(`Login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body.data.tokens as { accessToken: string; refreshToken: string };
}

/** Authenticated request helper. */
export async function as(email: string, headers: Record<string, string> = {}) {
  const { accessToken } = await login(email);
  const h = { Authorization: `Bearer ${accessToken}`, ...headers };
  return {
    token: accessToken,
    get: (url: string) => request(app).get(url).set(h),
    post: (url: string, body?: object) => request(app).post(url).set(h).send(body ?? {}),
    patch: (url: string, body?: object) => request(app).patch(url).set(h).send(body ?? {}),
    put: (url: string, body?: object) => request(app).put(url).set(h).send(body ?? {}),
    delete: (url: string) => request(app).delete(url).set(h),
  };
}

export function dischargeContent(opts: { templateId?: string; withMedication?: boolean } = {}) {
  return {
    summary: 'Synthetic test discharge after laparoscopic procedure.',
    clinicalInstructions: [{ title: 'Rest', details: 'Rest at home for 7 days and avoid driving.' }],
    medications: opts.withMedication === false
      ? []
      : [
          {
            name: 'Paracetamol',
            strength: '500mg',
            dose: '2 tablets',
            route: 'ORAL',
            frequencyText: 'Three times daily after meals',
            schedule: { kind: 'DAILY', timesOfDay: ['08:00', '14:00', '20:00'], durationDays: 5 },
            isPrn: false,
          },
          {
            name: 'Ibuprofen',
            dose: '1 tablet',
            route: 'ORAL',
            frequencyText: 'When needed for pain',
            schedule: { kind: 'DAILY', timesOfDay: ['09:00'] },
            isPrn: true,
          },
        ],
    woundCare: [{ title: 'Dressing', details: 'Keep the dressing dry for 48 hours.' }],
    warningSigns: [{ title: 'Fever', details: 'Temperature above 38 degrees or spreading redness.' }],
    education: [{ title: 'Wound care leaflet', details: 'Read the wound care leaflet provided.' }],
    followUps: [],
    activities: [],
    ...(opts.templateId ? { checkInTemplateId: opts.templateId, checkInSchedule: { kind: 'DAILY', timesOfDay: ['09:00'] } } : {}),
    programmeDurationDays: 14,
  };
}

export const oid = () => new Types.ObjectId().toString();
