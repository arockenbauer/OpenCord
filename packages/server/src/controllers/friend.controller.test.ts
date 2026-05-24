import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    $queryRaw: vi.fn(),
    friend: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
    },
    guildMember: {
      findMany: vi.fn(),
    },
  },
  getIO: vi.fn(() => ({
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  })),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

vi.mock('./notification.controller.js', () => ({
  createFriendRequestNotification: vi.fn(),
}));

import {
  getRelationships,
  sendFriendRequest,
  acceptFriendRequest,
  declineFriendRequest,
  removeFriend,
  blockUser,
  unblockUser,
} from './friend.controller.js';

describe('friend system', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.prisma.guildMember.findMany.mockResolvedValue([]);
    mocks.prisma.friend.findMany.mockResolvedValue([]);
    mocks.prisma.$queryRaw.mockResolvedValue([{ allow_friend_requests_from: 'everyone' }]);
  });

  function createReqRes(userId: string, params = {}, body = {}) {
    const req = {
      user: { userId },
      params,
      body,
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    } as any;
    const next = vi.fn();
    return { req, res, next };
  }

  describe('getRelationships', () => {
    it('returns relationships list', async () => {
      mocks.prisma.friend.findMany
        .mockResolvedValueOnce([{ id: 'rel-1', status: 1, target: { id: 'user-2' } }]) // sent
        .mockResolvedValueOnce([]); // received

      const { req, res, next } = createReqRes('user-1');
      await getRelationships(req, res, next);

      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        relationships: expect.any(Array),
      }));
    });
  });

  describe('sendFriendRequest', () => {
    it('sends friend request when users are not already friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-2',
        username: 'test',
        discriminator: '0001',
      });
      mocks.prisma.friend.create.mockResolvedValue({ id: 'rel-1' });

      const { req, res, next } = createReqRes('user-1', {}, { user_id: 'user-2' });
      await sendFriendRequest(req, res, next);

      expect(mocks.prisma.friend.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-1',
          target_id: 'user-2',
          status: 0,
        }),
      });
      expect(res.status).toHaveBeenCalledWith(201);
    });

    it('throws when already friends', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        status: 1,
      });

      const { req, res, next } = createReqRes('user-1', {}, { user_id: 'user-2' });
      await sendFriendRequest(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
    });
  });

  describe('acceptFriendRequest', () => {
    it('accepts pending friend request', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        user_id: 'user-2',
        target_id: 'user-1',
        status: 0,
      });
      mocks.prisma.friend.update.mockResolvedValue({});

      const { req, res, next } = createReqRes('user-1', { userId: 'user-2' });
      await acceptFriendRequest(req, res, next);

      expect(mocks.prisma.friend.update).toHaveBeenCalledWith({
        where: { id: 'rel-1' },
        data: { status: 1 },
      });
    });
  });

  describe('removeFriend', () => {
    it('removes friend relationship', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue({
        id: 'rel-1',
        status: 1,
      });
      mocks.prisma.friend.delete.mockResolvedValue({});

      const { req, res, next } = createReqRes('user-1', { userId: 'user-2' });
      await removeFriend(req, res, next);

      expect(mocks.prisma.friend.delete).toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(204);
    });
  });

  describe('blockUser', () => {
    it('blocks user', async () => {
      mocks.prisma.friend.findFirst.mockResolvedValue(null);
      mocks.prisma.friend.create.mockResolvedValue({});

      const { req, res, next } = createReqRes('user-1', { userId: 'user-2' });
      await blockUser(req, res, next);

      expect(mocks.prisma.friend.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          user_id: 'user-1',
          target_id: 'user-2',
          status: 2,
        }),
      });
    });
  });
});
