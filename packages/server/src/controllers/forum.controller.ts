import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

// Get all tags for a forum channel
export async function getForumTags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId;
    const tags = await prisma.forumTag.findMany({
      where: { channel_id: channelId },
      orderBy: { name: 'asc' },
    });
    res.json({ tags });
  } catch (err) {
    next(err);
  }
}

// Create a new forum tag
export async function createForumTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId;
    const { name, emoji_id, emoji_name, moderated } = req.body;

    if (!name || name.trim().length === 0 || name.length > 20) {
      throw new AppError(400, 'INVALID_NAME', 'Tag name must be 1-20 characters');
    }

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    if (channel.type !== 15 && channel.type !== 16) throw new AppError(400, 'NOT_FORUM', 'Channel is not a forum or media channel');

    const tag = await prisma.forumTag.create({
      data: {
        id: generateSnowflake(),
        guild_id: channel.guild_id!,
        channel_id: channelId,
        name: name.trim(),
        emoji_id: emoji_id || null,
        emoji_name: emoji_name || null,
        moderated: moderated || false,
      } as any,
    });

    // Update channel's available_tags
    const tags = await prisma.forumTag.findMany({ where: { channel_id: channelId } });
    await prisma.channel.update({
      where: { id: channelId },
      data: { available_tags: tags.length > 0 ? JSON.stringify(tags.map(t => ({ id: t.id, name: t.name, emoji_id: t.emoji_id, emoji_name: t.emoji_name }))) : undefined },
    });

    const io = getIO();
    if (io && channel.guild_id) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.GUILD_EMOJIS_UPDATE, {
        guild_id: channel.guild_id,
        tags,
      });
    }

    res.status(201).json({ tag });
  } catch (err) {
    next(err);
  }
}

// Update a forum tag
export async function updateForumTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tagId = req.params.tagId;
    const { name, emoji_id, emoji_name, moderated } = req.body;

    const tag = await prisma.forumTag.findUnique({ where: { id: tagId } });
    if (!tag) throw new AppError(404, 'TAG_NOT_FOUND', 'Tag not found');

    if (name && (name.length < 1 || name.length > 20)) {
      throw new AppError(400, 'INVALID_NAME', 'Tag name must be 1-20 characters');
    }

    const updated = await prisma.forumTag.update({
      where: { id: tagId },
      data: {
        name: name?.trim() || tag.name,
        emoji_id: emoji_id !== undefined ? emoji_id : tag.emoji_id,
        emoji_name: emoji_name !== undefined ? emoji_name : tag.emoji_name,
        moderated: moderated !== undefined ? moderated : tag.moderated,
      },
    });

    // Update channel's available_tags
    const tags = await prisma.forumTag.findMany({ where: { guild_id: tag.guild_id!, channel_id: tag.channel_id } });
    await prisma.channel.update({
      where: { id: tag.channel_id! },
      data: { available_tags: tags.length > 0 ? JSON.stringify(tags.map(t => ({ id: t.id, name: t.name, emoji_id: t.emoji_id, emoji_name: t.emoji_name }))) : undefined },
    });

    res.json({ tag: updated });
  } catch (err) {
    next(err);
  }
}

// Delete a forum tag
export async function deleteForumTag(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const tagId = req.params.tagId;
    const tag = await prisma.forumTag.findUnique({ where: { id: tagId } });
    if (!tag) throw new AppError(404, 'TAG_NOT_FOUND', 'Tag not found');

    await prisma.forumTag.delete({ where: { id: tagId } });

    // Update channel's available_tags
    const tags = await prisma.forumTag.findMany({ where: { channel_id: tag.channel_id } });
    const updateData: any = {};
    if (tags.length > 0) {
      updateData.available_tags = JSON.stringify(tags.map(t => ({ id: t.id, name: t.name, emoji_id: t.emoji_id, emoji_name: t.emoji_name })));
    }
    await prisma.channel.update({
      where: { id: tag.channel_id },
      data: updateData as any,
    } as any);

    // Remove applied tags
    await prisma.appliedTag.deleteMany({ where: { tag_id: tagId } });

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// Get applied tags for a thread
export async function getAppliedTags(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const threadId = req.params.threadId;
    const applied = await prisma.appliedTag.findMany({
      where: { thread_id: threadId },
      include: { tag: true },
    });
    res.json({ applied_tags: applied.map(a => a.tag) });
  } catch (err) {
    next(err);
  }
}
