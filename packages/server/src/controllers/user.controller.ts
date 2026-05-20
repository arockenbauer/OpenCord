import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import crypto from 'crypto';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { GatewayEvents } from '@opencord/shared';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

function resolveRelationshipType(relationship: { user_id: string; status: number } | null, viewerId: string): number | null {
  if (!relationship) return null;
  if (relationship.status === 0) {
    return relationship.user_id === viewerId ? 0 : 3;
  }
  return relationship.status;
}

function getFriendIds(edges: Array<{ user_id: string; target_id: string; status: number }>, userId: string): string[] {
  return edges
    .filter((edge) => edge.status === 1)
    .map((edge) => edge.user_id === userId ? edge.target_id : edge.user_id);
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      include: { user_badges: { include: { badge: true } }, notification_settings: true },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const { password_hash, two_factor_secret, two_factor_backup_codes, email_verify_token, password_reset_token, password_reset_expires, bot_token, ...safe } = user as any;
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

export async function updateMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const data = req.body;
    const allowedFields = [
      'username', 'global_name', 'bio', 'status', 'custom_status_text',
      'custom_status_emoji', 'custom_status_expires_at', 'locale', 'theme', 'font_size',
      'explicit_content_filter', 'default_message_notifications', 'allow_dms_from', 'allow_friend_requests', 'allow_friend_requests_from',
      'banner_color', 'accent_color', 'pronouns', 'avatar',
      'streamer_mode_enabled', 'streamer_mode_auto_detect', 'streamer_mode_hide_links',
      'streamer_mode_hide_email', 'streamer_mode_hide_notes', 'streamer_mode_hide_notifications',
      'streamer_mode_hide_personal_info', 'streamer_mode_disable_sounds',
    ];

    const currentUser = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!currentUser) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const maxBioLength = currentUser.premium ? 4000 : 190;
    if (data.bio && data.bio.length > maxBioLength) {
      throw new AppError(400, 'BIO_TOO_LONG', `Bio exceeds ${maxBioLength} characters`);
    }

    const updateData: any = {};
    for (const field of allowedFields) {
      if (data[field] !== undefined) updateData[field] = data[field];
    }

    if (updateData.username) {
      if (updateData.username !== currentUser.username) {
        const existing = await prisma.user.findFirst({
          where: { username: updateData.username, discriminator: currentUser.discriminator, id: { not: currentUser.id } },
        });
        if (existing) {
          throw new AppError(400, 'USERNAME_CONFLICT', 'Username conflict, try a different one');
        }
      }
    }

    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: updateData,
    });

    // Emit USER_UPDATE for profile changes
    const io = getIO();
    if (io) {
      const safeForEmit = {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        global_name: user.global_name,
        avatar: user.avatar,
        banner: user.banner,
        bio: user.bio,
        status: user.status,
        custom_status_text: user.custom_status_text,
        custom_status_emoji: user.custom_status_emoji,
      };
      io.emit(GatewayEvents.USER_UPDATE, safeForEmit);

      // Emit PRESENCE_UPDATE for status changes
      if (data.status !== undefined || data.custom_status_text !== undefined || data.custom_status_emoji !== undefined) {
        io.emit(GatewayEvents.PRESENCE_UPDATE, {
          user_id: user.id,
          status: user.status,
          custom_status_text: user.custom_status_text,
          custom_status_emoji: user.custom_status_emoji,
        });
      }
    }

    const { password_hash, two_factor_secret, two_factor_backup_codes, email_verify_token, password_reset_token, password_reset_expires, bot_token, ...safe } = user;
    res.json(safe);
  } catch (err) {
    next(err);
  }
}

