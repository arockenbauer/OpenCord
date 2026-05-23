import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../utils/prisma.js';

describe('users.routes integration', () => {
  let app: any;
  let accessToken: string;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });

    const reg = await request(app)
      .post('/api/auth/register')
      .send({
        email: '[EMAIL]',
        username: 'testuser',
        password: 'Passw0rd!123',
        date_of_birth: '2000-01-01',
      });

    const login = await request(app)
      .post('/api/auth/login')
      .send({ email: '[EMAIL]', password: 'Passw0rd!123' });

    accessToken = login.body.accessToken;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('GET /api/users/@me', () => {
    it('returns current user with valid token', async () => {
      const res = await request(app)
        .get('/api/users/@me')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.email).toBe('[EMAIL]');
    });

    it('returns 401 without token', async () => {
      const res = await request(app).get('/api/users/@me');
      expect(res.status).toBe(401);
    });
  });

  describe('PATCH /api/users/@me', () => {
    it('updates user profile', async () => {
      const res = await request(app)
        .patch('/api/users/@me')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ global_name: 'New Name', bio: 'Hello world' });

      expect(res.status).toBe(200);
      expect(res.body.global_name).toBe('New Name');
    });
  });

  describe('GET /api/users/:userId', () => {
    it('gets public user profile', async () => {
      const me = await request(app)
        .get('/api/users/@me')
        .set('Authorization', `Bearer ${accessToken}`);

      const res = await request(app)
        .get(`/api/users/${me.body.id}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(me.body.id);
    });
  });
});
