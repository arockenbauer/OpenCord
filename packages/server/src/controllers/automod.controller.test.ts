import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { evaluateAutoMod } from './automod.controller.js';
import { GatewayEvents } from '@opencord/shared';

const mocks = vi.hoisted(() => ({
  prisma: {
    autoModRule: {
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    autoModExecution: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    guildMemberRole: {
      findMany: vi.fn(),
    },
    guildMember: {
      findUnique: vi.fn(),
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

describe('automod.controller', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('evaluateAutoMod', () => {
    it('returns not blocked when no rules exist', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([]);

      const result = await evaluateAutoMod('guild-1', 'hello world', 'user-1', 'channel-1');
      expect(result.blocked).toBe(false);
    });

    it('returns not blocked when rules are disabled', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        { enabled: false, trigger_type: 1, trigger_metadata: '{}', actions: '[]' },
      ]);

      const result = await evaluateAutoMod('guild-1', 'badword', 'user-1', 'channel-1');
      expect(result.blocked).toBe(false);
    });

    it('skips exempt channels', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([{ type: 1 }]),
          exempt_channels: JSON.stringify(['channel-1']),
          exempt_roles: JSON.stringify([]),
        },
      ]);

      const result = await evaluateAutoMod('guild-1', 'badword', 'user-1', 'channel-1');
      expect(result.blocked).toBe(false);
    });

    it('skips exempt roles', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([{ type: 1 }]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify(['role-1']),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([
        { role_id: 'role-1' },
      ]);

      const result = await evaluateAutoMod('guild-1', 'badword', 'user-1', 'channel-1');
      expect(result.blocked).toBe(false);
    });

    it('blocks message with KEYWORD trigger', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword', 'spam*'] }),
          actions: JSON.stringify([{ type: 1, metadata: { custom_message: 'Blocked by AutoMod' } }]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);

      const result = await evaluateAutoMod('guild-1', 'This is badword content', 'user-1', 'channel-1');
      expect(result.blocked).toBe(true);
      expect(result.blockMessage).toBe('Blocked by AutoMod');
    });

    it('blocks message with wildcard keyword', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['spam*'] }),
          actions: JSON.stringify([{ type: 1 }]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);

      const result = await evaluateAutoMod('guild-1', 'This is spammy content', 'user-1', 'channel-1');
      expect(result.blocked).toBe(true);
    });

    it('sends alert message when configured', async () => {
      const io = mocks.getIO();
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          guild_id: 'guild-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([
            { type: 1 },
            { type: 2, metadata: { channel_id: 'alert-channel-1' } },
          ]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);

      await evaluateAutoMod('guild-1', 'badword content', 'user-1', 'channel-1');

      expect(io.to).toHaveBeenCalledWith('channel:alert-channel-1');
      expect(io.emit).toHaveBeenCalledWith(GatewayEvents.MESSAGE_CREATE, expect.anything());
    });

    it('applies timeout when configured', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([
            { type: 1 },
            { type: 3, metadata: { duration_seconds: 60 } },
          ]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);

      const result = await evaluateAutoMod('guild-1', 'badword content', 'user-1', 'channel-1');
      expect(result.blocked).toBe(true);
      expect(result.timeoutSeconds).toBe(60);
    });

    it('bypasses admin users with ADMINISTRATOR permission', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([{ type: 1 }]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([
        { role: { permissions: '8' } }, // ADMINISTRATOR
      ]);

      const result = await evaluateAutoMod('guild-1', 'badword content', 'admin-1', 'channel-1');
      expect(result.blocked).toBe(false);
    });

    it('records execution in autoModExecution table', async () => {
      mocks.prisma.autoModRule.findMany.mockResolvedValue([
        {
          id: 'rule-1',
          guild_id: 'guild-1',
          enabled: true,
          trigger_type: 1,
          trigger_metadata: JSON.stringify({ keyword_filter: ['badword'] }),
          actions: JSON.stringify([{ type: 1 }]),
          exempt_channels: JSON.stringify([]),
          exempt_roles: JSON.stringify([]),
        },
      ]);
      mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);

      await evaluateAutoMod('guild-1', 'badword content', 'user-1', 'channel-1');

      expect(mocks.prisma.autoModExecution.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          guild_id: 'guild-1',
          rule_id: 'rule-1',
          user_id: 'user-1',
          channel_id: 'channel-1',
          content: 'badword content',
        }),
      });
    });
  });
});
