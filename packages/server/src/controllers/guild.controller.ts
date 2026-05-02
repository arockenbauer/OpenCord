import { Request, Response, NextFunction } from 'express';
import sharp from 'sharp';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { DEFAULT_EVERYONE_PERMISSIONS } from '@opencord/shared';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function requireMembership(guildId: string, userId: string) {
  const member = await prisma.guildMember.findUnique({ where: { guild_id_user_id: { guild_id: guildId, user_id: userId } } });
  if (!member) throw new AppError(403, 'NOT_MEMBER', 'You are not a member of this server');
  return member;
}

export async function getMemberPermissions(guildId: string, userId: string): Promise<bigint> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
  if (guild.owner_id === userId) return BigInt('0xFFFFFFFFFFFFFFFF');

  const everyoneRole = await prisma.role.findFirst({ where: { guild_id: guildId, name: '@everyone' } });
  const everyonePerms = everyoneRole ? BigInt(everyoneRole.permissions) : BigInt(0);

  const memberRoles = await prisma.guildMemberRole.findMany({
    where: { guild_id: guildId, user_id: userId },
    include: { role: true },
  });

  let perms = everyonePerms;
  for (const mr of memberRoles) {
    perms |= BigInt(mr.role.permissions);
  }
  if ((perms & BigInt(0x8)) !== BigInt(0)) return BigInt('0xFFFFFFFFFFFFFFFF');
  return perms;
}

export function checkPermission(perms: bigint, bit: bigint): void {
  if ((perms & BigInt(0x8)) !== BigInt(0)) return;
  if ((perms & bit) === BigInt(0)) throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
}

export async function getHighestRolePosition(guildId: string, userId: string): Promise<number> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { owner_id: true } });
  if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
  if (guild.owner_id === userId) return Number.MAX_SAFE_INTEGER;

  const roles = await prisma.guildMemberRole.findMany({
    where: { guild_id: guildId, user_id: userId },
    include: { role: { select: { position: true } } },
  });
  return roles.reduce((max, r) => Math.max(max, r.role.position), 0);
}

export async function writeAuditLog(guildId: string, userId: string, actionType: string, targetId?: string, targetType?: string, changes?: any, reason?: string) {
  try {
    await prisma.auditLog.create({
      data: {
        id: generateSnowflake(),
        guild_id: guildId,
        user_id: userId,
        action_type: actionType,
        target_id: targetId || null,
        target_type: targetType || null,
        changes: changes ? JSON.stringify(changes) : null,
        reason: reason || null,
      },
    });
  } catch { /* best effort */ }
}

export async function createGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body;
    const userId = req.user!.userId;

    const guildId = generateSnowflake();
    const categoryTextId = generateSnowflake();
    const categoryVoiceId = generateSnowflake();
    const generalChannelId = generateSnowflake();
    const voiceChannelId = generateSnowflake();
    const everyoneRoleId = generateSnowflake();

    const guild = await prisma.guild.create({
      data: {
        id: guildId,
        name,
        owner_id: userId,
        system_channel_id: generalChannelId,
      },
    });

    await prisma.role.create({
      data: {
        id: everyoneRoleId,
        guild_id: guildId,
        name: '@everyone',
        position: 0,
        permissions: DEFAULT_EVERYONE_PERMISSIONS.toString(),
      },
    });

    await prisma.channel.createMany({
      data: [
        { id: categoryTextId, guild_id: guildId, name: 'TEXTE', type: 4, position: 0 },
        { id: generalChannelId, guild_id: guildId, name: 'général', type: 0, position: 0, parent_id: categoryTextId },
        { id: categoryVoiceId, guild_id: guildId, name: 'VOCAL', type: 4, position: 1 },
        { id: voiceChannelId, guild_id: guildId, name: 'Général', type: 2, position: 0, parent_id: categoryVoiceId },
      ],
    });

    await prisma.guildMember.create({
      data: { guild_id: guildId, user_id: userId },
    });

    const fullGuild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: true, roles: true, members: { include: { user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } } } } },
    });

    const io = getIO();
    if (io) {
      const sockets = await io.in(`user:${userId}`).fetchSockets();
      for (const s of sockets) {
        s.join(`guild:${guildId}`);
        for (const ch of fullGuild!.channels) {
          s.join(`channel:${ch.id}`);
        }
      }
    }

    res.status(201).json(fullGuild);
  } catch (err) {
    next(err);
  }
}

