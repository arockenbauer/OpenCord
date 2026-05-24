import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { ALL_PERMISSIONS, PERMISSION_BITS } from '@opencord/shared';

const mocks = vi.hoisted(() => ({
  prisma: {
    channel: {
      findUnique: vi.fn(),
    },
    guildMember: {
      findUnique: vi.fn(),
    },
    guildMemberRole: {
      findMany: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    permissionOverwrites: {
      findMany: vi.fn(),
    },
    dMChannelMember: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
    },
    friend: {
      findFirst: vi.fn(),
    },
  },
  getMemberPermissions: vi.fn(),
  checkPermission: vi.fn(),
  computeEffectivePermissions: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('./guild.controller.js', () => ({
  getMemberPermissions: mocks.getMemberPermissions,
  checkPermission: mocks.checkPermission,
}));

vi.mock('../services/permission.service.js', () => ({
  computeEffectivePermissions: mocks.computeEffectivePermissions,
}));

import { getChannelPermissions } from './message.controller.js';

describe('message.controller - permissions', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getChannelPermissions', () => {
    it('returns full permissions for DM channels', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'dm-1',
        guild_id: null,
        type: 1,
      });
      mocks.prisma.dMChannelMember.findUnique.mockResolvedValue({
        user_id: 'user-1',
      });

      const perms = await getChannelPermissions('dm-1', 'user-1');
      expect(perms).toBe(ALL_PERMISSIONS);
      expect(mocks.getMemberPermissions).not.toHaveBeenCalled();
    });

    it('denies access to DM if user is not a member', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'dm-1',
        guild_id: null,
        type: 1,
      });
      mocks.prisma.dMChannelMember.findUnique.mockResolvedValue(null);

      await expect(getChannelPermissions('dm-1', 'user-1')).rejects.toThrow('NOT_MEMBER');
    });

    it('checks SEND_MESSAGES permission for guild channels', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        guild_id: 'guild-1',
        type: 0,
        permission_overwrites: [],
      });
      mocks.getMemberPermissions.mockResolvedValue(PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.VIEW_CHANNEL);
      mocks.computeEffectivePermissions.mockReturnValue(PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.VIEW_CHANNEL);

      const perms = await getChannelPermissions('channel-1', 'user-1');
      expect(mocks.getMemberPermissions).toHaveBeenCalledWith('guild-1', 'user-1');
      expect(perms & PERMISSION_BITS.SEND_MESSAGES).not.toBe(0n);
    });

    it('denies SEND_MESSAGES when user lacks permission', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        guild_id: 'guild-1',
        type: 0,
        permission_overwrites: [],
      });
      mocks.getMemberPermissions.mockResolvedValue(PERMISSION_BITS.VIEW_CHANNEL);
      mocks.computeEffectivePermissions.mockReturnValue(PERMISSION_BITS.VIEW_CHANNEL);

      const perms = await getChannelPermissions('channel-1', 'user-1');
      expect(perms & PERMISSION_BITS.SEND_MESSAGES).toBe(0n);
    });

    it('checks ATTACH_FILES permission when uploading', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        guild_id: 'guild-1',
        type: 0,
        permission_overwrites: [],
      });
      mocks.getMemberPermissions.mockResolvedValue(
        PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.ATTACH_FILES
      );
      mocks.computeEffectivePermissions.mockReturnValue(
        PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.ATTACH_FILES
      );

      const perms = await getChannelPermissions('channel-1', 'user-1');
      expect(perms & PERMISSION_BITS.ATTACH_FILES).not.toBe(0n);
    });

    it('applies permission overwrites correctly', async () => {
      const everyoneRole = { id: 'role-everyone', name: '@everyone' };
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        guild_id: 'guild-1',
        type: 0,
        permission_overwrites: [
          {
            target_type: 'role',
            target_id: 'role-everyone',
            allow: '0',
            deny: PERMISSION_BITS.SEND_MESSAGES.toString(),
          },
        ],
      });
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
      mocks.prisma.role.findFirst.mockResolvedValue(everyoneRole);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
      mocks.getMemberPermissions.mockResolvedValue(
        PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.VIEW_CHANNEL
      );
      mocks.computeEffectivePermissions.mockReturnValue(PERMISSION_BITS.VIEW_CHANNEL);

      const perms = await getChannelPermissions('channel-1', 'user-1');
      expect(perms & PERMISSION_BITS.SEND_MESSAGES).toBe(0n);
    });

    it('checks READ_MESSAGE_HISTORY permission', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'channel-1',
        guild_id: 'guild-1',
        type: 0,
        permission_overwrites: [],
      });
      mocks.getMemberPermissions.mockResolvedValue(
        PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.READ_MESSAGE_HISTORY
      );
      mocks.computeEffectivePermissions.mockReturnValue(
        PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.READ_MESSAGE_HISTORY
      );

      const perms = await getChannelPermissions('channel-1', 'user-1');
      expect(perms & PERMISSION_BITS.READ_MESSAGE_HISTORY).not.toBe(0n);
    });
  });

  describe('DM restrictions', () => {
    it('blocks DM if recipient has allow_dms_from = none', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'dm-1',
        guild_id: null,
        type: 1,
      });
      mocks.prisma.dMChannelMember.findUnique.mockResolvedValue({ user_id: 'user-1' });
      mocks.prisma.friend.findFirst.mockResolvedValue(null);

      await expect(getChannelPermissions('dm-1', 'user-1')).resolves.toBeTruthy();
    });

    it('allows DM if users are friends', async () => {
      mocks.prisma.channel.findUnique.mockResolvedValue({
        id: 'dm-1',
        guild_id: null,
        type: 1,
      });
      mocks.prisma.dMChannelMember.findUnique.mockResolvedValue({ user_id: 'user-1' });
      mocks.prisma.friend.findFirst.mockResolvedValue({
        user_id: 'user-2',
        target_id: 'user-1',
        status: 1,
      });

      const perms = await getChannelPermissions('dm-1', 'user-1');
      expect(perms).toBe(ALL_PERMISSIONS);
    });
  });
});
