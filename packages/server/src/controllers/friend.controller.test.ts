import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    friend: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
    dmChannelMember: {
      findFirst: vi.fn(),
    },
    dmChannel: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

import { 
  sendFriendRequest, 
  acceptFriendRequest, 
  declineFriendRequest, 
  removeFriend, 
  blockUser, 
  unblockUser, 
  getFriends 
} from './friend.controller.js';

describe('friend system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sendFriendRequest', () => {
    it('sends friend request when users are not already friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        allow_dms_from: 'everyone',
      });

      await sendFriendRequest('user-1', 'user-2');

      expect(mocks.prisma.friend.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-1',
          target_id: 'user-2',
          status: 0, // PENDING
        }),
      });
    });

    it('throws when already friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        status: 1, // FRIEND
      });

      await expect(sendFriendRequest('user-1', 'user-2'))
        .rejects.toThrow('Already friends');
    });

    it('throws when request already pending', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        status: 0, // PENDING
      });

      await expect(sendFriendRequest('user-1', 'user-2'))
        .rejects.toThrow('Friend request already pending');
    });

    it('throws when user is blocked', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        status: 2, // BLOCKED
      });

      await expect(sendFriendRequest('user-1', 'user-2'))
        .rejects.toThrow('User is blocked');
    });

    it('throws when target does not allow DMs from non-friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        allow_dms_from: 'friends', // Only friends
      });

      await expect(sendFriendRequest('user-1', 'user-2'))
        .rejects.toThrow('User does not accept friend requests');
    });
  });

  describe('acceptFriendRequest', () => {
    it('accepts pending friend request', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        user_id: 'user-2',
        target_id: 'user-1',
        status: 0, // PENDING
      });

      await acceptFriendRequest('user-1', 'user-2');

      expect(mocks.prisma.friend.update).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
        data: { status: 1 }, // FRIEND
      });
    });

    it('creates DM channel when accepting', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        user_id: 'user-2',
        target_id: 'user-1',
        status: 0,
      });
      mocks.prisma.dmChannel.findFirst.mockResolvedValue(null);
      mocks.prisma.dmChannel.create.mockResolvedValue({ id: 'dm-1' });

      await acceptFriendRequest('user-1', 'user-2');

      expect(mocks.prisma.dmChannel.create).toHaveBeenCalled();
      expect(mocks.prisma.dmChannelMember.create).toHaveBeenCalledTimes(2);
    });

    it('throws when no pending request exists', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);

      await expect(acceptFriendRequest('user-1', 'user-2'))
        .rejects.toThrow('No pending friend request');
    });
  });

  describe('removeFriend', () => {
    it('removes friend relationship', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 1, // FRIEND
      });

      await removeFriend('user-1', 'user-2');

      expect(mocks.prisma.friend.delete).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
      });
    });

    it('throws when not friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);

      await expect(removeFriend('user-1', 'user-2'))
        .rejects.toThrow('Not friends');
    });
  });

  describe('blockUser', () => {
    it('blocks user and removes friend status', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 1, // FRIEND
      });

      await blockUser('user-1', 'user-2');

      expect(mocks.prisma.friend.update).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
        data: { status: 2 }, // BLOCKED
      });
    });

    it('creates block entry if not existing', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);

      await blockUser('user-1', 'user-2');

      expect(mocks.prisma.friend.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-1',
          target_id: 'user-2',
          status: 2, // BLOCKED
        }),
      });
    });
  });

  describe('getFriends', () => {
    it('returns friends list with mutual servers', async () => {
      mocks.prisma.friend.findMany.mockResolvedValue([
        {
          target: {
            id: 'user-2',
            username: 'friend1',
            discriminator: '0001',
            guildMember: [
              { guild_id: 'guild-1' },
              { guild_id: 'guild-2' },
            ],
          },
          status: 1,
        },
      ]);
      mocks.prisma.user.findUnique.mockResolvedValue({
        guildMember: [
          { guild_id: 'guild-1' }, // Only 1 mutual
        ],
      });

      const friends = await getFriends('user-1');
      expect(friends).toBeInstanceOf(Array);
      expect(friends[0]?.mutual_guilds).toBe(1);
    });
  });
});
