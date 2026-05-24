import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { getMemberPermissions } from './guild.controller.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    guildMember: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    guild: {
      findUnique: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    guildMemberRole: {
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

describe('timeout (communication_disabled_until)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('getMemberPermissions with timeout', () => {
    it('restricts permissions when user is timed out', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-2' });
      mocks.prisma.guildMember.findUnique.mockResolvedValue({
        pending: false,
        communication_disabled_until: new Date(Date.now() + 3600000), // Future
      });
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
      mocks.prisma.role.findFirst.mockResolvedValue({ id: 'role-1', permissions: String(0x400 | 0x10000 | 0x800) });

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
