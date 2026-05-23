import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function getNotifications(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Number(req.query.limit) || 20, 100);
    const unreadOnly = req.query.unread_only === 'true';
    const skip = (page - 1) * limit;

    const where: any = { user_id: req.user!.userId };
    if (unreadOnly) where.read = false;

    const [notifications, total, unreadCount] = await Promise.all([
      prisma.notification.findMany({
        where,
        take: limit,
        skip,
        orderBy: { created_at: 'desc' },
      }),
      prisma.notification.count({ where: { user_id: req.user!.userId } }),
      prisma.notification.count({ where: { user_id: req.user!.userId, read: false } }),
    ]);

    res.json({ notifications, total, unread_count: unreadCount, page, limit });
  } catch (err) {
    next(err);
  }
}

export async function markRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { user_id: req.user!.userId, read: false },
      data: { read: true },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function markOneRead(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notification.updateMany({
      where: { id: req.params.notificationId, user_id: req.user!.userId },
      data: { read: true },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function deleteNotification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notification.deleteMany({
      where: { id: req.params.notificationId, user_id: req.user!.userId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getUnreadCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const count = await prisma.notification.count({
      where: { user_id: req.user!.userId, read: false },
    });
    res.json({ count });
  } catch (err) {
    next(err);
  }
}

export async function getAllNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await prisma.notificationSettings.findMany({ where: { user_id: req.user!.userId } });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

export async function createNotificationSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setting = await prisma.notificationSettings.create({
      data: {
        id: generateSnowflake(),
        user_id: req.user!.userId,
        guild_id: req.body.guild_id || null,
        channel_id: req.body.channel_id || null,
        muted: req.body.muted ?? false,
        suppress_everyone: req.body.suppress_everyone ?? false,
        suppress_roles: req.body.suppress_roles ?? false,
        message_notifications: req.body.message_notifications ?? 0,
      },
    });
    res.status(201).json(setting);
  } catch (err) {
    next(err);
  }
}

export async function updateNotificationSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setting = await prisma.notificationSettings.findFirst({
      where: { id: req.params.settingId, user_id: req.user!.userId },
    });
    if (!setting) throw new AppError(404, 'NOT_FOUND', 'Setting not found');

    const { muted, suppress_everyone, suppress_roles, message_notifications } = req.body;
    const updated = await prisma.notificationSettings.update({
      where: { id: req.params.settingId },
      data: {
        muted: muted !== undefined ? muted : setting.muted,
        suppress_everyone: suppress_everyone !== undefined ? suppress_everyone : setting.suppress_everyone,
        suppress_roles: suppress_roles !== undefined ? suppress_roles : setting.suppress_roles,
        message_notifications: message_notifications !== undefined ? message_notifications : setting.message_notifications,
      },
    });
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteNotificationSetting(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.notificationSettings.deleteMany({
      where: { id: req.params.settingId, user_id: req.user!.userId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getChannelNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setting = await prisma.notificationSettings.findFirst({
      where: { user_id: req.user!.userId, channel_id: req.params.channelId },
    });
    res.json(setting || { channel_id: req.params.channelId, muted: false, suppress_everyone: false, suppress_roles: false, message_notifications: 0 });
  } catch (err) {
    next(err);
  }
}

export async function updateChannelNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = { user_id: req.user!.userId, channel_id: req.params.channelId };
    const channel = await prisma.channel.findUnique({ where: { id: req.params.channelId } });
    if (!channel) {
      throw new AppError(404, 'CHANNEL_NOT_FOUND', 'Channel not found');
    }

    let setting = await prisma.notificationSettings.findFirst({ where });
    if (!setting) {
      setting = await prisma.notificationSettings.create({
        data: {
          id: generateSnowflake(),
          user_id: req.user!.userId,
          channel_id: req.params.channelId,
          muted: req.body.muted ?? false,
          suppress_everyone: req.body.suppress_everyone ?? false,
          suppress_roles: req.body.suppress_roles ?? false,
          message_notifications: req.body.message_notifications ?? 0,
        },
      });
    } else {
      setting = await prisma.notificationSettings.update({
        where: { user_id_channel_id: { user_id: req.user!.userId, channel_id: req.params.channelId } },
        data: req.body,
      });
    }
    res.json(setting);
  } catch (err) {
    next(err);
  }
}

export async function getGuildNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const setting = await prisma.notificationSettings.findFirst({
      where: { user_id: req.user!.userId, guild_id: req.params.guildId },
    });
    res.json(setting || { guild_id: req.params.guildId, muted: false, suppress_everyone: false, suppress_roles: false, message_notifications: 0 });
  } catch (err) {
    next(err);
  }
}

