import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    adminAuditLog: { create: vi.fn() },
    auditLog: { create: vi.fn() },
  },
  generateSnowflake: vi.fn(() => 'snowflake-123'),
}));

vi.mock('../utils/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../utils/snowflake.js', () => ({ generateSnowflake: mocks.generateSnowflake }));

import { createAdminAuditLog, createGuildAuditLog } from './audit-log.js';

describe('audit-log', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('createAdminAuditLog', () => {
    it('creates admin audit log with all fields', async () => {
      await createAdminAuditLog({
        adminId: 'admin-1',
        action: 'USER_BAN',
        targetType: 'user',
        targetId: 'user-1',
        details: { reason: 'spam' },
        ipAddress: '127.0.0.1',
      });

      expect(mocks.prisma.adminAuditLog.create).toHaveBeenCalledWith({
        data: {
          id: 'snowflake-123',
          admin_id: 'admin-1',
          action: 'USER_BAN',
          target_type: 'user',
          target_id: 'user-1',
          details: '{"reason":"spam"}',
          ip_address: '127.0.0.1',
        },
      });
    });

    it('handles string details', async () => {
      await createAdminAuditLog({
        adminId: 'admin-1',
        action: 'BACKUP_CREATE',
        details: 'backup created',
      });

      expect(mocks.prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ details: 'backup created' }),
        })
      );
    });

    it('handles null details', async () => {
      await createAdminAuditLog({
        adminId: 'admin-1',
        action: 'TEST',
        details: null,
      });

      expect(mocks.prisma.adminAuditLog.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ details: null }),
        })
      );
    });
  });

  describe('createGuildAuditLog', () => {
    it('creates guild audit log with changes', async () => {
      const changes = [{ key: 'name', old_value: 'Old', new_value: 'New' }];
      await createGuildAuditLog({
        guildId: 'guild-1',
        userId: 'user-1',
        actionType: 1,
        targetId: 'target-1',
        targetType: 'channel',
        changes,
        reason: 'Renamed channel',
      });

      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: {
          id: 'snowflake-123',
          guild_id: 'guild-1',
          user_id: 'user-1',
          action_type: 1,
          target_id: 'target-1',
          target_type: 'channel',
          changes: JSON.stringify(changes),
          reason: 'Renamed channel',
        },
      });
    });

    it('creates guild audit log without optional fields', async () => {
      await createGuildAuditLog({
        guildId: 'guild-1',
        userId: 'user-1',
        actionType: 2,
      });

      expect(mocks.prisma.auditLog.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guild_id: 'guild-1',
          action_type: 2,
          changes: null,
          target_id: null,
          target_type: null,
          reason: null,
        }),
      });
    });
  });
});
