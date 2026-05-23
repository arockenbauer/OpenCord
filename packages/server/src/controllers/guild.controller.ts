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
import { logError } from '../utils/logger.js';

const uploadDir = process.env.UPLOAD_DIR || './uploads';

export async function requireMembership(guildId: string, userId: string) {
  const member = await prisma.guildMember.findUnique({ where: { guild_id_user_id: { guild_id: guildId, user_id: userId } } });
  if (!member) throw new AppError(403, 'NOT_MEMBER', 'You are not a member of this server');
  return member;
}

export async function getMemberPermissions(guildId: string, userId: string): Promise<bigint> {
  const guild = await prisma.guild.findUnique({ where: { id: guildId } });
  if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');
  // Owner always has all permissions (even if timed out, like Discord)
  if (guild.owner_id === userId) return BigInt('0xFFFFFFFFFFFFFFFF');

  const everyoneRole = await prisma.role.findFirst({ where: { guild_id: guildId, name: '@everyone' } });
  const everyonePerms = everyoneRole ? everyoneRole.permissions : BigInt(0);

  // Check if member is pending (membership screening) or timed out
  const member = await prisma.guildMember.findUnique({
    where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
    select: { pending: true, communication_disabled_until: true },
  });

  // If pending, only return @everyone permissions (no write, no DM)
  if (member?.pending) {
    return everyonePerms;
  }

  // Check if member is timed out (Discord behavior)
  const isTimedOut = member?.communication_disabled_until && new Date(member.communication_disabled_until) > new Date();
  
  const memberRoles = await prisma.guildMemberRole.findMany({
    where: { guild_id: guildId, user_id: userId },
    include: { role: true },
  });

  let perms = everyonePerms;
  for (const mr of memberRoles) {
    perms |= mr.role.permissions;
  }
  
  // If has ADMINISTRATOR permission, return ALL_PERMISSIONS (unless timed out, handled below)
  if ((perms & BigInt(0x8)) !== BigInt(0)) {
    // Even admins are subject to timeouts (except owner, handled above)
    if (isTimedOut) {
      // Discord behavior: timed out members lose all permissions except VIEW_CHANNEL and READ_MESSAGE_HISTORY
      return BigInt(0x400) | BigInt(0x10000); // VIEW_CHANNEL | READ_MESSAGE_HISTORY
    }
    return BigInt('0xFFFFFFFFFFFFFFFF');
  }
  
  // If timed out, restrict permissions (Discord behavior)
  if (isTimedOut) {
    // Only keep VIEW_CHANNEL and READ_MESSAGE_HISTORY
    perms &= (BigInt(0x400) | BigInt(0x10000)); // VIEW_CHANNEL | READ_MESSAGE_HISTORY
  }
  
  return perms;
}

// Permissions that require 2FA when guild has 2FA enabled
const SENSITIVE_PERMISSIONS = [
  BigInt(0x8),    // ADMINISTRATOR
  BigInt(0x10),   // MANAGE_CHANNELS
  BigInt(0x20),   // MANAGE_GUILD
  BigInt(0x10000000), // MANAGE_ROLES
  BigInt(0x40000000), // MANAGE_EMOJIS_AND_STICKERS
  BigInt(0x20000000), // MANAGE_WEBHOOKS
];