export async function getGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: {
        channels: { orderBy: [{ type: 'asc' }, { position: 'asc' }] },
        roles: { orderBy: { position: 'asc' } },
        emojis: true,
        stickers: true,
        _count: { select: { members: true } },
      },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    res.json({ ...guild, member_count: guild._count.members });
  } catch (err) {
    next(err);
  }
}

export async function updateGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: req.body });

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_UPDATE, { guild });

    res.json(guild);
  } catch (err) {
    next(err);
  }
}

export async function deleteGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
    if (guild.owner_id !== req.user!.userId) throw new AppError(403, 'NOT_OWNER', 'Only the owner can delete the server');
    if (req.body.confirmation !== guild.name) throw new AppError(400, 'INVALID_CONFIRMATION', 'Server name does not match');

    // Require 2FA code if owner has 2FA enabled
    const owner = await prisma.user.findUnique({ where: { id: guild.owner_id } });
    if (owner?.two_factor_enabled) {
      if (!req.body.code) throw new AppError(400, 'MISSING_2FA_CODE', '2FA code required for server deletion');
      const { authenticator } = await import('otplib');
      const isValid = authenticator.verify({ token: req.body.code, secret: owner.two_factor_secret! });
      if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
    }

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_DELETE, { id: guild.id });

    // Cascade delete: channels → messages → all related data
    const channels = await prisma.channel.findMany({ where: { guild_id: guild.id }, select: { id: true } });
    const channelIds = channels.map(c => c.id);
    if (channelIds.length > 0) {
      await prisma.message.deleteMany({ where: { channel_id: { in: channelIds } } });
    }
    await prisma.channel.deleteMany({ where: { guild_id: guild.id } });
    await prisma.role.deleteMany({ where: { guild_id: guild.id } });
    await prisma.invite.deleteMany({ where: { guild_id: guild.id } });
    await prisma.ban.deleteMany({ where: { guild_id: guild.id } });
    await prisma.emoji.deleteMany({ where: { guild_id: guild.id } });
    await prisma.sticker.deleteMany({ where: { guild_id: guild.id } });
    await prisma.auditLog.deleteMany({ where: { guild_id: guild.id } });
    await prisma.autoModRule.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guildScheduledEvent.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guildWidget.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guildMember.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guildTemplate.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guildWelcomeChannel.deleteMany({ where: { guild_id: guild.id } });
    await prisma.guild.delete({ where: { id: guild.id } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function uploadGuildIcon(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const iconDir = path.join(uploadDir, 'guild-icons');
    fs.mkdirSync(iconDir, { recursive: true });

    const filename = `${req.params.guildId}.webp`;
    await sharp(req.file.path).resize(128, 128, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(iconDir, filename));
    fs.unlinkSync(req.file.path);

    const iconUrl = `/uploads/guild-icons/${filename}`;
    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: { icon: iconUrl } });

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_UPDATE, { guild: { id: guild.id, icon: guild.icon } });

    res.json({ icon: guild.icon });
  } catch (err) {
    next(err);
  }
}

export async function uploadGuildBanner(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const bannerDir = path.join(uploadDir, 'guild-banners');
    fs.mkdirSync(bannerDir, { recursive: true });

    const filename = `${req.params.guildId}.webp`;
    await sharp(req.file.path).resize(960, 540, { fit: 'cover' }).webp({ quality: 80 }).toFile(path.join(bannerDir, filename));
    fs.unlinkSync(req.file.path);

    const bannerUrl = `/uploads/guild-banners/${filename}`;
    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: { banner: bannerUrl } });

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_UPDATE, { guild: { id: guild.id, banner: guild.banner } });

    res.json({ banner: guild.banner });
  } catch (err) {
    next(err);
  }
}

