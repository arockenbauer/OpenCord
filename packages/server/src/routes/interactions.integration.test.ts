import bcrypt from 'bcrypt';
import crypto from 'crypto';
import request from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { prisma } from '../utils/prisma.js';
import { clearTestData, rebuildTestDatabase, seedSmokeScenario, type SmokeScenario } from '../test/test-db.js';
import { applyServerTestEnv } from '../test/test-env.js';

interface SeededBotApp {
  appId: string;
  botId: string;
  botToken: string;
}

function buildId(prefix: string): string {
  return `${prefix}_${crypto.randomUUID().replace(/-/g, '')}`;
}

async function seedBotApplication(scenario: SmokeScenario): Promise<SeededBotApp> {
  applyServerTestEnv();

  const botId = buildId('bot');
  const appId = buildId('app');
  const botIdB64 = Buffer.from(botId).toString('base64url');
  const timestampB64 = Buffer.from(Date.now().toString()).toString('base64url');
  const hmac = crypto.createHmac('sha256', process.env.BOT_SECRET || 'opencord_dev_bot_secret')
    .update(`${botIdB64}.${timestampB64}`)
    .digest('base64url');
  const botToken = `${botIdB64}.${timestampB64}.${hmac}`;

  await prisma.user.create({
    data: {
      id: botId,
      email: `${botId}@opencord.test`,
      username: 'specbot',
      discriminator: '0000',
      password_hash: 'bot-password-hash',
      date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
      verified: true,
      locale: 'fr',
      theme: 'dark',
      allow_dms_from: 'everyone',
      bot: true,
      bot_token: await bcrypt.hash(botToken, 10),
      bot_owner_id: scenario.admin.id,
    },
  });

  await prisma.application.create({
    data: {
      id: appId,
      name: 'Spec Bot',
      owner_id: scenario.admin.id,
      bot_id: botId,
    },
  });

  await prisma.guildMember.create({
    data: {
      guild_id: scenario.guildId,
      user_id: botId,
      nickname: 'Spec Bot',
    },
  });

  return { appId, botId, botToken };
}

async function seedInteraction(
  scenario: SmokeScenario,
  appId: string,
  options?: {
    type?: number;
    data?: Record<string, unknown>;
    createdAt?: Date;
    token?: string;
  },
) {
  const interactionId = buildId('interaction');
  const interactionToken = options?.token || buildId('token');

  await prisma.interaction.create({
    data: {
      id: interactionId,
      application_id: appId,
      type: options?.type ?? 2,
      guild_id: scenario.guildId,
      channel_id: scenario.channelId,
      user_id: scenario.user.id,
      token: interactionToken,
      data: options?.data ? JSON.stringify(options.data) : null,
      created_at: options?.createdAt ?? new Date(),
    },
  });

  return { interactionId, interactionToken };
}

async function seedTargetMessage(scenario: SmokeScenario, appId?: string) {
  const messageId = buildId('message');

  await prisma.message.create({
    data: {
      id: messageId,
      channel_id: scenario.channelId,
      author_id: scenario.admin.id,
      content: 'Initial content',
      type: 0,
      application_id: appId || null,
    },
  });

  return messageId;
}

function botAuthHeader(botToken: string): Record<string, string> {
  return { Authorization: `Bot ${botToken}` };
}