export async function updateGuildNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const where = { user_id: req.user!.userId, guild_id: req.params.guildId };
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) {
      throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
    }

    let setting = await prisma.notificationSettings.findFirst({ where });
    if (!setting) {
      setting = await prisma.notificationSettings.create({
        data: {
          id: generateSnowflake(),
          user_id: req.user!.userId,
          guild_id: req.params.guildId,
          muted: req.body.muted ?? false,
          suppress_everyone: req.body.suppress_everyone ?? false,
          suppress_roles: req.body.suppress_roles ?? false,
          message_notifications: req.body.message_notifications ?? 0,
        },
      });
    } else {
      setting = await prisma.notificationSettings.update({
        where: { user_id_guild_id: { user_id: req.user!.userId, guild_id: req.params.guildId } },
        data: req.body,
      });
    }
    res.json(setting);
  } catch (err) {
    next(err);
  }
}

export async function createFriendRequestNotification(senderId: string, receiverId: string): Promise<void> {
  const sender = await prisma.user.findUnique({ where: { id: senderId }, select: { id: true, username: true, avatar: true } });
  if (!sender) return;

  const notification = await prisma.notification.create({
    data: {
      id: generateSnowflake(),
      user_id: receiverId,
      type: 'friend_request',
      data: JSON.stringify({ sender }),
      read: false,
    },
  });

  const io = getIO();
  if (io) {
    io.to(`user:${receiverId}`).emit(GatewayEvents.NOTIFICATION_CREATE, notification);
  }
}

export async function createGuildInviteNotification(guildId: string, inviterId: string, inviteCode: string, receiverId: string): Promise<void> {
  const inviter = await prisma.user.findUnique({ where: { id: inviterId }, select: { id: true, username: true, avatar: true } });
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { id: true, name: true, icon: true } });
  if (!inviter || !guild) return;

  const notification = await prisma.notification.create({
    data: {
      id: generateSnowflake(),
      user_id: receiverId,
      type: 'guild_invite',
      data: JSON.stringify({ inviter, guild, invite_code: inviteCode }),
      read: false,
    },
  });

  const io = getIO();
  if (io) {
    io.to(`user:${receiverId}`).emit(GatewayEvents.NOTIFICATION_CREATE, notification);
  }
}

export async function createNotification(data: {
  user_id: string;
  type: string;
  title: string;
  body: string;
  guild_id?: string;
  channel_id?: string;
  message_id?: string;
}): Promise<void> {
  const notification = await prisma.notification.create({
    data: {
      id: generateSnowflake(),
      user_id: data.user_id,
      type: data.type,
      data: JSON.stringify({ title: data.title, body: data.body }),
      guild_id: data.guild_id,
      channel_id: data.channel_id,
      message_id: data.message_id,
    },
  });

  const io = getIO();
  if (io) {
    io.to(`user:${data.user_id}`).emit(GatewayEvents.NOTIFICATION_CREATE, {
      ...notification,
      title: data.title,
      body: data.body,
    });
  }
}

export async function requestNotificationPermission(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    res.json({ permission: 'default' });
  } catch (err) {
    next(err);
  }
}

export async function createMessageNotification(
  channelId: string,
  authorId: string,
  authorUsername: string,
  content: string,
  mentionIds: string[],
  guildId?: string
): Promise<void> {
  for (const userId of mentionIds) {
    if (userId === authorId) continue;
    await createNotification({
      user_id: userId,
      type: 'message_mention',
      title: `${authorUsername} vous a mentionné`,
      body: content.slice(0, 100),
      guild_id: guildId,
      channel_id: channelId,
    });
  }
}
