import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, requireMembership, writeAuditLog, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents, PERMISSION_BITS } from '@opencord/shared';
import { getChannelPermissions } from './message.controller.js';
import { markTemplateDirty } from './guild.controller.js';
import { serializeBigInt } from '../utils/serialize.js';

async function emitChannelUpdate(channelId: string): Promise<void> {
  const channel = await prisma.channel.findUnique({
    where: { id: channelId },
    include: { permission_overwrites: true },
  });
  if (!channel?.guild_id) return;
  const io = getIO();
  if (io) {
    io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_UPDATE, serializeBigInt({ channel }));
  }
}

export async function createChannel(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, PERMISSION_BITS.MANAGE_CHANNELS, req.params.guildId, req.user!.userId);

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
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_CREATE, channel.id, 'CHANNEL', [
      { key: 'name', old_value: null, new_value: channel.name },
      { key: 'type', old_value: null, new_value: channel.type },
    ]);
    await markTemplateDirty(req.params.guildId);

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
      await checkPermission(perms, PERMISSION_BITS.VIEW_CHANNEL, channel.guild_id, req.user!.userId);
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
      await checkPermission(perms, PERMISSION_BITS.MANAGE_CHANNELS, channel.guild_id, req.user!.userId);
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

    // If this is a category channel and permissions were updated, sync child channels
    if (channel.guild_id && channel.type === 4) { // 4 = category type
      // Get all child channels that are synced with this category
      const childChannels = await prisma.channel.findMany({
        where: { guild_id: channel.guild_id, parent_id: channel.id },
      });
      
      const { syncChannelWithParent } = await import('../services/permission.service.js');
      for (const child of childChannels) {
        // Check if child is synced (has same overwrites as parent)
        const isSynced = await (await import('../services/permission.service.js')).isChannelSynced(child.id, channel.id);
        if (isSynced) {
          await syncChannelWithParent(child.id, channel.id);
          // Emit channel update for synced child
          const io = getIO();
          if (io) io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_UPDATE, { channel: child });
        }
      }
    }

    if (channel.guild_id) {
      const io = getIO();
      if (io) io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.CHANNEL_UPDATE, { channel: updated });
      await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_UPDATE, channel.id, 'CHANNEL', [
        { key: 'name', old_value: channel.name, new_value: updated.name },
        { key: 'topic', old_value: channel.topic, new_value: updated.topic },
        { key: 'nsfw', old_value: channel.nsfw, new_value: updated.nsfw },
        { key: 'parent_id', old_value: channel.parent_id, new_value: updated.parent_id },
        { key: 'position', old_value: channel.position, new_value: updated.position },
        { key: 'slowmode_delay', old_value: channel.slowmode_delay, new_value: updated.slowmode_delay },
        { key: 'bitrate', old_value: channel.bitrate?.toString(), new_value: updated.bitrate?.toString() },
        { key: 'user_limit', old_value: channel.user_limit, new_value: updated.user_limit },
      ].filter(c => c.old_value !== c.new_value));
      await markTemplateDirty(channel.guild_id);
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
      await checkPermission(perms, PERMISSION_BITS.MANAGE_CHANNELS, channel.guild_id, req.user!.userId);
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
      await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_DELETE, channel.id, 'CHANNEL', [
        { key: 'name', old_value: channel.name, new_value: null },
        { key: 'type', old_value: channel.type?.toString(), new_value: null },
      ]);
      await markTemplateDirty(channel.guild_id);
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
    await checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES, channel.guild_id, req.user!.userId);

    const existing = await prisma.permissionOverwrite.findFirst({
      where: { id: req.params.overwriteId, channel_id: req.params.channelId },
    });
    if (!existing) throw new AppError(404, 'OVERWRITE_NOT_FOUND', 'Permission overwrite not found');

    const data: { allow?: bigint; deny?: bigint } = {};
    if (req.body.allow !== undefined) data.allow = BigInt(req.body.allow);
    if (req.body.deny !== undefined) data.deny = BigInt(req.body.deny);

    const updated = await prisma.permissionOverwrite.update({
      where: { id: existing.id },
      data,
    });
    
    // If this channel has a parent category, check if it's still synced
    if (channel.parent_id) {
      const { isChannelSynced } = await import('../services/permission.service.js');
      const stillSynced = await isChannelSynced(channel.id, channel.parent_id);
      if (!stillSynced) {
        // Channel is now desynced from parent category
        console.log(`Channel ${channel.id} is now desynced from parent category ${channel.parent_id}`);
      }
    }
    
    await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_OVERWRITE_UPDATE, updated.id, 'PERMISSION_OVERWRITE', [
      { key: 'allow', old_value: existing.allow.toString(), new_value: updated.allow.toString() },
      { key: 'deny', old_value: existing.deny.toString(), new_value: updated.deny.toString() },
    ]);
    await emitChannelUpdate(req.params.channelId);

    res.json(serializeBigInt(updated));
  } catch (err) {
    next(err);
  }
}

