import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { SuperAgentTest } from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../utils/prisma.js';
import { clearTestData, rebuildTestDatabase } from '../test/test-db.js';

const testEmail = 'guild-user@opencord.test';

describe('guilds.routes integration', () => {
  let app: any;
  let agent: SuperAgentTest;

  beforeAll(async () => {
    await rebuildTestDatabase();
    app = createApp();
  });

  beforeEach(async () => {
    await clearTestData();
    agent = request.agent(app);

    await agent
      .post('/api/auth/register')
      .send({
        email: testEmail,
        username: 'testuser',
        password: 'Passw0rd!123',
        date_of_birth: '2000-01-01',
      });

    const login = await agent
      .post('/api/auth/login')
      .send({ email: testEmail, password: 'Passw0rd!123' });

    expect(login.status).toBe(200);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/guilds', () => {
    it('creates a guild', async () => {
      const res = await agent
        .post('/api/guilds')
        .send({ name: 'Test Guild' });

      expect(res.status).toBe(201);
      expect(res.body.name).toBe('Test Guild');
    });

    it('requires authentication', async () => {
      const res = await request(app)
        .post('/api/guilds')
        .send({ name: 'Test Guild' });

      expect(res.status).toBe(401);
    });
  });

  describe('GET /api/guilds/:guildId', () => {
    it('gets guild by id', async () => {
      const createRes = await agent
        .post('/api/guilds')
        .send({ name: 'Test Guild' });

      const guildId = createRes.body.id;

      const res = await agent.get(`/api/guilds/${guildId}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(guildId);
    });
  });

  describe('GET /api/users/@me/guilds', () => {
    it('lists user guilds', async () => {
      await agent
        .post('/api/guilds')
        .send({ name: 'Test Guild' });

      const res = await agent.get('/api/users/@me/guilds');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.guilds)).toBe(true);
      expect(res.body.guilds.some((guild: any) => guild.name === 'Test Guild')).toBe(true);
    });
  });
});
