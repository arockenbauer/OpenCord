import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, writeAuditLog } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';
import { createAndDispatchSystemMessage } from '../services/system-message.service.js';

async function generateUniqueInviteCode(): Promise<string> {
  for (let i = 0; i < 10; i++) {
    const code = crypto.randomBytes(6).toString('base64url').slice(0, 8);
    const existing = await prisma.invite.findUnique({ where: { code } });
    if (!existing) return code;
  }
  throw new AppError(500, 'INVITE_CODE_GENERATION_FAILED', 'Unable to generate invite code');
}

export async function createInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x1));

    const guild = await prisma.guild.findUnique({ where: { id: req.params.guildId } });
    if (guild?.invites_disabled) throw new AppError(403, 'INVITES_DISABLED', 'Invites are disabled for this server');

    const channelId = req.body.channel_id || req.params.channelId;
    const channel = await prisma.channel.findUnique({ where: { id: channelId } });
    if (!channel || channel.guild_id !== req.params.guildId) {
      throw new AppError(400, 'INVALID_CHANNEL', 'Channel must belong to the target guild');
    }

    const maxAge = req.body.max_age ?? 86400;
    const expiresAt = maxAge > 0 ? new Date(Date.now() + maxAge * 1000) : null;
    const unique = req.body.unique !== false;

    if (!unique) {
      const reusableInvite = await prisma.invite.findFirst({
        where: {
          guild_id: req.params.guildId,
          channel_id: channelId,
          inviter_id: req.user!.userId,
          max_uses: req.body.max_uses || 0,
          max_age: maxAge,
          temporary: req.body.temporary || false,
        },
        include: {
          guild: { select: { id: true, name: true, icon: true } },
          channel: { select: { id: true, name: true, type: true } },
          inviter: { select: { id: true, username: true, discriminator: true, avatar: true } },
        },
      });
      if (reusableInvite && (!reusableInvite.expires_at || reusableInvite.expires_at > new Date())) {
        res.status(200).json(reusableInvite);
        return;
      }
    }

    const code = await generateUniqueInviteCode();

    const invite = await prisma.invite.create({
      data: {
        code,
        guild_id: req.params.guildId,
        channel_id: channelId,
        inviter_id: req.user!.userId,
        max_uses: req.body.max_uses || 0,
        max_age: maxAge,
        temporary: req.body.temporary || false,
        expires_at: expiresAt,
        source: req.body.source || 'invite',
        source_guild_id: req.body.source_guild_id || null,
      },
      include: {
        guild: { select: { id: true, name: true, icon: true } },
        channel: { select: { id: true, name: true, type: true } },
        inviter: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.INVITE_CREATE, {
        guild_id: req.params.guildId,
        invite: {
          code: invite.code,
          channel_id: invite.channel_id,
          inviter_id: invite.inviter_id,
          max_uses: invite.max_uses,
          uses: invite.uses,
          expires_at: invite.expires_at,
        },
      });
    }
    await writeAuditLog(req.params.guildId, req.user!.userId, 'INVITE_CREATE', invite.code, 'INVITE', {
      channel_id: invite.channel_id,
      max_uses: invite.max_uses,
      max_age: invite.max_age,
      temporary: invite.temporary,
      expires_at: invite.expires_at,
    });

    res.status(201).json(invite);
  } catch (err) {
    next(err);
  }
}

export async function getInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const withCounts = String(req.query.with_counts || '').toLowerCase() === 'true';
    const withExpiration = String(req.query.with_expiration || '').toLowerCase() === 'true';

    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: {
        guild: {
          select: withCounts
            ? { id: true, name: true, icon: true, description: true, _count: { select: { members: true } } }
            : { id: true, name: true, icon: true, description: true },
        },
        channel: { select: { id: true, name: true, type: true } },
      },
    });
    if (!invite) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite not found or expired');
    if (invite.expires_at && invite.expires_at < new Date()) {
      await prisma.invite.delete({ where: { code: invite.code } }).catch(() => {});
      throw new AppError(404, 'INVITE_EXPIRED', 'Invite expired');
    }
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) throw new AppError(404, 'INVITE_USED', 'Invite has been used up');

    const guildData: any = invite.guild;
    if (withCounts && guildData?._count) {
      guildData.approximate_member_count = guildData._count.members;
      delete guildData._count;
    }
    if (!withExpiration) {
      delete (invite as any).expires_at;
    }

    res.json(invite);
  } catch (err) {
    next(err);
  }
}