export async function deletePermissionOverwrite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    await checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES, channel.guild_id, req.user!.userId);

    const deleted = await prisma.permissionOverwrite.deleteMany({
      where: { id: req.params.overwriteId, channel_id: req.params.channelId },
    });
    if (deleted.count === 0) throw new AppError(404, 'OVERWRITE_NOT_FOUND', 'Permission overwrite not found');
    await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_OVERWRITE_DELETE, req.params.overwriteId, 'PERMISSION_OVERWRITE', [
      { key: 'channel_id', old_value: req.params.channelId, new_value: null },
    ]);
    await emitChannelUpdate(req.params.channelId);

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
    await checkPermission(perms, PERMISSION_BITS.MANAGE_ROLES, channel.guild_id, req.user!.userId);

    const targetId = req.body.target_id;
    const targetType = req.body.type || 'role';
    if (!targetId) throw new AppError(400, 'MISSING_FIELD', 'target_id is required');

    const existing = await prisma.permissionOverwrite.findUnique({
      where: { channel_id_target_id_target_type: { channel_id: req.params.channelId, target_id: targetId, target_type: targetType } },
    });
    if (existing) {
      const updated = await prisma.permissionOverwrite.update({
        where: { id: existing.id },
        data: { allow: BigInt(req.body.allow || '0'), deny: BigInt(req.body.deny || '0') },
      });
      await emitChannelUpdate(req.params.channelId);
      res.json(serializeBigInt(updated));
      return;
    }

    const overwrite = await prisma.permissionOverwrite.create({
      data: {
        id: generateSnowflake(),
        channel_id: req.params.channelId,
        target_id: targetId,
        target_type: targetType,
        allow: BigInt(req.body.allow || '0'),
        deny: BigInt(req.body.deny || '0'),
      },
    });
    await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.CHANNEL_OVERWRITE_CREATE, overwrite.id, 'PERMISSION_OVERWRITE', [
      { key: 'channel_id', old_value: null, new_value: req.params.channelId },
      { key: 'target_id', old_value: null, new_value: targetId },
      { key: 'target_type', old_value: null, new_value: targetType },
      { key: 'allow', old_value: null, new_value: overwrite.allow.toString() },
      { key: 'deny', old_value: null, new_value: overwrite.deny.toString() },
    ]);
    await emitChannelUpdate(req.params.channelId);

    res.status(201).json(serializeBigInt(overwrite));
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
    const sourceChannel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!sourceChannel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    if (sourceChannel.type !== 5) throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Can only follow announcement channels');
    if (!sourceChannel.guild_id) throw new AppError(400, 'INVALID_CHANNEL', 'Source channel must be in a server');

    const { webhook_channel_id } = req.body;
    if (!webhook_channel_id) throw new AppError(400, 'MISSING_FIELD', 'webhook_channel_id is required');

    const targetChannel = await prisma.channel.findUnique({ where: { id: webhook_channel_id } });
    if (!targetChannel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Target channel not found');
    if (!targetChannel.guild_id) throw new AppError(400, 'INVALID_CHANNEL', 'Target channel must be in a server');

    // Check MANAGE_WEBHOOKS in target guild
    const targetPerms = await getMemberPermissions(targetChannel.guild_id, req.user!.userId);
    await checkPermission(targetPerms, BigInt(0x20000000), targetChannel.guild_id, req.user!.userId); // MANAGE_WEBHOOKS

    // Check limit: max 10 follows per target channel
    const existingFollows = await prisma.channelFollower.count({ where: { target_channel_id: webhook_channel_id } });
    if (existingFollows >= 10) throw new AppError(400, 'FOLLOW_LIMIT_REACHED', 'Maximum 10 follows per target channel');

    // Check if already following
    const existingFollow = await prisma.channelFollower.findUnique({
      where: { source_channel_id_target_channel_id: { source_channel_id: req.params.channelId, target_channel_id: webhook_channel_id } },
    });
    if (existingFollow) throw new AppError(400, 'ALREADY_FOLLOWING', 'Already following this channel');

    // Create webhook of type CHANNEL_FOLLOWER (2)
    const webhook = await prisma.webhook.create({
      data: {
        id: generateSnowflake(),
        type: 2, // CHANNEL_FOLLOWER
        guild_id: targetChannel.guild_id,
        channel_id: webhook_channel_id,
        name: `${sourceChannel.name} updates`,
        token: crypto.randomBytes(32).toString('hex'),
        creator_id: req.user!.userId,
        source_channel_id: req.params.channelId,
        source_guild_id: sourceChannel.guild_id,
      },
    });

    // Create ChannelFollower entry
    await prisma.channelFollower.create({
      data: {
        source_channel_id: req.params.channelId,
        target_channel_id: webhook_channel_id,
        created_by_id: req.user!.userId,
      },
    });

    await writeAuditLog(targetChannel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.WEBHOOK_CREATE, webhook.id, 'WEBHOOK', [
      { key: 'source_channel_id', old_value: null, new_value: req.params.channelId },
      { key: 'target_channel_id', old_value: null, new_value: webhook_channel_id },
      { key: 'type', old_value: null, new_value: 2 },
    ]);

    // Emit WEBHOOKS_UPDATE in target guild
    const io = getIO();
    if (io) {
      io.to(`guild:${targetChannel.guild_id}`).emit(GatewayEvents.WEBHOOK_UPDATE, {
        channel_id: webhook_channel_id,
        webhook_id: webhook.id,
      });
    }

    res.status(201).json({ source_channel_id: req.params.channelId, target_channel_id: webhook_channel_id, webhook_id: webhook.id });
  } catch (err) {
    next(err);
  }
}

export async function markChannelRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    const messageId = req.body.message_id;
    if (!messageId) throw new AppError(400, 'MISSING_FIELD', 'message_id is required');

    await prisma.readState.upsert({
      where: { user_id_channel_id: { user_id: req.user!.userId, channel_id: req.params.channelId } },
      create: {
        user_id: req.user!.userId,
        channel_id: req.params.channelId,
        last_read_message_id: messageId,
        mention_count: 0,
      },
      update: {
        last_read_message_id: messageId,
        mention_count: 0,
      },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function reorderChannels(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x10), req.params.guildId, req.user!.userId);

    const updates = req.body as Array<{ id: string; position: number; parent_id?: string | null }>;
    if (!Array.isArray(updates)) throw new AppError(400, 'INVALID_BODY', 'Expected an array of channel updates');

    const updatePromises = updates.map((ch) =>
      prisma.channel.updateMany({
        where: { id: ch.id, guild_id: req.params.guildId },
        data: {
          position: ch.position,
          parent_id: ch.parent_id !== undefined ? ch.parent_id : undefined,
        },
      })
    );
    await Promise.all(updatePromises);

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.CHANNEL_UPDATE, { guild_id: req.params.guildId, updates });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
