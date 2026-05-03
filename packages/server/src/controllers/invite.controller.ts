import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission, writeAuditLog, AUDIT_LOG_ACTIONS } from './guild.controller.js';
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
    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.INVITE_CREATE, invite.code, 'INVITE', {
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
    const invite = await prisma.invite.findUnique({
      where: { code: req.params.code },
      include: {
        guild: { select: { id: true, name: true, icon: true, splash: true, banner: true, features: true, verification_level: true } },
        channel: { select: { id: true, name: true, type: true } },
      },
    });
    if (!invite) throw new AppError(404, 'INVITE_NOT_FOUND', 'Invite not found');
    if (invite.expires_at && invite.expires_at < new Date()) throw new AppError(404, 'INVITE_EXPIRED', 'Invite expired');
    if (invite.max_uses > 0 && invite.uses >= invite.max_uses) throw new AppError(403, 'INVITE_MAX_USES_REACHED', 'Invite has reached max uses');

    const guildState = await prisma.guild.findUnique({
      where: { id: invite.guild_id },
      select: { invites_disabled: true, verification_level: true },
    });
    if (!guildState) throw new AppError(404, 'GUILD_NOT_FOUND', 'Guild not found');
    if (guildState.invites_disabled) throw new AppError(403, 'INVITES_DISABLED', 'Invites are disabled for this server');

    const ban = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: invite.guild_id, user_id: req.user!.userId } },
    });
    if (ban) throw new AppError(403, 'BANNED_FROM_GUILD', 'You are banned from this server');

    // Vérification du niveau de vérification
    if (guildState.verification_level > 0) {
      // Implémentation basique: vérifier si l'utilisateur a un email vérifié
      const user = await prisma.user.findUnique({ where: { id: req.user!.userId }, select: { email: true } });
      if (!user?.email) throw new AppError(403, 'VERIFICATION_LEVEL_TOO_LOW', 'Verification level too low');
    }

    const existing = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: invite.guild_id, user_id: req.user!.userId } },
    });

    const new_member = !existing;

    if (!existing) {
      // Check if membership verification is enabled
      const verification = await prisma.guildMemberVerification.findUnique({
        where: { guild_id: invite.guild_id },
        select: { enabled: true },
      });
      const isPending = invite.temporary || (verification?.enabled ?? false);

      await prisma.guildMember.create({
        data: {
          guild_id: invite.guild_id,
          user_id: req.user!.userId,
          pending: isPending,
        },
      });
    }

    const updatedInvite = await prisma.invite.update({ where: { code: invite.code }, data: { uses: { increment: 1 } } });
    if (updatedInvite.max_uses > 0 && updatedInvite.uses >= updatedInvite.max_uses) {
      await prisma.invite.delete({ where: { code: updatedInvite.code } }).catch(() => {});
    }

    const io = getIO();
    if (io && new_member) {
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
        const channels = await prisma.channel.findMany({ where: { guild_id: invite.guild_id } });
        for (const ch of channels) {
          s.join(`channel:${ch.id}`);
        }
      }

      const guild = await prisma.guild.findUnique({
        where: { id: invite.guild_id },
        include: {
          channels: { orderBy: { position: 'asc' } },
          roles: { orderBy: { position: 'asc' } },
        },
      });
      io.to(`user:${req.user!.userId}`).emit(GatewayEvents.GUILD_CREATE, { guild });
    }

    res.json({
      type: 0,
      guild: invite.guild,
      channel: invite.channel,
      new_member,
    });
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
        guild: { select: { id: true, name: true, icon: true, splash: true, banner: true, features: true, verification_level: true, vanity_url_code: true } },
        channel: { select: { id: true, name: true, type: true } },
        inviter: { select: { id: true, username: true, discriminator: true, avatar: true, global_name: true } },
      },
    });
    res.json(invites);
  } catch (err) {
    next(err);
  }
}

export async function getChannelInvites(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x10)); // MANAGE_CHANNELS

    const invites = await prisma.invite.findMany({
      where: { channel_id: req.params.channelId, guild_id: req.params.guildId },
      include: {
        guild: { select: { id: true, name: true, icon: true } },
        channel: { select: { id: true, name: true, type: true } },
        inviter: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    res.json(invites);
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
    await writeAuditLog(invite.guild_id, req.user!.userId, AUDIT_LOG_ACTIONS.INVITE_DELETE, invite.code, 'INVITE', {
      channel_id: invite.channel_id,
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getVanityURL(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      select: { vanity_url_code: true, premium_tier: true },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Guild not found');

    if (!guild.vanity_url_code) {
      res.json({ code: null, uses: 0 });
      return;
    }

    const invite = await prisma.invite.findFirst({
      where: { guild_id: req.params.guildId, source: 'vanity' },
      select: { uses: true },
    });

    res.json({ code: guild.vanity_url_code, uses: invite?.uses || 0 });
  } catch (err) {
    next(err);
  }
}

export async function updateVanityURL(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, BigInt(0x20));

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      select: { premium_tier: true, vanity_url_code: true },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Guild not found');

    // Tier 3 requis (14 boosts minimum)
    if (guild.premium_tier < 3) {
      throw new AppError(403, 'TIER_3_REQUIRED', 'Vanity URL requires Tier 3 (14 boosts)');
    }

    const { code } = req.body;
    if (!code || code.length < 3 || code.length > 32 || !/^[a-zA-Z0-9-]+$/.test(code)) {
      throw new AppError(400, 'INVALID_VANITY_CODE', 'Code must be 3-32 alphanumeric characters or hyphens');
    }

    // Vérifier unicité
    const existing = await prisma.guild.findFirst({
      where: { vanity_url_code: code, NOT: { id: req.params.guildId } },
    });
    if (existing) throw new AppError(409, 'VANITY_CODE_EXISTS', 'This vanity code is already in use');

    // Mettre à jour ou créer l'invitation vanity
    await prisma.guild.update({
      where: { id: req.params.guildId },
      data: { vanity_url_code: code },
    });

    const existingInvite = await prisma.invite.findFirst({
      where: { guild_id: req.params.guildId, source: 'vanity' },
    });

    if (existingInvite) {
      await prisma.invite.update({
        where: { code: existingInvite.code },
        data: { code },
      });
    } else {
      const channel = await prisma.channel.findFirst({
        where: { guild_id: req.params.guildId, type: 0 },
      });
      if (!channel) throw new AppError(400, 'NO_TEXT_CHANNEL', 'Guild has no text channels');

      await prisma.invite.create({
        data: {
          code,
          guild_id: req.params.guildId,
          channel_id: channel.id,
          inviter_id: req.user!.userId,
          max_age: 0,
          max_uses: 0,
          source: 'vanity',
        },
      });
    }

    res.json({ code });
  } catch (err) {
    next(err);
  }
}