export async function useInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invite = await prisma.invite.findUnique({ where: { code: req.params.code } });
    if (!invite) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite not found');
    if (invite.expires_at && invite.expires_at < new Date()) throw new AppError(404, 'INVITE_EXPIRED', 'Invite expired');
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) throw new AppError(403, 'INVITE_MAX_USES_REACHED', 'Invite has reached max uses');

    const guildState = await prisma.guild.findUnique({
      where: { id: invite.guild_id },
      select: { invites_disabled: true },
    });
    if (!guildState) throw new AppError(404, 'GUILD_NOT_FOUND', 'Guild not found');
    if (guildState.invites_disabled) throw new AppError(403, 'INVITES_DISABLED', 'Invites are disabled for this server');

    const ban = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: invite.guild_id, user_id: req.user!.userId } },
    });
    if (ban) throw new AppError(403, 'BANNED', 'You are banned from this server');

    const existing = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: invite.guild_id, user_id: req.user!.userId } },
    });
    if (existing) {
      const guild = await prisma.guild.findUnique({ where: { id: invite.guild_id }, include: { channels: true, roles: true } });
      res.json(guild);
      return;
    }

    await prisma.guildMember.create({
      data: {
        guild_id: invite.guild_id,
        user_id: req.user!.userId,
        pending: invite.temporary,
      },
    });
    const updatedInvite = await prisma.invite.update({ where: { code: invite.code }, data: { uses: { increment: 1 } } });
    if (updatedInvite.max_uses > 0 && updatedInvite.uses >= updatedInvite.max_uses) {
      await prisma.invite.delete({ where: { code: updatedInvite.code } }).catch(() => {});
    }

    const guild = await prisma.guild.findUnique({
      where: { id: invite.guild_id },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
        members: { include: { user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } } } },
      },
    });

    const io = getIO();
    if (io) {
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { id: true, username: true, discriminator: true, avatar: true } });
      if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

      io.to(`guild:${invite.guild_id}`).emit(GatewayEvents.GUILD_MEMBER_ADD, {
        guild_id: invite.guild_id,
        member: { user, roles: [], joined_at: new Date(), nickname: null },
      });

      // Send system channel welcome message
      const guildWithSystem = await prisma.guild.findUnique({
        where: { id: invite.guild_id },
        select: { system_channel_id: true, welcome_enabled: true },
      });
      if (guildWithSystem?.system_channel_id && guildWithSystem?.welcome_enabled) {
        await createAndDispatchSystemMessage({
          channelId: guildWithSystem.system_channel_id,
          content: `Bienvenue à ${user.username} !`,
          type: 7,
          guildId: invite.guild_id,
        });
      }

      const sockets = await io.in(`user:${req.user!.userId}`).fetchSockets();
      for (const s of sockets) {
        s.join(`guild:${invite.guild_id}`);
        for (const ch of guild!.channels) {
          s.join(`channel:${ch.id}`);
        }
      }

      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.GUILD_CREATE, { guild });
    }

    res.json(guild);
  } catch (err) {
    next(err);
  }
}

export async function getGuildInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const invites = await prisma.invite.findMany({
      where: { guild_id: req.params.guildId },
      include: {
        channel: { select: { id: true, name: true } },
        inviter: { select: { id: true, username: true, discriminator: true } },
      },
    });
    res.json({ invites });
  } catch (err) {
    next(err);
  }
}

export async function deleteInvite(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const invite = await prisma.invite.findUnique({ where: { code: req.params.code } });
    if (!invite) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite not found');

    const perms = await getMemberPermissions(invite.guild_id, req.user!.userId);
    if (invite.inviter_id !== req.user!.userId) {
      checkPermission(perms, BigInt(0x20));
    }

    await prisma.invite.delete({ where: { code: req.params.code } });

    const io = getIO();
    if (io) {
      io.to(`guild:${invite.guild_id}`).emit(GatewayEvents.INVITE_DELETE, {
        guild_id: invite.guild_id,
        code: invite.code,
      });
    }
    await writeAuditLog(invite.guild_id, req.user!.userId, 'INVITE_DELETE', invite.code, 'INVITE', {
      channel_id: invite.channel_id,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}
