import { Types } from 'mongoose';
import type { AuthTokens, AuthUser, LoginInput } from '@recoveros/shared';
import { AppError, errors } from '../../utils/errors';
import { isProduction } from '../../config/env';
import {
  DUMMY_PASSWORD_HASH,
  generateNumericCode,
  generateToken,
  hashPassword,
  needsRehash,
  sha256,
  verifyPassword,
} from '../../utils/crypto';
import { audit } from '../audit/audit.service';
import { UserModel, type UserDocument } from '../users/user.model';
import { HospitalModel } from '../hospitals/hospital.models';
import { PatientModel } from '../patients/patient.model';
import { loadAvailableContexts, type Principal } from '../access/principal';
import { notify, devExpose } from '../notifications/notification.service';
import { disconnectSession } from '../../services/realtime';
import { SessionModel, VerificationTokenModel } from './auth.models';
import { hashRefreshToken, newRefreshToken, refreshExpiry, signAccessToken } from './token.service';

const MAX_FAILED_LOGINS = 5;
const LOCK_MINUTES = 15;

interface ClientInfo {
  ip?: string;
  userAgent?: string;
}

function normaliseIdentifier(identifier: string): { email?: string; phone?: string } {
  const v = identifier.trim();
  if (v.includes('@')) return { email: v.toLowerCase() };
  return { phone: v.replace(/[\s-]/g, '') };
}

async function issueSession(user: UserDocument, client: ClientInfo, device?: LoginInput['device']): Promise<AuthTokens & { sessionId: string }> {
  const { token: refreshToken, hash } = newRefreshToken();
  const session = await SessionModel.create({
    userId: user._id,
    refreshTokenHash: hash,
    device,
    ip: client.ip,
    userAgent: client.userAgent,
    expiresAt: refreshExpiry(),
    lastUsedAt: new Date(),
  });
  const access = signAccessToken(String(user._id), String(session._id));
  return {
    sessionId: String(session._id),
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken,
    refreshTokenExpiresAt: session.expiresAt.toISOString(),
  };
}

export async function login(input: LoginInput, client: ClientInfo) {
  const id = normaliseIdentifier(input.identifier);
  const user = await UserModel.findOne(id).select('+passwordHash');

  if (!user || !user.passwordHash) {
    await verifyPassword(input.password, DUMMY_PASSWORD_HASH); // equalise timing
    await audit({ action: 'LOGIN_FAILED', resourceType: 'User', outcome: 'FAILURE', actor: { kind: 'ANONYMOUS' }, metadata: { reason: 'unknown_identifier' } });
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect login details');
  }
  // Synthetic demo accounts can never be used in production.
  if (user.isDemoAccount && isProduction) {
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect login details');
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new AppError('RATE_LIMITED', 'Too many failed attempts. Try again later or reset your password.');
  }

  const valid = await verifyPassword(input.password, user.passwordHash);
  if (!valid) {
    user.failedLoginAttempts = (user.failedLoginAttempts ?? 0) + 1;
    if (user.failedLoginAttempts >= MAX_FAILED_LOGINS) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60_000);
      user.failedLoginAttempts = 0;
    }
    await user.save();
    await audit({ action: 'LOGIN_FAILED', resourceType: 'User', resourceId: String(user._id), outcome: 'FAILURE', actor: { userId: String(user._id) } });
    throw new AppError('INVALID_CREDENTIALS', 'Incorrect login details');
  }
  if (user.status === 'SUSPENDED') throw new AppError('ACCOUNT_SUSPENDED', 'This account is suspended. Contact your hospital administrator.');
  if (user.status !== 'ACTIVE') throw new AppError('ACCOUNT_NOT_ACTIVE', 'This account has not been activated yet.');

  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  if (needsRehash(user.passwordHash)) user.passwordHash = await hashPassword(input.password);
  await user.save();

  const tokens = await issueSession(user, client, input.device);
  await audit({ action: 'LOGIN_SUCCEEDED', resourceType: 'Session', resourceId: tokens.sessionId, actor: { userId: String(user._id) } });
  return { tokens, user: await buildAuthUser(user) };
}

