import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, writeAuditLog, getHighestRolePosition, AUDIT_LOG_ACTIONS } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

export async function banUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);

    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot ban a member with equal or higher role');
    }

    const targetMember = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    if (targetMember) {
      await prisma.guildMember.delete({
        where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      });
    }

    const existingBan = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    if (existingBan) {
      throw new AppError(400, 'ALREADY_BANNED', 'User is already banned');
    }

    const ban = await prisma.ban.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        user_id: req.params.userId,
        reason: req.body.reason || null,
        banned_by: req.user!.userId,
        delete_message_seconds: req.body.delete_message_seconds || 0,
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_BAN_ADD, req.params.userId, 'USER', [
      { key: 'reason', old_value: null, new_value: req.body.reason },
      { key: 'delete_messages_seconds', old_value: 0, new_value: req.body.delete_messages_seconds || 0 },
    ], req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_BAN_ADD, {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
      });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.GUILD_DELETE, {
        id: req.params.guildId,
      });
    }

    res.status(201).json(ban);
  } catch (err) {
    next(err);
  }
}

export async function unbanUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    const ban = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    if (!ban) throw new AppError(404, 'NOT_BANNED', 'User is not banned');

    await prisma.ban.delete({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_BAN_REMOVE, req.params.userId, 'USER', undefined, undefined, req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_BAN_REMOVE, {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
      });
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

    const limit = Math.min(Number(req.query.limit) || 1000, 1000);
    const where: any = { guild_id: req.params.guildId };

    if (req.query.before) where.user_id = { lt: req.query.before };
    if (req.query.after) where.user_id = { gt: req.query.after };

    const bans = await prisma.ban.findMany({
      where,
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true } },
      },
      orderBy: { user_id: 'desc' },
      take: limit,
    });

    if (req.query.query) {
      const query = (req.query.query as string).toLowerCase();
      const filtered = bans.filter(b =>
        b.user.username.toLowerCase().includes(query) ||
        b.user.id.includes(query)
      );
      res.json(filtered);
    } else {
      res.json(bans);
    }
  } catch (err) {
    next(err);
  }
}

export async function getBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    const ban = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    if (!ban) throw new AppError(404, 'NOT_BANNED', 'User is not banned');

    res.json({
      reason: ban.reason,
      user: ban.user,
    });
  } catch (err) {
    next(err);
  }
}

export async function kickUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x2));

    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);

    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot kick a member with equal or higher role');
    }

    const targetMember = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    if (!targetMember) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    await prisma.guildMember.delete({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_KICK, req.params.userId, 'USER', [
      { key: 'reason', old_value: null, new_value: req.body.reason },
    ], req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_REMOVE, {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
      });
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.GUILD_DELETE, {
        id: req.params.guildId,
      });
    }

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function warnUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x4));

    const targetMember = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
    });

    if (!targetMember) throw new AppError(404, 'MEMBER_NOT_FOUND', 'Member not found');

    const warning = await prisma.adminAuditLog.create({
      data: {
        id: generateSnowflake(),
        admin_id: req.user!.userId,
        action: 'MEMBER_WARN',
        details: JSON.stringify({
          guild_id: req.params.guildId,
          target_user_id: req.params.userId,
          reason: req.body.reason || 'No reason provided',
        }),
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_WARN, req.params.userId, 'USER', [
      { key: 'reason', old_value: null, new_value: req.body.reason },
    ], req.body.reason);

    const io = getIO();
    if (io) {
      io.to(`user:${req.params.userId}`).emit(GatewayEvents.NOTIFICATION_CREATE, {
        id: generateSnowflake(),
        type: 'warn',
        data: JSON.stringify({
          title: 'Avertissement',
          body: req.body.reason || 'Vous avez reçu un avertissement',
        }),
      });
    }

    res.status(201).json({ id: warning.id, reason: req.body.reason });
  } catch (err) {
    next(err);
  }
}
