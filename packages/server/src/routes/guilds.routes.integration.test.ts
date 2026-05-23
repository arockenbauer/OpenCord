import { describe, expect, it, beforeAll, afterAll, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../index.js';
import { prisma } from '../utils/prisma.js';

describe('guilds.routes integration', () => {
  let app: any;
  let accessToken: string;
  let userId: string;

  beforeAll(() => {
    app = createApp();
  });

  beforeEach(async () => {
    await prisma.user.deleteMany({ where: { email: { contains: 'test' } } });
    await prisma.guild.deleteMany({ where: { name: { contains: 'Test Guild' } } });

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
    userId = reg.body.user.id;
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe('POST /api/guilds', () => {
    it('creates a guild', async () => {
      const res = await request(app)
        .post('/api/guilds')
        .set('Authorization', `Bearer ${accessToken}`)
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
      const createRes = await request(app)
        .post('/api/guilds')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Guild' });

      const guildId = createRes.body.id;

      const res = await request(app)
        .get(`/api/guilds/${guildId}`)
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(guildId);
    });
  });

  describe('GET /api/users/@me/guilds', () => {
    it('lists user guilds', async () => {
      await request(app)
        .post('/api/guilds')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({ name: 'Test Guild' });

      const res = await request(app)
        .get('/api/users/@me/guilds')
        .set('Authorization', `Bearer ${accessToken}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });
  });
});
