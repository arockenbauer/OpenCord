import { Request, Response, NextFunction } from 'express';
import path from 'path';
import fs from 'fs';
import sharp from 'sharp';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { evaluateAutoMod } from './automod.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { sanitizeFilename } from '../middleware/upload.middleware.js';
import { createAndDispatchSystemMessage } from '../services/system-message.service.js';
import { computeEffectivePermissions } from '../services/permission.service.js';
import { serializeMessageForClient, serializeMessagesForClient } from '../utils/message-response.js';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function getChannelPermissions(channelId: string, userId: string): Promise<bigint> {
  const channel = await prisma.channel.findUnique({ where: { id: channelId }, include: { permission_overwrites: true } });
  if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
  if (!channel.guild_id) {
    const member = await prisma.dMChannelMember.findUnique({
      where: { channel_id_user_id: { channel_id: channelId, user_id: userId } },
    });
    if (!member) throw new AppError(403, 'NOT_MEMBER', 'You are not a member of this DM');
    return BigInt('0xFFFFFFFFFFFFFFFF');
  }

  const base = await getMemberPermissions(channel.guild_id, userId);
  const roleIds = await prisma.guildMemberRole.findMany({
    where: { guild_id: channel.guild_id, user_id: userId },
    select: { role_id: true },
  });
  const everyoneRole = await prisma.role.findFirst({
    where: { guild_id: channel.guild_id, name: '@everyone' },
    select: { id: true },
  });
  const everyoneOverwrite = everyoneRole
    ? channel.permission_overwrites.find((ow) => ow.target_type === 'role' && ow.target_id === everyoneRole.id)
    : null;
  const roleOverwrites = channel.permission_overwrites.filter(
    (ow) => ow.target_type === 'role' && roleIds.some((r) => r.role_id === ow.target_id),
  );
  const memberOverwrite = channel.permission_overwrites.find(
    (ow) => ow.target_type === 'member' && ow.target_id === userId,
  );

  return computeEffectivePermissions(
    base,
    everyoneOverwrite ? { allow: BigInt(everyoneOverwrite.allow), deny: BigInt(everyoneOverwrite.deny) } : null,
    roleOverwrites.map((ow) => ({ allow: BigInt(ow.allow), deny: BigInt(ow.deny) })),
    memberOverwrite ? { allow: BigInt(memberOverwrite.allow), deny: BigInt(memberOverwrite.deny) } : null,
  );
}

function buildMessageInclude() {
  return {
    author: { select: { id: true, username: true, discriminator: true, avatar: true, bot: true } },
    attachments: true,
    embeds: true,
    reactions: true,
  };
}

