import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const mocks = vi.hoisted(() => ({
  prisma: {
    guildMember: {
      findUnique: vi.fn(),
      delete: vi.fn(),
      update: vi.fn(),
      findFirst: vi.fn(),
    },
    guild: {
      findUnique: vi.fn(),
    },
    ban: {
      findUnique: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn(),
    },
    message: {
      deleteMany: vi.fn(),
    },
    auditLog: {
      create: vi.fn(),
    },
  },
  getMemberPermissions: vi.fn(),
  checkPermission: vi.fn(),
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  })),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('./guild.controller.js', () => ({
  getMemberPermissions: mocks.getMemberPermissions,
  checkPermission: mocks.checkPermission,
}));

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

import { kickMember, banMember, unbanMember, getBans, getBan } from './ban.controller.js';

describe('moderation - kick/ban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('kickMember', () => {
    it('kicks member when user has KICK_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2)); // KICK_MEMBERS
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });

      await kickMember('guild-1', 'user-2', 'user-1', 'Bad behavior');

      expect(mocks.prisma.guildMember.delete).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
      });
      expect(mocks.getIO().to).toHaveBeenCalledWith('guild:guild-1');
      expect(mocks.getIO().emit).toHaveBeenCalledWith(GatewayEvents.GUILD_MEMBER_REMOVE, expect.anything());
    });

    it('throws when user lacks KICK_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0)); // No permissions
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
      });

      await expect(kickMember('guild-1', 'user-2', 'user-1'))
        .rejects.toThrow('Missing required permissions');
    });

    it('throws when trying to kick guild owner', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });

      await expect(kickMember('guild-1', 'user-2', 'user-1'))
        .rejects.toThrow('Cannot kick the guild owner');
    });

    it('throws when trying to kick yourself', async () => {
      await expect(kickMember('guild-1', 'user-1', 'user-1'))
        .rejects.toThrow('Cannot kick yourself');
    });

    it('throws when target has higher role hierarchy', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2)); // KICK_MEMBERS
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'HIERARCHY_ERROR', 'Cannot moderate this user');
      });

      await expect(kickMember('guild-1', 'user-2', 'user-1'))
        .rejects.toThrow('Cannot moderate this user');
    });
  });

  describe('banMember', () => {
    it('bans user and deletes messages within timeframe', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
      mocks.prisma.ban.findUnique.mockResolvedValue(null);

      await banMember('guild-1', 'user-2', 'user-1', {
        reason: 'Spam',
        delete_message_seconds: 86400, // 24 hours
      });

      expect(mocks.prisma.ban.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guild_id: 'guild-1',
          user_id: 'user-2',
          reason: 'Spam',
          banned_by: 'user-1',
          delete_messages_seconds: 86400,
        }),
      });
      expect(mocks.prisma.guildMember.delete).toHaveBeenCalled();
      expect(mocks.prisma.message.deleteMany).toHaveBeenCalled();
    });

    it('throws when user is already banned', async () => {
      mocks.prisma.ban.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });

      await expect(banMember('guild-1', 'user-2', 'user-1', {}))
        .rejects.toThrow('User is already banned');
    });

    it('throws when trying to ban guild owner', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });

      await expect(banMember('guild-1', 'user-2', 'user-1', {}))
        .rejects.toThrow('Cannot ban the guild owner');
    });
  });

  describe('unbanMember', () => {
    it('unbans user when user has BAN_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.ban.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });

      await unbanMember('guild-1', 'user-2', 'user-1', 'Lifted ban');

      expect(mocks.prisma.ban.delete).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
      });
      expect(mocks.getIO().to).toHaveBeenCalledWith('guild:guild-1');
      expect(mocks.getIO().emit).toHaveBeenCalledWith(GatewayEvents.GUILD_BAN_REMOVE, expect.anything());
    });

    it('throws when user is not banned', async () => {
      mocks.prisma.ban.findUnique.mockResolvedValue(null);

      await expect(unbanMember('guild-1', 'user-2', 'user-1'))
        .rejects.toThrow('User is not banned');
    });
  });

  describe('getBans', () => {
    it('lists bans when user has BAN_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.ban.findMany.mockResolvedValue([
        {
          reason: 'Spam',
          user: { id: 'user-2', username: 'spammer', discriminator: '0001' },
        },
      ]);

      const bans = await getBans('guild-1', 'user-1', {});
      expect(bans).toBeInstanceOf(Array);
      expect(bans[0]?.reason).toBe('Spam');
    });

    it('throws when user lacks BAN_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0));
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
      });

      await expect(getBans('guild-1', 'user-1', {}))
        .rejects.toThrow('Missing required permissions');
    });
  });

  describe('getBan', () => {
    it('gets specific ban when user has permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.ban.findUnique.mockResolvedValue({
        reason: 'Spam',
        user: { id: 'user-2', username: 'spammer' },
      });

      const ban = await getBan('guild-1', 'user-2', 'user-1');
      expect(ban.reason).toBe('Spam');
    });

    it('returns 404 when ban does not exist', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4));
      mocks.prisma.ban.findUnique.mockResolvedValue(null);

      await expect(getBan('guild-1', 'user-2', 'user-1'))
        .rejects.toThrow('Ban not found');
    });
  });
});
