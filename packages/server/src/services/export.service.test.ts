import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn() },
    refreshToken: { findMany: vi.fn() },
    friend: { findMany: vi.fn() },
    guildMember: { findMany: vi.fn() },
    message: { count: vi.fn(), findMany: vi.fn() },
    reaction: { findMany: vi.fn() },
    userBadge: { findMany: vi.fn() },
    userSubscription: { findUnique: vi.fn() },
    boost: { findMany: vi.fn() },
    auditLog: { findMany: vi.fn() },
    dataExport: { findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    attachment: { aggregate: vi.fn(), findMany: vi.fn() },
  },
  generateSnowflake: vi.fn(() => 'export-123'),
  bcrypt: { compare: vi.fn(() => true) },
  fs: {
    existsSync: vi.fn(() => false),
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
    copyFileSync: vi.fn(),
    statSync: vi.fn(() => ({ size: 1024 })),
    readdirSync: vi.fn(() => []),
    rmSync: vi.fn(),
  },
  archiver: vi.fn(() => ({
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
  getIO: vi.fn(() => null),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  createAdminAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../utils/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../utils/snowflake.js', () => ({ generateSnowflake: mocks.generateSnowflake }));
vi.mock('bcrypt', () => mocks.bcrypt);
vi.mock('fs', () => mocks.fs);
vi.mock('archiver', () => ({ default: mocks.archiver }));
vi.mock('../gateway/index.js', () => ({ getIO: mocks.getIO }));
vi.mock('../utils/email.js', () => ({ sendEmail: mocks.sendEmail }));
vi.mock('../utils/audit-log.js', () => ({ createAdminAuditLog: mocks.createAdminAuditLog }));

import { requestDataExport } from './export.service.js';

describe('export.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.user.findUnique.mockResolvedValue({
      id: 'user-1',
      password_hash: 'hashed',
      email: '[EMAIL]',
    });
    mocks.prisma.dataExport.findFirst.mockResolvedValue(null);
    mocks.prisma.message.count.mockResolvedValue(10);
    mocks.prisma.attachment.aggregate.mockResolvedValue({ _sum: { size: 1024 } });
    mocks.prisma.dataExport.create.mockResolvedValue({ id: 'export-123' });
  });

  describe('requestDataExport', () => {
    it('requests export successfully', async () => {
      const result = await requestDataExport('user-1', 'password123', false);
      expect(result.export_id).toBe('export-123');
      expect(result.status).toBe('processing');
      expect(mocks.prisma.dataExport.create).toHaveBeenCalled();
    });

    it('throws if user not found', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null);
      await expect(requestDataExport('user-1', 'pass')).rejects.toThrow('User not found');
    });

    it('throws if password invalid', async () => {
      mocks.bcrypt.compare.mockResolvedValue(false);
      await expect(requestDataExport('user-1', 'wrong')).rejects.toThrow('Invalid password');
    });

    it('throws if rate limited', async () => {
      mocks.prisma.dataExport.findFirst.mockResolvedValue({ id: 'existing' });
      await expect(requestDataExport('user-1', 'pass')).rejects.toThrow('An export was already requested');
    });

    it('includes attachments when requested', async () => {
      await requestDataExport('user-1', 'pass', true);
      expect(mocks.prisma.attachment.aggregate).toHaveBeenCalled();
    });
  });
});