export async function createMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId;
    const perms = await getChannelPermissions(channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x800));

    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    // Check DM restrictions for DM channels
    if (!channel.guild_id && channel.type === 1) {
      const dmMembers = await prisma.dMChannelMember.findMany({
        where: { channel_id: channelId },
        include: { user: { select: { id: true, username: true, allow_dms_from: true } } },
      });
      const recipient = dmMembers.find(m => m.user_id !== req.user!.userId);
      if (recipient) {
        const senderFriendship = await prisma.friend.findFirst({
          where: { user_id: recipient.user_id, target_id: req.user!.userId, status: 1 },
        });
        const isFriend = !!senderFriendship;
        const blockCheck = await prisma.friend.findFirst({
          where: { user_id: recipient.user_id, target_id: req.user!.userId, status: 2 },
        });
        const isBlocked = !!blockCheck;

        if (isBlocked || (!isFriend && recipient.user.allow_dms_from === "none") || (!isFriend && recipient.user.allow_dms_from === "friends")) {
          const recipientUsername = recipient.user.username;
          const sysMsg = await createAndDispatchSystemMessage({
            channelId,
            content: `Vous ne pouvez pas envoyer de message à ${recipientUsername}.`,
            type: 20,
            recipientUserId: req.user!.userId,
            guildId: null,
          });
          res.status(201).json(sysMsg);
          return;
        }
      }
    }

    let body = req.body;
    if (req.body.payload_json) {
      try { body = { ...body, ...JSON.parse(req.body.payload_json) }; } catch { /* use body as-is */ }
    }

    const files = (req as any).files as Express.Multer.File[] | undefined;
    if (body.tts) checkPermission(perms, BigInt(0x1000));
    if (files && files.length > 0) checkPermission(perms, BigInt(0x8000));
    if (!body.content && !body.sticker_ids?.length && (!files || files.length === 0)) {
      throw new AppError(400, 'EMPTY_MESSAGE', 'Message must have content, stickers, or files');
    }

    if (channel.guild_id) {
      const member = await prisma.guildMember.findUnique({
        where: { guild_id_user_id: { guild_id: channel.guild_id, user_id: req.user!.userId } },
      });
      if (member?.communication_disabled_until && member.communication_disabled_until > new Date()) {
        throw new AppError(403, 'MEMBER_TIMED_OUT', 'You are timed out and cannot send messages');
      }
    }

    if (channel.slowmode_delay > 0) {
      const hasManageMessages = (perms & BigInt(0x2000)) !== BigInt(0) || (perms & BigInt(0x8)) !== BigInt(0);
      if (!hasManageMessages) {
        const lastMsg = await prisma.message.findFirst({
          where: { channel_id: channelId, author_id: req.user!.userId },
          orderBy: { created_at: 'desc' },
        });
        if (lastMsg) {
          const elapsed = (Date.now() - lastMsg.created_at.getTime()) / 1000;
          if (elapsed < channel.slowmode_delay) {
            throw new AppError(429, 'SLOWMODE', `Slowmode active, wait ${Math.ceil(channel.slowmode_delay - elapsed)}s`);
          }
        }
      }
    }

    if (channel.guild_id && body.content) {
      const automodResult = await evaluateAutoMod(channel.guild_id, body.content, req.user!.userId, channelId);
      if (automodResult.timeoutSeconds) {
        const until = new Date(Date.now() + automodResult.timeoutSeconds * 1000);
        await prisma.guildMember.update({
          where: { guild_id_user_id: { guild_id: channel.guild_id, user_id: req.user!.userId } },
          data: { communication_disabled_until: until },
        });
      }
      if (automodResult.warnMessage) {
        try {
          const dmChannel = await prisma.dMChannel.findFirst({
            include: { members: { where: { user_id: req.user!.userId } } },
          });
          if (dmChannel) {
            await prisma.message.create({
              data: {
                id: generateSnowflake(),
                channel_id: dmChannel.id,
                author_id: '0',
                content: `⚠️ AutoMod: ${automodResult.warnMessage}`,
                type: 20,
              },
            });
          }
        } catch { /* DM failed, ignore */ }
      }
      if (automodResult.closeChannel) {
        // Channel "locked" flag is not part of the current schema; keep behavior non-blocking.
      }
      if (automodResult.blocked) {
        throw new AppError(400, 'AUTOMOD_BLOCKED', automodResult.blockMessage || 'Your message was blocked by AutoMod');
      }
    }

    const mentionEveryone = body.content ? /@(everyone|here)/.test(body.content) : false;
    if (mentionEveryone) checkPermission(perms, BigInt(0x20000));
    const messageType = body.message_reference ? 19 : 0;

    const messageId = generateSnowflake();
    await prisma.message.create({
      data: {
        id: messageId,
        channel_id: channelId,
        author_id: req.user!.userId,
        content: body.content || null,
        components: body.components ? JSON.stringify(body.components) : null,
        type: messageType,
        tts: body.tts || false,
        mention_everyone: mentionEveryone,
        reference_id: body.message_reference?.message_id || null,
        sticker_ids: body.sticker_ids ? JSON.stringify(body.sticker_ids) : null,
        flags: body.flags || 0,
      },
      include: buildMessageInclude(),
    });

    if (files && files.length > 0) {
      const attachDir = path.join(uploadDir, 'attachments', channelId, messageId);
      fs.mkdirSync(attachDir, { recursive: true });

      for (const file of files) {
        const attachId = generateSnowflake();
        const safeFilename = sanitizeFilename(file.originalname || `file-${attachId}`);
        const storagePath = path.join(attachDir, safeFilename);
        fs.renameSync(file.path, storagePath);

        let width: number | null = null;
        let height: number | null = null;
        let thumbnailUrl: string | null = null;

        if (file.mimetype.startsWith('image/')) {
          try {
            const meta = await sharp(storagePath).metadata();
            width = meta.width || null;
            height = meta.height || null;
            const thumbPath = path.join(attachDir, `thumb_${safeFilename}.webp`);
            await sharp(storagePath).resize(256, 256, { fit: 'inside' }).webp({ quality: 70 }).toFile(thumbPath);
            thumbnailUrl = `/uploads/attachments/${channelId}/${messageId}/thumb_${safeFilename}.webp`;
          } catch { /* non-image or corrupt */ }
        }

        await prisma.attachment.create({
          data: {
            id: attachId,
            message_id: messageId,
            filename: safeFilename,
            storage_path: storagePath,
            url: `/uploads/attachments/${channelId}/${messageId}/${safeFilename}`,
            mime_type: file.mimetype,
            size: file.size,
            width,
            height,
            thumbnail_url: thumbnailUrl,
            spoiler: safeFilename.startsWith('SPOILER_'),
          },
        });
      }
    }

    if (body.embeds && body.embeds.length > 0) {
      for (const embed of body.embeds) {
        await prisma.embed.create({
          data: { id: generateSnowflake(), message_id: messageId, data: JSON.stringify(embed) },
        });
      }
    }

    await prisma.channel.update({ where: { id: channelId }, data: { last_message_id: messageId } });

    const fullMessage = await prisma.message.findUnique({
      where: { id: messageId },
      include: buildMessageInclude(),
    });

    const io = getIO();
    if (io) {
      const guildId = channel.guild_id;
      const responseMessage = serializeMessageForClient(fullMessage, guildId);
      io.to(`channel:${channelId}`).emit(GatewayEvents.MESSAGE_CREATE, {
        message: responseMessage,
      });
    }

    res.status(201).json(serializeMessageForClient(fullMessage, channel.guild_id));
  } catch (err) {
    next(err);
  }
}