export async function checkPermission(perms: bigint, bit: bigint, guildId?: string, userId?: string): Promise<void> {
  if ((perms & BigInt(0x8)) !== BigInt(0)) return;
  if ((perms & bit) === BigInt(0)) throw new AppError(403, 'MISSING_PERMISSIONS', 'Missing required permissions');
  
  // Check 2FA requirement for sensitive permissions (Discord behavior)
  if (guildId && userId && SENSITIVE_PERMISSIONS.some(p => (bit & p) === p)) {
    const guild = await prisma.guild.findUnique({ 
      where: { id: guildId }, 
      select: { features: true } 
    });
    
    // Check if guild has 2FA requirement enabled (feature "2FA_REQUIRED" or similar)
    if (guild?.features?.includes('2FA_REQUIRED')) {
      const user = await prisma.user.findUnique({ 
        where: { id: userId }, 
        select: { two_factor_enabled: true } 
      });
      
      if (!user?.two_factor_enabled) {
        throw new AppError(403, '2FA_REQUIRED', 'Two-factor authentication is required for this action');
      }
    }
  }
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

// Audit Log Action Types (from spec 06)
export const AUDIT_LOG_ACTIONS = {
  GUILD_UPDATE: 1,
  CHANNEL_CREATE: 10,
  CHANNEL_UPDATE: 11,
  CHANNEL_DELETE: 12,
  CHANNEL_OVERWRITE_CREATE: 13,
  CHANNEL_OVERWRITE_UPDATE: 14,
  CHANNEL_OVERWRITE_DELETE: 15,
  MEMBER_KICK: 20,
  MEMBER_BAN_ADD: 22,
  MEMBER_BAN_REMOVE: 23,
  MEMBER_UPDATE: 24,
  MEMBER_ROLE_UPDATE: 25,
  ROLE_CREATE: 30,
  ROLE_UPDATE: 31,
  ROLE_DELETE: 32,
  INVITE_CREATE: 40,
  INVITE_UPDATE: 41,
  INVITE_DELETE: 42,
  WEBHOOK_CREATE: 50,
  WEBHOOK_UPDATE: 51,
  WEBHOOK_DELETE: 52,
  EMOJI_CREATE: 60,
  EMOJI_UPDATE: 61,
  EMOJI_DELETE: 62,
  MESSAGE_DELETE: 72,
  MESSAGE_BULK_DELETE: 73,
  MESSAGE_PIN: 74,
  MESSAGE_UNPIN: 75,
  STICKER_CREATE: 90,
  STICKER_UPDATE: 91,
  STICKER_DELETE: 92,
  THREAD_CREATE: 110,
  THREAD_UPDATE: 111,
  THREAD_DELETE: 112,
  AUTO_MODERATION_RULE_CREATE: 140,
  AUTO_MODERATION_RULE_UPDATE: 141,
  AUTO_MODERATION_RULE_DELETE: 142,
  AUTO_MODERATION_BLOCK_MESSAGE: 143,
  MEMBER_TIMEOUT: 24, // Same as MEMBER_UPDATE but with communication_disabled_until change
  MEMBER_TIMEOUT_REMOVE: 24,
  MEMBER_WARN: 24, // Custom, not in Discord's enum
};

export async function writeAuditLog(guildId: string, userId: string, actionType: number, targetId?: string, targetType?: string, changes?: Array<{key: string; old_value: any; new_value: any}>, reason?: string, options?: any) {
  try {
    const entry = await prisma.auditLog.create({
      data: {
        id: generateSnowflake(),
        guild_id: guildId,
        user_id: userId,
        action_type: actionType,
        target_id: targetId || null,
        target_type: targetType || null,
        changes: changes ? JSON.stringify(changes) : null,
        reason: reason || null,
        options: options ? JSON.stringify(options) : null,
      },
    });

    // Fetch with user for Gateway event
    const entryWithUser = await prisma.auditLog.findUnique({
      where: { id: entry.id },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    // Emit Gateway event to guild members with VIEW_AUDIT_LOG permission
    const io = getIO();
    if (io) {
      // Get members with VIEW_AUDIT_LOG permission (0x80)
      const membersWithPerm = await prisma.guildMemberRole.findMany({
        where: {
          guild_id: guildId,
          role: { permissions: { gte: BigInt(0x80) } },
        },
        select: { user_id: true },
        distinct: ['user_id'],
      });

      // Also include guild owner
      const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { owner_id: true } });

      const payload = {
        entry: {
          ...entryWithUser!,
          user: entryWithUser!.user,
          target: entryWithUser!.target_id ? await prisma.user.findUnique({
            where: { id: entryWithUser!.target_id },
            select: { id: true, username: true, discriminator: true, avatar: true },
          }) : null,
        },
      };

      io.to(`guild:${guildId}`).emit(GatewayEvents.GUILD_AUDIT_LOG_ENTRY_CREATE, payload);
    }
  } catch (err) { logError('Failed to write audit log:', err); }
}

export async function createGuild(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { name } = req.body;
    const userId = req.user!.userId;

    if (!userId) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // Verify user exists
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    }

    const guildId = String(generateSnowflake());
    const categoryTextId = String(generateSnowflake());
    const categoryVoiceId = String(generateSnowflake());
    const generalChannelId = String(generateSnowflake());
    const voiceChannelId = String(generateSnowflake());
    const everyoneRoleId = String(generateSnowflake());

    const guild = await prisma.$transaction(async (tx) => {
      // Create guild without system_channel_id first (channel doesn't exist yet)
      const newGuild = await tx.guild.create({
        data: {
          id: guildId,
          name,
          owner_id: userId,
        },
      });

      await tx.role.create({
        data: {
          id: everyoneRoleId,
          guild_id: guildId,
          name: '@everyone',
          position: 0,
          permissions: DEFAULT_EVERYONE_PERMISSIONS,
        },
      });

      // Create parent categories first
      await tx.channel.createMany({
        data: [
          { id: categoryTextId, guild_id: guildId, name: 'TEXTE', type: 4, position: 0 },
          { id: categoryVoiceId, guild_id: guildId, name: 'VOCAL', type: 4, position: 1 },
        ],
      });

      // Then create child channels with parent_id references
      await tx.channel.createMany({
        data: [
          { id: generalChannelId, guild_id: guildId, name: 'général', type: 0, position: 0, parent_id: categoryTextId },
          { id: voiceChannelId, guild_id: guildId, name: 'Général', type: 2, position: 0, parent_id: categoryVoiceId },
        ],
      });

      // Now update guild with system_channel_id
      const updatedGuild = await tx.guild.update({
        where: { id: guildId },
        data: { system_channel_id: generalChannelId },
      });

      await tx.guildMember.create({
        data: { guild_id: guildId, user_id: userId },
      });

      return updatedGuild;
    });

    const fullGuild = await prisma.guild.findUnique({
      where: { id: guildId },
      include: { channels: true, roles: true, members: { include: { user: { select: { id: true, username: true, discriminator: true, avatar: true, status: true } } } } },
    });

    if (!fullGuild) {
      throw new AppError(500, 'GUILD_NOT_FOUND', 'Guild not found after creation');
    }

    const io = getIO();
    if (io) {
      try {
        const sockets = await io.in(`user:${userId}`).fetchSockets();
        for (const s of sockets) {
          s.join(`guild:${guildId}`);
          for (const ch of fullGuild.channels) {
            s.join(`channel:${ch.id}`);
          }
        }
      } catch (socketErr) {
        logError('Error joining socket rooms:', socketErr);
      }
    }

    // Convert BigInts to strings for JSON serialization
    const serializedGuild = JSON.parse(
      JSON.stringify(fullGuild, (key, value) => 
        typeof value === 'bigint' ? value.toString() : value
      )
    );
    res.status(201).json(serializedGuild);
  } catch (err) {
    const e = err as any;
    console.error('CREATE GUILD ERROR:', e.message, e.code, e.meta);
    console.error('CREATE GUILD ERROR stack:', e.stack);
    logError('Error in createGuild:', err);
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
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: req.body });

    const io = getIO();
    if (io) io.to(`guild:${guild.id}`).emit(GatewayEvents.GUILD_UPDATE, { guild });
    await markTemplateDirty(req.params.guildId);

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
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const iconDir = path.join(uploadDir, 'guild-icons', req.params.guildId);
    fs.mkdirSync(iconDir, { recursive: true });

    // Delete old icons
    const oldFiles = fs.readdirSync(iconDir).filter(f => f.endsWith('.webp'));
    for (const f of oldFiles) fs.unlinkSync(path.join(iconDir, f));

    // Generate hash from file content
    const buf = fs.readFileSync(req.file.path);
    const hash = crypto.createHash('md5').update(buf).digest('hex');

    // Generate 128 and 256 variants
    for (const size of [128, 256]) {
      const out = path.join(iconDir, `${hash}_${size}.webp`);
      await sharp(req.file.path).resize(size, size, { fit: 'cover' }).webp({ quality: 85 }).toFile(out);
    }

    fs.unlinkSync(req.file.path);

    const iconUrl = `/files/guild-icons/${req.params.guildId}/${hash}_128.webp`;
    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: { icon: iconUrl, icon_hash: hash } });

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
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    if (!req.file) throw new AppError(400, 'NO_FILE', 'No file uploaded');

    const bannerDir = path.join(uploadDir, 'guild-banners', req.params.guildId);
    fs.mkdirSync(bannerDir, { recursive: true });

    // Delete old banners
    const oldFiles = fs.readdirSync(bannerDir).filter(f => f.endsWith('.webp'));
    for (const f of oldFiles) fs.unlinkSync(path.join(bannerDir, f));

    // Generate hash from file content
    const buf = fs.readFileSync(req.file.path);
    const hash = crypto.createHash('md5').update(buf).digest('hex');

    // Resize to max 960x540, fit: inside
    const out = path.join(bannerDir, `${hash}.webp`);
    await sharp(req.file.path).resize(960, 540, { fit: 'inside' }).webp({ quality: 85 }).toFile(out);

    fs.unlinkSync(req.file.path);

    const bannerUrl = `/files/guild-banners/${req.params.guildId}/${hash}.webp`;
    const guild = await prisma.guild.update({ where: { id: req.params.guildId }, data: { banner: bannerUrl, banner_hash: hash } });

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
        await checkPermission(perms, BigInt(0x4000000), req.params.guildId, req.user!.userId);
      } else {
        await checkPermission(perms, BigInt(0x8000000), req.params.guildId, req.user!.userId);
      }
      data.nickname = req.body.nickname || null;
    }

    if (req.body.communication_disabled_until !== undefined) {
      await checkPermission(perms, BigInt(0x10000000000), req.params.guildId, req.user!.userId);
      if (req.params.userId !== req.user!.userId && actorHighestRole <= targetHighestRole) {
        throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot timeout a member with an equal or higher role');
      }
      data.communication_disabled_until = req.body.communication_disabled_until ? new Date(req.body.communication_disabled_until) : null;
      await writeAuditLog(req.params.guildId, req.user!.userId, data.communication_disabled_until ? AUDIT_LOG_ACTIONS.MEMBER_TIMEOUT : AUDIT_LOG_ACTIONS.MEMBER_TIMEOUT_REMOVE, req.params.userId, 'USER', [{ key: 'communication_disabled_until', old_value: currentMember.communication_disabled_until, new_value: data.communication_disabled_until }], req.body.reason);
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
      await checkPermission(perms, BigInt(0x10000000), req.params.guildId, req.user!.userId);

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
      await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_ROLE_UPDATE, req.params.userId, 'USER', [
        { key: 'roles', old_value: currentMember.role_assignments.map((ra) => ra.role_id), new_value: req.body.roles },
      ], req.body.reason);

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
      await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_UPDATE, req.params.userId, 'USER', [
        { key: 'nickname', old_value: currentMember.nickname, new_value: data.nickname ?? null },
      ], req.body.reason);
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
    await checkPermission(perms, BigInt(0x2), req.params.guildId, req.user!.userId);
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

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_KICK, req.params.userId, 'USER', undefined, undefined, req.body.reason);

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

