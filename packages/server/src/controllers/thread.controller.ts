import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, writeAuditLog, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

function checkThreadPermission(perms: bigint, bit: bigint, message: string = 'Missing required permissions'): void {
  if ((perms & BigInt(0x8)) !== BigInt(0)) return; // ADMINISTRATOR bypass
  if ((perms & bit) === BigInt(0)) throw new AppError(403, 'MISSING_PERMISSIONS', message);
}

async function ensureThreadAccess(threadId: string, userId: string) {
  const thread = await prisma.channel.findUnique({
    where: { id: threadId },
    include: { parent: true, thread_members: true },
  });
  if (!thread || (thread.type !== 10 && thread.type !== 11 && thread.type !== 12)) {
    throw new AppError(404, 'NOT_FOUND', 'Thread not found');
  }
  if (thread.guild_id) {
    const perms = await getMemberPermissions(thread.guild_id, userId);
    checkThreadPermission(perms, BigInt(0x400), 'Missing VIEW_CHANNEL');
    return { thread, perms };
  }
  return { thread, perms: BigInt('0xFFFFFFFFFFFFFFFF') };
}

function parseThreadMetadata(metadata: any): any {
  if (typeof metadata === 'string') {
    try { return JSON.parse(metadata); } catch { return {}; }
  }
  return metadata || {};
}

export async function startThreadFromMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId, messageId } = req.params;
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (channel.type !== 0 && channel.type !== 5 && channel.type !== 15) {
      throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Can only start threads from text, announcement, or forum channels');
    }

    const message = await prisma.message.findUnique({ where: { id: messageId } });
    if (!message || message.channel_id !== channelId) {
      throw new AppError(404, 'NOT_FOUND', 'Message not found in this channel');
    }

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkThreadPermission(perms, BigInt(0x800000000)); // CREATE_PUBLIC_THREADS
    }

    const name = req.body.name || message.content?.slice(0, 100) || 'Thread';
    const threadId = generateSnowflake();
    const autoArchive = req.body.auto_archive_duration || channel.default_auto_archive_duration || 1440;

    const thread = await prisma.channel.create({
      data: {
        id: threadId,
        guild_id: channel.guild_id,
        name,
        type: 11, // PUBLIC_THREAD
        parent_id: channelId,
        default_auto_archive_duration: autoArchive,
        thread_metadata: {
          archived: false,
          auto_archive_duration: autoArchive,
          archive_timestamp: null,
          locked: false,
          invitable: true,
          create_timestamp: new Date().toISOString(),
        } as any,
        total_messages: 0,
        member_count: 0,
      },
    });

    await prisma.message.update({
      where: { id: messageId },
      data: { thread_id: threadId },
    });

    await prisma.threadMember.create({
      data: {
        id: generateSnowflake(),
        thread_id: threadId,
        user_id: req.user!.userId,
        flags: 0,
      },
    });

    await prisma.channel.update({
      where: { id: channelId },
      data: { total_messages: { increment: 1 } },
    });

    const io = getIO();
    if (io && channel.guild_id) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.THREAD_CREATE, { thread });
    }
    if (channel.guild_id) {
      await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.THREAD_CREATE, thread.id, 'CHANNEL', [
        { key: 'parent_id', old_value: null, new_value: channelId },
        { key: 'name', old_value: null, new_value: thread.name },
        { key: 'auto_archive_duration', old_value: null, new_value: autoArchive },
        { key: 'source_message_id', old_value: null, new_value: messageId },
      ]);
    }

    res.status(201).json(thread);
  } catch (err) {
    next(err);
  }
}