export async function getMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);

    const limit = Math.min(Number(req.query.limit) || 100, 1000);
    const after = req.query.after as string | undefined;
    const query = req.query.query as string | undefined;

    const where: any = { guild_id: req.params.guildId };
    if (after) where.user_id = { gt: after };
    if (query) {
      where.OR = [
        { user: { username: { contains: query } } },
        { nickname: { contains: query } },
      ];
    }

    const members = await prisma.guildMember.findMany({
      where,
      take: limit,
      orderBy: { user_id: 'asc' },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, bot: true } },
        role_assignments: { select: { role_id: true } },
      },
    });

    res.json({
      members: members.map((m) => ({
        user: m.user,
        nickname: m.nickname,
        roles: m.role_assignments.map((ra) => ra.role_id),
        joined_at: m.joined_at,
        premium_since: m.premium_since,
        communication_disabled_until: m.communication_disabled_until,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);

    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true, bot: true } },
        role_assignments: { select: { role_id: true } },
      },
    });
    if (!member) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    res.json({
      user: member.user,
      nickname: member.nickname,
      roles: member.role_assignments.map((ra) => ra.role_id),
      joined_at: member.joined_at,
      premium_since: member.premium_since,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);
    if (req.params.userId !== req.user!.userId && actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot act on a member with an equal or higher role');
    }
    const currentMember = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: { role_assignments: { select: { role_id: true } } },
    });
    if (!currentMember) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    const data: any = {};

    if (req.body.nickname !== undefined) {
      if (req.params.userId === req.user!.userId) {
        checkPermission(perms, BigInt(0x4000000));
      } else {
        checkPermission(perms, BigInt(0x8000000));
      }
      data.nickname = req.body.nickname || null;
    }

    if (req.body.communication_disabled_until !== undefined) {
      checkPermission(perms, BigInt(0x10000000000));
      data.communication_disabled_until = req.body.communication_disabled_until ? new Date(req.body.communication_disabled_until) : null;
      await writeAuditLog(req.params.guildId, req.user!.userId, data.communication_disabled_until ? 'MEMBER_TIMEOUT' : 'MEMBER_TIMEOUT_REMOVE', req.params.userId, 'USER', null, req.body.reason);
    }

    const member = await prisma.guildMember.update({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      data,
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
        role_assignments: { select: { role_id: true } },
      },
    });

    if (req.body.roles !== undefined) {
      checkPermission(perms, BigInt(0x10000000));

      await prisma.guildMemberRole.deleteMany({
        where: { guild_id: req.params.guildId, user_id: req.params.userId },
      });

      if (req.body.roles.length > 0) {
        await prisma.guildMemberRole.createMany({
          data: req.body.roles.map((roleId: string) => ({
            guild_id: req.params.guildId,
            user_id: req.params.userId,
            role_id: roleId,
            assigned_by: req.user!.userId,
          })),
        });
      }
      await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_ROLES_UPDATE', req.params.userId, 'USER', {
        before: currentMember.role_assignments.map((ra) => ra.role_id),
        after: req.body.roles,
      }, req.body.reason);

      const io = getIO();
      if (io) {
        io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_UPDATE, {
          guild_id: req.params.guildId,
          member: {
            user: member.user,
            roles: req.body.roles,
            nickname: member.nickname,
          },
        });
      }
    }

    if (req.body.nickname !== undefined) {
      await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_NICKNAME_UPDATE', req.params.userId, 'USER', {
        before: currentMember.nickname,
        after: data.nickname ?? null,
      }, req.body.reason);
    }

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_UPDATE, {
        guild_id: req.params.guildId,
        member: {
          user: member.user,
          roles: req.body.roles || member.role_assignments.map((ra) => ra.role_id),
          nickname: member.nickname,
        },
      });
    }

    res.json(member);
  } catch (err) {
    next(err);
  }
}

