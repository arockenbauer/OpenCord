import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';

const mocks = vi.hoisted(() => ({
  io: {
    to: vi.fn().mockReturnThis(),
    emit: vi.fn(),
  },
  prisma: {
    guild: {
      findUnique: vi.fn(),
    },
    role: {
      findFirst: vi.fn(),
    },
    guildMember: {
      findUnique: vi.fn(),
    },
    guildMemberRole: {
      findMany: vi.fn(),
    },
    message: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    channel: {
      findUnique: vi.fn(),
    },
    attachment: {
      findMany: vi.fn(),
      deleteMany: vi.fn(),
    },
    embed: {
      deleteMany: vi.fn(),
    },
    reaction: {
      deleteMany: vi.fn(),
    },
  },
  getMemberPermissions: vi.fn(),
  checkPermission: vi.fn(),
  getIO: vi.fn(),
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

import { bulkDelete } from './message.controller.js';

describe('bulk delete messages', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.checkPermission.mockResolvedValue(undefined);
    mocks.getIO.mockReturnValue(mocks.io);
    mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'user-1' });
    mocks.prisma.role.findFirst.mockResolvedValue({ permissions: '0' });
    mocks.prisma.guildMember.findUnique.mockResolvedValue({ pending: false, communication_disabled_until: null });
    mocks.prisma.guildMemberRole.findMany.mockResolvedValue([]);
    mocks.prisma.attachment.findMany.mockResolvedValue([]);
    mocks.prisma.attachment.deleteMany.mockResolvedValue({});
    mocks.prisma.embed.deleteMany.mockResolvedValue({});
    mocks.prisma.reaction.deleteMany.mockResolvedValue({});
  });

  function createReqRes(channelId: string, ids: string[], userId = 'user-1') {
    const req = {
      params: { channelId },
      body: { ids },
      user: { userId },
    } as any;
    const res = {
      status: vi.fn().mockReturnThis(),
      json: vi.fn(),
      send: vi.fn(),
    } as any;
    const next = vi.fn();
    return { req, res, next };
  }

  it('deletes messages when user has MANAGE_MESSAGES', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000)); // MANAGE_MESSAGES
    mocks.prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', guild_id: 'guild-1' });
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', created_at: new Date() },
      { id: 'msg-2', created_at: new Date() },
    ]);

    const { req, res, next } = createReqRes('channel-1', ['msg-1', 'msg-2']);
    await bulkDelete(req, res, next);

    expect(mocks.prisma.message.deleteMany).toHaveBeenCalledWith({
      where: { id: { in: ['msg-1', 'msg-2'] } },
    });
    expect(res.status).toHaveBeenCalledWith(204);
  });

  it('throws when user lacks MANAGE_MESSAGES', async () => {
    mocks.prisma.guild.findUnique.mockResolvedValue({ owner_id: 'someone-else' });
    mocks.prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', guild_id: 'guild-1' });
    mocks.prisma.role.findFirst.mockResolvedValue({ permissions: '0' });
    mocks.checkPermission.mockImplementation(() => {
      throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
    });

    const { req, res, next } = createReqRes('channel-1', ['msg-1']);
    await bulkDelete(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 403 }));
  });

  it('throws when channel is not found', async () => {
    mocks.prisma.channel.findUnique.mockResolvedValue(null);

    const { req, res, next } = createReqRes('channel-1', ['msg-1']);
    await bulkDelete(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 404 }));
  });

  it('skips messages older than 14 days', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    mocks.prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', guild_id: 'guild-1' });
    const oldDate = new Date(Date.now() - (15 * 24 * 60 * 60 * 1000)); // 15 days ago
    const recentDate = new Date();
    
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'old-msg', created_at: oldDate },
      { id: 'recent-msg', created_at: recentDate },
    ]);

    const { req, res, next } = createReqRes('channel-1', ['old-msg', 'recent-msg']);
    await bulkDelete(req, res, next);

    expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 400 }));
  });

  it('emits socket event for bulk delete', async () => {
    mocks.getMemberPermissions.mockResolvedValue(BigInt(0x2000));
    mocks.prisma.channel.findUnique.mockResolvedValue({ id: 'channel-1', guild_id: 'guild-1' });
    mocks.prisma.message.findMany.mockResolvedValue([
      { id: 'msg-1', created_at: new Date() },
    ]);

    const { req, res, next } = createReqRes('channel-1', ['msg-1']);
    await bulkDelete(req, res, next);

    expect(mocks.getIO().to).toHaveBeenCalledWith('channel:channel-1');
    expect(mocks.getIO().emit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      channel_id: 'channel-1',
    }));
  });
});