export async function getMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId;
    const perms = await getChannelPermissions(channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    checkPermission(perms, BigInt(0x10000));

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined;
    const after = req.query.after as string | undefined;
    const around = req.query.around as string | undefined;

    const where: any = { channel_id: channelId };
    let orderBy: any = { created_at: 'desc' };

    if (before) where.id = { lt: before };
    else if (after) {
      where.id = { gt: after };
      orderBy = { created_at: 'asc' };
    } else if (around) {
      const half = Math.floor(limit / 2);
      const beforeMsgs = await prisma.message.findMany({
        where: { channel_id: channelId, id: { lt: around } },
        take: half,
        orderBy: { created_at: 'desc' },
        include: buildMessageInclude(),
      });
      const afterMsgs = await prisma.message.findMany({
        where: { channel_id: channelId, id: { gte: around } },
        take: half + 1,
        orderBy: { created_at: 'asc' },
        include: buildMessageInclude(),
      });
      const all = [...beforeMsgs.reverse(), ...afterMsgs];
      res.json({ messages: serializeMessagesForClient(all, null) });
      return;
    }

    const messages = await prisma.message.findMany({
      where,
      take: limit,
      orderBy,
      include: buildMessageInclude(),
    });

    res.json({ messages: serializeMessagesForClient(orderBy.created_at === 'asc' ? messages : messages, null) });
  } catch (err) {
    next(err);
  }
}