export async function startThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId } = req.params;
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (channel.type !== 0 && channel.type !== 5 && channel.type !== 15) {
      throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Can only start threads from text, announcement, or forum channels');
    }

    if (!req.body.name || req.body.name.length < 1 || req.body.name.length > 100) {
      throw new AppError(400, 'INVALID_NAME', 'Thread name must be 1-100 characters');
    }

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      const threadBit = channel.type === 15 ? BigInt(0x800000000) : BigInt(0x800000000);
      checkThreadPermission(perms, threadBit);
    }

    const threadId = generateSnowflake();
    const autoArchive = req.body.auto_archive_duration || channel.default_auto_archive_duration || 1440;
    const threadType = req.body.private ? 12 : 11; // PRIVATE_THREAD or PUBLIC_THREAD

    const thread = await prisma.channel.create({
      data: {
        id: threadId,
        guild_id: channel.guild_id,
        name: req.body.name,
        type: threadType,
        parent_id: channelId,
        default_auto_archive_duration: autoArchive,
        thread_metadata: {
          archived: false,
          auto_archive_duration: autoArchive,
          archive_timestamp: null,
          locked: false,
          invitable: !req.body.private,
          create_timestamp: new Date().toISOString(),
        } as any,
        total_messages: 0,
        member_count: 0,
      },
    });

    // Create initial message if provided (for forum threads)
    if (req.body.message && channel.type === 15) {
      await prisma.message.create({
        data: {
          id: generateSnowflake(),
          channel_id: threadId,
          author_id: req.user!.userId,
          content: req.body.message.content || '',
          type: 0,
        },
      });
      await prisma.channel.update({
        where: { id: threadId },
        data: { total_messages: { increment: 1 } },
      });
    }

    // Apply tags for forum threads
    if (req.body.applied_tags && Array.isArray(req.body.applied_tags)) {
      for (const tagId of req.body.applied_tags) {
        await prisma.appliedTag.create({
          data: { thread_id: threadId, tag_id: tagId },
        });
      }
    }

    await prisma.threadMember.create({
      data: {
        id: generateSnowflake(),
        thread_id: threadId,
        user_id: req.user!.userId,
        flags: 0,
      },
    });

    await prisma.channel.update({
      where: { id: channelId },
      data: { total_messages: { increment: 1 } },
    });

    const io = getIO();
    if (io && channel.guild_id) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.THREAD_CREATE, { thread });
    }
    if (channel.guild_id) {
      await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.THREAD_CREATE, thread.id, 'CHANNEL', [
        { key: 'parent_id', old_value: null, new_value: channelId },
        { key: 'name', old_value: null, new_value: thread.name },
        { key: 'auto_archive_duration', old_value: null, new_value: autoArchive },
        { key: 'applied_tags', old_value: null, new_value: req.body.applied_tags || [] },
      ]);
    }

    res.status(201).json(thread);
  } catch (err) {
    next(err);
  }
}

export async function getActiveThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId } = req.params;
    const parent = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!parent) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (parent.guild_id) {
      const perms = await getMemberPermissions(parent.guild_id, req.user!.userId);
      checkThreadPermission(perms, BigInt(0x400), 'Missing VIEW_CHANNEL');
    }

    const threads = await prisma.channel.findMany({
      where: {
        parent_id: channelId,
        type: { in: [10, 11, 12] },
        thread_metadata: { equals: 'false' },
      },
      orderBy: { last_message_id: 'desc' },
      take: 50,
    });

    res.json({ threads });
  } catch (err) {
    next(err);
  }
}

