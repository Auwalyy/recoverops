import { describe, expect, it, beforeAll } from 'vitest';
import request from 'supertest';
import { app, as, createHospital, createUser, login, PASSWORD } from '../helpers';
import { SessionModel } from '../../src/modules/auth/auth.models';
import { AuditLogModel } from '../../src/modules/audit/audit.model';

describe('authentication', () => {
  let email: string;
  let hospitalId: string;

  beforeAll(async () => {
    const h = await createHospital();
    hospitalId = h.hospitalId;
    ({ email } = await createUser({ firstName: 'Doc', hospitalId, roles: ['DOCTOR'], departmentIds: [h.surgery._id] }));
  });

  it('logs in and returns the resolved permission set (never trusting client claims)', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: PASSWORD });
    expect(res.status).toBe(200);
    expect(res.body.data.tokens.accessToken).toBeTruthy();
    expect(res.body.data.user.memberships[0].roles).toEqual(['DOCTOR']);
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${res.body.data.tokens.accessToken}`);
    expect(me.body.data.user.permissions).toContain('discharge.approve');
    expect(me.body.data.user.activeHospitalId).toBe(hospitalId);
  });

  it('rejects wrong passwords with a generic message and audits the failure', async () => {
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: email, password: 'wrong-password-1' });
    expect(res.status).toBe(401);
    expect(res.body.error.code).toBe('INVALID_CREDENTIALS');
    const unknown = await request(app).post('/api/v1/auth/login').send({ identifier: 'nobody@test.local', password: 'wrong-password-1' });
    expect(unknown.body.error.message).toBe(res.body.error.message);
    expect(await AuditLogModel.countDocuments({ action: 'LOGIN_FAILED' })).toBeGreaterThanOrEqual(2);
  });

  it('locks the account after repeated failures', async () => {
    const { email: e } = await createUser({ firstName: 'Lock', hospitalId, roles: ['RECOVERY_NURSE'] });
    for (let i = 0; i < 5; i++) await request(app).post('/api/v1/auth/login').send({ identifier: e, password: 'bad-password-9' });
    const res = await request(app).post('/api/v1/auth/login').send({ identifier: e, password: PASSWORD });
    expect(res.status).toBe(429);
  });

  it('rotates refresh tokens and revokes the session on reuse (token theft)', async () => {
    const tokens = await login(email);
    const r1 = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(r1.status).toBe(200);
    const rotated = r1.body.data.tokens.refreshToken;
    expect(rotated).not.toBe(tokens.refreshToken);

    // Replaying the old token → detected → session revoked.
    const replay = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken });
    expect(replay.status).toBe(401);
    const afterTheft = await request(app).post('/api/v1/auth/refresh').send({ refreshToken: rotated });
    expect(afterTheft.status).toBe(401);
    // The access token for that session is now useless as well.
    const me = await request(app).get('/api/v1/auth/me').set('Authorization', `Bearer ${r1.body.data.tokens.accessToken}`);
    expect(me.status).toBe(401);
  });

  it('logout revokes the session', async () => {
    const client = await as(email);
    expect((await client.post('/api/v1/auth/logout')).status).toBe(200);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
  });

  it('never stores plaintext refresh tokens', async () => {
    const tokens = await login(email);
    expect(await SessionModel.exists({ refreshTokenHash: tokens.refreshToken })).toBeNull();
  });

  it('password reset does not enumerate accounts and revokes sessions', async () => {
    const unknown = await request(app).post('/api/v1/auth/forgot-password').send({ identifier: 'ghost@test.local' });
    expect(unknown.status).toBe(200);
    expect(unknown.body.data.devToken).toBeUndefined();
    const { email: e } = await createUser({ firstName: 'Reset', hospitalId, roles: ['RECOVERY_NURSE'] });
    const client = await as(e);
    const res = await request(app).post('/api/v1/auth/forgot-password').send({ identifier: e });
    expect(res.body.data.devToken).toBeTruthy();
    const reset = await request(app).post('/api/v1/auth/reset-password').send({ token: res.body.data.devToken, password: 'BrandNewPass99' });
    expect(reset.status).toBe(200);
    expect((await client.get('/api/v1/auth/me')).status).toBe(401);
    await login(e, 'BrandNewPass99');
    const reuse = await request(app).post('/api/v1/auth/reset-password').send({ token: res.body.data.devToken, password: 'AnotherPass99' });
    expect(reuse.status).toBe(400);
  });

  it('validates input and rejects malformed tokens', async () => {
    expect((await request(app).post('/api/v1/auth/login').send({ identifier: 'x' })).body.error.code).toBe('VALIDATION_ERROR');
    expect((await request(app).get('/api/v1/auth/me').set('Authorization', 'Bearer not-a-jwt')).status).toBe(401);
    expect((await request(app).get('/api/v1/patients')).status).toBe(401);
  });
});