export async function getMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: buildMessageInclude(),
    });
    if (!message || message.channel_id !== req.params.channelId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    res.json(serializeMessageForClient(message));
  } catch (err) {
    next(err);
  }
}

export async function editMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
    if (!message || message.channel_id !== req.params.channelId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    if (message.author_id !== req.user!.userId) {
      throw new AppError(403, 'FORBIDDEN', 'Can only edit your own messages');
    }

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { content: req.body.content, flags: req.body.flags, edited_at: new Date() },
      include: buildMessageInclude(),
    });

    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    const io = getIO();
    if (io) {
      const responseMessage = serializeMessageForClient(updated, channel?.guild_id);
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_UPDATE, {
        message: responseMessage,
      });
    }

    res.json(serializeMessageForClient(updated, channel?.guild_id));
  } catch (err) {
    next(err);
  }
}

export async function deleteMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const message = await prisma.message.findUnique({ where: { id: req.params.messageId } });
    if (!message || message.channel_id !== req.params.channelId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }

    if (message.author_id !== req.user!.userId) {
      const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
      if (channel?.guild_id) {
        const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
        checkPermission(perms, BigInt(0x2000));
      } else {
        throw new AppError(403, 'FORBIDDEN', 'Cannot delete others messages');
      }
    }

    // Clean up attachments from filesystem
    const attachments = await prisma.attachment.findMany({ where: { message_id: req.params.messageId } });
    for (const att of attachments) {
      try { fs.unlinkSync(path.join(uploadDir, att.storage_path)); } catch { /* ignore */ }
    }
    await prisma.attachment.deleteMany({ where: { message_id: req.params.messageId } });
    await prisma.embed.deleteMany({ where: { message_id: req.params.messageId } });
    await prisma.reaction.deleteMany({ where: { message_id: req.params.messageId } });
    await prisma.message.delete({ where: { id: req.params.messageId } });

    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_DELETE, {
        id: req.params.messageId,
        channel_id: req.params.channelId,
        guild_id: channel?.guild_id,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function bulkDelete(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkPermission(perms, BigInt(0x2000));
    }

    const { ids } = req.body;
    const fourteenDaysAgo = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);

    const messages = await prisma.message.findMany({
      where: { id: { in: ids }, channel_id: req.params.channelId },
    });

    const tooOld = messages.filter((m) => m.created_at < fourteenDaysAgo);
    if (tooOld.length > 0) {
      throw new AppError(400, 'MESSAGE_TOO_OLD', 'Some messages are older than 14 days');
    }

    const validIds = messages.map((m) => m.id);

    // Clean up attachments from filesystem for all messages being deleted
    const attachments = await prisma.attachment.findMany({ where: { message_id: { in: validIds } } });
    for (const att of attachments) {
      try { fs.unlinkSync(path.join(uploadDir, att.storage_path)); } catch { /* ignore */ }
    }
    await prisma.attachment.deleteMany({ where: { message_id: { in: validIds } } });
    await prisma.embed.deleteMany({ where: { message_id: { in: validIds } } });
    await prisma.reaction.deleteMany({ where: { message_id: { in: validIds } } });
    await prisma.message.deleteMany({ where: { id: { in: validIds } } });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_BULK_DELETE, {
        channel_id: req.params.channelId,
        guild_id: channel.guild_id,
        ids: validIds,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function addReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x40));

    const emoji = decodeURIComponent(req.params.emoji);
    const emojiId = emoji.includes(':') ? emoji.split(':')[2]?.replace('>', '') || null : null;
    const emojiName = emojiId ? emoji.split(':')[1]! : emoji;

    await prisma.reaction.upsert({
      where: {
        message_id_user_id_emoji_name_emoji_id: {
          message_id: req.params.messageId,
          user_id: req.user!.userId,
          emoji_name: emojiName,
          emoji_id: emojiId || '',
        },
      },
      create: {
        id: generateSnowflake(),
        message_id: req.params.messageId,
        user_id: req.user!.userId,
        emoji_name: emojiName,
        emoji_id: emojiId,
      },
      update: {},
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_REACTION_ADD, {
        user_id: req.user!.userId,
        channel_id: req.params.channelId,
        message_id: req.params.messageId,
        emoji: { name: emojiName, id: emojiId },
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeReaction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const emoji = decodeURIComponent(req.params.emoji);
    const emojiId = emoji.includes(':') ? emoji.split(':')[2]?.replace('>', '') || null : null;
    const emojiName = emojiId ? emoji.split(':')[1]! : emoji;

    await prisma.reaction.deleteMany({
      where: {
        message_id: req.params.messageId,
        user_id: req.user!.userId,
        emoji_name: emojiName,
        emoji_id: emojiId || '',
      },
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_REACTION_REMOVE, {
        user_id: req.user!.userId,
        channel_id: req.params.channelId,
        message_id: req.params.messageId,
        emoji: { name: emojiName, id: emojiId },
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function pinMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkPermission(perms, BigInt(0x2000));
    }

    const pinCount = await prisma.pin.count({ where: { channel_id: req.params.channelId } });
    if (pinCount >= 50) throw new AppError(400, 'MAX_PINS', 'Maximum number of pins reached (50)');

    await prisma.pin.upsert({
      where: {
        channel_id_message_id: { channel_id: req.params.channelId, message_id: req.params.messageId },
      },
      create: {
        id: generateSnowflake(),
        channel_id: req.params.channelId,
        message_id: req.params.messageId,
        pinned_by: req.user!.userId,
      },
      update: {},
    });

    await prisma.message.update({ where: { id: req.params.messageId }, data: { pinned: true } });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.CHANNEL_PINS_UPDATE, {
        channel_id: req.params.channelId,
        guild_id: channel.guild_id,
      });
    }

    const pinner = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: { username: true },
    });
    await createAndDispatchSystemMessage({
      channelId: req.params.channelId,
      content: `${pinner?.username ?? 'Quelqu\'un'} a épinglé un message dans ce salon.`,
      type: 6,
      guildId: channel.guild_id,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function unpinMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');

    if (channel.guild_id) {
      const perms = await getMemberPermissions(channel.guild_id, req.user!.userId);
      checkPermission(perms, BigInt(0x2000));
    }

    await prisma.pin.deleteMany({ where: { channel_id: req.params.channelId, message_id: req.params.messageId } });
    await prisma.message.update({ where: { id: req.params.messageId }, data: { pinned: false } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getPins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    checkPermission(perms, BigInt(0x10000));
    const pins = await prisma.pin.findMany({
      where: { channel_id: req.params.channelId },
      orderBy: { pinned_at: 'desc' },
    });

    const messageIds = pins.map((p) => p.message_id);
    const messages = await prisma.message.findMany({
      where: { id: { in: messageIds } },
      include: buildMessageInclude(),
    });

    res.json({ messages });
  } catch (err) {
    next(err);
  }
}

export async function searchMessages(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    checkPermission(perms, BigInt(0x10000));
    const channelId = req.params.channelId;
    const q = req.query.q as string;
    const limit = Math.min(Number(req.query.limit) || 25, 25);
    const offset = Number(req.query.offset) || 0;

    const messages = await prisma.message.findMany({
      where: { channel_id: channelId, content: { contains: q } },
      take: limit,
      skip: offset,
      orderBy: { created_at: 'desc' },
      include: buildMessageInclude(),
    });

    const total = await prisma.message.count({ where: { channel_id: channelId, content: { contains: q } } });

    res.json({ messages, total_results: total });
  } catch (err) {
    next(err);
  }
}

export async function ackMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    await prisma.readState.upsert({
      where: { user_id_channel_id: { user_id: req.user!.userId, channel_id: req.params.channelId } },
      create: { user_id: req.user!.userId, channel_id: req.params.channelId, last_read_message_id: req.params.messageId, mention_count: 0 },
      update: { last_read_message_id: req.params.messageId, mention_count: 0 },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const poll = await prisma.poll.findUnique({
      where: { id: req.params.pollId },
      include: {
        answers: {
          include: { poll: { include: { answers: true } } },
        },
      },
    });
    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    const sourceMessage = await prisma.message.findUnique({ where: { id: poll.message_id }, select: { channel_id: true } });
    if (!sourceMessage) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Poll source message not found');
    const perms = await getChannelPermissions(sourceMessage.channel_id, req.user!.userId);
    checkPermission(perms, BigInt(0x400));

    const answers = poll.answers.map((a) => {
      const options = JSON.parse(poll.options) as string[];
      const answerIds = JSON.parse(a.answer_ids) as string[];
      return { ...a, answer_ids: answerIds, options };
    });

    const totalVotes = answers.reduce((sum) => sum + 1, 0);
    res.json({ ...poll, answers, total_votes: totalVotes });
  } catch (err) {
    next(err);
  }
}

export async function answerPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId } });
    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    const sourceMessage = await prisma.message.findUnique({ where: { id: poll.message_id }, select: { channel_id: true } });
    if (!sourceMessage) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Poll source message not found');
    const perms = await getChannelPermissions(sourceMessage.channel_id, req.user!.userId);
    checkPermission(perms, BigInt(0x400));
    checkPermission(perms, BigInt(0x800));
    if (poll.ended_at && poll.ended_at < new Date()) throw new AppError(400, 'POLL_ENDED', 'Poll has ended');

    const existing = await prisma.pollAnswer.findUnique({
      where: { poll_id_user_id: { poll_id: req.params.pollId, user_id: req.user!.userId } },
    });
    if (existing) throw new AppError(400, 'ALREADY_VOTED', 'Already voted');

    const answer = await prisma.pollAnswer.create({
      data: {
        id: generateSnowflake(),
        poll_id: req.params.pollId,
        user_id: req.user!.userId,
        answer_ids: JSON.stringify(req.body.answer_ids || [req.body.answer_id]),
      },
    });

    res.status(201).json({ ...answer, answer_ids: JSON.parse(answer.answer_ids) });
  } catch (err) {
    next(err);
  }
}

