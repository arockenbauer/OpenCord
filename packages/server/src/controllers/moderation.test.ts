import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const mocks = vi.hoisted(() => ({
  prisma: {
    role: {
      findFirst: vi.fn(),
    },
    guildMemberRole: {
      findMany: vi.fn(),
    },
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
  getHighestRolePosition: vi.fn(),
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
  getHighestRolePosition: mocks.getHighestRolePosition,
  writeAuditLog: vi.fn(),
  AUDIT_LOG_ACTIONS: {
    MEMBER_BAN_ADD: 22,
    MEMBER_BAN_REMOVE: 23,
    MEMBER_KICK: 20,
  },
}));

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

import { banUser, unbanUser, getBans, getBan } from './ban.controller.js';
import { kickUser } from './ban.controller.js';

describe('moderation - kick/ban', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermission.mockResolvedValue(undefined);
    mocks.getHighestRolePosition.mockImplementation(async (_guildId: string, userId: string) => (
      userId === 'user-1' ? 10 : 0
    ));
    mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
    mocks.prisma.role.findFirst.mockResolvedValue({ permissions: '0' });
    mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
  });

  function createReqRes(guildId: string, userId: string, params = {}, body = {}, actorId = 'user-1') {
    const req = {
      params: { guildId, userId, ...params },
      query: {},
      body,
      user: { userId: actorId },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    } as any;
    const next = vi.fn();
    return { req, res, next };
  }

  describe('kickUser', () => {
    it('kicks member when user has KICK_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2)); // KICK_MEMBERS
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await kickUser(req, res, next);

      expect(mocks.prisma.guildMember.delete).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
      });
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('throws when user lacks KICK_MEMBERS permission', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'someone-else' });
      mocks.prisma.role.findFirst.mockResolvedValue({ permissions: '0' });
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
      });

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await kickUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
    });
  });

  describe('banUser', () => {
    it('bans user', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
      mocks.prisma.ban.findUnique.mockResolvedValue(null);
      mocks.prisma.ban.create.mockResolvedValue({});

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, { reason: 'Spam', delete_message_seconds: 86400 }, 'user-1');
      await banUser(req, res, next);

      expect(mocks.prisma.ban.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guild_id: 'guild-1',
          user_id: 'user-2',
          reason: 'Spam',
          banned_by: 'user-1',
        }),
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('throws when user is already banned', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
      mocks.prisma.ban.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await banUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('unbanUser', () => {
    it('unbans user when user has BAN_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.ban.findUnique.mockResolvedValue({
        user_id: 'user-2',
        guild_id: 'guild-1',
      });
      mocks.prisma.ban.delete.mockResolvedValue({});

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await unbanUser(req, res, next);

      expect(mocks.prisma.ban.delete).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
      });
      expect(res.status).toHaveBeenCalledWith(204);
    });

    it('throws when user is not banned', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
      mocks.prisma.ban.findUnique.mockResolvedValue(null);

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await unbanUser(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
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

      const { req, res, next } = createReqRes('guild-1', 'user-1');
      await getBans(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.any(Array));
    });
  });

  describe('getBan', () => {
    it('gets specific ban when user has permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4)); // BAN_MEMBERS
      mocks.prisma.ban.findUnique.mockResolvedValue({
        reason: 'Spam',
        user: { id: 'user-2', username: 'spammer' },
      });

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await getBan(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        reason: 'Spam',
      }));
    });

    it('returns 404 when ban does not exist', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x4));
      mocks.prisma.ban.findUnique.mockResolvedValue(null);

      const { req, res, next } = createReqRes('guild-1', 'user-2', {}, {}, 'user-1');
      await getBan(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
    });
  });
});