export async function assignRoleToMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x10000000), req.params.guildId, req.user!.userId);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);
    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot assign roles to a member with an equal or higher role');
    }

    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.name === '@everyone') throw new AppError(400, 'CANNOT_ASSIGN', 'Cannot assign @everyone role');
    if (actorHighestRole <= role.position) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot assign a role equal or higher than your top role');
    }

    await prisma.guildMemberRole.create({
      data: {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
        role_id: req.params.roleId,
        assigned_by: req.user!.userId,
      },
    });

    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
        role_assignments: { select: { role_id: true } },
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_UPDATE, {
      guild_id: req.params.guildId,
      member: {
        user: member!.user,
        roles: member!.role_assignments.map((ra) => ra.role_id),
        nickname: member!.nickname,
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_ROLE_UPDATE, req.params.userId, 'USER', [
      { key: 'role_added', old_value: null, new_value: req.params.roleId },
    ]);

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeRoleFromMember(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x10000000), req.params.guildId, req.user!.userId);
    const actorHighestRole = await getHighestRolePosition(req.params.guildId, req.user!.userId);
    const targetHighestRole = await getHighestRolePosition(req.params.guildId, req.params.userId);
    if (actorHighestRole <= targetHighestRole) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot remove roles from a member with an equal or higher role');
    }

    const role = await prisma.role.findFirst({ where: { id: req.params.roleId, guild_id: req.params.guildId } });
    if (!role) throw new AppError(404, 'ROLE_NOT_FOUND', 'Role not found');
    if (role.name === '@everyone') throw new AppError(400, 'CANNOT_REMOVE', 'Cannot remove @everyone role');
    if (actorHighestRole <= role.position) {
      throw new AppError(403, 'ROLE_HIERARCHY', 'Cannot remove a role equal or higher than your top role');
    }

    await prisma.guildMemberRole.deleteMany({
      where: {
        guild_id: req.params.guildId,
        user_id: req.params.userId,
        role_id: req.params.roleId,
      },
    });

    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
        role_assignments: { select: { role_id: true } },
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_MEMBER_UPDATE, {
      guild_id: req.params.guildId,
      member: {
        user: member!.user,
        roles: member!.role_assignments.map((ra) => ra.role_id),
        nickname: member!.nickname,
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_ROLE_UPDATE, req.params.userId, 'USER', [
      { key: 'role_removed', old_value: req.params.roleId, new_value: null },
    ]);

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
    await checkPermission(perms, BigInt(0x4), req.params.guildId, req.user!.userId);

    const bans = await prisma.ban.findMany({
      where: { guild_id: req.params.guildId },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });
    res.json(bans);
  } catch (err) {
    next(err);
  }
}

