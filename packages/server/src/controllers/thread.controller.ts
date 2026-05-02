import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, writeAuditLog } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

function checkThreadPermission(perms: bigint, bit: bigint, message: string = 'Missing required permissions'): void {
  if ((perms & BigInt(0x8)) !== BigInt(0)) return; // ADMINISTRATOR bypass
  if ((perms & bit) === BigInt(0)) throw new AppError(403, 'MISSING_PERMISSIONS', message);
}

async function ensureThreadVisibility(threadId: string, userId: string) {
  const thread = await prisma.channel.findUnique({ where: { id: threadId } });
  if (!thread || thread.type !== 11) throw new AppError(404, 'NOT_FOUND', 'Thread not found');
  if (thread.guild_id) {
    const perms = await getMemberPermissions(thread.guild_id, userId);
    checkThreadPermission(perms, BigInt(0x400), 'Missing VIEW_CHANNEL');
    return { thread, perms };
  }
  return { thread, perms: BigInt('0xFFFFFFFFFFFFFFFF') };
}

export async function startThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (channel.type !== 0 && channel.type !== 11) {
      throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Can only start threads in text channels');
    }

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      const threadBit = (channel.type as number) === 12 ? BigInt(0x1000000000) : BigInt(0x800000000); // private vs public
      checkThreadPermission(perms, threadBit);
    }

    const name = req.body.name || req.body.message?.content?.slice(0, 100) || 'Thread';
    const threadId = generateSnowflake();
    const autoArchive = req.body.auto_archive_duration || channel.default_auto_archive_duration || 1440;

    const thread = await prisma.channel.create({
      data: {
        id: threadId,
        guild_id: channel.guild_id,
        name,
        type: 11,
        parent_id: req.params.channelId,
        default_auto_archive_duration: autoArchive,
        thread_metadata: JSON.stringify({
          auto_archive_duration: autoArchive,
          archive_timestamp: null,
          locked: false,
          invitable: true,
        }),
      },
    });

    if (req.body.message_id) {
      const message = await prisma.message.findUnique({ where: { id: req.body.message_id } });
      if (message) {
        await prisma.message.update({
          where: { id: req.body.message_id },
          data: { thread_id: threadId },
        });
      }
    }

    await prisma.channel.update({
      where: { id: req.params.channelId },
      data: { total_messages: { increment: 1 } },
    });

    // Auto-join creator to thread
    await prisma.threadMember.create({
      data: { id: generateSnowflake(), thread_id: threadId, user_id: req.user!.userId },
    });

    const io = getIO();
    if (io && channel.guild_id) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_CREATE, { channel: thread });
    }
    if (channel.guild_id) {
      await writeAuditLog(channel.guild_id, req.user!.userId, 'THREAD_CREATE', thread.id, 'CHANNEL', {
        parent_id: req.params.channelId,
        name: thread.name,
        auto_archive_duration: autoArchive,
        source_message_id: req.body.message_id || null,
      });
    }

    res.status(201).json(thread);
  } catch (err) {
    next(err);
  }
}

export async function startThreadWithoutMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const name = req.body.name;
    if (!name || name.length < 1 || name.length > 100) throw new AppError(400, 'INVALID_NAME', 'Thread name must be 1-100 characters');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      const threadBit = (channel.type as number) === 12 ? BigInt(0x1000000000) : BigInt(0x800000000); // private vs public
      checkThreadPermission(perms, threadBit);
    }

    const threadId = generateSnowflake();
    const autoArchive = req.body.auto_archive_duration || 1440;

    const thread = await prisma.channel.create({
      data: {
        id: threadId,
        guild_id: channel.guild_id,
        name,
        type: 11,
        parent_id: req.params.channelId,
        default_auto_archive_duration: autoArchive,
        thread_metadata: JSON.stringify({
          auto_archive_duration: autoArchive,
          archive_timestamp: null,
          locked: false,
          invitable: true,
        }),
      },
    });

    // Auto-join creator to thread
    await prisma.threadMember.create({
      data: { id: generateSnowflake(), thread_id: threadId, user_id: req.user!.userId },
    });

    const io = getIO();
    if (io && channel.guild_id) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_CREATE, { channel: thread });
    }
    if (channel.guild_id) {
      await writeAuditLog(channel.guild_id, req.user!.userId, 'THREAD_CREATE', thread.id, 'CHANNEL', {
        parent_id: req.params.channelId,
        name: thread.name,
        auto_archive_duration: autoArchive,
        source_message_id: null,
      });
    }

    res.status(201).json(thread);
  } catch (err) {
    next(err);
  }
}

