import bcrypt from 'bcrypt';
import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { applyServerTestEnv, repositoryRoot, serverRoot } from './test-env.js';

export const TEST_PASSWORD = 'Passw0rd!123';

export interface SeededAccount {
  id: string;
  email: string;
  username: string;
  discriminator: string;
  password: string;
  adminLevel: number;
}

export interface SmokeScenario {
  user: SeededAccount;
  admin: SeededAccount;
  guildId: string;
  channelId: string;
  inviteCode: string;
  dmChannelId: string;
}

function getDatabaseFilePath(): string {
  applyServerTestEnv();
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl?.startsWith('file:')) {
    throw new Error(`Unsupported test database URL: ${databaseUrl ?? 'undefined'}`);
  }

  const dbPath = databaseUrl.slice('file:'.length);
  return path.isAbsolute(dbPath) ? dbPath : path.resolve(serverRoot, dbPath);
}

function getUploadsDir(): string {
  applyServerTestEnv();
  return path.resolve(process.env.UPLOAD_DIR || path.join(repositoryRoot, 'uploads', 'tests-vitest'));
}

function getManagedDirectories(): string[] {
  applyServerTestEnv();
  return [
    getUploadsDir(),
    path.resolve(process.env.BACKUP_DIR || path.join(repositoryRoot, 'exports', 'tests-vitest-backups')),
    path.resolve(process.env.EXPORT_DIR || path.join(repositoryRoot, 'exports', 'tests-vitest-exports')),
  ];
}

function getMigrationPaths(): string[] {
  const migrationsDir = path.join(serverRoot, 'prisma', 'migrations');
  const sqlFiles = fs.readdirSync(migrationsDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .flatMap((entry) => {
      const candidate = path.join(migrationsDir, entry.name, 'migration.sql');
      return fs.existsSync(candidate) ? [candidate] : [];
    })
    .sort();

  if (sqlFiles.length === 0) {
    throw new Error('No Prisma migration.sql file found for test database initialization');
  }

  return sqlFiles;
}

function openDatabase(): Database.Database {
  const dbPath = getDatabaseFilePath();
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  return new Database(dbPath);
}

async function disconnectPrisma(): Promise<void> {
  const { prisma } = await import('../utils/prisma.js');
  await prisma.$disconnect().catch(() => undefined);
}

export async function rebuildTestDatabase(): Promise<void> {
  applyServerTestEnv();
  await disconnectPrisma();

  const dbPath = getDatabaseFilePath();

  for (const suffix of ['', '-wal', '-shm']) {
    const candidate = `${dbPath}${suffix}`;
    if (fs.existsSync(candidate)) {
      fs.rmSync(candidate, { force: true });
    }
  }

  for (const dir of getManagedDirectories()) {
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = openDatabase();
  for (const migrationPath of getMigrationPaths()) {
    const migrationSql = fs.readFileSync(migrationPath, 'utf8');
    db.exec(migrationSql);
  }
  db.close();
}

export async function clearTestData(): Promise<void> {
  applyServerTestEnv();
  await disconnectPrisma();

  const db = openDatabase();
  const tables = db.prepare(`
    SELECT name
    FROM sqlite_master
    WHERE type = 'table'
      AND name NOT LIKE 'sqlite_%'
      AND name NOT LIKE '_prisma_%'
  `).all() as Array<{ name: string }>;

  db.pragma('foreign_keys = OFF');
  db.exec('BEGIN');
  for (const { name } of tables) {
    db.exec(`DELETE FROM "${name}"`);
  }
  db.exec('COMMIT');
  db.pragma('foreign_keys = ON');
  db.close();
}

function buildId(prefix: string): string {
  return `${prefix}_${randomUUID().replace(/-/g, '')}`;
}

export async function seedSmokeScenario(): Promise<SmokeScenario> {
  applyServerTestEnv();
  const { prisma } = await import('../utils/prisma.js');
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);

  const user: SeededAccount = {
    id: buildId('user'),
    email: 'smoke-user@opencord.test',
    username: 'smokeuser',
    discriminator: '1001',
    password: TEST_PASSWORD,
    adminLevel: 0,
  };
  const admin: SeededAccount = {
    id: buildId('admin'),
    email: 'smoke-admin@opencord.test',
    username: 'smokeadmin',
    discriminator: '0001',
    password: TEST_PASSWORD,
    adminLevel: 2,
  };
  const guildId = buildId('guild');
  const channelId = buildId('channel');
  const inviteCode = 'smoke-invite';
  const dmChannelId = buildId('dm');

  await prisma.user.createMany({
    data: [
      {
        id: user.id,
        email: user.email,
        username: user.username,
        discriminator: user.discriminator,
        password_hash: passwordHash,
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        verified: true,
        admin_level: user.adminLevel,
        locale: 'fr',
        theme: 'dark',
        allow_dms_from: 'everyone',
      },
      {
        id: admin.id,
        email: admin.email,
        username: admin.username,
        discriminator: admin.discriminator,
        password_hash: passwordHash,
        date_of_birth: new Date('1990-01-01T00:00:00.000Z'),
        verified: true,
        admin_level: admin.adminLevel,
        locale: 'fr',
        theme: 'dark',
        allow_dms_from: 'everyone',
      },
    ],
  });

  await prisma.guild.create({
    data: {
      id: guildId,
      name: 'Smoke Guild',
      owner_id: admin.id,
      discoverable: true,
      discovery_description: 'Guild used by the smoke test suite',
    },
  });

  await prisma.guildMember.createMany({
    data: [
      { guild_id: guildId, user_id: admin.id, nickname: 'Admin' },
      { guild_id: guildId, user_id: user.id, nickname: 'User' },
    ],
  });

  await prisma.channel.create({
    data: {
      id: channelId,
      guild_id: guildId,
      name: 'general',
      type: 0,
      position: 0,
    },
  });

  await prisma.invite.create({
    data: {
      code: inviteCode,
      guild_id: guildId,
      channel_id: channelId,
      inviter_id: admin.id,
      max_uses: 0,
      max_age: 86400,
      source: 'invite',
    },
  });

  await prisma.friend.create({
    data: {
      id: buildId('friend'),
      user_id: user.id,
      target_id: admin.id,
      status: 1,
    },
  });

  await prisma.dMChannel.create({
    data: {
      id: dmChannelId,
      type: 1,
      name: null,
      owner_id: user.id,
    },
  });

  await prisma.dMChannelMember.createMany({
    data: [
      { channel_id: dmChannelId, user_id: user.id },
      { channel_id: dmChannelId, user_id: admin.id },
    ],
  });

  return {
    user,
    admin,
    guildId,
    channelId,
    inviteCode,
    dmChannelId,
  };
}
