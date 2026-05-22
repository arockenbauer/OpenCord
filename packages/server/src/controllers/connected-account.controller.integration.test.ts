import request from 'supertest';
import { describe, it, beforeAll, beforeEach, expect } from 'vitest';
import app from '../index.js';
import { rebuildTestDatabase, clearTestData, seedSmokeScenario } from '../test/test-db.js';
import { applyServerTestEnv } from '../test/test-env.js';
import { prisma } from '../utils/prisma.js';
import type { SmokeScenario } from '../test/test-db.js';

// Helper to login and return an agent
async function loginAs(agent: any, account: { email: string; password: string }) {
  const res = await agent.post('/api/auth/login').send({ email: account.email, password: account.password });
  expect(res.status).toBe(200);
}

describe('Connected Account API', () => {
  let userAgent: any;
  let scenario: SmokeScenario;

  beforeAll(async () => {
    applyServerTestEnv();
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    userAgent = request.agent(app);
    await loginAs(userAgent, scenario.user);
  });

  it('GET returns created accounts after POST', async () => {
    // Simulate a connection (ENABLE_FAKE_OAUTH=true)
    process.env.ENABLE_FAKE_OAUTH = 'true';
    const type = 'github';
    const code = 'fakecode123';
    await userAgent.post(`/api/connected-accounts/${type}/callback`).send({ code });
    const res = await userAgent.get('/api/connected-accounts');
    expect(res.status).toBe(200);
    expect(res.body.accounts).toBeInstanceOf(Array);
    expect(res.body.accounts.some((acc: any) => acc.type === type)).toBe(true);
  });

  it('Callback returns 501 if ENABLE_FAKE_OAUTH is not set', async () => {
    process.env.ENABLE_FAKE_OAUTH = 'false';
    const type = 'github';
    const code = 'fakecode123';
    const res = await userAgent.post(`/api/connected-accounts/${type}/callback`).send({ code });
    expect(res.status).toBe(501);
    const errorMsg = res.body?.error?.message || res.body?.message || JSON.stringify(res.body);
    expect(errorMsg).toMatch(/not (implemented|configured)/i);
  });

  it('Callback simulates account and persists it if ENABLE_FAKE_OAUTH is true', async () => {
    applyServerTestEnv({ ENABLE_FAKE_OAUTH: 'true' });
    const type = 'github';
    const code = 'fakecode123';
    const res = await userAgent.post(`/api/connected-accounts/${type}/callback`).send({ code });
    expect(res.status).toBe(200);
    expect(res.body.simulated).toBe(true);
    expect(res.body.type).toBe(type);
    // Check DB
    const dbAccount = await prisma.connectedAccount.findFirst({ where: { user_id: scenario.user.id, type } });
    expect(dbAccount).not.toBeNull();
    expect(dbAccount?.type).toBe(type);
  });
});