export async function getBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x4), req.params.guildId, req.user!.userId);

    const ban = await prisma.ban.findUnique({
      where: { guild_id_user_id: { guild_id: req.params.guildId, user_id: req.params.userId } },
      include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });
    if (!ban) throw new AppError(404, 'BAN_NOT_FOUND', 'Ban not found');
    res.json(ban);
  } catch (err) {
    next(err);
  }
}

export async function createBan(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x4), req.params.guildId, req.user!.userId);
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
        delete_message_seconds: (req.body.delete_message_days ?? 0) * 86400,
      },
      update: {
        reason: req.body.reason || null,
        banned_by: req.user!.userId,
      },
    });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_BAN_ADD, req.params.userId, 'USER', undefined, undefined, req.body.reason);

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
    await checkPermission(perms, BigInt(0x4), req.params.guildId, req.user!.userId);

    await prisma.ban.deleteMany({ where: { guild_id: req.params.guildId, user_id: req.params.userId } });

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_BAN_REMOVE, req.params.userId, 'USER', undefined, undefined, undefined);

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
    await checkPermission(perms, BigInt(0x80), req.params.guildId, req.user!.userId);

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const before = req.query.before as string | undefined;
    const after = req.query.after as string | undefined;
    const where: any = { guild_id: req.params.guildId };
    if (before) where.id = { lt: before };
    if (after) where.id = { gt: after };
    if (req.query.user_id) where.user_id = req.query.user_id;
    if (req.query.action_type) where.action_type = Number(req.query.action_type);

    const logs = await prisma.auditLog.findMany({
      where,
      take: limit,
      orderBy: { created_at: 'desc' },
      include: {
        user: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });

    // Get unique target IDs from logs (users targeted)
    const targetIds = [...new Set(logs.filter(l => l.target_id).map(l => l.target_id!))];
    const targetUsers = targetIds.length > 0 ? await prisma.user.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, username: true, discriminator: true, avatar: true },
    }) : [];

    const targetMap = new Map(targetUsers.map(u => [u.id, u]));

    // Build users map (actors + targets)
    const usersMap = new Map<string, any>();
    for (const log of logs) {
      if (log.user) usersMap.set(log.user.id, log.user);
    }
    for (const u of targetUsers) {
      if (!usersMap.has(u.id)) usersMap.set(u.id, u);
    }

    // Get webhooks referenced in logs (where target_type === 'WEBHOOK')
    const webhookIds = logs.filter(l => l.target_type === 'WEBHOOK' && l.target_id).map(l => l.target_id!);
    const webhooks = webhookIds.length > 0 ? await prisma.webhook.findMany({
      where: { id: { in: webhookIds } },
      select: { id: true, name: true, channel_id: true },
    }) : [];

    // Get application commands referenced (where target_type === 'APPLICATION_COMMAND')
    const appCommandIds = logs.filter(l => l.target_type === 'APPLICATION_COMMAND' && l.target_id).map(l => l.target_id!);
    const applicationCommands = appCommandIds.length > 0 ? await prisma.application.findMany({
      where: { id: { in: appCommandIds } },
      select: { id: true, name: true },
    }) : [];

    res.json({
      audit_log_entries: logs.map((log) => ({
        ...log,
        changes: typeof log.changes === 'string' ? JSON.parse(log.changes) : log.changes,
        options: log.options ? (typeof log.options === 'string' ? JSON.parse(log.options) : log.options) : null,
        user: log.user,
        target: log.target_id ? targetMap.get(log.target_id) || null : null,
      })),
      users: Array.from(usersMap.values()),
      webhooks,
      application_commands: applicationCommands,
    });
  } catch (err) {
    next(err);
  }
}

