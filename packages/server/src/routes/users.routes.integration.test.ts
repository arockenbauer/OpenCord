import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import type { SuperAgentTest } from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../utils/prisma.js';
import { clearTestData, rebuildTestDatabase } from '../test/test-db.js';

const testEmail = 'profile-user@opencord.test';

describe('users.routes integration', () => {
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

  describe('GET /api/users/@me', () => {
    it('returns current user with valid token', async () => {
      const res = await agent.get('/api/users/@me');

      expect(res.status).toBe(200);
      expect(res.body.email).toBe(testEmail);
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/users/@me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/@me', () => {
    it('updates user profile', async () => {
      const res = await agent
        .patch('/api/users/@me')
        .send({ global_name: 'New Name', bio: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.global_name).toBe('New Name');
    });
  });

  describe('GET /api/users/:userId', () => {
    it('gets public user profile', async () => {
      const me = await agent.get('/api/users/@me');

      const res = await agent.get(`/api/users/${me.body.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(me.body.id);
    });
  });
});
