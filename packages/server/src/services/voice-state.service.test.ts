import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    voiceState: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      count: vi.fn(),
      upsert: vi.fn(),
      deleteMany: vi.fn(),
    },
    channel: {
      findFirst: vi.fn(),
    },
  },
  getIO: vi.fn(() => null),
  AppError: class AppError extends Error {
    constructor(public status: number, public code: string, message: string) {
      super(message);
    }
  },
  generateSnowflake: vi.fn(() => 'snowflake-1'),
  getChannelPermissions: vi.fn(() => BigInt(0)),
  checkPermission: vi.fn(),
  getMemberPermissions: vi.fn(() => BigInt(0)),
  requireMembership: vi.fn(),
  serializeBigInt: vi.fn((payload) => payload),
  closeUserMedia: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

vi.mock('../utils/app-error.js', () => ({
  AppError: mocks.AppError,
}));

vi.mock('../utils/snowflake.js', () => ({
  generateSnowflake: mocks.generateSnowflake,
}));

vi.mock('../controllers/message.controller.js', () => ({
  getChannelPermissions: mocks.getChannelPermissions,
}));

vi.mock('../controllers/guild.controller.js', () => ({
  checkPermission: mocks.checkPermission,
  getMemberPermissions: mocks.getMemberPermissions,
  requireMembership: mocks.requireMembership,
}));

vi.mock('../utils/serialize.js', () => ({
  serializeBigInt: mocks.serializeBigInt,
}));

vi.mock('./voice-media.service.js', () => ({
  closeUserMedia: mocks.closeUserMedia,
}));

import { updateOwnVoiceState, updateModeratedVoiceState, listVoiceStates } from './voice-state.service.js';

describe('voice-state.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listVoiceStates', () => {
    it('returns voice states for a guild', async () => {
      const states = [{ id: 'state-1', user: { id: 'user-1' } }];
      mocks.prisma.voiceState.findMany.mockResolvedValue(states);

      const result = await listVoiceStates('guild-1');
      expect(result).toEqual(states);
      expect(mocks.prisma.voiceState.findMany).toHaveBeenCalledWith({
        where: { guild_id: 'guild-1' },
        include: {
          user: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true, status: true } },
        },
        orderBy: { updated_at: 'desc' },
      });
    });
  });

  describe('updateOwnVoiceState', () => {
    it('joins a voice channel when channel_id is provided', async () => {
      mocks.prisma.channel.findFirst.mockResolvedValue({ id: 'channel-1', type: 2, user_limit: 0 });
      mocks.prisma.voiceState.findUnique.mockResolvedValue(null);
      mocks.getChannelPermissions.mockResolvedValue(BigInt(1024)); // VIEW_CHANNEL + CONNECT
      mocks.prisma.voiceState.upsert.mockResolvedValue({
        guild_id: 'guild-1',
        user_id: 'user-1',
        channel_id: 'channel-1',
        self_mute: false,
        self_deaf: false,
      });

      const result = await updateOwnVoiceState('guild-1', 'user-1', { channel_id: 'channel-1' });
      expect(result.channel_id).toBe('channel-1');
      expect(mocks.prisma.voiceState.upsert).toHaveBeenCalled();
    });

    it('leaves voice channel when channel_id is null', async () => {
      mocks.prisma.voiceState.findUnique.mockResolvedValue({ channel_id: 'channel-1' });

      await updateOwnVoiceState('guild-1', 'user-1', { channel_id: null });
      expect(mocks.prisma.voiceState.deleteMany).toHaveBeenCalledWith({
        where: { guild_id: 'guild-1', user_id: 'user-1' },
      });
      expect(mocks.closeUserMedia).toHaveBeenCalledWith('channel-1', 'user-1');
    });

    it('throws when voice channel is full', async () => {
      mocks.prisma.channel.findFirst.mockResolvedValue({ id: 'channel-1', type: 2, user_limit: 1 });
      mocks.prisma.voiceState.findUnique.mockResolvedValue(null);
      mocks.getChannelPermissions.mockResolvedValue(BigInt(1024));
      mocks.prisma.voiceState.count.mockResolvedValue(1);

      await expect(updateOwnVoiceState('guild-1', 'user-1', { channel_id: 'channel-1' }))
        .rejects.toThrow('Voice channel is full');
    });
  });

  describe('updateModeratedVoiceState', () => {
    it('moves a user to another channel when moderator has permission', async () => {
      mocks.prisma.channel.findFirst.mockResolvedValue({ id: 'channel-2', type: 2, user_limit: 0 });
      mocks.prisma.voiceState.findUnique.mockResolvedValue({ channel_id: 'channel-1' });
      mocks.getMemberPermissions.mockResolvedValue(BigInt(1048576)); // MOVE_MEMBERS
      mocks.prisma.voiceState.upsert.mockResolvedValue({
        guild_id: 'guild-1',
        user_id: 'user-2',
        channel_id: 'channel-2',
      });

      const result = await updateModeratedVoiceState('guild-1', 'admin-1', 'user-2', { channel_id: 'channel-2' });
      expect(result.channel_id).toBe('channel-2');
    });

    it('throws when moderator lacks permission', async () => {
      mocks.getMemberPermissions.mockResolvedValue(BigInt(0));
      mocks.checkPermission.mockImplementationOnce(() => {
        throw new mocks.AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
      });

      await expect(updateModeratedVoiceState('guild-1', 'admin-1', 'user-2', { channel_id: 'channel-2' }))
        .rejects.toThrow();
    });
  });
});
