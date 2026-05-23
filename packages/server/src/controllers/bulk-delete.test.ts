import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
      findUnique: vi.fn(),
    },
    channel: {
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

import { bulkDeleteMessages } from './message.controller.js';

describe('bulk delete messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deletes up to 100 messages when user has MANAGE_MESSAGES', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000)); // MANAGE_MESSAGES
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', created_at: new Date() },
      { id: 'msg-2', created_at: new Date() },
    ]);
    mocks.prisma.channel.findUnique.mockResolvedValue({ guild_id: 'guild-1' });

    await bulkDeleteMessages('channel-1', 'user-1', ['msg-1', 'msg-2']);

    expect(mocks.prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['msg-1', 'msg-2'] } },
    });
  });

  it('throws when user lacks MANAGE_MESSAGES', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0)); // No permissions
    mocks.checkPermission.mockImplementation(() => {
      throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
    });

    await expect(bulkDeleteMessages('channel-1', 'user-1', ['msg-1']))
      .rejects.toThrow('Missing required permissions');
  });

  it('throws when more than 100 messages requested', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    const ids = Array.from({ length: 101 }, (_, i) => `msg-${i}`);
    
    await expect(bulkDeleteMessages('channel-1', 'user-1', ids))
      .rejects.toThrow('Cannot delete more than 100 messages');
  });

  it('skips messages older than 14 days', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    const oldDate = new Date(Date.now() - (15 * 24 * 60 * 60 * 1000)); // 15 days ago
    const recentDate = new Date();
    
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'old-msg', created_at: oldDate },
      { id: 'recent-msg', created_at: recentDate },
    ]);
    mocks.prisma.channel.findUnique.mockResolvedValue({ guild_id: 'guild-1' });

    await bulkDeleteMessages('channel-1', 'user-1', ['old-msg', 'recent-msg']);

    expect(mocks.prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['recent-msg'] } }, // Only recent
    });
  });

  it('throws when channel is not found', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    mocks.prisma.channel.findUnique.mockResolvedValue(null);

    await expect(bulkDeleteMessages('channel-1', 'user-1', ['msg-1']))
      .rejects.toThrow('Channel not found');
  });

  it('allows author to delete own messages regardless of age', async () => {
    const oldDate = new Date(Date.now() - (20 * 24 * 60 * 60 * 1000)); // 20 days ago
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'my-old-msg', author_id: 'user-1', created_at: oldDate },
    ]);
    mocks.prisma.channel.findUnique.mockResolvedValue({ guild_id: 'guild-1' });

    await bulkDeleteMessages('channel-1', 'user-1', ['my-old-msg']);

    expect(mocks.prisma.message.deleteMany).toHaveBeenCalled();
  });

  it('emits socket event for each deleted message', async () => {
    const io = vi.fn(() => ({
      emit: vi.fn(),
    }));
    vi.doMock('../gateway/index.js', () => ({
      getIO: io,
    }));

    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', created_at: new Date() },
    ]);
    mocks.prisma.channel.findUnique.mockResolvedValue({ guild_id: 'guild-1' });

    await bulkDeleteMessages('channel-1', 'user-1', ['msg-1']);

    expect(io().emit).toHaveBeenCalledWith('message:delete', expect.anything());
  });
});