/**
 * Refresh-token rotation with reuse detection. A token that has already been rotated
 * indicates theft; the entire session (token family) is revoked.
 */
export async function refresh(refreshToken: string) {
  const hash = hashRefreshToken(refreshToken);
  const session = await SessionModel.findOne({ refreshTokenHash: hash });

  if (!session) {
    const reused = await SessionModel.findOne({ previousTokenHashes: hash });
    if (reused && !reused.revokedAt) {
      reused.revokedAt = new Date();
      reused.revokedReason = 'REFRESH_TOKEN_REUSE';
      await reused.save();
      disconnectSession(String(reused._id));
      await audit({ action: 'REFRESH_TOKEN_REUSE_DETECTED', resourceType: 'Session', resourceId: String(reused._id), outcome: 'DENIED', actor: { userId: String(reused.userId) } });
    }
    throw new AppError('UNAUTHENTICATED', 'Session expired. Please sign in again.');
  }
  if (session.revokedAt || session.expiresAt < new Date()) throw new AppError('UNAUTHENTICATED', 'Session expired. Please sign in again.');

  const user = await UserModel.findById(session.userId);
  if (!user || user.status !== 'ACTIVE') {
    session.revokedAt = new Date();
    session.revokedReason = 'USER_INACTIVE';
    await session.save();
    throw new AppError('UNAUTHENTICATED', 'Session expired. Please sign in again.');
  }

  const next = newRefreshToken();
  // Atomic compare-and-swap so two concurrent refreshes cannot both succeed.
  const updated = await SessionModel.findOneAndUpdate(
    { _id: session._id, refreshTokenHash: hash, revokedAt: { $exists: false } },
    {
      $set: { refreshTokenHash: next.hash, lastUsedAt: new Date() },
      $push: { previousTokenHashes: { $each: [hash], $slice: -20 } },
    },
    { new: true },
  );
  if (!updated) throw new AppError('UNAUTHENTICATED', 'Session expired. Please sign in again.');

  const access = signAccessToken(String(user._id), String(session._id));
  return {
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt.toISOString(),
    refreshToken: next.token,
    refreshTokenExpiresAt: updated.expiresAt.toISOString(),
  } satisfies AuthTokens;
}

export async function logout(sessionId: string, userId: string): Promise<void> {
  await SessionModel.updateOne(
    { _id: sessionId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'LOGOUT' }, $unset: { 'device.pushToken': 1 } },
  );
  disconnectSession(sessionId);
  await audit({ action: 'LOGOUT', resourceType: 'Session', resourceId: sessionId, actor: { userId } });
}

export async function listSessions(userId: string, currentSessionId: string) {
  const sessions = await SessionModel.find({ userId, revokedAt: { $exists: false }, expiresAt: { $gt: new Date() } })
    .sort({ lastUsedAt: -1 })
    .select('device.name device.platform ip lastUsedAt createdAt');
  return sessions.map((s) => ({
    id: String(s._id),
    deviceName: s.device?.name,
    platform: s.device?.platform,
    lastUsedAt: s.lastUsedAt,
    createdAt: s.get('createdAt') as Date,
    current: String(s._id) === currentSessionId,
  }));
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
  const res = await SessionModel.updateOne(
    { _id: sessionId, userId, revokedAt: { $exists: false } },
    { $set: { revokedAt: new Date(), revokedReason: 'USER_REVOKED' } },
  );
  if (res.matchedCount === 0) throw errors.notFound('Session');
  disconnectSession(sessionId);
  await audit({ action: 'SESSION_REVOKED', resourceType: 'Session', resourceId: sessionId, actor: { userId } });
}

