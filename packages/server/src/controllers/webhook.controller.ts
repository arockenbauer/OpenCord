import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, writeAuditLog, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { serializeMessageForClient } from '../utils/message-response.js';

export async function getWebhooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    await checkPermission(perms, BigInt(0x20000000), channel.guild_id, req.user!.userId);

    const webhooks = await prisma.webhook.findMany({
      where: { channel_id: req.params.channelId },
      include: { creator: { select: { id: true, username: true, discriminator: true } } },
    });
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
}

export async function createWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    await checkPermission(perms, BigInt(0x20000000), channel.guild_id, req.user!.userId);

    const token = crypto.randomBytes(32).toString('hex');
    const webhook = await prisma.webhook.create({
      data: {
        id: generateSnowflake(),
        guild_id: channel.guild_id,
        channel_id: channel.id,
        creator_id: req.user!.userId,
        name: req.body.name || 'Webhook',
        token,
        type: 1,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${channel.guild_id}`).emit(GatewayEvents.WEBHOOK_UPDATE, {
        guild_id: channel.guild_id,
        channel_id: channel.id,
      });
    }
    await writeAuditLog(channel.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.WEBHOOK_CREATE, webhook.id, 'WEBHOOK', [
      { key: 'channel_id', old_value: null, new_value: webhook.channel_id },
      { key: 'name', old_value: null, new_value: webhook.name },
      { key: 'type', old_value: null, new_value: webhook.type },
    ]);

    res.status(201).json({ ...webhook, url: `/api/webhooks/${webhook.id}/${webhook.token}` });
  } catch (err) {
    next(err);
  }
}

export async function deleteWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

    const perms = await getMemberPermissions(webhook.guild_id, req.user!.userId);
    if (webhook.creator_id !== req.user!.userId) {
      await checkPermission(perms, BigInt(0x20000000), webhook.guild_id, req.user!.userId);
    }

    await prisma.webhook.delete({ where: { id: req.params.webhookId } });

    const io = getIO();
    if (io) {
      io.to(`guild:${webhook.guild_id}`).emit(GatewayEvents.WEBHOOK_UPDATE, {
        guild_id: webhook.guild_id,
        channel_id: webhook.channel_id,
      });
    }
    await writeAuditLog(webhook.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.WEBHOOK_DELETE, webhook.id, 'WEBHOOK', [
      { key: 'channel_id', old_value: webhook.channel_id, new_value: null },
      { key: 'name', old_value: webhook.name, new_value: null },
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getGuildWebhooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'NOT_FOUND', 'Guild not found');

    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20000000), req.params.guildId, req.user!.userId);

    const webhooks = await prisma.webhook.findMany({
      where: { guild_id: req.params.guildId },
      include: { creator: { select: { id: true, username: true, discriminator: true } } },
    });
    res.json({ webhooks });
  } catch (err) {
    next(err);
  }
}

export async function getWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webhook = await prisma.webhook.findUnique({
      where: { id: req.params.webhookId },
      include: { creator: { select: { id: true, username: true, discriminator: true } } },
    });
    if (!webhook) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

    const perms = await getMemberPermissions(webhook.guild_id, req.user!.userId);
    await checkPermission(perms, BigInt(0x20000000), webhook.guild_id, req.user!.userId);

    res.json({
      id: webhook.id,
      guild_id: webhook.guild_id,
      channel_id: webhook.channel_id,
      name: webhook.name,
      avatar: webhook.avatar,
      type: webhook.type,
      creator: webhook.creator ? {
        id: webhook.creator.id,
        username: webhook.creator.username,
        discriminator: webhook.creator.discriminator,
      } : null,
      created_at: webhook.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

    const perms = await getMemberPermissions(webhook.guild_id, req.user!.userId);
    if (webhook.creator_id !== req.user!.userId) {
      await checkPermission(perms, BigInt(0x20000000), webhook.guild_id, req.user!.userId);
    }

    const { name, avatar, channel_id } = req.body;
    const data: any = {};
    if (name !== undefined) data.name = String(name).trim() || webhook.name;
    if (avatar !== undefined) data.avatar = avatar || null;
    if (channel_id !== undefined) {
      const channel = await prisma.channel.findUnique({ where: { id: channel_id } });
      if (!channel || channel.guild_id !== webhook.guild_id) {
        throw new AppError(400, 'INVALID_CHANNEL', 'Channel not in same guild');
      }
      data.channel_id = channel_id;
    }

    const updated = await prisma.webhook.update({
      where: { id: req.params.webhookId },
      data,
      include: { creator: { select: { id: true, username: true, discriminator: true } } },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${webhook.guild_id}`).emit(GatewayEvents.WEBHOOK_UPDATE, {
        guild_id: webhook.guild_id,
        channel_id: updated.channel_id,
      });
    }

    res.json({
      id: updated.id,
      guild_id: updated.guild_id,
      channel_id: updated.channel_id,
      name: updated.name,
      avatar: updated.avatar,
      type: updated.type,
      creator: updated.creator ? {
        id: updated.creator.id,
        username: updated.creator.username,
        discriminator: updated.creator.discriminator,
      } : null,
      created_at: updated.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function executeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook || webhook.token !== req.params.token) {
      next();
      return;
    }

    const authorName = req.body.username || webhook.name;
    const authorAvatar = req.body.avatar_url || null;

    const message = await prisma.message.create({
      data: {
        id: generateSnowflake(),
        channel_id: webhook.channel_id,
        author_id: webhook.creator_id,
        content: req.body.content || null,
        components: req.body.components ? JSON.stringify(req.body.components) : null,
        tts: req.body.tts || false,
        webhook_id: webhook.id,
      },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true } },
        attachments: true,
        embeds: true,
        reactions: true,
      },
    });

    if (req.body.embeds) {
      for (const embed of req.body.embeds) {
        await prisma.embed.create({
          data: { id: generateSnowflake(), message_id: message.id, data: JSON.stringify(embed) },
        });
      }
    }

    const fullMessage = await prisma.message.findUnique({
      where: { id: message.id },
      include: {
        author: { select: { id: true, username: true, discriminator: true, avatar: true } },
        attachments: true,
        embeds: true,
        reactions: true,
      },
    });
    const responseMessage = serializeMessageForClient(fullMessage, webhook.guild_id);

    const io = getIO();
    if (io) {
      io.to(`channel:${webhook.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message: { ...responseMessage, webhook_author: { name: authorName, avatar: authorAvatar } },
      });
    }

    const wait = req.query.wait === 'true';
    if (wait) {
      res.status(200).json(responseMessage);
    } else {
      res.status(204).send();
    }
  } catch (err) {
    next(err);
  }
}
