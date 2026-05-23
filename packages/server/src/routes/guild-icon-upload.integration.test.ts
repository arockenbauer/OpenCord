import fs from 'fs';
import path from 'path';
import request, { type SuperAgentTest } from 'supertest';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import app from '../index.js';
import { prisma } from '../utils/prisma.js';
import { rebuildTestDatabase, clearTestData, seedSmokeScenario, type SeededAccount, type SmokeScenario } from '../test/test-db.js';
import { defaultVitestUploadsDir } from '../test/test-env.js';

const png1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=',
  'base64',
);

async function loginAs(agent: SuperAgentTest, account: SeededAccount): Promise<void> {
  const response = await agent
    .post('/api/auth/login')
    .send({ email: account.email, password: account.password });

  expect(response.status).toBe(200);
}

describe('guild icon uploads', () => {
  let scenario: SmokeScenario;
  let agent: SuperAgentTest;

  beforeAll(async () => {
    await rebuildTestDatabase();
  });

  beforeEach(async () => {
    await clearTestData();
    scenario = await seedSmokeScenario();
    agent = request.agent(app);
    await loginAs(agent, scenario.admin);
  });

  it('updates the guild icon when the multipart field is icon', async () => {
    const response = await agent
      .patch(`/api/guilds/${scenario.guildId}/icon`)
      .attach('icon', png1x1, { filename: 'icon.png', contentType: 'image/png' });

    expect(response.status).toBe(200);
    expect(response.body.icon).toMatch(new RegExp(`^/files/guild-icons/${scenario.guildId}/[a-f0-9]{32}_128\\.webp$`));

    const guild = await prisma.guild.findUnique({
      where: { id: scenario.guildId },
      select: { icon: true, icon_hash: true },
    });

    expect(guild?.icon).toBe(response.body.icon);
    expect(guild?.icon_hash).toMatch(/^[a-f0-9]{32}$/);

    const iconDir = path.join(defaultVitestUploadsDir, 'guild-icons', scenario.guildId);
    expect(fs.existsSync(path.join(iconDir, `${guild?.icon_hash}_128.webp`))).toBe(true);
    expect(fs.existsSync(path.join(iconDir, `${guild?.icon_hash}_256.webp`))).toBe(true);
  });

  it('returns a client error instead of 500 when the multipart field is unexpected', async () => {
    const response = await agent
      .patch(`/api/guilds/${scenario.guildId}/icon`)
      .attach('file', png1x1, { filename: 'icon.png', contentType: 'image/png' });

    expect(response.status).toBe(400);
    expect(response.body.error).toEqual({
      code: 'UNEXPECTED_FILE_FIELD',
      message: 'Unexpected file field: file',
    });
  });
});