export async function revokeAllSessions(userId: string | Types.ObjectId, reason: string, exceptSessionId?: string): Promise<void> {
  const filter: Record<string, unknown> = { userId, revokedAt: { $exists: false } };
  if (exceptSessionId) filter._id = { $ne: exceptSessionId };
  const sessions = await SessionModel.find(filter).select('_id');
  await SessionModel.updateMany(filter, { $set: { revokedAt: new Date(), revokedReason: reason } });
  for (const s of sessions) disconnectSession(String(s._id));
}

export async function changePassword(userId: string, sessionId: string, current: string, next: string): Promise<void> {
  const user = await UserModel.findById(userId).select('+passwordHash');
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash))) {
    throw new AppError('INVALID_CREDENTIALS', 'Current password is incorrect');
  }
  user.passwordHash = await hashPassword(next);
  user.passwordChangedAt = new Date();
  await user.save();
  await revokeAllSessions(userId, 'PASSWORD_CHANGED', sessionId);
  await audit({ action: 'PASSWORD_CHANGED', resourceType: 'User', resourceId: userId, actor: { userId } });
}

/** Always succeeds from the caller's perspective (no account enumeration). */
export async function forgotPassword(identifier: string) {
  const user = await UserModel.findOne(normaliseIdentifier(identifier));
  if (!user || user.status === 'DEACTIVATED') return {};
  const token = generateToken(24);
  await VerificationTokenModel.create({
    userId: user._id,
    purpose: 'PASSWORD_RESET',
    tokenHash: sha256(token),
    expiresAt: new Date(Date.now() + 30 * 60_000),
  });
  await notify({
    userId: user._id,
    template: 'PASSWORD_RESET',
    vars: { token },
    channels: user.email ? ['EMAIL'] : ['SMS'],
    idempotencyKey: `pwreset:${sha256(token).slice(0, 16)}`,
  });
  await audit({ action: 'PASSWORD_RESET_REQUESTED', resourceType: 'User', resourceId: String(user._id), actor: { userId: String(user._id) } });
  return devExpose({ devToken: token });
}

export async function resetPassword(token: string, password: string): Promise<void> {
  const record = await VerificationTokenModel.findOne({
    tokenHash: sha256(token),
    purpose: 'PASSWORD_RESET',
    usedAt: { $exists: false },
    expiresAt: { $gt: new Date() },
  });
  if (!record) throw new AppError('VALIDATION_ERROR', 'This reset link is invalid or has expired');
  const user = await UserModel.findById(record.userId);
  if (!user) throw new AppError('VALIDATION_ERROR', 'This reset link is invalid or has expired');
  user.passwordHash = await hashPassword(password);
  user.passwordChangedAt = new Date();
  user.failedLoginAttempts = 0;
  user.lockedUntil = undefined;
  await user.save();
  record.usedAt = new Date();
  await record.save();
  await revokeAllSessions(user._id, 'PASSWORD_RESET');
  await audit({ action: 'PASSWORD_RESET_COMPLETED', resourceType: 'User', resourceId: String(user._id), actor: { userId: String(user._id) } });
}

export async function requestVerification(userId: string, channel: 'EMAIL' | 'SMS') {
  const user = await UserModel.findById(userId);
  if (!user) throw errors.notFound('User');
  if (channel === 'EMAIL' && !user.email) throw errors.validation('No email address on this account');
  if (channel === 'SMS' && !user.phone) throw errors.validation('No phone number on this account');
  const code = generateNumericCode(6);
  const purpose = channel === 'EMAIL' ? 'VERIFY_EMAIL' : 'VERIFY_PHONE';
  await VerificationTokenModel.deleteMany({ userId: user._id, purpose, usedAt: { $exists: false } });
  await VerificationTokenModel.create({ userId: user._id, purpose, tokenHash: sha256(`${userId}:${code}`), expiresAt: new Date(Date.now() + 10 * 60_000) });
  await notify({ userId: user._id, template: 'VERIFICATION_CODE', vars: { code }, channels: [channel], idempotencyKey: `verify:${userId}:${Date.now()}` });
  return devExpose({ devCode: code });
}