export async function getArchivedThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId } = req.params;
    const parent = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!parent) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    if (parent.guild_id) {
      const perms = await getMemberPermissions(parent.guild_id, req.user!.userId);
      checkThreadPermission(perms, BigInt(0x400), 'Missing VIEW_CHANNEL');
    }

    const type = req.query.type as string || 'public';
    const where: any = {
      parent_id: channelId,
      type: type === 'private' ? 12 : 11,
      thread_metadata: { path: 'archived', equals: true },
    };

    // For private archived, check MANAGE_THREADS or membership
    if (type === 'private') {
      if (parent.guild_id) {
        const perms = await getMemberPermissions(parent.guild_id, req.user!.userId);
        const isMember = await prisma.threadMember.findUnique({
          where: { thread_id_user_id: { thread_id: channelId, user_id: req.user!.userId } },
        });
        if (!(perms & BigInt(0x400000000)) && !isMember) {
          throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing MANAGE_THREADS');
        }
      }
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

export async function getMyPrivateArchivedThreads(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { channelId } = req.params;
    const parent = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!parent) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const threads = await prisma.channel.findMany({
      where: {
        parent_id: channelId,
        type: 12, // PRIVATE_THREAD
        thread_metadata: { equals: 'true' },
        thread_members: { some: { user_id: req.user!.userId } },
      },
      orderBy: { last_message_id: 'desc' },
      take: 25,
    });

    res.json({ threads });
  } catch (err) {
    next(err);
  }
}

export async function joinThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId !== '@me' && req.params.userId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Can only join thread for yourself');
    }
    const { thread, perms } = await ensureThreadAccess(req.params.threadId, req.user!.userId);
    checkThreadPermission(perms, BigInt(0x4000000000), 'Missing SEND_MESSAGES_IN_THREADS');

    const metadata = parseThreadMetadata(thread.thread_metadata);
    if (metadata.locked) {
      checkThreadPermission(perms, BigInt(0x400000000), 'Thread is locked');
    }

    const existing = await prisma.threadMember.findUnique({
      where: { thread_id_user_id: { thread_id: req.params.threadId, user_id: req.user!.userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_MEMBER', 'Already a member of this thread');

    // Check if private thread and not invitable
    if (thread.type === 12 && !metadata.invitable) {
      throw new AppError(403, 'FORBIDDEN', 'This private thread is not invitable');
    }

    await prisma.threadMember.create({
      data: {
        id: generateSnowflake(),
        thread_id: req.params.threadId,
        user_id: req.user!.userId,
        flags: 0,
      },
    });

    await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { member_count: { increment: 1 } },
    });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_MEMBER_ADD, {
        thread_id: req.params.threadId,
        user_id: req.user!.userId,
      });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function leaveThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId !== '@me' && req.params.userId !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Can only leave thread for yourself');
    }
    const { thread } = await ensureThreadAccess(req.params.threadId, req.user!.userId);

    await prisma.threadMember.delete({
      where: { thread_id_user_id: { thread_id: req.params.threadId, user_id: req.user!.userId } },
    });

    await prisma.channel.update({
      where: { id: req.params.threadId },
      data: { member_count: { decrement: 1 } },
    });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_MEMBER_REMOVE, {
        thread_id: req.params.threadId,
        user_id: req.user!.userId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addThreadMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { threadId, userId } = req.params;
    const { thread, perms } = await ensureThreadAccess(threadId, req.user!.userId);

    // Only creator or MANAGE_THREADS can add members to private threads
    if (thread.type === 12) {
      const isCreator = thread.thread_members?.some((m: any) => m.user_id === req.user!.userId);
      if (!isCreator) {
        checkThreadPermission(perms, BigInt(0x400000000), 'Missing MANAGE_THREADS');
      }
    }

    const existing = await prisma.threadMember.findUnique({
      where: { thread_id_user_id: { thread_id: threadId, user_id: userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_MEMBER', 'User is already a member of this thread');

    await prisma.threadMember.create({
      data: {
        id: generateSnowflake(),
        thread_id: threadId,
        user_id: userId,
        flags: 0,
      },
    });

    await prisma.channel.update({
      where: { id: threadId },
      data: { member_count: { increment: 1 } },
    });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_MEMBER_ADD, {
        thread_id: threadId,
        user_id: userId,
      });
    }

    res.status(201).json({ success: true });
  } catch (err) {
    next(err);
  }
}

export async function removeThreadMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { threadId, userId } = req.params;
    const { thread, perms } = await ensureThreadAccess(threadId, req.user!.userId);

    // Can remove self or others with permission
    if (userId !== req.user!.userId) {
      checkThreadPermission(perms, BigInt(0x400000000), 'Missing MANAGE_THREADS');
    }

    await prisma.threadMember.delete({
      where: { thread_id_user_id: { thread_id: threadId, user_id: userId } },
    });

    await prisma.channel.update({
      where: { id: threadId },
      data: { member_count: { decrement: 1 } },
    });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_MEMBER_REMOVE, {
        thread_id: threadId,
        user_id: userId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getThreadMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await ensureThreadAccess(req.params.threadId, req.user!.userId);
    const withMember = req.query.with_member === 'true';

    const members = await prisma.threadMember.findMany({
      where: { thread_id: req.params.threadId },
      include: withMember ? {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
        thread: { select: { guild_id: true } },
      } : undefined,
      orderBy: { join_timestamp: 'asc' },
    });

    res.json({ members });
  } catch (err) {
    next(err);
  }
}