export async function updateAvatar(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const avatarDir = path.join(uploadDir, 'avatars');
    fs.mkdirSync(avatarDir, { recursive: true });

    const filename = `${req.user!.userId}.webp`;
    const outputPath = path.join(avatarDir, filename);

    await sharp(req.file.path).resize(128, 128, { fit: 'cover' }).webp({ quality: 80 }).toFile(outputPath);

    const fileBuffer = fs.readFileSync(outputPath);
    const hash = crypto.createHash('md5').update(fileBuffer).digest('hex');
    const isAnimated = req.file.mimetype === 'image/gif';

    fs.unlinkSync(req.file.path);

    const avatarUrl = `/uploads/avatars/${filename}`;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { avatar: avatarUrl, avatar_hash: hash, avatar_animated: isAnimated, avatar_updated_at: new Date() },
    });

    res.json({ avatar: user.avatar });
  } catch (err) {
    next(err);
  }
}

export async function updateBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const bannerDir = path.join(uploadDir, 'banners');
    fs.mkdirSync(bannerDir, { recursive: true });

    const filename = `${req.user!.userId}.webp`;
    const outputPath = path.join(bannerDir, filename);

    await sharp(req.file.path).resize(600, 240, { fit: 'cover' }).webp({ quality: 80 }).toFile(outputPath);
    fs.unlinkSync(req.file.path);

    const bannerUrl = `/uploads/banners/${filename}`;
    const user = await prisma.user.update({
      where: { id: req.user!.userId },
      data: { banner: bannerUrl, banner_updated_at: new Date() },
    });

    res.json({ banner: user.banner });
  } catch (err) {
    next(err);
  }
}

export async function getUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const viewerId = req.user!.userId;
    const userId = req.params.userId;
    const guildId = typeof req.query.guild_id === 'string' ? req.query.guild_id : null;

    const [user, relationship, viewerMemberships, targetMemberships, viewerGuildMember, targetGuildMember] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        include: { user_badges: { include: { badge: true } } },
      }),
      viewerId === userId ? Promise.resolve(null) : prisma.friend.findFirst({
        where: {
          OR: [
            { user_id: viewerId, target_id: userId },
            { user_id: userId, target_id: viewerId },
          ],
        },
      }),
      prisma.guildMember.findMany({
        where: { user_id: viewerId },
        include: { guild: { select: { id: true, name: true, icon: true } } },
      }),
      prisma.guildMember.findMany({
        where: { user_id: userId },
        include: { guild: { select: { id: true, name: true, icon: true } } },
      }),
      guildId ? prisma.guildMember.findUnique({
        where: { guild_id_user_id: { guild_id: guildId, user_id: viewerId } },
        select: { user_id: true },
      }) : Promise.resolve(null),
      guildId ? prisma.guildMember.findUnique({
        where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
        include: { role_assignments: { include: { role: true } } },
      }) : Promise.resolve(null),
    ]);

    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const viewerGuildIds = new Map(viewerMemberships.map((membership) => [membership.guild_id, membership.guild]));
    const mutualGuilds = targetMemberships
      .filter((membership) => viewerGuildIds.has(membership.guild_id))
      .map((membership) => viewerGuildIds.get(membership.guild_id))
      .filter(Boolean);

    const relationshipType = resolveRelationshipType(relationship, viewerId);
    const hasSharedGuild = mutualGuilds.length > 0;

    if (viewerId !== userId && !hasSharedGuild && relationshipType === null) {
      throw new AppError(403, 'PROFILE_NOT_ACCESSIBLE', 'You must share a guild or relationship with this user');
    }

    let mutualFriends: Array<{ id: string; username: string; discriminator: string; avatar: string | null; global_name: string | null; status: string }> = [];
    if (viewerId !== userId) {
      const [viewerFriends, targetFriends] = await Promise.all([
        prisma.friend.findMany({
          where: {
            status: 1,
            OR: [{ user_id: viewerId }, { target_id: viewerId }],
          },
          select: { user_id: true, target_id: true, status: true },
        }),
        prisma.friend.findMany({
          where: {
            status: 1,
            OR: [{ user_id: userId }, { target_id: userId }],
          },
          select: { user_id: true, target_id: true, status: true },
        }),
      ]);

      const viewerFriendIds = new Set(getFriendIds(viewerFriends, viewerId));
      const targetFriendIds = getFriendIds(targetFriends, userId).filter((id) => viewerFriendIds.has(id) && id !== viewerId && id !== userId);

      if (targetFriendIds.length > 0) {
        mutualFriends = await prisma.user.findMany({
          where: { id: { in: targetFriendIds } },
          select: {
            id: true,
            username: true,
            discriminator: true,
            avatar: true,
            global_name: true,
            status: true,
          },
          take: 10,
        });
      }
    }

    const guildRoles = viewerGuildMember && targetGuildMember
      ? [...targetGuildMember.role_assignments]
        .map((assignment) => assignment.role)
        .sort((a, b) => b.position - a.position)
      : [];

    res.json({
      id: user.id,
      username: user.username,
      discriminator: user.discriminator,
      global_name: user.global_name,
      avatar: user.avatar,
      banner: user.banner,
      banner_color: user.banner_color,
      accent_color: user.accent_color,
      bio: user.bio,
      status: user.status,
      custom_status_text: user.custom_status_text,
      custom_status_emoji: user.custom_status_emoji,
      flags: user.flags,
      bot: user.bot,
      premium: user.premium,
      premium_type: user.premium_type,
      badges: user.user_badges.map((entry) => entry.badge),
      created_at: user.created_at,
      relationship_type: relationshipType,
      mutual_guilds: mutualGuilds,
      mutual_friends: mutualFriends,
      guild_member: viewerGuildMember && targetGuildMember ? {
        nickname: targetGuildMember.nickname,
        joined_at: targetGuildMember.joined_at,
        roles: guildRoles,
      } : null,
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyGuilds(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const memberships = await prisma.guildMember.findMany({
      where: { user_id: req.user!.userId },
      include: {
        guild: { select: { id: true, name: true, icon: true, owner_id: true, premium_tier: true, features: true } },
      },
    });

    const guilds = memberships.map((m) => ({
      id: m.guild.id,
      name: m.guild.name,
      icon: m.guild.icon,
      owner: m.guild.owner_id === req.user!.userId,
      premium_tier: m.guild.premium_tier,
    }));

    res.json({ guilds });
  } catch (err) {
    next(err);
  }
}

export async function deleteAccount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    const ownedGuilds = await prisma.guild.findMany({ where: { owner_id: user.id } });
    if (ownedGuilds.length > 0) {
      throw new AppError(400, 'OWNS_GUILDS', 'Transfer or delete your guilds before deleting your account');
    }

    await prisma.user.delete({ where: { id: user.id } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getNotificationSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await prisma.notificationSettings.findMany({ where: { user_id: req.user!.userId } });
    res.json({ settings });
  } catch (err) {
    next(err);
  }
}

export async function getUserNotes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const notes = await prisma.userNote.findMany({
      where: { user_id: req.user!.userId },
      include: { note_target: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true } } },
      orderBy: { updated_at: 'desc' },
    });
    res.json({ notes });
  } catch (err) {
    next(err);
  }
}