export async function joinThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Can only join thread for yourself');
    const { thread, perms } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);
    checkThreadPermission(perms, BigInt(0x4000000000), 'Missing SEND_MESSAGES_IN_THREADS');

    const existing = await prisma.threadMember.findUnique({
      where: { thread_id_user_id: { thread_id: req.params.threadId, user_id: req.user!.userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_MEMBER', 'Already a member of this thread');

    await prisma.threadMember.create({
      data: { id: generateSnowflake(), thread_id: req.params.threadId, user_id: req.user!.userId },
    });

    await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { member_count: { increment: 1 } },
    });
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_MEMBER_ADD', req.user!.userId, 'USER', {
        thread_id: req.params.threadId,
      });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function leaveThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId !== req.user!.userId) throw new AppError(403, 'FORBIDDEN', 'Can only leave thread for yourself');
    const { thread } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);
    await prisma.threadMember.delete({
      where: { thread_id_user_id: { thread_id: req.params.threadId, user_id: req.user!.userId } },
    });

    await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { member_count: { decrement: 1 } },
    });
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_MEMBER_REMOVE', req.user!.userId, 'USER', {
        thread_id: req.params.threadId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getThreadMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureThreadVisibility(req.params.threadId, req.user!.userId);
    const members = await prisma.threadMember.findMany({
      where: { thread_id: req.params.threadId },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
      orderBy: { join_timestamp: 'asc' },
    });
    res.json({ members });
  } catch (err) {
    next(err);
  }
}

export async function getThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);
    res.json(thread);
  } catch (err) {
    next(err);
  }
}

export async function updateThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);

    const { name, archived, locked, invitable } = req.body;
    const metadata = JSON.parse(thread.thread_metadata || '{}');

    if (thread.guild_id && (archived !== undefined || locked !== undefined || name !== undefined || invitable !== undefined)) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    if (name !== undefined) metadata.name = name;
    if (archived !== undefined) {
      metadata.archive_timestamp = archived ? new Date().toISOString() : null;
    }
    if (locked !== undefined) metadata.locked = locked;
    if (invitable !== undefined) metadata.invitable = invitable;

    const updated = await prisma.channel.update({
      where: { id: req.params.threadId },
      data: {
        name: name !== undefined ? name : thread.name,
        thread_metadata: JSON.stringify(metadata),
      },
    });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.CHANNEL_UPDATE, { channel: updated });
    }
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_UPDATE', thread.id, 'CHANNEL', {
        before: thread.thread_metadata,
        after: updated.thread_metadata,
        name_before: thread.name,
        name_after: updated.name,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);

    if (thread.guild_id) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    await prisma.channel.delete({ where: { id: req.params.threadId } });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.CHANNEL_DELETE, { channel_id: req.params.threadId });
    }
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_DELETE', thread.id, 'CHANNEL', {
        parent_id: thread.parent_id,
        name: thread.name,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function archiveThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);

    if (thread.guild_id) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    const metadata = JSON.parse(thread.thread_metadata || '{}');
    metadata.archive_timestamp = new Date().toISOString();

    const updated = await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { thread_metadata: JSON.stringify(metadata) },
    });
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_UPDATE', thread.id, 'CHANNEL', {
        before: thread.thread_metadata,
        after: updated.thread_metadata,
        archived: true,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function lockThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadVisibility(req.params.threadId, req.user!.userId);

    if (thread.guild_id) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    const metadata = JSON.parse(thread.thread_metadata || '{}');
    metadata.locked = true;

    const updated = await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { thread_metadata: JSON.stringify(metadata) },
    });
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, 'THREAD_UPDATE', thread.id, 'CHANNEL', {
        before: thread.thread_metadata,
        after: updated.thread_metadata,
        locked: true,
      });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getArchivedThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const parent = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!parent) throw new AppError(404, 'NOT_FOUND', 'Channel not found');
    if (parent.guild_id) {
      const perms = await getMemberPermissions(parent.guild_id, req.user!.userId);
      checkThreadPermission(perms, BigInt(0x400), 'Missing VIEW_CHANNEL');
      checkThreadPermission(perms, BigInt(0x10000), 'Missing READ_MESSAGE_HISTORY');
    }

    const type = req.query.type as string || 'public';
    const parentId = req.params.channelId;

    const where: any = { parent_id: parentId, type: 11 };
    if (type === 'public') {
      where.thread_metadata = { contains: '"archive_timestamp"' };
    }

    const threads = await prisma.channel.findMany({
      where,
      orderBy: { thread_metadata: 'desc' },
      take: 25,
    });

    res.json({ threads });
  } catch (err) {
    next(err);
  }
}
