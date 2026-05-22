import bcrypt from 'bcrypt';
import request from 'supertest';
import { randomUUID } from 'crypto';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { applyServerTestEnv } from '../test/test-env.js';
import { rebuildTestDatabase, clearTestData, seedSmokeScenario, TEST_PASSWORD } from '../test/test-db.js';
import { prisma } from '../utils/prisma.js';
import * as oauth2Service from '../services/oauth2.service.js';
import type { SmokeScenario } from '../test/test-db.js';

function makeId(prefix: string) {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

async function loginAs(agent: any, account: { email: string; password: string }) {
  const res = await agent.post('/api/auth/login').send({ email: account.email, password: account.password });
  expect(res.status).toBe(200);
}

describe('Users routes auth interoperability', () => {
  let scenario: SmokeScenario;
  let userAgent: any;
  let oauthAppId: string;
  let joinUserId: string;
  const redirectUri = 'https://opencord.test/oauth/callback';

  beforeAll(async () => {
    applyServerTestEnv();
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    userAgent = request.agent(app);
    await loginAs(userAgent, scenario.user);

    const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
    joinUserId = makeId('oauth_user');
    const botUserId = makeId('oauth_bot');
    oauthAppId = makeId('oauth_app');

    await prisma.user.create({
      data: {
        id: joinUserId,
        email: 'oauth-join@opencord.test',
        username: 'oauthjoin',
        discriminator: '2002',
        password_hash: passwordHash,
        date_of_birth: new Date('1992-02-02T00:00:00.000Z'),
        verified: true,
        locale: 'fr',
        theme: 'dark',
        allow_dms_from: 'everyone',
      },
    });

    await prisma.user.create({
      data: {
        id: botUserId,
        email: `bot-${Date.now()}@example.com`,
        username: 'oauth-bot',
        discriminator: '9999',
        password_hash: passwordHash,
        date_of_birth: new Date('1991-01-01T00:00:00.000Z'),
        verified: true,
        bot: true,
        bot_owner_id: scenario.admin.id,
        application_id: oauthAppId,
        locale: 'fr',
        theme: 'dark',
        allow_dms_from: 'everyone',
      },
    });

    await prisma.application.create({
      data: {
        id: oauthAppId,
        name: 'OAuth Test App',
        description: 'OAuth test application',
        owner_id: scenario.admin.id,
        bot_id: botUserId,
        redirect_uris: JSON.stringify([redirectUri]),
        scopes_allowed: JSON.stringify(['identify', 'email', 'guilds', 'guilds.members.read', 'guilds.join']),
      },
    });

    await prisma.guildMember.create({
      data: {
        guild_id: scenario.guildId,
        user_id: botUserId,
      },
    });
  });

  async function issueAccessToken(userId: string, scopes: string[]) {
    const code = await oauth2Service.createAuthorizationCode(oauthAppId, userId, scopes, redirectUri);
    const tokens = await oauth2Service.exchangeCodeForTokens(code, oauthAppId, redirectUri);
    return tokens.token;
  }

  it('returns guilds for logged-in users without an OAuth2 bearer token', async () => {
    const res = await userAgent.get('/api/users/@me/guilds');
    expect(res.status).toBe(200);
    expect(res.body.guilds).toEqual(expect.arrayContaining([
      expect.objectContaining({
        id: scenario.guildId,
        name: 'Smoke Guild',
        owner: false,
      }),
    ]));
    expect(res.body.guilds[0]?.permissions).toEqual(expect.any(String));
  });

  it('omits email for identify-only OAuth2 tokens and includes it with the email scope', async () => {
    const identifyToken = await issueAccessToken(scenario.user.id, ['identify']);
    const identifyRes = await request(app)
      .get('/api/users/@me')
      .set('Authorization', `Bearer ${identifyToken}`);

    expect(identifyRes.status).toBe(200);
    expect(identifyRes.body.id).toBe(scenario.user.id);
    expect(identifyRes.body.email).toBeUndefined();

    const emailToken = await issueAccessToken(scenario.user.id, ['identify', 'email']);
    const emailRes = await request(app)
      .get('/api/users/@me')
      .set('Authorization', `Bearer ${emailToken}`);

    expect(emailRes.status).toBe(200);
    expect(emailRes.body.email).toBe(scenario.user.email);
  });

  it('returns guilds and current member details for OAuth2 guild scopes', async () => {
    const token = await issueAccessToken(scenario.user.id, ['guilds', 'guilds.members.read']);

    const guildsRes = await request(app)
      .get('/api/users/@me/guilds')
      .set('Authorization', `Bearer ${token}`);
    expect(guildsRes.status).toBe(200);
    expect(guildsRes.body.guilds).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: scenario.guildId }),
    ]));

    const memberRes = await request(app)
      .get(`/api/users/@me/guilds/${scenario.guildId}/member`)
      .set('Authorization', `Bearer ${token}`);
    expect(memberRes.status).toBe(200);
    expect(memberRes.body.user.id).toBe(scenario.user.id);
    expect(memberRes.body.roles).toBeInstanceOf(Array);
  });

  it('joins the OAuth2 user to the guild when guilds.join is granted and the app bot is installed', async () => {
    const token = await issueAccessToken(joinUserId, ['guilds.join']);

    const res = await request(app)
      .put(`/api/users/@me/guilds/${scenario.guildId}/member`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(201);
    expect(res.body.user.id).toBe(joinUserId);

    const membership = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: scenario.guildId, user_id: joinUserId } },
    });
    expect(membership).not.toBeNull();
  });
});