export async function kickMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x2));
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);
    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot kick a member with an equal or higher role');
    }

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (guild?.owner_id === req.params.userId) throw new AppError(400, 'CANNOT_KICK_OWNER', 'Cannot kick the server owner');

    await prisma.guildMember.delete({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_KICK', req.params.userId, 'USER', null, req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_REMOVE, {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
      });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.GUILD_DELETE, { id: req.params.guildId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function leaveGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
    if (guild.owner_id === req.user!.userId) throw new AppError(400, 'CANNOT_LEAVE', 'Transfer ownership before leaving');

    await prisma.guildMember.delete({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.user!.userId } },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_REMOVE, {
        guild_id: req.params.guildId,
        user_id: req.user!.userId,
      });
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.GUILD_DELETE, { id: req.params.guildId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getBans(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    const bans = await prisma.ban.findMany({
      where: { guild_id: req.params.guildId },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });
    res.json({ bans });
  } catch (err) {
    next(err);
  }
}

export async function createBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);
    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot ban a member with an equal or higher role');
    }

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (guild?.owner_id === req.params.userId) throw new AppError(400, 'CANNOT_BAN_OWNER', 'Cannot ban the owner');

    await prisma.guildMember.deleteMany({
      where: { guild_id: req.params.guildId, user_id: req.params.userId },
    });

    await prisma.ban.upsert({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      create: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        user_id: req.params.userId,
        reason: req.body.reason || null,
        banned_by: req.user!.userId,
        delete_messages_seconds: (req.body.delete_message_days || 0) * 86400,
      },
      update: {
        reason: req.body.reason || null,
        banned_by: req.user!.userId,
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_BAN_ADD', req.params.userId, 'USER', null, req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_BAN_ADD, {
        guild_id: req.params.guildId,
        user: { id: req.params.userId },
      });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.GUILD_DELETE, { id: req.params.guildId });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    await prisma.ban.deleteMany({ where: { guild_id: req.params.guildId, user_id: req.params.userId } });

    await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_BAN_REMOVE', req.params.userId, 'USER');

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_BAN_REMOVE, {
        guild_id: req.params.guildId,
        user: { id: req.params.userId },
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function transferOwnership(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
    if (guild.owner_id !== req.user!.userId) throw new AppError(403, 'NOT_OWNER', 'Only the owner can transfer');

    // Require 2FA code if owner has 2FA enabled
    const owner = await prisma.user.findUnique({ where: { id: guild.owner_id } });
    if (owner?.two_factor_enabled) {
      if (!req.body.code) throw new AppError(400, 'MISSING_2FA_CODE', '2FA code required for ownership transfer');
      const { authenticator } = await import('otplib');
      const isValid = authenticator.verify({ token: req.body.code, secret: owner.two_factor_secret! });
      if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
    }

    const targetMember = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.body.new_owner_id } },
    });
    if (!targetMember) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Target user is not a member');

    await prisma.guild.update({ where: { id: guild.id }, data: { owner_id: req.body.new_owner_id } });

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_UPDATE, { guild: { id: guild.id, owner_id: req.body.new_owner_id } });

    res.json({ owner_id: req.body.new_owner_id });
  } catch (err) {
    next(err);
  }
}

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x80));

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined;
    const where: any = { guild_id: req.params.guildId };
    if (before) where.id = { lt: before };
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.action_type) where.action_type = req.query.action_type;

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });

    res.json({ audit_logs: logs });
  } catch (err) {
    next(err);
  }
}

export async function getVanityUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    res.json({ code: guild.vanity_url_code, uses: 0 });
  } catch (err) {
    next(err);
  }
}

export async function updateVanityUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
    if (guild.premium_tier < 3) throw new AppError(403, 'INSUFFICIENT_TIER', 'Vanity URL requires server boost tier 3');

    const code = req.body.code;
    if (!code || !/^[a-zA-Z0-9-]{3,32}$/.test(code)) throw new AppError(400, 'INVALID_CODE', 'Invalid vanity URL code (3-32 alphanumeric chars)');

    const existing = await prisma.guild.findUnique({ where: { vanity_url_code: code } });
    if (existing && existing.id !== req.params.guildId) throw new AppError(409, 'CODE_TAKEN', 'This code is already taken');

    await prisma.guild.update({ where: { id: req.params.guildId }, data: { vanity_url_code: code } });
    res.json({ code });
  } catch (err) {
    next(err);
  }
}