export async function setUserNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (req.params.userId === req.user!.userId) throw new AppError(400, 'INVALID', 'Cannot set note on yourself');

    const target = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!target) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const note = await prisma.userNote.upsert({
      where: { user_id_note_user_id: { user_id: req.user!.userId, note_user_id: req.params.userId } },
      create: { id: generateSnowflake(), user_id: req.user!.userId, note_user_id: req.params.userId, note_content: req.body.note_content || req.body.content || '' },
      update: { note_content: req.body.note_content || req.body.content || '' },
      include: { note_target: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true } } },
    });
    res.json({ id: note.id, note_content: note.note_content, note_user_id: note.note_user_id, note_target: note.note_target });
  } catch (err) {
    next(err);
  }
}

export async function deleteUserNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userNote.delete({ where: { user_id_note_user_id: { user_id: req.user!.userId, note_user_id: req.params.userId } } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const connections = await prisma.connectedAccount.findMany({ where: { user_id: req.user!.userId } });
    res.json({ connections });
  } catch (err) {
    next(err);
  }
}

export async function createConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const connection = await prisma.connectedAccount.create({
      data: {
        id: generateSnowflake(),
        user_id: req.user!.userId,
        type: req.body.platform,
        name: req.body.platform_username,
        access_token: req.body.access_token,
        refresh_token: req.body.refresh_token,
      },
    });
    res.status(201).json(connection);
  } catch (err) {
    next(err);
  }
}

