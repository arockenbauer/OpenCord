import request, { type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { PERMISSION_BITS } from '@opencord/shared';
import app from '../index.js';
import { clearTestData, rebuildTestDatabase, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { prisma } from '../utils/prisma.js';

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<void> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status).toBe(200);
}

async function createMessage(agent: SuperAgentTest, channelId: string, content: string) {
  return agent
    .post(`/api/channels/${channelId}/messages`)
    .send({ content });
}

describe('messages.routes integration', () => {
  let scenario: SmokeScenario;
  let userAgent: SuperAgentTest;
  let adminAgent: SuperAgentTest;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    userAgent = request.agent(app);
    adminAgent = request.agent(app);
    await loginAs(userAgent, scenario.user);
    await loginAs(adminAgent, scenario.admin);
  });

  it('creates, reads, edits, and deletes an owned guild message with DB persistence', async () => {
    const create = await createMessage(userAgent, scenario.channelId, 'Contract message');

    expect(create.status).toBe(201);
    expect(create.body.content).toBe('Contract message');
    expect(create.body.author.id).toBe(scenario.user.id);

    const stored = await prisma.message.findUnique({ where: { id: create.body.id } });
    expect(stored?.content).toBe('Contract message');
    expect(stored?.channel_id).toBe(scenario.channelId);

    const list = await userAgent.get(`/api/channels/${scenario.channelId}/messages?limit=10`);
    expect(list.status).toBe(200);
    expect(list.body.messages.some((message: any) => message.id === create.body.id)).toBe(true);

    const get = await userAgent.get(`/api/channels/${scenario.channelId}/messages/${create.body.id}`);
    expect(get.status).toBe(200);
    expect(get.body.id).toBe(create.body.id);

    const edit = await userAgent
      .patch(`/api/channels/${scenario.channelId}/messages/${create.body.id}`)
      .send({ content: 'Edited contract message' });
    expect(edit.status).toBe(200);
    expect(edit.body.content).toBe('Edited contract message');
    expect(edit.body.edited_at).toBeTruthy();

    const afterEdit = await prisma.message.findUnique({ where: { id: create.body.id } });
    expect(afterEdit?.content).toBe('Edited contract message');
    expect(afterEdit?.edited_at).toBeInstanceOf(Date);

    const del = await userAgent.delete(`/api/channels/${scenario.channelId}/messages/${create.body.id}`);
    expect(del.status).toBe(204);

    const afterDelete = await prisma.message.findUnique({ where: { id: create.body.id } });
    expect(afterDelete).toBeNull();
  });

  it('prevents editing and deleting another member message without manage permission', async () => {
    const create = await createMessage(adminAgent, scenario.channelId, 'Do not mutate me');
    expect(create.status).toBe(201);

    const edit = await userAgent
      .patch(`/api/channels/${scenario.channelId}/messages/${create.body.id}`)
      .send({ content: 'Member edit attempt' });
    expect(edit.status).toBe(403);
    expect(edit.body.error.code).toBe('FORBIDDEN');

    const del = await userAgent.delete(`/api/channels/${scenario.channelId}/messages/${create.body.id}`);
    expect(del.status).toBe(403);
    expect(del.body.error.code).toBe('MISSING_PERMISSIONS');

    const stored = await prisma.message.findUnique({ where: { id: create.body.id } });
    expect(stored?.content).toBe('Do not mutate me');
  });

  it('enforces channel SEND_MESSAGES deny overwrites for normal members', async () => {
    const everyoneRole = await prisma.role.findFirstOrThrow({
      where: { guild_id: scenario.guildId, name: '@everyone' },
    });

    await prisma.permissionOverwrite.create({
      data: {
        id: 'deny-send-messages',
        channel_id: scenario.channelId,
        target_id: everyoneRole.id,
        target_type: 'role',
        allow: 0n,
        deny: PERMISSION_BITS.SEND_MESSAGES,
      },
    });

    const denied = await createMessage(userAgent, scenario.channelId, 'Denied by overwrite');
    expect(denied.status).toBe(403);
    expect(denied.body.error.code).toBe('MISSING_PERMISSIONS');

    const adminAllowed = await createMessage(adminAgent, scenario.channelId, 'Owner bypasses overwrite');
    expect(adminAllowed.status).toBe(201);
    expect(adminAllowed.body.content).toBe('Owner bypasses overwrite');
  });

  it('persists pins, reactions, ack state, and removes reaction rows when count reaches zero', async () => {
    const create = await createMessage(userAgent, scenario.channelId, 'Interactive message');
    expect(create.status).toBe(201);

    const pin = await adminAgent.put(`/api/channels/${scenario.channelId}/messages/${create.body.id}/pins`);
    expect(pin.status).toBe(204);
    expect(await prisma.pin.count({ where: { message_id: create.body.id } })).toBe(1);

    const pins = await userAgent.get(`/api/channels/${scenario.channelId}/messages/pins`);
    expect(pins.status).toBe(200);
    expect(pins.body.messages.some((message: any) => message.id === create.body.id)).toBe(true);

    const react = await userAgent.put(`/api/channels/${scenario.channelId}/messages/${create.body.id}/reactions/%F0%9F%91%8D/@me`);
    expect(react.status).toBe(204);
    expect(await prisma.reaction.count({ where: { message_id: create.body.id, emoji_name: '👍' } })).toBe(1);

    const ack = await userAgent.post(`/api/channels/${scenario.channelId}/messages/${create.body.id}/ack`);
    expect(ack.status).toBe(204);
    const readState = await prisma.readState.findUnique({
      where: { user_id_channel_id: { channel_id: scenario.channelId, user_id: scenario.user.id } },
    });
    expect(readState?.last_read_message_id).toBe(create.body.id);

    const removeReaction = await userAgent.delete(`/api/channels/${scenario.channelId}/messages/${create.body.id}/reactions/%F0%9F%91%8D/@me`);
    expect(removeReaction.status).toBe(204);
    expect(await prisma.reaction.count({ where: { message_id: create.body.id, emoji_name: '👍' } })).toBe(0);

    const unpin = await adminAgent.delete(`/api/channels/${scenario.channelId}/messages/${create.body.id}/pins`);
    expect(unpin.status).toBe(204);
    expect(await prisma.pin.count({ where: { message_id: create.body.id } })).toBe(0);
  });
});
