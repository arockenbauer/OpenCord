import request, { type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_EVERYONE_PERMISSIONS, PERMISSION_BITS } from '@opencord/shared';
import app from '../index.js';
import { clearTestData, rebuildTestDatabase, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { prisma } from '../utils/prisma.js';

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<void> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status).toBe(200);
}

async function seedEveryoneRole(scenario: SmokeScenario): Promise<string> {
  const roleId = `${scenario.guildId}:everyone`;
  await prisma.role.create({
    data: {
      id: roleId,
      guild_id: scenario.guildId,
      name: '@everyone',
      position: 0,
      permissions: DEFAULT_EVERYONE_PERMISSIONS,
    },
  });
  return roleId;
}

describe('voice and permission routes', () => {
  let scenario: SmokeScenario;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
  });

  it('updates and deletes permission overwrites by overwrite id', async () => {
    const agent = request.agent(app);
    await loginAs(agent, scenario.admin);
    const everyoneRoleId = await seedEveryoneRole(scenario);

    const overwrite = await prisma.permissionOverwrite.create({
      data: {
        id: 'overwrite-id-1',
        channel_id: scenario.channelId,
        target_id: everyoneRoleId,
        target_type: 'role',
        allow: 0n,
        deny: PERMISSION_BITS.SEND_MESSAGES,
      },
    });

    const patch = await agent
      .patch(`/api/channels/${scenario.channelId}/permissions/${overwrite.id}`)
      .send({ allow: PERMISSION_BITS.SEND_MESSAGES.toString(), deny: '0' });

    expect(patch.status).toBe(200);
    expect(patch.body.id).toBe(overwrite.id);
    expect(patch.body.target_id).toBe(everyoneRoleId);
    expect(patch.body.allow).toBe(PERMISSION_BITS.SEND_MESSAGES.toString());
    expect(await prisma.permissionOverwrite.count({ where: { channel_id: scenario.channelId } })).toBe(1);

    const del = await agent.delete(`/api/channels/${scenario.channelId}/permissions/${overwrite.id}`);
    expect(del.status).toBe(204);
    expect(await prisma.permissionOverwrite.count({ where: { channel_id: scenario.channelId } })).toBe(0);
  });

  it('serializes role permissions and keeps hierarchy route reachable', async () => {
    const agent = request.agent(app);
    await loginAs(agent, scenario.admin);
    await seedEveryoneRole(scenario);

    const create = await agent
      .post(`/api/guilds/${scenario.guildId}/roles`)
      .send({ name: 'QA Role', permissions: PERMISSION_BITS.SEND_MESSAGES.toString() });

    expect(create.status).toBe(201);
    expect(create.body.permissions).toBe(PERMISSION_BITS.SEND_MESSAGES.toString());

    const update = await agent
      .patch(`/api/guilds/${scenario.guildId}/roles/${create.body.id}`)
      .send({
        name: 'QA Role Updated',
        permissions: (PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.CONNECT).toString(),
        mentionable: true,
      });

    expect(update.status).toBe(200);
    expect(update.body.name).toBe('QA Role Updated');
    expect(update.body.permissions).toBe((PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.CONNECT).toString());

    const hierarchy = await agent.get(`/api/guilds/${scenario.guildId}/roles/hierarchy`);
    expect(hierarchy.status).toBe(200);
    expect(hierarchy.body.roles.some((role: any) => role.id === create.body.id)).toBe(true);
  });

  it('joins voice with CONNECT permission and enforces user limit', async () => {
    const userAgent = request.agent(app);
    const adminAgent = request.agent(app);
    await loginAs(userAgent, scenario.user);
    await loginAs(adminAgent, scenario.admin);
    await seedEveryoneRole(scenario);

    const voiceChannel = await prisma.channel.create({
      data: {
        id: 'voice-channel-1',
        guild_id: scenario.guildId,
        name: 'Vocal',
        type: 2,
        user_limit: 1,
      },
    });

    const join = await userAgent
      .patch(`/api/guilds/${scenario.guildId}/voice-states/@me`)
      .send({ channel_id: voiceChannel.id });

    expect(join.status).toBe(200);
    expect(join.body.voice_state.channel_id).toBe(voiceChannel.id);

    const blocked = await adminAgent
      .patch(`/api/guilds/${scenario.guildId}/voice-states/@me`)
      .send({ channel_id: voiceChannel.id });

    expect(blocked.status).toBe(403);
    expect(blocked.body.error.code).toBe('VOICE_CHANNEL_FULL');
  });
});
