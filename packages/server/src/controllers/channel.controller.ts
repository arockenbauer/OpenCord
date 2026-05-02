import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, requireMembership, writeAuditLog } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { getChannelPermissions } from './message.controller.js';

export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10));

    const channel = await prisma.channel.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        name: req.body.name,
        type: req.body.type || 0,
        parent_id: req.body.parent_id || null,
        topic: req.body.topic || null,
        nsfw: req.body.nsfw || false,
        position: req.body.position ?? 0,
        slowmode_delay: req.body.slowmode_delay ?? 0,
        bitrate: req.body.bitrate ?? 64000,
        user_limit: req.body.user_limit ?? 0,
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.CHANNEL_CREATE, { channel });
    await writeAuditLog(req.params.guildId, req.user!.userId, 'CHANNEL_CREATE', channel.id, 'CHANNEL', { name: channel.name, type: channel.type });

    res.status(201).json(channel);
  } catch (err) {
    next(err);
  }
}

export async function getChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({
      where: { id: req.params.channelId },
      include: { permission_overwrites: true },
    });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      await requireMembership(channel.guild_id, req.user!.userId);
      const perms = await getChannelPermissions(channel.id, req.user!.userId);
      checkPermission(perms, BigInt(0x400)); // VIEW_CHANNEL
    }

    res.json(channel);
  } catch (err) {
    next(err);
  }
}

export async function updateChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkPermission(perms, BigInt(0x10));
    }

    const allowedFields: Record<string, any> = {};
    const possibleFields = ['name', 'topic', 'position', 'nsfw', 'parent_id', 'slowmode_delay', 'bitrate', 'user_limit'];
    for (const field of possibleFields) {
      if (req.body[field] !== undefined) allowedFields[field] = req.body[field];
    }

    const updated = await prisma.channel.update({
      where: { id: req.params.channelId },
      data: allowedFields,
    });

    if (channel.guild_id) {
      const io = getIO();
      if (io) io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_UPDATE, { channel: updated });
      await writeAuditLog(channel.guild_id, req.user!.userId, 'CHANNEL_UPDATE', channel.id, 'CHANNEL', { before: channel, after: updated });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkPermission(perms, BigInt(0x10));
    }

    // Clean up related records for DM channels
    if (!channel.guild_id) {
      await prisma.dMChannelMember.deleteMany({ where: { channel_id: req.params.channelId } });
      await prisma.dMChannel.delete({ where: { id: req.params.channelId } });
    }

    await prisma.channel.delete({ where: { id: req.params.channelId } });

    if (channel.guild_id) {
      const io = getIO();
      if (io) io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_DELETE, { id: channel.id, guild_id: channel.guild_id });
      await writeAuditLog(channel.guild_id, req.user!.userId, 'CHANNEL_DELETE', channel.id, 'CHANNEL', { name: channel.name, type: channel.type });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function updatePermissionOverwrite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const updated = await prisma.permissionOverwrite.upsert({
      where: {
        channel_id_target_id_target_type: {
          channel_id: req.params.channelId,
          target_id: req.params.overwriteId,
          target_type: req.body.type || 'role',
        },
      },
      create: {
        id: generateSnowflake(),
        channel_id: req.params.channelId,
        target_id: req.params.overwriteId,
        target_type: req.body.type || 'role',
        allow: String(req.body.allow || '0'),
        deny: String(req.body.deny || '0'),
      },
      update: {
        allow: String(req.body.allow || '0'),
        deny: String(req.body.deny || '0'),
      },
    });
    await writeAuditLog(channel.guild_id, req.user!.userId, 'CHANNEL_OVERWRITE_UPDATE', updated.id, 'PERMISSION_OVERWRITE', {
      channel_id: req.params.channelId,
      target_id: req.params.overwriteId,
      target_type: req.body.type || 'role',
      allow: updated.allow,
      deny: updated.deny,
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deletePermissionOverwrite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const deleted = await prisma.permissionOverwrite.deleteMany({
      where: { channel_id: req.params.channelId, target_id: req.params.overwriteId },
    });
    await writeAuditLog(channel.guild_id, req.user!.userId, 'CHANNEL_OVERWRITE_DELETE', req.params.overwriteId, 'PERMISSION_OVERWRITE', {
      channel_id: req.params.channelId,
      deleted_count: deleted.count,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function createPermissionOverwrite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x10000000));

    const targetId = req.body.target_id;
    const targetType = req.body.type || 'role';
    if (!targetId) throw new AppError(400, 'MISSING_FIELD', 'target_id is required');

    const existing = await prisma.permissionOverwrite.findUnique({
      where: { channel_id_target_id_target_type: { channel_id: req.params.channelId, target_id: targetId, target_type: targetType } },
    });
    if (existing) {
      const updated = await prisma.permissionOverwrite.update({
        where: { id: existing.id },
        data: { allow: String(req.body.allow || '0'), deny: String(req.body.deny || '0') },
      });
      res.json(updated);
      return;
    }

    const overwrite = await prisma.permissionOverwrite.create({
      data: {
        id: generateSnowflake(),
        channel_id: req.params.channelId,
        target_id: targetId,
        target_type: targetType,
        allow: String(req.body.allow || '0'),
        deny: String(req.body.deny || '0'),
      },
    });
    await writeAuditLog(channel.guild_id, req.user!.userId, 'CHANNEL_OVERWRITE_CREATE', overwrite.id, 'PERMISSION_OVERWRITE', {
      channel_id: req.params.channelId,
      target_id: targetId,
      target_type: targetType,
      allow: overwrite.allow,
      deny: overwrite.deny,
    });

    res.status(201).json(overwrite);
  } catch (err) {
    next(err);
  }
}

export async function triggerTyping(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const member = await prisma.guildMember.findUnique({
        where: { guild_id_user_id: { guild_id: channel.guild_id, user_id: req.user!.userId } },
      });
      if (!member) throw new AppError(403, 'NOT_MEMBER', 'Not a member of this server');
    }

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.TYPING_START, {
        channel_id: req.params.channelId,
        user_id: req.user!.userId,
        timestamp: Math.floor(Date.now() / 1000),
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function followChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    if (channel.type !== 5) throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Can only follow announcement channels');

    if (!channel.guild_id) throw new AppError(400, 'INVALID_CHANNEL', 'Channel must be in a server');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x20000000)); // MANAGE_WEBHOOKS

    const { webhook_channel_id } = req.body;
    if (!webhook_channel_id) throw new AppError(400, 'MISSING_FIELD', 'webhook_channel_id is required');

    const targetChannel = await prisma.channel.findUnique({ where: { id: webhook_channel_id } });
    if (!targetChannel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Target channel not found');

    const webhook = await prisma.webhook.create({
      data: {
        id: generateSnowflake(),
        type: 2, // Channel Follow webhook
        guild_id: channel.guild_id,
        channel_id: req.params.channelId,
        name: `${channel.name} updates`,
        token: crypto.randomBytes(32).toString('hex'),
        creator_id: req.user!.userId,
        source_channel_id: req.params.channelId,
        source_guild_id: channel.guild_id,
      },
    });
    await writeAuditLog(channel.guild_id, req.user!.userId, 'WEBHOOK_FOLLOW_CREATE', webhook.id, 'WEBHOOK', {
      source_channel_id: req.params.channelId,
      target_channel_id: webhook_channel_id,
      type: 2,
    });

    res.status(201).json({ channel_id: req.params.channelId, webhook_id: webhook.id });
  } catch (err) {
    next(err);
  }
}
