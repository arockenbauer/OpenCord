import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, writeAuditLog } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function getWebhooks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel || !channel.guild_id) throw new AppError(404, 'NOT_FOUND', 'Channel not found');

    const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
    checkPermission(perms, BigInt(0x20000000));

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
    checkPermission(perms, BigInt(0x20000000));

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
    await writeAuditLog(channel.guild_id, req.user!.userId, 'WEBHOOK_CREATE', webhook.id, 'WEBHOOK', {
      channel_id: webhook.channel_id,
      name: webhook.name,
      type: webhook.type,
    });

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
      checkPermission(perms, BigInt(0x20000000));
    }

    await prisma.webhook.delete({ where: { id: req.params.webhookId } });

    const io = getIO();
    if (io) {
      io.to(`guild:${webhook.guild_id}`).emit(GatewayEvents.WEBHOOK_UPDATE, {
        guild_id: webhook.guild_id,
        channel_id: webhook.channel_id,
      });
    }
    await writeAuditLog(webhook.guild_id, req.user!.userId, 'WEBHOOK_DELETE', webhook.id, 'WEBHOOK', {
      channel_id: webhook.channel_id,
      name: webhook.name,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function executeWebhook(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const webhook = await prisma.webhook.findUnique({ where: { id: req.params.webhookId } });
    if (!webhook || webhook.token !== req.params.token) throw new AppError(404, 'NOT_FOUND', 'Webhook not found');

    const message = await prisma.message.create({
      data: {
        id: generateSnowflake(),
        channel_id: webhook.channel_id,
        author_id: webhook.creator_id,
        content: req.body.content || null,
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

    const io = getIO();
    if (io) {
      io.to(`channel:${webhook.channel_id}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message: { ...message, guild_id: webhook.guild_id },
      });
    }

    res.status(201).json(message);
  } catch (err) {
    next(err);
  }
}
