import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    guild: {
      findUnique: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

import { checkPermission } from './guild.controller.js';

describe('sensitive permissions - 2FA requirement', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('checkPermission with 2FA requirement', () => {
    it('allows sensitive permission when guild has 2FA enabled and user has 2FA', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: true,
      });

      const perms = BigInt(0x20); // MANAGE_GUILD
      await expect(checkPermission(perms, BigInt(0x20), 'guild-1', 'user-1'))
        .resolves.not.toThrow();
    });

    it('denies sensitive permission when guild has 2FA enabled and user lacks 2FA', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
      });

      const perms = BigInt(0x20); // MANAGE_GUILD
      await expect(checkPermission(perms, BigInt(0x20), 'guild-1', 'user-1'))
        .rejects.toThrow('2FA required for this action');
    });

    it('allows sensitive permission when guild does not require 2FA', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({}),
      });

      const perms = BigInt(0x20); // MANAGE_GUILD
      await expect(checkPermission(perms, BigInt(0x20), 'guild-1', 'user-1'))
        .resolves.not.toThrow();
    });

    it('denies MANAGE_ROLES without 2FA when required', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
      });

      await expect(checkPermission(BigInt(0x10000000), BigInt(0x10000000), 'guild-1', 'user-1'))
        .rejects.toThrow('2FA required');
    });

    it('denies MANAGE_EMOJIS_AND_STICKERS without 2FA when required', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
      });

      await expect(checkPermission(BigInt(0x40000000), BigInt(0x40000000), 'guild-1', 'user-1'))
        .rejects.toThrow('2FA required');
    });

    it('denies MANAGE_WEBHOOKS without 2FA when required', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
      });

      await expect(checkPermission(BigInt(0x20000000), BigInt(0x20000000), 'guild-1', 'user-1'))
        .rejects.toThrow('2FA required');
    });

    it('allows non-sensitive permission without 2FA', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });
      mocks.prisma.user.findUnique.mockResolvedValue({
        two_factor_enabled: false,
      });

      const perms = BigInt(0x800); // SEND_MESSAGES (non-sensitive)
      await expect(checkPermission(perms, BigInt(0x800), 'guild-1', 'user-1'))
        .resolves.not.toThrow();
    });

    it('allows ADMINISTRATOR to bypass 2FA check', async () => {
      mocks.prisma.guild.findUnique.mockResolvedValue({
        features: JSON.stringify({ require_2fa: true }),
      });

      const perms = BigInt(0x8); // ADMINISTRATOR
      await expect(checkPermission(perms, BigInt(0x8), 'guild-1', 'user-1'))
        .resolves.not.toThrow();
    });
  });
});
