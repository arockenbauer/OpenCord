import request, { type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { clearTestData, rebuildTestDatabase, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { prisma } from '../utils/prisma.js';

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<void> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status).toBe(200);
}

async function registerAccount(
  username: string,
  email = `${username}@opencord.test`,
): Promise<SeededAccount> {
  const agent = request.agent(app);
  const response = await agent
    .post('/api/auth/register')
    .send({
      email,
      username,
      password: 'Passw0rd!123',
      date_of_birth: '1990-01-01',
    });

  expect(response.status).toBe(201);
  const user = await prisma.user.findUniqueOrThrow({ where: { email } });
  return {
    id: user.id,
    email,
    username: user.username,
    discriminator: user.discriminator,
    password: 'Passw0rd!123',
    adminLevel: user.admin_level,
  };
}

describe('relationships and DM routes integration', () => {
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

  it('creates, accepts, lists, removes, and declines friend relationships with persisted state', async () => {
    const target = await registerAccount('relationshiptarget');
    const targetAgent = request.agent(app);
    await loginAs(targetAgent, target);

    const requestResponse = await userAgent
      .post('/api/relationships')
      .send({ user_id: target.id });
    expect(requestResponse.status).toBe(201);
    expect(requestResponse.body.type).toBe(0);
    expect(requestResponse.body.user.id).toBe(target.id);

    const pending = await prisma.friend.findFirstOrThrow({
      where: { user_id: scenario.user.id, target_id: target.id },
    });
    expect(pending.status).toBe(0);

    const targetRelationships = await targetAgent.get('/api/relationships');
    expect(targetRelationships.status).toBe(200);
    expect(targetRelationships.body.relationships).toContainEqual(
      expect.objectContaining({ id: pending.id, type: 3, user: expect.objectContaining({ id: scenario.user.id }) }),
    );

    const accept = await targetAgent.post(`/api/relationships/accept/${scenario.user.id}`);
    expect(accept.status).toBe(200);
    expect(accept.body.type).toBe(1);
    expect(accept.body.user.id).toBe(scenario.user.id);
    await expect(prisma.friend.findUniqueOrThrow({ where: { id: pending.id } })).resolves.toMatchObject({ status: 1 });

    const remove = await userAgent.delete(`/api/relationships/${target.id}`);
    expect(remove.status).toBe(204);
    expect(await prisma.friend.findUnique({ where: { id: pending.id } })).toBeNull();

    const second = await userAgent.post('/api/relationships').send({ user_id: target.id });
    expect(second.status).toBe(201);
    const decline = await targetAgent.post(`/api/relationships/decline/${scenario.user.id}`);
    expect(decline.status).toBe(204);
    expect(await prisma.friend.count({ where: { user_id: scenario.user.id, target_id: target.id } })).toBe(0);
  });

  it('enforces blocks and recipient privacy before creating DMs', async () => {
    const blocked = await registerAccount('blockedrecipient');
    const blockedAgent = request.agent(app);
    await loginAs(blockedAgent, blocked);

    const block = await blockedAgent.put(`/api/relationships/${scenario.user.id}/block`);
    expect(block.status).toBe(204);
    await expect(
      prisma.friend.findFirstOrThrow({
        where: { user_id: blocked.id, target_id: scenario.user.id, status: 2 },
      }),
    ).resolves.toMatchObject({ status: 2 });

    const blockedDm = await userAgent.post('/api/dms').send({ recipient_id: blocked.id });
    expect(blockedDm.status).toBe(403);
    expect(blockedDm.body.error.code).toBe('BLOCKED');

    const unblock = await blockedAgent.delete(`/api/relationships/${scenario.user.id}/block`);
    expect(unblock.status).toBe(204);

    await prisma.$executeRaw`UPDATE User SET allow_dms_from = 'friends' WHERE id = ${blocked.id}`;
    const friendsOnlyDm = await userAgent.post('/api/dms').send({ recipient_id: blocked.id });
    expect(friendsOnlyDm.status).toBe(403);
    expect(friendsOnlyDm.body.error.code).toBe('DM_FRIENDS_ONLY');

    await prisma.friend.create({
      data: {
        id: 'friend_dm_privacy',
        user_id: scenario.user.id,
        target_id: blocked.id,
        status: 1,
      },
    });

    const allowed = await userAgent.post('/api/dms').send({ recipient_id: blocked.id });
    expect(allowed.status).toBe(201);
    expect(allowed.body.recipients).toContainEqual(expect.objectContaining({ id: blocked.id }));
    expect(await prisma.dMChannelMember.count({ where: { channel_id: allowed.body.id } })).toBe(2);
  });

  it('reuses one-to-one DMs and closes only the requesting member view', async () => {
    const existing = await userAgent.post('/api/dms').send({ recipient_id: scenario.admin.id });
    expect(existing.status).toBe(200);
    expect(existing.body.id).toBe(scenario.dmChannelId);
    expect(existing.body.recipients).toContainEqual(expect.objectContaining({ id: scenario.admin.id }));

    const close = await userAgent.delete(`/api/dms/${scenario.dmChannelId}`);
    expect(close.status).toBe(200);

    const userMembership = await prisma.dMChannelMember.findUniqueOrThrow({
      where: { channel_id_user_id: { channel_id: scenario.dmChannelId, user_id: scenario.user.id } },
    });
    const adminMembership = await prisma.dMChannelMember.findUniqueOrThrow({
      where: { channel_id_user_id: { channel_id: scenario.dmChannelId, user_id: scenario.admin.id } },
    });
    expect(userMembership.closed).toBe(true);
    expect(adminMembership.closed).toBe(false);
  });

  it('enforces group DM ownership for update/add/remove and transfers ownership when owner leaves', async () => {
    const member = await registerAccount('groupmember');
    const outsider = await registerAccount('groupoutsider');
    const memberAgent = request.agent(app);
    await loginAs(memberAgent, member);

    const group = await userAgent
      .post('/api/dms/group')
      .send({ name: 'Project Room', recipient_ids: [scenario.admin.id, member.id] });
    expect(group.status).toBe(201);
    expect(group.body.name).toBe('Project Room');
    expect(group.body.owner_id).toBe(scenario.user.id);
    expect(await prisma.dMChannelMember.count({ where: { channel_id: group.body.id } })).toBe(3);

    const nonOwnerUpdate = await memberAgent.patch(`/api/dms/${group.body.id}`).send({ name: 'Hijacked' });
    expect(nonOwnerUpdate.status).toBe(403);
    expect(nonOwnerUpdate.body.error.code).toBe('FORBIDDEN');

    const ownerUpdate = await userAgent.patch(`/api/dms/${group.body.id}`).send({ name: 'Launch Room' });
    expect(ownerUpdate.status).toBe(200);
    expect(ownerUpdate.body.name).toBe('Launch Room');
    await expect(prisma.dMChannel.findUniqueOrThrow({ where: { id: group.body.id } })).resolves.toMatchObject({ name: 'Launch Room' });
    expect(await prisma.message.count({ where: { channel_id: group.body.id, type: 6 } })).toBe(1);

    const nonOwnerAdd = await memberAgent.put(`/api/dms/${group.body.id}/recipients/${outsider.id}`);
    expect(nonOwnerAdd.status).toBe(403);
    expect(nonOwnerAdd.body.error.code).toBe('FORBIDDEN');

    const ownerAdd = await userAgent.put(`/api/dms/${group.body.id}/recipients/${outsider.id}`);
    expect(ownerAdd.status).toBe(201);
    expect(ownerAdd.body.id).toBe(outsider.id);
    expect(await prisma.dMChannelMember.count({ where: { channel_id: group.body.id } })).toBe(4);

    const ownerRemove = await userAgent.delete(`/api/dms/${group.body.id}/recipients/${outsider.id}`);
    expect(ownerRemove.status).toBe(204);
    expect(await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: group.body.id, user_id: outsider.id } },
    })).toBeNull();

    const leave = await userAgent.delete(`/api/dms/${group.body.id}`);
    expect(leave.status).toBe(204);
    const afterLeave = await prisma.dMChannel.findUniqueOrThrow({ where: { id: group.body.id } });
    expect(afterLeave.owner_id).not.toBe(scenario.user.id);
    expect([scenario.admin.id, member.id]).toContain(afterLeave.owner_id);
    expect(await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: group.body.id, user_id: scenario.user.id } },
    })).toBeNull();
  });
});