describe('interaction deferred responses', () => {
  let scenario: SmokeScenario;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
  });

  it('creates and later edits the original response for deferred channel messages', async () => {
    const botApp = await seedBotApplication(scenario);
    const interaction = await seedInteraction(scenario, botApp.appId);

    const callbackResponse = await request(app)
      .post(`/api/interactions/${interaction.interactionId}/${interaction.interactionToken}/callback`)
      .set(botAuthHeader(botApp.botToken))
      .send({ type: 5 });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body.type).toBe(5);

    const storedInteraction = await prisma.interaction.findUnique({ where: { id: interaction.interactionId } });
    expect(storedInteraction?.responded).toBe(true);
    expect(storedInteraction?.response_type).toBe(5);
    expect(storedInteraction?.original_message_id).toBeTruthy();

    const placeholder = await prisma.message.findUnique({ where: { id: storedInteraction!.original_message_id! } });
    expect(placeholder?.author_id).toBe(botApp.botId);
    expect(placeholder?.flags).toBe(64);
    expect(placeholder?.content).toBe('Le bot repond...');

    const getOriginalResponse = await request(app)
      .get(`/api/webhooks/${botApp.appId}/${interaction.interactionToken}/messages/@original`)
      .set(botAuthHeader(botApp.botToken));

    expect(getOriginalResponse.status).toBe(200);
    expect(getOriginalResponse.body.id).toBe(storedInteraction?.original_message_id);

    const editResponse = await request(app)
      .patch(`/api/webhooks/${botApp.appId}/${interaction.interactionToken}/messages/@original`)
      .set(botAuthHeader(botApp.botToken))
      .send({ content: 'Done processing' });

    expect(editResponse.status).toBe(200);
    expect(editResponse.body.content).toBe('Done processing');
    expect(editResponse.body.flags).toBe(0);
  });

  it('stores the target message and updates it after a deferred component response', async () => {
    const botApp = await seedBotApplication(scenario);
    const targetMessageId = await seedTargetMessage(scenario, botApp.appId);
    const interaction = await seedInteraction(scenario, botApp.appId, {
      type: 3,
      data: { message_id: targetMessageId, custom_id: 'btn-1' },
    });
    const beforeCount = await prisma.message.count();

    const callbackResponse = await request(app)
      .post(`/api/interactions/${interaction.interactionId}/${interaction.interactionToken}/callback`)
      .set(botAuthHeader(botApp.botToken))
      .send({ type: 6 });

    expect(callbackResponse.status).toBe(200);
    expect(callbackResponse.body.type).toBe(6);

    const afterCallback = await prisma.interaction.findUnique({ where: { id: interaction.interactionId } });
    expect(afterCallback?.response_type).toBe(6);
    expect(afterCallback?.original_message_id).toBe(targetMessageId);
    expect(await prisma.message.count()).toBe(beforeCount);

    const editResponse = await request(app)
      .patch(`/api/webhooks/${botApp.appId}/${interaction.interactionToken}/messages/@original`)
      .set(botAuthHeader(botApp.botToken))
      .send({ content: 'Updated by deferred response' });

    expect(editResponse.status).toBe(200);
    expect(editResponse.body.id).toBe(targetMessageId);
    expect(editResponse.body.content).toBe('Updated by deferred response');
  });

  it('uses the bot user as the follow-up message author', async () => {
    const botApp = await seedBotApplication(scenario);
    const interaction = await seedInteraction(scenario, botApp.appId);

    const followUpResponse = await request(app)
      .post(`/api/webhooks/${botApp.appId}/${interaction.interactionToken}`)
      .set(botAuthHeader(botApp.botToken))
      .send({ content: 'Follow-up response' });

    expect(followUpResponse.status).toBe(201);
    expect(followUpResponse.body.author.id).toBe(botApp.botId);
    expect(followUpResponse.body.content).toBe('Follow-up response');
  });

  it('rejects expired interaction tokens on original response endpoints', async () => {
    const botApp = await seedBotApplication(scenario);
    const targetMessageId = await seedTargetMessage(scenario, botApp.appId);
    const interaction = await seedInteraction(scenario, botApp.appId, {
      createdAt: new Date(Date.now() - (16 * 60 * 1000)),
    });

    await prisma.interaction.update({
      where: { id: interaction.interactionId },
      data: {
        responded: true,
        response_type: 5,
        original_message_id: targetMessageId,
      },
    });

    const response = await request(app)
      .get(`/api/webhooks/${botApp.appId}/${interaction.interactionToken}/messages/@original`)
      .set(botAuthHeader(botApp.botToken));

    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('INTERACTION_EXPIRED');
  });
});