export async function deleteConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.connectedAccount.delete({
      where: { user_id_type: { user_id: req.user!.userId, type: req.params.platform } },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getActivities(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activities = await prisma.userActivity.findMany({
      where: { user_id: req.user!.userId },
      orderBy: { created_at: 'desc' },
      take: 10,
    });
    res.json({ activities });
  } catch (err) {
    next(err);
  }
}

export async function updateActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const activity = await prisma.userActivity.create({
      data: {
        id: generateSnowflake(),
        user_id: req.user!.userId,
        activity_type: req.body.activity_type,
        application_id: req.body.application_id || null,
        name: req.body.name || null,
        state: req.body.state || null,
        details: req.body.details || null,
        timestamps: req.body.timestamps ? JSON.stringify(req.body.timestamps) : null,
        session_id: req.body.session_id || null,
      },
    });
    res.status(201).json(activity);
  } catch (err) {
    next(err);
  }
}

export async function deleteActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userActivity.deleteMany({ where: { user_id: req.user!.userId, session_id: req.params.sessionId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getUserSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.userId },
      select: {
        explicit_content_filter: true,
        default_message_notifications: true,
        allow_dms_from: true,
        locale: true,
        theme: true,
        streamer_mode_enabled: true,
        streamer_mode_auto_detect: true,
        streamer_mode_hide_links: true,
        streamer_mode_hide_email: true,
        streamer_mode_hide_notes: true,
        streamer_mode_hide_notifications: true,
        streamer_mode_hide_personal_info: true,
        streamer_mode_disable_sounds: true,
      },
    });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    const frPolicy = await prisma.$queryRaw<Array<{ allow_friend_requests_from: string | null }>>`
      SELECT allow_friend_requests_from FROM User WHERE id = ${req.user!.userId} LIMIT 1
    `;
    res.json({
      ...user,
      allow_friend_requests_from: frPolicy[0]?.allow_friend_requests_from || 'everyone',
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const allowed = [
      'explicit_content_filter', 'default_message_notifications', 'allow_dms_from', 'locale', 'theme',
      'streamer_mode_enabled', 'streamer_mode_auto_detect', 'streamer_mode_hide_links', 'streamer_mode_hide_email',
      'streamer_mode_hide_notes', 'streamer_mode_hide_notifications', 'streamer_mode_hide_personal_info', 'streamer_mode_disable_sounds',
    ];
    const updateData: any = {};
    for (const field of allowed) {
      if (req.body[field] !== undefined) updateData[field] = req.body[field];
    }

    const user = await prisma.user.update({ where: { id: req.user!.userId }, data: updateData });
    if (req.body.allow_friend_requests_from !== undefined) {
      const allowedPolicy = ['everyone', 'friends_of_friends', 'none'];
      const policy = String(req.body.allow_friend_requests_from);
      if (!allowedPolicy.includes(policy)) {
        throw new AppError(400, 'INVALID_FRIEND_REQUEST_POLICY', 'Invalid allow_friend_requests_from value');
      }
      await prisma.$executeRaw`UPDATE User SET allow_friend_requests_from = ${policy} WHERE id = ${req.user!.userId}`;
    }
    const frPolicy = await prisma.$queryRaw<Array<{ allow_friend_requests_from: string | null }>>`
      SELECT allow_friend_requests_from FROM User WHERE id = ${req.user!.userId} LIMIT 1
    `;
    res.json({
      explicit_content_filter: user.explicit_content_filter,
      default_message_notifications: user.default_message_notifications,
      allow_dms_from: user.allow_dms_from,
      allow_friend_requests_from: frPolicy[0]?.allow_friend_requests_from || 'everyone',
      locale: user.locale,
      theme: user.theme,
      streamer_mode_enabled: user.streamer_mode_enabled,
      streamer_mode_auto_detect: user.streamer_mode_auto_detect,
      streamer_mode_hide_links: user.streamer_mode_hide_links,
      streamer_mode_hide_email: user.streamer_mode_hide_email,
      streamer_mode_hide_notes: user.streamer_mode_hide_notes,
      streamer_mode_hide_notifications: user.streamer_mode_hide_notifications,
      streamer_mode_hide_personal_info: user.streamer_mode_hide_personal_info,
      streamer_mode_disable_sounds: user.streamer_mode_disable_sounds,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, custom_status_text, custom_status_emoji, custom_status_expires_at } = req.body;
    const data: any = {};
    if (status !== undefined) data.status = status;
    if (custom_status_text !== undefined) data.custom_status_text = custom_status_text || null;
    if (custom_status_emoji !== undefined) data.custom_status_emoji = custom_status_emoji || null;
    if (custom_status_expires_at !== undefined) data.custom_status_expires_at = custom_status_expires_at ? new Date(custom_status_expires_at) : null;

    const user = await prisma.user.update({ where: { id: req.user!.userId }, data });

    const io = getIO();
    if (io) {
      io.emit(GatewayEvents.PRESENCE_UPDATE, {
        user_id: user.id,
        status: user.status,
        custom_status_text: user.custom_status_text,
        custom_status_emoji: user.custom_status_emoji,
      });
    }

    res.json({ status: user.status, custom_status_text: user.custom_status_text, custom_status_emoji: user.custom_status_emoji });
  } catch (err) {
    next(err);
  }
}

export async function getGames(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const games = await prisma.userGameLibrary.findMany({
      where: { user_id: req.user!.userId },
      orderBy: { last_played_at: 'desc' },
    });
    res.json({ games });
  } catch (err) {
    next(err);
  }
}