export async function confirmVerification(userId: string, channel: 'EMAIL' | 'SMS', code: string): Promise<void> {
  const purpose = channel === 'EMAIL' ? 'VERIFY_EMAIL' : 'VERIFY_PHONE';
  const record = await VerificationTokenModel.findOne({ userId, purpose, usedAt: { $exists: false }, expiresAt: { $gt: new Date() } });
  if (!record) throw errors.validation('No pending verification. Request a new code.');
  if (record.attempts >= 5) throw new AppError('RATE_LIMITED', 'Too many attempts. Request a new code.');
  if (record.tokenHash !== sha256(`${userId}:${code}`)) {
    record.attempts += 1;
    await record.save();
    throw errors.validation('Incorrect code');
  }
  record.usedAt = new Date();
  await record.save();
  await UserModel.updateOne({ _id: userId }, { $set: channel === 'EMAIL' ? { emailVerifiedAt: new Date() } : { phoneVerifiedAt: new Date() } });
}

export async function switchHospital(sessionId: string, userId: string, hospitalId: string): Promise<void> {
  const ctx = await loadAvailableContexts(userId);
  const allowed = [...ctx.staff, ...ctx.patient, ...ctx.caregiver].some((c) => c.hospitalId === hospitalId);
  if (!allowed) throw new AppError('TENANT_ACCESS_DENIED', 'You do not have access to this hospital');
  await SessionModel.updateOne({ _id: sessionId, userId }, { $set: { activeHospitalId: hospitalId } });
}

export async function updatePushToken(sessionId: string, userId: string, pushToken: string | null): Promise<void> {
  await SessionModel.updateOne(
    { _id: sessionId, userId },
    pushToken ? { $set: { 'device.pushToken': pushToken } } : { $unset: { 'device.pushToken': 1 } },
  );
}

/** Build the client-facing description of who the user is and what they can access. */
export async function buildAuthUser(user: UserDocument, principal?: Principal): Promise<AuthUser> {
  const ctx = await loadAvailableContexts(String(user._id));
  const hospitalIds = [...new Set([...ctx.staff, ...ctx.patient, ...ctx.caregiver].map((c) => c.hospitalId))];
  const hospitals = await HospitalModel.find({ _id: { $in: hospitalIds } }).select('name');
  const nameOf = (id: string) => hospitals.find((h) => String(h._id) === id)?.name ?? '';
  const caregiverPatients = ctx.caregiver.length
    ? await PatientModel.find({ _id: { $in: ctx.caregiver.map((c) => c.patientId) } })
        .setOptions({ skipTenantGuard: true })
        .select('firstName')
    : [];

  const kind = principal?.kind ?? (user.platformRoles?.length && !ctx.staff.length ? 'PLATFORM' : ctx.staff.length ? 'STAFF' : ctx.patient.length ? 'PATIENT' : ctx.caregiver.length ? 'CAREGIVER' : 'PATIENT');

  return {
    id: String(user._id),
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email ?? undefined,
    phone: user.phone ?? undefined,
    preferredLanguage: user.preferredLanguage ?? 'en',
    kind,
    platformRoles: [...(user.platformRoles ?? [])],
    memberships: ctx.staff.map((m) => ({ hospitalId: m.hospitalId, hospitalName: nameOf(m.hospitalId), roles: m.roles, departmentIds: m.departmentIds })),
    patientProfiles: ctx.patient.map((p) => ({ patientId: p.patientId, hospitalId: p.hospitalId, hospitalName: nameOf(p.hospitalId) })),
    caregiverOf: ctx.caregiver.map((c) => ({
      consentId: c.consentId,
      patientId: c.patientId,
      hospitalId: c.hospitalId,
      patientName: caregiverPatients.find((p) => String(p._id) === c.patientId)?.firstName ?? 'Patient',
      scopes: c.scopes,
    })),
    activeHospitalId: principal?.hospitalId,
    permissions: principal ? [...principal.permissions] : [],
  };
}