export async function getThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread } = await ensureThreadAccess(req.params.threadId, req.user!.userId);
    res.json(thread);
  } catch (err) {
    next(err);
  }
}

export async function updateThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadAccess(req.params.threadId, req.user!.userId);

    const { name, archived, locked, invitable, auto_archive_duration, applied_tags } = req.body;
    const metadata = parseThreadMetadata(thread.thread_metadata);

    if (archived !== undefined || locked !== undefined || name !== undefined || invitable !== undefined) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    if (name !== undefined) {
      if (name.length < 1 || name.length > 100) {
        throw new AppError(400, 'INVALID_NAME', 'Thread name must be 1-100 characters');
      }
      metadata.name = name;
    }
    if (archived !== undefined) {
      if (archived && metadata.locked && !(perms & BigInt(0x400000000))) {
        throw new AppError(403, 'FORBIDDEN', 'Cannot unarchive a locked thread without MANAGE_THREADS');
      }
      metadata.archived = archived;
      metadata.archive_timestamp = archived ? new Date().toISOString() : null;
    }
    if (locked !== undefined) {
      metadata.locked = locked;
    }
    if (invitable !== undefined) {
      metadata.invitable = invitable;
    }
    if (auto_archive_duration !== undefined) {
      metadata.auto_archive_duration = auto_archive_duration;
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.threadId },
      data: {
        name: name !== undefined ? name : thread.name,
        thread_metadata: metadata as any,
      },
    });

    // Update applied tags if provided
    if (applied_tags !== undefined && Array.isArray(applied_tags)) {
      await prisma.appliedTag.deleteMany({ where: { thread_id: req.params.threadId } });
      for (const tagId of applied_tags) {
        await prisma.appliedTag.create({
          data: { thread_id: req.params.threadId, tag_id: tagId },
        });
      }
    }

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_UPDATE, { thread: updated });
    }
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.THREAD_UPDATE, thread.id, 'CHANNEL', [
        { key: 'thread_metadata', old_value: thread.thread_metadata, new_value: updated.thread_metadata },
        { key: 'name', old_value: thread.name, new_value: updated.name },
      ]);
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteThread(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { thread, perms } = await ensureThreadAccess(req.params.threadId, req.user!.userId);

    if (thread.guild_id) {
      checkThreadPermission(perms, BigInt(0x400000000)); // MANAGE_THREADS
    }

    await prisma.channel.delete({ where: { id: req.params.threadId } });

    const io = getIO();
    if (io && thread.guild_id) {
      io.to(`guild:${thread.guild_id}`).emit(GatewayEvents.THREAD_DELETE, { thread_id: req.params.threadId });
    }
    if (thread.guild_id) {
      await writeAuditLog(thread.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.THREAD_DELETE, thread.id, 'CHANNEL', [
        { key: 'parent_id', old_value: thread.parent_id, new_value: null },
        { key: 'name', old_value: thread.name, new_value: null },
      ]);
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
