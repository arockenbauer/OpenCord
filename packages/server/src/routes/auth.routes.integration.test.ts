import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { authenticator } from 'otplib';
import { createApp } from '../index.js';
import { prisma } from '../utils/prisma.js';
import { clearTestData, rebuildTestDatabase } from '../test/test-db.js';

const testEmail = 'auth-user@opencord.test';

describe('auth.routes integration', () => {
  let app: any;

  beforeAll(async () => {
    await rebuildTestDatabase();
    app = createApp();
  });

  beforeEach(async () => {
    await clearTestData();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/auth/register', () => {
    it('registers a new user with valid data', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      expect(res.status).toBe(201);
      expect(res.body).toHaveProperty('user');
      expect(res.body.user.email).toBe(testEmail);
    });

    it('rejects invalid email', async () => {
      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'invalid',
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      expect(res.status).toBe(400);
    });

    it('rejects duplicate email', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      const res = await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser2',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      expect(res.status).toBe(409);
    });
  });

  describe('POST /api/auth/login', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });
    });

    it('logs in with valid credentials', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'Passw0rd!123',
        });

      expect(res.status).toBe(200);
      expect(res.body.user.email).toBe(testEmail);
      expect(res.headers['set-cookie']?.some((cookie: string) => cookie.startsWith('access_token='))).toBe(true);
      expect(res.headers['set-cookie']?.some((cookie: string) => cookie.startsWith('refresh_token='))).toBe(true);
    });

    it('rejects invalid password', async () => {
      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: testEmail,
          password: 'WrongPassw0rd!123',
        });

      expect(res.status).toBe(401);
    });

    it('rejects disabled users before issuing cookies', async () => {
      const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
      await prisma.user.update({ where: { id: user.id }, data: { disabled: true } });

      const res = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Passw0rd!123' });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe('ACCOUNT_DISABLED');
      expect(res.headers['set-cookie']).toBeUndefined();
    });
  });

  describe('session lifecycle', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });
    });

    it('rotates refresh tokens and rejects replay of the old token', async () => {
      const agent = request.agent(app);
      const login = await agent
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Passw0rd!123' });

      expect(login.status).toBe(200);
      const firstRefreshCookie = login.headers['set-cookie']
        ?.find((cookie: string) => cookie.startsWith('refresh_token='));
      expect(firstRefreshCookie).toBeTruthy();
      const firstRefreshToken = firstRefreshCookie!.split(';')[0]!.replace('refresh_token=', '');

      const refresh = await agent
        .post('/api/auth/refresh')
        .send({ refresh_token: firstRefreshToken });

      expect(refresh.status).toBe(200);
      expect(refresh.body.refresh_token).toBeTruthy();
      expect(refresh.body.refresh_token).not.toBe(firstRefreshToken);

      const replay = await request(app)
        .post('/api/auth/refresh')
        .send({ refresh_token: firstRefreshToken });

      expect(replay.status).toBe(401);
      expect(replay.body.error.code).toBe('TOKEN_REVOKED');
    });

    it('logout-all revokes every active refresh token for the user', async () => {
      const agentA = request.agent(app);
      const agentB = request.agent(app);

      await agentA.post('/api/auth/login').send({ email: testEmail, password: 'Passw0rd!123' }).expect(200);
      await agentB.post('/api/auth/login').send({ email: testEmail, password: 'Passw0rd!123' }).expect(200);

      const before = await prisma.refreshToken.findMany({
        where: { user: { email: testEmail }, is_revoked: false },
      });
      expect(before.length).toBeGreaterThanOrEqual(2);

      await agentA.post('/api/auth/logout/all').send({}).expect(204);

      const after = await prisma.refreshToken.findMany({
        where: { user: { email: testEmail }, is_revoked: false },
      });
      expect(after).toHaveLength(0);
    });
  });

  describe('two-factor authentication', () => {
    beforeEach(async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });
    });

    it('enables 2FA, requires the second factor at login, consumes backup codes once, and disables 2FA', async () => {
      const setupAgent = request.agent(app);
      await setupAgent.post('/api/auth/login').send({ email: testEmail, password: 'Passw0rd!123' }).expect(200);

      const enable = await setupAgent
        .post('/api/auth/2fa/enable')
        .send({ password: 'Passw0rd!123' });

      expect(enable.status).toBe(200);
      expect(enable.body.secret).toBeTruthy();
      expect(enable.body.backup_codes).toHaveLength(10);

      const verifyCode = authenticator.generate(enable.body.secret);
      const verify = await setupAgent
        .post('/api/auth/2fa/verify')
        .send({ code: verifyCode });

      expect(verify.status).toBe(200);
      expect(verify.body.two_factor_enabled).toBe(true);

      const passwordOnlyLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Passw0rd!123' });

      expect(passwordOnlyLogin.status).toBe(200);
      expect(passwordOnlyLogin.body.two_factor_required).toBe(true);
      expect(passwordOnlyLogin.headers['set-cookie']).toBeUndefined();

      const badSecondFactor = await request(app)
        .post('/api/auth/2fa/login')
        .send({ partial_token: passwordOnlyLogin.body.partial_token, code: '000000' });

      expect(badSecondFactor.status).toBe(401);
      expect(badSecondFactor.body.error.code).toBe('INVALID_2FA_CODE');

      const backupCode = enable.body.backup_codes[0];
      const backupLogin = await request(app)
        .post('/api/auth/2fa/login')
        .send({ partial_token: passwordOnlyLogin.body.partial_token, code: backupCode });

      expect(backupLogin.status).toBe(200);
      expect(backupLogin.body.user.email).toBe(testEmail);
      expect(backupLogin.headers['set-cookie']?.some((cookie: string) => cookie.startsWith('access_token='))).toBe(true);

      const replayBackup = await request(app)
        .post('/api/auth/2fa/login')
        .send({ partial_token: passwordOnlyLogin.body.partial_token, code: backupCode });

      expect(replayBackup.status).toBe(401);

      const disableCode = authenticator.generate(enable.body.secret);
      const disable = await setupAgent
        .post('/api/auth/2fa/disable')
        .send({ password: 'Passw0rd!123', code: disableCode });

      expect(disable.status).toBe(200);
      expect(disable.body.two_factor_enabled).toBe(false);
    });
  });

  describe('password reset and email verification', () => {
    it('does not leak unknown emails and resets a known user password with the issued token', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      const unknown = await request(app)
        .post('/api/auth/password/reset-request')
        .send({ email: 'missing-user@opencord.test' });
      expect(unknown.status).toBe(200);
      expect(unknown.body.message).toBe('reset_email_sent');

      const known = await request(app)
        .post('/api/auth/password/reset-request')
        .send({ email: testEmail });
      expect(known.status).toBe(200);
      expect(known.body.message).toBe('reset_email_sent');

      const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
      expect(user.password_reset_token).toBeTruthy();

      const reset = await request(app)
        .post('/api/auth/password/reset')
        .send({ token: user.password_reset_token, password: 'NewPassw0rd!123' });
      expect(reset.status).toBe(200);
      expect(reset.body.message).toBe('password_reset_success');

      const oldLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'Passw0rd!123' });
      expect(oldLogin.status).toBe(401);

      const newLogin = await request(app)
        .post('/api/auth/login')
        .send({ email: testEmail, password: 'NewPassw0rd!123' });
      expect(newLogin.status).toBe(200);
    });

    it('verifies email tokens once and clears the token', async () => {
      await request(app)
        .post('/api/auth/register')
        .send({
          email: testEmail,
          username: 'testuser',
          password: 'Passw0rd!123',
          date_of_birth: '2000-01-01',
        });

      const user = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
      expect(user.verified).toBe(false);
      expect(user.email_verify_token).toBeTruthy();

      const verify = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: user.email_verify_token });
      expect(verify.status).toBe(200);
      expect(verify.body.message).toBe('email_verified');

      const updated = await prisma.user.findUniqueOrThrow({ where: { email: testEmail } });
      expect(updated.verified).toBe(true);
      expect(updated.email_verify_token).toBeNull();

      const replay = await request(app)
        .post('/api/auth/verify-email')
        .send({ token: user.email_verify_token });
      expect(replay.status).toBe(400);
      expect(replay.body.error.code).toBe('INVALID_TOKEN');
    });
  });
});