export async function getGuildBoosters(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId } = req.params;
    await requireMembership(guildId, req.user!.userId);

    const guild = await prisma.guild.findUnique({
      where: { id: guildId },
      select: { premium_tier: true, premium_subscription_count: true },
    });

    if (!guild) {
      res.status(404).json({ message: 'Guild not found' });
      return;
    }

    const boosts = await prisma.boost.findMany({
      where: { guild_id: guildId },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true } } },
      orderBy: { started_at: 'desc' },
    });

    const boostersMap = new Map<string, { user: any; boost_count: number; premium_since: string }>();
    for (const boost of boosts) {
      if (boostersMap.has(boost.user_id)) {
        boostersMap.get(boost.user_id)!.boost_count++;
      } else {
        boostersMap.set(boost.user_id, {
          user: boost.user,
          boost_count: 1,
          premium_since: boost.started_at.toISOString(),
        });
      }
    }

    res.json({
      boosters: Array.from(boostersMap.values()),
      premium_tier: guild.premium_tier,
      premium_subscription_count: guild.premium_subscription_count,
    });
  } catch (err) {
    next(err);
  }
}

export async function getWidget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const widget = await prisma.guildWidget.findUnique({ where: { guild_id: req.params.guildId } });
    if (!widget) {
      res.json({ guild_id: req.params.guildId, enabled: false, channel_id: null });
      return;
    }
    res.json(widget);
  } catch (err) {
    next(err);
  }
}

export async function updateWidget(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const widget = await prisma.guildWidget.upsert({
      where: { guild_id: req.params.guildId },
      create: {
        guild_id: req.params.guildId,
        enabled: req.body.enabled ?? false,
        channel_id: req.body.channel_id || null,
      },
      update: {
        enabled: req.body.enabled !== undefined ? req.body.enabled : undefined,
        channel_id: req.body.channel_id !== undefined ? req.body.channel_id : undefined,
      },
    });
    res.json(widget);
  } catch (err) {
    next(err);
  }
}

export async function getMemberCount(guildId: string): Promise<number> {
  return prisma.guildMember.count({ where: { guild_id: guildId } });
}

export async function pruneCount(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x2)); // KICK_MEMBERS

    const days = Math.min(Math.max(Number(req.query.days) || 7, 1), 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const membersWithRoles = await prisma.guildMemberRole.findMany({
      where: { guild_id: req.params.guildId },
      select: { user_id: true },
      distinct: ['user_id'],
    });
    const membersWithRolesSet = new Set(membersWithRoles.map(m => m.user_id));

    const count = await prisma.guildMember.count({
      where: {
        guild_id: req.params.guildId,
        joined_at: { lt: cutoff },
        user_id: { notIn: [...membersWithRolesSet, guild.owner_id] },
      },
    });

    res.json({ pruned: count });
  } catch (err) {
    next(err);
  }
}

export async function pruneMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x2)); // KICK_MEMBERS

    const days = Math.min(Math.max(Number(req.body.days) || 7, 1), 30);
    const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const membersWithRoles = await prisma.guildMemberRole.findMany({
      where: { guild_id: req.params.guildId },
      select: { user_id: true },
      distinct: ['user_id'],
    });
    const membersWithRolesSet = new Set(membersWithRoles.map(m => m.user_id));

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const toPrune = await prisma.guildMember.findMany({
      where: {
        guild_id: req.params.guildId,
        joined_at: { lt: cutoff },
        user_id: { notIn: [...membersWithRolesSet, guild.owner_id] },
      },
      select: { user_id: true },
    });

    const io = getIO();

    for (const member of toPrune) {
      await prisma.guildMember.delete({
        where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: member.user_id } },
      }).catch(() => {});

      if (io) {
        io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_REMOVE, {
          guild_id: req.params.guildId,
          user_id: member.user_id,
        });
      }
    }

    await writeAuditLog(req.params.guildId, req.user!.userId, 'MEMBER_PRUNE', undefined, 'guild', { days, count: toPrune.length });

    res.json({ pruned: toPrune.length });
  } catch (err) {
    next(err);
  }
}

