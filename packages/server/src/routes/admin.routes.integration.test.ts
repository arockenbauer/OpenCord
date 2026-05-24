import request, { type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { clearTestData, rebuildTestDatabase, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { prisma } from '../utils/prisma.js';

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<string> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status).toBe(200);
  const refreshCookie = response.headers['set-cookie']
    ?.find((cookie: string) => cookie.startsWith('refresh_token='));
  expect(refreshCookie).toBeTruthy();
  return refreshCookie!.split(';')[0]!.replace('refresh_token=', '');
}

describe('admin.routes integration', () => {
  let scenario: SmokeScenario;
  let userAgent: SuperAgentTest;
  let adminAgent: SuperAgentTest;
  let userRefreshToken: string;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    userAgent = request.agent(app);
    adminAgent = request.agent(app);
    userRefreshToken = await loginAs(userAgent, scenario.user);
    await loginAs(adminAgent, scenario.admin);
  });

  it('rejects non-admin access and returns stats/users from real seeded data for admins', async () => {
    const rejected = await userAgent.get('/api/admin/stats');
    expect(rejected.status).toBe(403);
    expect(rejected.body.error.code).toBe('FORBIDDEN');

    const stats = await adminAgent.get('/api/admin/stats');
    expect(stats.status).toBe(200);
    expect(stats.body.total_users).toBe(3);
    expect(stats.body.total_guilds).toBe(1);
    expect(stats.body.system.node_version).toBe(process.version);

    const users = await adminAgent.get('/api/admin/users?search=smoke&limit=10');
    expect(users.status).toBe(200);
    expect(users.body.total).toBe(2);
    expect(users.body.users).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: scenario.user.id, email: scenario.user.email, guild_count: 1 }),
        expect.objectContaining({ id: scenario.admin.id, email: scenario.admin.email, admin_level: 2 }),
      ]),
    );
  });

  it('persists platform settings updates and records the updater', async () => {
    const update = await adminAgent
      .patch('/api/admin/settings')
      .send({ maintenance_mode: true, default_locale: 'en', message_retention_days: 30 });

    expect(update.status).toBe(200);
    expect(update.body.maintenance_mode).toBe(true);
    expect(update.body.default_locale).toBe('en');
    expect(update.body.message_retention_days).toBe(30);

    const stored = await prisma.platformSettings.findMany({
      where: { key: { in: ['maintenance_mode', 'default_locale', 'message_retention_days'] } },
    });
    expect(stored).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ key: 'maintenance_mode', value: 'true', updated_by: scenario.admin.id }),
        expect.objectContaining({ key: 'default_locale', value: 'en', updated_by: scenario.admin.id }),
        expect.objectContaining({ key: 'message_retention_days', value: '30', updated_by: scenario.admin.id }),
      ]),
    );

    const readBack = await adminAgent.get('/api/admin/settings');
    expect(readBack.status).toBe(200);
    expect(readBack.body).toMatchObject({
      maintenance_mode: true,
      default_locale: 'en',
      message_retention_days: 30,
    });
  });

  it('bans, unbans, disables, enables, and writes admin audit logs for sensitive user actions', async () => {
    const disable = await adminAgent
      .patch(`/api/admin/users/${scenario.user.id}`)
      .send({ disabled: true });
    expect(disable.status).toBe(200);
    expect(disable.body.disabled).toBe(true);
    await expect(prisma.user.findUniqueOrThrow({ where: { id: scenario.user.id } })).resolves.toMatchObject({ disabled: true });

    const enable = await adminAgent
      .patch(`/api/admin/users/${scenario.user.id}`)
      .send({ disabled: false });
    expect(enable.status).toBe(200);
    expect(enable.body.disabled).toBe(false);

    const ban = await adminAgent
      .post(`/api/admin/users/${scenario.user.id}/ban`)
      .send({ reason: 'integration-contract' });
    expect(ban.status).toBe(200);
    expect(ban.body).toMatchObject({
      user_id: scenario.user.id,
      banned: true,
      ban_reason: 'integration-contract',
      banned_by: scenario.admin.id,
    });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: scenario.user.id } })).resolves.toMatchObject({
      banned: true,
      ban_reason: 'integration-contract',
      banned_by: scenario.admin.id,
    });

    const unban = await adminAgent.delete(`/api/admin/users/${scenario.user.id}/ban`);
    expect(unban.status).toBe(200);
    expect(unban.body).toMatchObject({ user_id: scenario.user.id, banned: false });
    await expect(prisma.user.findUniqueOrThrow({ where: { id: scenario.user.id } })).resolves.toMatchObject({
      banned: false,
      ban_reason: null,
      banned_by: null,
    });

    const auditActions = await prisma.adminAuditLog.findMany({
      where: { admin_id: scenario.admin.id, target_id: scenario.user.id },
      select: { action: true, target_type: true },
    });
    expect(auditActions).toEqual(
      expect.arrayContaining([
        { action: 'USER_DISABLE', target_type: 'user' },
        { action: 'USER_ENABLE', target_type: 'user' },
        { action: 'USER_BAN', target_type: 'user' },
        { action: 'USER_UNBAN', target_type: 'user' },
      ]),
    );
  });

  it('force-logs out a user by revoking refresh tokens and blocking refresh reuse', async () => {
    expect(await prisma.refreshToken.count({ where: { user_id: scenario.user.id, is_revoked: false } })).toBe(1);

    const logout = await adminAgent.post(`/api/admin/users/${scenario.user.id}/force-logout`);
    expect(logout.status).toBe(200);
    expect(logout.body.sessions_terminated).toBe(1);
    expect(await prisma.refreshToken.count({ where: { user_id: scenario.user.id, is_revoked: false } })).toBe(0);

    const refresh = await userAgent.post('/api/auth/refresh').send({ refresh_token: userRefreshToken });
    expect(refresh.status).toBe(401);
    expect(refresh.body.error.code).toBe('TOKEN_REVOKED');

    const audit = await prisma.adminAuditLog.findFirst({
      where: { admin_id: scenario.admin.id, target_id: scenario.user.id, action: 'USER_FORCE_LOGOUT' },
    });
    expect(audit).not.toBeNull();
  });
});
