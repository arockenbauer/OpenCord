import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
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
  });
});