export async function addGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const game = await prisma.userGameLibrary.upsert({
      where: { user_id_name: { user_id: req.user!.userId, name: req.body.name } },
      create: { id: generateSnowflake(), user_id: req.user!.userId, name: req.body.name, icon_url: req.body.icon_url || null },
      update: { icon_url: req.body.icon_url || undefined },
    });
    res.status(201).json(game);
  } catch (err) {
    next(err);
  }
}

export async function deleteGame(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userGameLibrary.deleteMany({ where: { id: req.params.gameId, user_id: req.user!.userId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function requestDataExport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;

    const [user, guilds, messages, dmChannels, relationships] = await Promise.all([
      prisma.user.findUnique({
        where: { id: userId },
        select: { id: true, username: true, discriminator: true, email: true, created_at: true, premium: true, global_name: true },
      }),
      prisma.guildMember.findMany({
        where: { user_id: userId },
        include: { guild: { select: { id: true, name: true } } },
      }),
      prisma.message.findMany({
        where: { author_id: userId },
        select: { id: true, channel_id: true, content: true, created_at: true },
        take: 10000,
        orderBy: { created_at: 'desc' },
      }),
      prisma.dMChannelMember.findMany({
        where: { user_id: userId },
        select: { channel_id: true },
      }),
      prisma.friend.findMany({
        where: { OR: [{ user_id: userId }, { target_id: userId }] },
        include: {
          user: { select: { id: true, username: true, discriminator: true } },
          target: { select: { id: true, username: true, discriminator: true } },
        },
      }),
    ]);

    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const exportData = {
      exported_at: new Date().toISOString(),
      user,
      servers: guilds.map((g) => ({ id: g.guild.id, name: g.guild.name, joined_at: g.joined_at, nickname: g.nickname })),
      messages: {
        total: messages.length,
        data: messages,
        note: 'Limited to last 10,000 messages',
      },
      dm_channels: dmChannels.map((d) => d.channel_id),
      relationships: relationships.map((f) => ({
        id: f.id,
        type: f.status,
        user: f.user_id === userId ? f.target : f.user,
      })),
    };

    res.json({ export: exportData });
  } catch (err) {
    next(err);
  }
}

export async function getMyBoosts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const boosts = await prisma.boost.findMany({
      where: { user_id: req.user!.userId, ended_at: null },
      include: { guild: { select: { id: true, name: true, icon: true } } },
      orderBy: { started_at: 'desc' },
    });
    res.json(boosts);
  } catch (err) {
    next(err);
  }
}