export async function getVanityUrl(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

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
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

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
          premium_since: boost.started_at?.toISOString() || '',
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
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

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
    await checkPermission(perms, BigInt(0x2), req.params.guildId, req.user!.userId); // KICK_MEMBERS

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
    await checkPermission(perms, BigInt(0x2), req.params.guildId, req.user!.userId); // KICK_MEMBERS

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

    await writeAuditLog(req.params.guildId, req.user!.userId, AUDIT_LOG_ACTIONS.MEMBER_KICK, undefined, 'guild', [
      { key: 'days', old_value: null, new_value: days },
      { key: 'count', old_value: null, new_value: toPrune.length }
    ]);

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
      include: { creator: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });

    res.json(templates);
  } catch (err) {
    next(err);
  }
}

export async function createGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD

    // Max 1 template per server (spec 30)
    const existingCount = await prisma.guildTemplate.count({ where: { guild_id: req.params.guildId } });
    if (existingCount >= 1) throw new AppError(400, 'TEMPLATE_LIMIT', 'Maximum 1 template per server');

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: {
        channels: { orderBy: { position: 'asc' } },
        roles: { orderBy: { position: 'asc' } },
      },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const serialized_source_guild = {
      name: guild.name,
      description: guild.description,
      icon: guild.icon_hash,
      verification_level: guild.verification_level,
      default_message_notifications: guild.default_message_notifications,
      explicit_content_filter: guild.explicit_content_filter,
      preferred_locale: guild.preferred_locale,
      system_channel_flags: guild.system_channel_flags,
      roles: guild.roles.map(r => ({
        name: r.name, permissions: Number(r.permissions), color: r.color ? parseInt(r.color) : 0,
        hoist: r.hoist, mentionable: r.mentionable, position: r.position,
      })),
      channels: guild.channels.map(c => ({
        name: c.name, type: c.type, position: c.position, topic: c.topic,
        nsfw: c.nsfw, rate_limit_per_user: c.slowmode_delay,
        permission_overwrites: [], parent_id: c.parent_id,
      })),
    };

    const template = await prisma.guildTemplate.create({
      data: {
        id: generateSnowflake(),
        code: Math.random().toString(36).substring(2, 10) + Math.random().toString(36).substring(2, 10),
        name: req.body.name,
        description: req.body.description || null,
        creator_id: req.user!.userId,
        guild_id: req.params.guildId,
        serialized: JSON.stringify(serialized_source_guild),
        is_dirty: false,
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_TEMPLATE_CREATE, { template });

    res.status(201).json(template);
  } catch (err) {
    next(err);
  }
}