export async function getPollAnswers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId } });
    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    const sourceMessage = await prisma.message.findUnique({ where: { id: poll.message_id }, select: { channel_id: true } });
    if (!sourceMessage) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Poll source message not found');
    const perms = await getChannelPermissions(sourceMessage.channel_id, req.user!.userId);
    checkPermission(perms, BigInt(0x400));

    const answers = await prisma.pollAnswer.findMany({
      where: { poll_id: req.params.pollId },
    });

    const options = JSON.parse(poll.options) as string[];
    const results = options.map((_, i) => ({
      option: i,
      count: answers.filter((a) => JSON.parse(a.answer_ids).includes(i)).length,
    }));

    res.json({ results, total_votes: answers.length });
  } catch (err) {
    next(err);
  }
}

export async function endPoll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const poll = await prisma.poll.findUnique({ where: { id: req.params.pollId } });
    if (!poll) throw new AppError(404, 'NOT_FOUND', 'Poll not found');
    const sourceMessage = await prisma.message.findUnique({ where: { id: poll.message_id }, select: { channel_id: true } });
    if (!sourceMessage) throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Poll source message not found');
    const perms = await getChannelPermissions(sourceMessage.channel_id, req.user!.userId);
    checkPermission(perms, BigInt(0x2000));

    const updated = await prisma.poll.update({
      where: { id: req.params.pollId },
      data: { ended_at: new Date() },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function getReactionUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400)); // VIEW_CHANNEL

    const emoji = decodeURIComponent(req.params.emoji);
    const emojiId = emoji.includes(':') ? emoji.split(':')[2]?.replace('>', '') || null : null;
    const emojiName = emojiId ? emoji.split(':')[1]! : emoji;
    const limit = Math.min(Number(req.query.limit) || 25, 100);
    const after = req.query.after as string | undefined;

    const where: any = { message_id: req.params.messageId, emoji_name: emojiName };
    if (emojiId) where.emoji_id = emojiId;
    if (after) where.user_id = { gt: after };

    const reactions = await prisma.reaction.findMany({
      where,
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
      take: limit,
      orderBy: { user_id: 'asc' },
    });

    res.json({ users: reactions.map(r => r.user) });
  } catch (err) {
    next(err);
  }
}