export async function getGuildTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);

    const templates = await prisma.guildTemplate.findMany({
      where: { guild_id: req.params.guildId },
    });

    res.json({ templates });
  } catch (err) {
    next(err);
  }
}

export async function createGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
      },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const serialized = JSON.stringify({
      name: guild.name,
      description: req.body.description || null,
      channels: guild.channels.map(c => ({
        type: c.type, name: c.name, position: c.position, parent_id: c.parent_id,
        topic: c.topic, nsfw: c.nsfw, bitrate: c.bitrate, user_limit: c.user_limit,
        slowmode_delay: c.slowmode_delay,
      })),
      roles: guild.roles.map(r => ({
        name: r.name, permissions: r.permissions, color: r.color,
        hoist: r.hoist, mentionable: r.mentionable,
      })),
    });

    const template = await prisma.guildTemplate.create({
      data: {
        id: generateSnowflake(),
        name: req.body.name,
        description: req.body.description || null,
        guild_id: req.params.guildId,
        serialized,
      },
    });

    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
}

export async function syncGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const template = await prisma.guildTemplate.findFirst({
      where: { id: req.params.code, guild_id: req.params.guildId },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: { channels: true, roles: true },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const serialized = JSON.stringify({
      name: guild.name,
      channels: guild.channels.map(c => ({
        type: c.type, name: c.name, position: c.position, parent_id: c.parent_id,
      })),
      roles: guild.roles.map(r => ({
        name: r.name, permissions: r.permissions, color: r.color,
      })),
    });

    const updated = await prisma.guildTemplate.update({
      where: { id: template.id },
      data: { serialized },
    });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    await prisma.guildTemplate.deleteMany({
      where: { id: req.params.code, guild_id: req.params.guildId },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getWelcomeScreen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      select: { id: true, description: true, system_channel_id: true, welcome_enabled: true },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const welcomeChannels = await prisma.guildWelcomeChannel.findMany({
      where: { guild_id: req.params.guildId },
      include: { channel: { select: { id: true, name: true } } },
    });

    res.json({
      enabled: guild.welcome_enabled,
      description: guild.description,
      welcome_channels: welcomeChannels.map((wc: { channel_id: string; channel: { name: string }; emoji_id: string | null; description: string }) => ({
        channel_id: wc.channel_id,
        channel_name: wc.channel.name,
        emoji_id: wc.emoji_id,
        description: wc.description,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function updateWelcomeScreen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20)); // MANAGE_GUILD

    const { enabled, description, welcome_channels } = req.body;

    const data: any = {};
    if (enabled !== undefined) data.welcome_enabled = enabled;
    if (description !== undefined) data.description = description;

    if (welcome_channels !== undefined) {
      await prisma.guildWelcomeChannel.deleteMany({ where: { guild_id: req.params.guildId } });
      if (welcome_channels.length > 0) {
        await prisma.guildWelcomeChannel.createMany({
          data: welcome_channels.map((wc: { channel_id: string; emoji_id?: string; description: string }) => ({
            guild_id: req.params.guildId,
            channel_id: wc.channel_id,
            emoji_id: wc.emoji_id || null,
            description: wc.description,
          })),
        });
      }
    }

    const guild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data,
      select: { id: true, description: true, system_channel_id: true, welcome_enabled: true },
    });

    const savedChannels = await prisma.guildWelcomeChannel.findMany({
      where: { guild_id: req.params.guildId },
      include: { channel: { select: { id: true, name: true } } },
    });

    res.json({
      enabled: guild.welcome_enabled,
      description: guild.description,
      welcome_channels: savedChannels.map((wc: { channel_id: string; channel: { name: string }; emoji_id: string | null; description: string }) => ({
        channel_id: wc.channel_id,
        channel_name: wc.channel.name,
        emoji_id: wc.emoji_id,
        description: wc.description,
      })),
    });
  } catch (err) {
    next(err);
  }
}

export async function getMyGuildPermissions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await requireMembership(req.params.guildId, req.user!.userId);
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    res.json({ permissions: perms.toString() });
  } catch (err) {
    next(err);
  }
}