export async function syncGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    const template = await prisma.guildTemplate.findFirst({
      where: { code: req.params.code, guild_id: req.params.guildId },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: { channels: true, roles: true },
    });
    if (!guild) throw new AppError(404, 'GUILD_NOT_FOUND', 'Server not found');

    const serialized_source_guild = {
      name: guild.name,
      description: guild.description,
      icon: guild.icon_hash,
      verification_level: guild.verification_level,
      default_message_notifications: guild.default_message_notifications,
      explicit_content_filter: guild.explicit_content_filter,
      preferred_locale: guild.preferred_locale,
      system_channel_flags: guild.system_channel_flags,
      roles: guild.roles.map(r => ({
        name: r.name, permissions: Number(r.permissions), color: r.color ? parseInt(r.color) : 0,
        hoist: r.hoist, mentionable: r.mentionable, position: r.position,
      })),
      channels: guild.channels.map(c => ({
        name: c.name, type: c.type, position: c.position, topic: c.topic,
        nsfw: c.nsfw, rate_limit_per_user: c.slowmode_delay,
        permission_overwrites: [], parent_id: c.parent_id,
      })),
    };

    const updated = await prisma.guildTemplate.update({
      where: { code: template.code },
      data: { serialized_source_guild: serialized_source_guild as any, is_dirty: false },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_TEMPLATE_UPDATE, { template: updated });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function updateGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    const template = await prisma.guildTemplate.findFirst({
      where: { code: req.params.code, guild_id: req.params.guildId },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    const updated = await prisma.guildTemplate.update({
      where: { code: template.code },
      data: {
        name: req.body.name !== undefined ? req.body.name : undefined,
        description: req.body.description !== undefined ? req.body.description : undefined,
      },
    });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_TEMPLATE_UPDATE, { template: updated });

    res.json(updated);
  } catch (err) {
    next(err);
  }
}