export async function removeAllReactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x2000)); // MANAGE_MESSAGES

    await prisma.reaction.deleteMany({ where: { message_id: req.params.messageId } });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_REACTION_REMOVE_ALL, {
        channel_id: req.params.channelId,
        message_id: req.params.messageId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeEmojiReactions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x2000)); // MANAGE_MESSAGES

    const emoji = decodeURIComponent(req.params.emoji);
    const emojiId = emoji.includes(':') ? emoji.split(':')[2]?.replace('>', '') || null : null;
    const emojiName = emojiId ? emoji.split(':')[1]! : emoji;

    const where: any = { message_id: req.params.messageId, emoji_name: emojiName };
    if (emojiId) where.emoji_id = emojiId;

    await prisma.reaction.deleteMany({ where });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_REACTION_REMOVE_EMOJI, {
        channel_id: req.params.channelId,
        message_id: req.params.messageId,
        emoji: { name: emojiName, id: emojiId },
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function crosspostMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    if (channel.type !== 5) throw new AppError(400, 'INVALID_CHANNEL_TYPE', 'Only announcement channels support crossposting');

    const perms = await getChannelPermissions(req.params.channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x800)); // SEND_MESSAGES

    const message = await prisma.message.findUnique({
      where: { id: req.params.messageId },
      include: buildMessageInclude(),
    });
    if (!message || message.channel_id !== req.params.channelId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    if ((Number(message.flags) & 2) !== 0) {
      throw new AppError(400, 'ALREADY_CROSSPOSTED', 'Message has already been crossposted');
    }

    const updated = await prisma.message.update({
      where: { id: req.params.messageId },
      data: { flags: 2 },
      include: buildMessageInclude(),
    });

    const io = getIO();
    if (io) {
      io.to(`channel:${req.params.channelId}`).emit(GatewayEvents.MESSAGE_UPDATE, { message: updated });
    }

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function reportMessage(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channelId = req.params.channelId;
    const messageId = req.params.messageId;
    const perms = await getChannelPermissions(channelId, req.user!.userId);
    checkPermission(perms, BigInt(0x400));

    const message = await prisma.message.findUnique({
      where: { id: messageId },
      select: { id: true, channel_id: true, author_id: true, content: true },
    });
    if (!message || message.channel_id !== channelId) {
      throw new AppError(404, 'MESSAGE_NOT_FOUND', 'Message not found');
    }
    if (message.author_id === req.user!.userId) {
      throw new AppError(400, 'INVALID_REPORT_TARGET', 'Cannot report your own message');
    }

    const report = await prisma.report.create({
      data: {
        id: generateSnowflake(),
        reporter_id: req.user!.userId,
        target_type: 'message',
        target_id: message.id,
        reason: req.body?.reason || 'Signalement utilisateur',
        notes: JSON.stringify({
          channel_id: channelId,
          message_excerpt: (message.content || '').slice(0, 300),
        }),
        status: 'pending',
      },
    });

    const io = getIO();
    if (io) {
      io.to('admin').emit(GatewayEvents.NOTIFICATION_CREATE, { type: 'report', report_id: report.id });
    }

    res.status(201).json({ report_id: report.id, status: report.status });
  } catch (err) {
    next(err);
  }
}
