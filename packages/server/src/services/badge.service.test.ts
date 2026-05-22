import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    badge: {
      findFirst: vi.fn(),
    },
    userBadge: {
      upsert: vi.fn(),
      deleteMany: vi.fn(),
      findMany: vi.fn(),
    },
  },
  generateSnowflake: vi.fn(() => 'snowflake-1'),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../utils/snowflake.js', () => ({
  generateSnowflake: mocks.generateSnowflake,
}));

import { assignBadge, getUserBadges, revokeBadge } from './badge.service.js';

describe('badge.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('assignBadge', () => {
    it('upserts a badge assignment when the badge exists', async () => {
      mocks.prisma.badge.findFirst.mockResolvedValue({ id: 'badge-1', name: 'EARLY_SUPPORTER' });

      await assignBadge('user-1', 'EARLY_SUPPORTER', 'admin-1');

      expect(mocks.prisma.userBadge.upsert).toHaveBeenCalledWith({
        where: { user_id_badge_id: { user_id: 'user-1', badge_id: 'badge-1' } },
        create: {
          id: 'snowflake-1',
          user_id: 'user-1',
          badge_id: 'badge-1',
          assigned_by: 'admin-1',
        },
        update: {},
      });
    });

    it('does nothing when the badge does not exist', async () => {
      mocks.prisma.badge.findFirst.mockResolvedValue(null);

      await assignBadge('user-1', 'UNKNOWN');

      expect(mocks.prisma.userBadge.upsert).not.toHaveBeenCalled();
    });
  });

  describe('revokeBadge', () => {
    it('deletes existing user badge entries when the badge exists', async () => {
      mocks.prisma.badge.findFirst.mockResolvedValue({ id: 'badge-1', name: 'EARLY_SUPPORTER' });

      await revokeBadge('user-1', 'EARLY_SUPPORTER');

      expect(mocks.prisma.userBadge.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', badge_id: 'badge-1' },
      });
    });

    it('does nothing when the badge does not exist', async () => {
      mocks.prisma.badge.findFirst.mockResolvedValue(null);

      await revokeBadge('user-1', 'UNKNOWN');

      expect(mocks.prisma.userBadge.deleteMany).not.toHaveBeenCalled();
    });
  });

  describe('getUserBadges', () => {
    it('returns badge entities in the same order as prisma results', async () => {
      const badgeA = { id: 'badge-a', name: 'A' };
      const badgeB = { id: 'badge-b', name: 'B' };
      mocks.prisma.userBadge.findMany.mockResolvedValue([
        { badge: badgeA },
        { badge: badgeB },
      ]);

      await expect(getUserBadges('user-1')).resolves.toEqual([badgeA, badgeB]);
      expect(mocks.prisma.userBadge.findMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1' },
        include: { badge: true },
        orderBy: { badge: { priority: 'asc' } },
      });
    });
  });
});