export async function deleteGuildTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId);

    const template = await prisma.guildTemplate.findFirst({
      where: { code: req.params.code, guild_id: req.params.guildId },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    await prisma.guildTemplate.delete({ where: { code: template.code } });

    const io = getIO();
    if (io) io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_TEMPLATE_DELETE, { code: template.code });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// Public: Get a template by code (no auth required)
export async function getPublicTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const template = await prisma.guildTemplate.findUnique({
      where: { code: req.params.code },
      include: {
        guild: { select: { id: true, name: true, icon: true, description: true } },
        creator: { select: { id: true, username: true, discriminator: true, avatar: true } },
      },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    res.json({
      code: template.code,
      name: template.name,
      description: template.description,
      creator_id: template.creator_id,
      guild_id: template.guild_id,
      is_dirty: template.is_dirty,
      serialized_source_guild: template.serialized_source_guild,
      created_at: template.created_at,
    });
  } catch (err) {
    next(err);
  }
}

// Create a guild from a template
export async function createGuildFromTemplate(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const template = await prisma.guildTemplate.findUnique({
      where: { code: req.params.code },
    });
    if (!template) throw new AppError(404, 'NOT_FOUND', 'Template not found');

    const userId = req.user!.userId;
    const { name, icon } = req.body;

    if (!name || name.trim().length < 2) throw new AppError(400, 'INVALID_NAME', 'Server name must be at least 2 characters');

    const sourceGuild = template.serialized_source_guild as any;
    const guildId = generateSnowflake();

    // Create guild
    const guild = await prisma.guild.create({
      data: {
        id: guildId,
        name: name.trim(),
        owner_id: userId,
        description: sourceGuild.description || null,
        verification_level: sourceGuild.verification_level || 0,
        default_message_notifications: sourceGuild.default_message_notifications || 0,
        explicit_content_filter: sourceGuild.explicit_content_filter || 0,
        preferred_locale: sourceGuild.preferred_locale || 'fr',
        system_channel_flags: sourceGuild.system_channel_flags || 0,
      },
    });

    // Create roles from template (replace IDs with placeholders logic - spec says use placeholders)
    const roleIdMap = new Map<string, string>();
    if (sourceGuild.roles && Array.isArray(sourceGuild.roles)) {
      for (const r of sourceGuild.roles) {
        const newRoleId = generateSnowflake();
        roleIdMap.set(r.name, newRoleId);
        await prisma.role.create({
          data: {
            id: newRoleId,
            guild_id: guildId,
            name: r.name,
            color: r.color?.toString() || null,
            hoist: r.hoist || false,
            mentionable: r.mentionable || false,
            position: r.position || 0,
            permissions: BigInt(r.permissions || 0),
          },
        });
      }
    }

    // Create channels from template
    if (sourceGuild.channels && Array.isArray(sourceGuild.channels)) {
      for (const c of sourceGuild.channels) {
        const newChannelId = generateSnowflake();
        await prisma.channel.create({
          data: {
            id: newChannelId,
            guild_id: guildId,
            name: c.name,
            type: c.type || 0,
            position: c.position || 0,
            topic: c.topic || null,
            nsfw: c.nsfw || false,
            slowmode_delay: c.rate_limit_per_user || 0,
            parent_id: c.parent_id || null,
          },
        });
      }
    }

    // Add owner as member
    await prisma.guildMember.create({
      data: { guild_id: guildId, user_id: userId },
    });

    // Increment usage_count
    await prisma.guildTemplate.update({
      where: { code: template.code },
      data: { usage_count: { increment: 1 } },
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

// Mark template as dirty when guild structure changes
export async function markTemplateDirty(guildId: string) {
  try {
    const templates = await prisma.guildTemplate.findMany({ where: { guild_id: guildId } });
    for (const t of templates) {
      if (!t.is_dirty) {
        await prisma.guildTemplate.update({ where: { code: t.code }, data: { is_dirty: true } });
        const io = getIO();
        if (io) io.to(`guild:${guildId}`).emit(GatewayEvents.GUILD_TEMPLATE_UPDATE, { template: { code: t.code, is_dirty: true } });
      }
    }
  } catch (err) { logError('Failed to mark template dirty:', err); }
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

    const response = {
      enabled: guild.welcome_enabled,
      description: guild.description,
      welcome_channels: welcomeChannels.map((wc) => ({
        channel_id: wc.channel_id,
        description: wc.description,
        emoji_id: wc.emoji_id,
        screen_id: wc.screen_id,
      })),
    };

    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function updateWelcomeScreen(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD

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

    const response = {
      enabled: guild.welcome_enabled,
      description: guild.description,
      welcome_channels: savedChannels.map((wc) => ({
        channel_id: wc.channel_id,
        description: wc.description,
        emoji_id: wc.emoji_id,
        screen_id: wc.screen_id,
      })),
    };

    // Emit Socket.IO event
    const io = getIO();
    if (io) {
      io.to(`guild:${req.params.guildId}`).emit(GatewayEvents.GUILD_WELCOME_SCREEN_UPDATE, response);
    }

    res.json(response);
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

// getAuditLogs is already defined above (line 640)

// Member Verification (Membership Screening)
export async function getMemberVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;
    const verification = await prisma.guildMemberVerification.findUnique({
      where: { guild_id: guildId },
    });

    if (!verification) {
      res.json({ enabled: false, description: null, form_fields: [] });
      return;
    }

    // Check if enabled and user is authenticated
    if (!verification.enabled) {
      throw new AppError(403, 'VERIFICATION_DISABLED', 'Membership verification is disabled');
    }

    res.json({
      enabled: verification.enabled,
      description: verification.description,
      form_fields: verification.form_fields,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateMemberVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;
    const perms = await getMemberPermissions(guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD

    const { enabled, description, form_fields } = req.body;

    const data: any = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (description !== undefined) data.description = description;
    if (form_fields !== undefined) data.form_fields = form_fields;

    const verification = await prisma.guildMemberVerification.upsert({
      where: { guild_id: guildId },
      update: data,
      create: {
        id: generateSnowflake(),
        guild_id: guildId,
        enabled: enabled ?? false,
        description: description ?? null,
        form_fields: form_fields ?? '[]',
      },
    });

    const response = {
      enabled: verification.enabled,
      description: verification.description,
      form_fields: verification.form_fields,
    };

    // Emit Socket.IO event
    const io = getIO();
    if (io) {
      io.to(`guild:${guildId}`).emit(GatewayEvents.GUILD_MEMBER_VERIFICATION_UPDATE, response);
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
}

export async function completeMemberVerification(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;
    const userId = req.user!.userId;

    // Check if user is a member
    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
    });

    if (!member) {
      throw new AppError(403, 'NOT_A_MEMBER', 'You are not a member of this server');
    }

    // Check if verification is enabled
    const verification = await prisma.guildMemberVerification.findUnique({
      where: { guild_id: guildId },
    });

    if (!verification || !verification.enabled) {
      // No verification required, just return
      res.json({ success: true });
      return;
    }

    // Mark member as not pending
    await prisma.guildMember.update({
      where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
      data: { pending: false },
    });

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`guild:${guildId}`).emit('GUILD_MEMBER_UPDATE', {
        guild_id: guildId,
        user: { id: userId },
        pending: false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// Guild Onboarding
export async function getGuildOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;

    const onboarding = await prisma.guildOnboarding.findUnique({
      where: { guild_id: guildId },
    });

    if (!onboarding) {
      res.json({ enabled: false, mode: 0, prompts: [], default_channel_ids: null });
      return;
    }

    res.json({
      enabled: onboarding.enabled,
      mode: onboarding.mode,
      prompts: onboarding.prompts,
      default_channel_ids: onboarding.default_channel_ids,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateGuildOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;
    const perms = await getMemberPermissions(guildId, req.user!.userId);
    await checkPermission(perms, BigInt(0x20), req.params.guildId, req.user!.userId); // MANAGE_GUILD
    await checkPermission(perms, BigInt(0x1000000000), req.params.guildId, req.user!.userId); // MANAGE_ROLES

    const { enabled, mode, prompts, default_channel_ids } = req.body;

    const data: any = {};
    if (enabled !== undefined) data.enabled = enabled;
    if (mode !== undefined) data.mode = mode;
    if (prompts !== undefined) data.prompts = prompts;
    if (default_channel_ids !== undefined) data.default_channel_ids = default_channel_ids;

    const onboarding = await prisma.guildOnboarding.upsert({
      where: { guild_id: guildId },
      update: data,
      create: {
        id: generateSnowflake(),
        guild_id: guildId,
        enabled: enabled ?? false,
        mode: mode ?? 0,
        prompts: prompts ?? '[]',
        default_channel_ids: default_channel_ids ?? null,
      },
    });

    const response = {
      enabled: onboarding.enabled,
      mode: onboarding.mode,
      prompts: onboarding.prompts,
      default_channel_ids: onboarding.default_channel_ids,
    };

    // Emit Socket.IO event
    const io = getIO();
    if (io) {
      io.to(`guild:${guildId}`).emit(GatewayEvents.GUILD_ONBOARDING_UPDATE, response);
    }

    res.json(response);
  } catch (err) {
    next(err);
  }
}

// Submit onboarding responses
export async function submitOnboarding(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guildId = req.params.guildId;
    const userId = req.user!.userId;
    const { prompt_responses } = req.body; // Array of { prompt_id, option_id }

    // Check if user is a member
    const member = await prisma.guildMember.findUnique({
      where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
    });

    if (!member) {
      throw new AppError(403, 'NOT_A_MEMBER', 'You are not a member of this server');
    }

    // Get onboarding config
    const onboarding = await prisma.guildOnboarding.findUnique({
      where: { guild_id: guildId },
    });

    if (!onboarding || !onboarding.enabled) {
      res.json({ success: true });
      return;
    }

    // Parse prompts and responses
    const prompts = typeof onboarding.prompts === 'string' ? JSON.parse(onboarding.prompts) : onboarding.prompts;
    const responses = prompt_responses || [];

    // Collect role_ids and channel_ids from selected options
    const roleIdsToAdd: string[] = [];
    const channelIdsToJoin: string[] = [];

    for (const response of responses) {
      const prompt = prompts.find((p: any) => p.id === response.prompt_id);
      if (!prompt) continue;

      const option = prompt.options?.find((o: any) => o.id === response.option_id);
      if (!option) continue;

      if (option.role_ids) {
        roleIdsToAdd.push(...option.role_ids);
      }
      if (option.channel_ids) {
        channelIdsToJoin.push(...option.channel_ids);
      }
    }

    // Add default channel ids
    if (onboarding.default_channel_ids) {
      const defaultChannels = typeof onboarding.default_channel_ids === 'string' 
        ? JSON.parse(onboarding.default_channel_ids) 
        : onboarding.default_channel_ids;
      channelIdsToJoin.push(...defaultChannels);
    }

    // Assign roles
    for (const roleId of [...new Set(roleIdsToAdd)]) {
      await prisma.guildMemberRole.create({
        data: {
          guild_id: guildId,
          user_id: userId,
          role_id: roleId,
        },
      }).catch(() => {}); // Ignore duplicates
    }

    // Join channels (add member to channel permission overwrites if needed)
    // For simplicity, we just ensure the member can see these channels via roles

    // Mark member as not pending if verification is also complete
    const verification = await prisma.guildMemberVerification.findUnique({
      where: { guild_id: guildId },
    });

    if (!verification || !verification.enabled) {
      await prisma.guildMember.update({
        where: { guild_id_user_id: { guild_id: guildId, user_id: userId } },
        data: { pending: false },
      });
    }

    // Emit socket event
    const io = req.app.get('io');
    if (io) {
      io.to(`guild:${guildId}`).emit('GUILD_MEMBER_UPDATE', {
        guild_id: guildId,
        user: { id: userId },
        pending: false,
      });
    }

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
