import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';
import { checkPermission } from './guild.controller.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    guildMember: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    guild: {
      findUnique: vi.fn(),
    },
  },
  getMemberPermissions: vi.fn(),
  checkPermission: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('./guild.controller.js', () => ({
  getMemberPermissions: mocks.getMemberPermissions,
  checkPermission: mocks.checkPermission,
}));

import { applyTimeout, removeTimeout } from './guild.controller.js';

describe('timeout (communication_disabled_until)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('applyTimeout', () => {
    it('applies timeout when user has MODERATE_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000)); // MODERATE_MEMBERS
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        communication_disabled_until: null,
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });

      const futureDate = new Date(Date.now() + 3600000); // 1 hour
      await applyTimeout('guild-1', 'user-1', 'user-2', futureDate, 'Bad behavior');

      expect(mocks.prisma.guildMember.update).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
        data: { communication_disabled_until: futureDate },
      });
    });

    it('throws when user lacks MODERATE_MEMBERS permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0)); // No permissions
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
      });

      const futureDate = new Date(Date.now() + 3600000);
      await expect(applyTimeout('guild-1', 'user-1', 'user-2', futureDate))
        .rejects.toThrow('Missing required permissions');
    });

    it('throws when trying to timeout the guild owner', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000));

      const futureDate = new Date(Date.now() + 3600000);
      await expect(applyTimeout('guild-1', 'user-1', 'user-2', futureDate))
        .rejects.toThrow('Cannot timeout the guild owner');
    });

    it('throws when timeout exceeds 28 days maximum', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000));
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        communication_disabled_until: null,
      });
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });

      const tooLong = new Date(Date.now() + (29 * 24 * 60 * 60 * 1000)); // 29 days
      await expect(applyTimeout('guild-1', 'user-1', 'user-2', tooLong))
        .rejects.toThrow('Timeout cannot exceed 28 days');
    });

    it('throws when user hierarchy is insufficient', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000));
      mocks.checkPermission.mockImplementation(() => {
        throw new AppError(403, 'HIERARCHY_ERROR', 'Cannot moderate this user');
      });

      const futureDate = new Date(Date.now() + 3600000);
      await expect(applyTimeout('guild-1', 'user-1', 'user-2', futureDate))
        .rejects.toThrow('Cannot moderate this user');
    });
  });

  describe('removeTimeout', () => {
    it('removes timeout when user has permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000));
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        communication_disabled_until: new Date(Date.now() + 3600000),
      });

      await removeTimeout('guild-1', 'user-1', 'user-2');

      expect(mocks.prisma.guildMember.update).toHaveBeenCalledWith({
        where: { guild_id_user_id: { guild_id: 'guild-1', user_id: 'user-2' } },
        data: { communication_disabled_until: null },
      });
    });

    it('silently succeeds if user has no timeout', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0x10000000000));
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        user_id: 'user-2',
        communication_disabled_until: null,
      });

      await removeTimeout('guild-1', 'user-1', 'user-2');
      expect(mocks.prisma.guildMember.update).toHaveBeenCalled();
    });
  });

  describe('getMemberPermissions with timeout', () => {
    it('restricts permissions when user is timed out', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        pending: false,
        communication_disabled_until: new Date(Date.now() + 3600000), // Future
      });
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
      mocks.prisma.role.findFirst.mockResolvedValue({ id: 'role-1', permissions: '0' });

      const perms = await getMemberPermissions('guild-1', 'user-1');
      // Only VIEW_CHANNEL and READ_MESSAGE_HISTORY should remain
      expect(perms & BigInt(0x400)).not.toBe(0n); // VIEW_CHANNEL
      expect(perms & BigInt(0x10000)).not.toBe(0n); // READ_MESSAGE_HISTORY
      expect(perms & BigInt(0x800)).toBe(0n); // SEND_MESSAGES should be gone
    });

    it('restores permissions when timeout expires', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        pending: false,
        communication_disabled_until: new Date(Date.now() - 1000), // Past
      });
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
      mocks.prisma.role.findFirst.mockResolvedValue({ id: 'role-1', permissions: '2048' });

      const perms = await getMemberPermissions('guild-1', 'user-1');
      expect(perms & BigInt(0x800)).not.toBe(0n); // SEND_MESSAGES restored
    });
  });
});
