import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getIO } from '../gateway/index.js';
import { createAdminAuditLog } from '../utils/audit-log.js';
import { syncPremiumBadge } from '../services/badge.service.js';
import { testSmtpConfig } from '../utils/email.js';
import os from 'os';

type PlatformSettingsResponse = {
  registration_enabled: boolean;
  invite_only: boolean;
  max_file_size_mb: number;
  default_locale: string;
  maintenance_mode: boolean;
  max_guilds_per_user: number;
  max_members_per_guild: number;
  message_retention_days: number | null;
};

const DEFAULT_PLATFORM_SETTINGS: PlatformSettingsResponse = {
  registration_enabled: true,
  invite_only: false,
  max_file_size_mb: Math.max(1, Math.round(Number(process.env.MAX_FILE_SIZE || 8 * 1024 * 1024) / (1024 * 1024))),
  default_locale: 'fr',
  maintenance_mode: false,
  max_guilds_per_user: 100,
  max_members_per_guild: 500000,
  message_retention_days: null,
};

function getDbPath(): string {
  return process.env.DATABASE_URL?.replace('file:', '') || './prisma/opencord.db';
}

function getDbSize(): number {
  try {
    const dbPath = path.resolve(getDbPath());
    return fs.statSync(dbPath).size;
  } catch {
    return 0;
  }
}

function parseStoredBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  return value === 'true';
}

function parseStoredNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseStoredNullableNumber(value: string | undefined, fallback: number | null): number | null {
  if (value === undefined) return fallback;
  if (value === '' || value === 'null') return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function serializeSettingValue(value: unknown): string {
  if (value === null) return 'null';
  return String(value);
}

function buildPlatformSettingsResponse(settings: Array<{ key: string; value: string }>): PlatformSettingsResponse {
  const raw = Object.fromEntries(settings.map((setting) => [setting.key, setting.value]));

  return {
    registration_enabled: parseStoredBoolean(raw.registration_enabled, DEFAULT_PLATFORM_SETTINGS.registration_enabled),
    invite_only: parseStoredBoolean(raw.invite_only, DEFAULT_PLATFORM_SETTINGS.invite_only),
    max_file_size_mb: parseStoredNumber(raw.max_file_size_mb, DEFAULT_PLATFORM_SETTINGS.max_file_size_mb),
    default_locale: raw.default_locale || DEFAULT_PLATFORM_SETTINGS.default_locale,
    maintenance_mode: parseStoredBoolean(raw.maintenance_mode, DEFAULT_PLATFORM_SETTINGS.maintenance_mode),
    max_guilds_per_user: parseStoredNumber(raw.max_guilds_per_user, DEFAULT_PLATFORM_SETTINGS.max_guilds_per_user),
    max_members_per_guild: parseStoredNumber(raw.max_members_per_guild, DEFAULT_PLATFORM_SETTINGS.max_members_per_guild),
    message_retention_days: parseStoredNullableNumber(raw.message_retention_days, DEFAULT_PLATFORM_SETTINGS.message_retention_days),
  };
}

// ── STATS ──────────────────────────────────────────────────────────────────

export async function getStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const [totalUsers, totalGuilds, messages24h] = await Promise.all([
      prisma.user.count({ where: { bot: false } }),
      prisma.guild.count(),
      prisma.message.count({ where: { created_at: { gte: since24h } } }),
    ]);

    const io = getIO();
    const activeSockets = io ? (await io.fetchSockets()).length : 0;

    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    let storageBytes = 0;
    try {
      const walk = (dir: string) => {
        for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
          const full = path.join(dir, f.name);
          if (f.isDirectory()) walk(full);
          else storageBytes += fs.statSync(full).size;
        }
      };
      if (fs.existsSync(uploadDir)) walk(uploadDir);
    } catch { /* ignore */ }

    const mem = process.memoryUsage();
    const uptimeSeconds = process.uptime();
    const dbSize = getDbSize();

    res.json({
      total_users: totalUsers,
      total_guilds: totalGuilds,
      messages_24h: messages24h,
      active_connections: activeSockets,
      storage_used_bytes: storageBytes,
      system: {
        uptime_seconds: Math.floor(uptimeSeconds),
        heap_used: mem.heapUsed,
        heap_total: mem.heapTotal,
        db_size_bytes: dbSize,
        version: process.env.npm_package_version || '1.0.0',
        node_version: process.version,
      },
    });
  } catch (err) {
    next(err);
  }
}

export async function getStatsCharts(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const days = 30;
    const now = new Date();

    const dailyNewUsers: Array<{ date: string; count: number }> = [];
    const dailyMessages: Array<{ date: string; count: number }> = [];
    const dailyActiveUsers: Array<{ date: string; count: number }> = [];

    for (let i = days - 1; i >= 0; i--) {
      const dayStart = new Date(now);
      dayStart.setDate(dayStart.getDate() - i);
      dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(dayStart);
      dayEnd.setHours(23, 59, 59, 999);
      const dateStr = dayStart.toISOString().slice(0, 10);

      const [newUsers, msgCount, activeCount] = await Promise.all([
        prisma.user.count({ where: { created_at: { gte: dayStart, lte: dayEnd } } }),
        prisma.message.count({ where: { created_at: { gte: dayStart, lte: dayEnd } } }),
        prisma.message.groupBy({ by: ['author_id'], where: { created_at: { gte: dayStart, lte: dayEnd } } }).then((r) => r.length),
      ]);

      dailyNewUsers.push({ date: dateStr, count: newUsers });
      dailyMessages.push({ date: dateStr, count: msgCount });
      dailyActiveUsers.push({ date: dateStr, count: activeCount });
    }

    res.json({ new_users: dailyNewUsers, messages: dailyMessages, active_users: dailyActiveUsers });
  } catch (err) {
    next(err);
  }
}

export async function getRecentAuditActivity(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const logs = await prisma.adminAuditLog.findMany({
      take: 10,
      orderBy: { created_at: 'desc' },
      include: { admin: { select: { id: true, username: true, discriminator: true, avatar: true } } },
    });
    res.json({ logs: logs.map((l) => ({ ...l, details: l.details || null })) });
  } catch (err) {
    next(err);
  }
}

// ── PLATFORM SETTINGS ─────────────────────────────────────────────────────

export async function getPlatformSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const settings = await prisma.platformSettings.findMany({
      select: { key: true, value: true },
    });
    res.json(buildPlatformSettingsResponse(settings));
  } catch (err) {
    next(err);
  }
}

export async function updatePlatformSettings(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    for (const [key, value] of Object.entries(req.body)) {
      await prisma.platformSettings.upsert({
        where: { key },
        create: { key, value: serializeSettingValue(value), updated_by: req.user!.userId },
        update: { value: serializeSettingValue(value), updated_by: req.user!.userId },
      });
    }

    const settings = await prisma.platformSettings.findMany({
      select: { key: true, value: true },
    });

    res.json(buildPlatformSettingsResponse(settings));
  } catch (err) {
    next(err);
  }
}

// ── USERS ─────────────────────────────────────────────────────────────────

export async function getUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const search = req.query.search as string | undefined;
    const adminLevel = req.query.admin_level !== undefined ? Number(req.query.admin_level) : undefined;
    const status = req.query.status as string | undefined;
    const sort = (req.query.sort as string) || 'created_at_desc';

    const where: any = {};
    if (search) {
      where.OR = [
        { username: { contains: search } },
        { email: { contains: search } },
        { id: search },
      ];
    }
    if (adminLevel !== undefined) where.admin_level = adminLevel;
    if (status === 'active') { where.disabled = false; where.banned = false; }
    else if (status === 'disabled') where.disabled = true;
    else if (status === 'banned') where.banned = true;

    const orderBy: any =
      sort === 'created_at_asc' ? { created_at: 'asc' }
      : sort === 'username_asc' ? { username: 'asc' }
      : { created_at: 'desc' };

    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        select: {
          id: true, username: true, discriminator: true, email: true, avatar: true,
          admin_level: true, disabled: true, banned: true, premium: true, premium_type: true,
          created_at: true, last_seen_at: true,
          _count: { select: { guild_members: true } },
          subscription: { select: { status: true, tier: { select: { name: true } } } },
        },
        orderBy,
      }),
      prisma.user.count({ where }),
    ]);

    res.json({
      users: users.map((u) => ({
        ...u,
        guild_count: u._count.guild_members,
        subscription: u.subscription ? {
          active: u.subscription.status === 'active',
          plan: u.subscription.tier.name.toLowerCase().replace(/ /g, '_'),
        } : null,
        _count: undefined,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function getUserAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.userId },
      include: {
        user_badges: { include: { badge: true }, orderBy: { badge: { priority: 'asc' } } },
        guild_members: { include: { guild: { select: { id: true, name: true, icon: true, _count: { select: { members: true } } } } }, take: 20 },
        subscription: { include: { tier: true } },
        refresh_tokens: { where: { is_revoked: false, expires_at: { gte: new Date() } } },
      },
    });
    if (!user) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const { password_hash, two_factor_secret, two_factor_backup_codes, email_verify_token, password_reset_token, password_reset_expires, bot_token, ...safe } = user;

    res.json({
      ...safe,
      mfa_enabled: user.two_factor_enabled,
      badges: user.user_badges.map((ub) => ub.badge),
      guilds: user.guild_members.map((m) => ({
        id: m.guild.id, name: m.guild.name, icon: m.guild.icon,
        member_count: m.guild._count.members,
      })),
      subscription: user.subscription ? {
        active: user.subscription.status === 'active',
        plan: user.subscription.tier.name.toLowerCase().replace(/ /g, '_'),
        started_at: user.subscription.created_at,
        expires_at: user.subscription.current_period_end,
      } : null,
      sessions_count: user.refresh_tokens.length,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateUserAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const adminUser = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!adminUser) throw new AppError(401, 'UNAUTHORIZED', 'Not found');
    const targetUser = await prisma.user.findUnique({ where: { id: req.params.userId } });
    if (!targetUser) throw new AppError(404, 'NOT_FOUND', 'User not found');

    const data: any = {};
    const actions: string[] = [];

    if (req.body.disabled !== undefined) {
      data.disabled = req.body.disabled;
      actions.push(req.body.disabled ? 'USER_DISABLE' : 'USER_ENABLE');
    }
    if (req.body.admin_level !== undefined) {
      if (adminUser.admin_level < 3) throw new AppError(403, 'FORBIDDEN', 'Only super admins can change admin level');
      data.admin_level = req.body.admin_level;
      actions.push('USER_LEVEL_CHANGE');
    }
    if (req.body.premium !== undefined) {
      data.premium = req.body.premium;
      data.premium_type = req.body.premium ? 1 : 0;
      await syncPremiumBadge(targetUser.id, req.body.premium);
    }

    const user = await prisma.user.update({ where: { id: req.params.userId }, data });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    for (const action of actions) {
      await createAdminAuditLog({
        adminId: req.user!.userId,
        action,
        targetType: 'user',
        targetId: req.params.userId,
        details: { admin_level: req.body.admin_level, disabled: req.body.disabled },
        ipAddress: ip,
      });
    }

    res.json({ id: user.id, disabled: user.disabled, banned: user.banned, admin_level: user.admin_level, premium: user.premium });
  } catch (err) {
    next(err);
  }
}

export async function banUserAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = req.body;
    const now = new Date();
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { banned: true, ban_reason: reason || null, banned_at: now, banned_by: req.user!.userId },
    });

    const io = getIO();
    if (io) io.to(`user:${req.params.userId}`).disconnectSockets(true);

    await prisma.refreshToken.updateMany({
      where: { user_id: req.params.userId, is_revoked: false },
      data: { is_revoked: true },
    });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'USER_BAN', targetType: 'user', targetId: req.params.userId, details: { reason }, ipAddress: ip });

    res.json({ user_id: req.params.userId, banned: true, ban_reason: reason, banned_at: now, banned_by: req.user!.userId });
  } catch (err) {
    next(err);
  }
}

export async function unbanUserAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { banned: false, ban_reason: null, banned_at: null, banned_by: null },
    });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'USER_UNBAN', targetType: 'user', targetId: req.params.userId, ipAddress: ip });

    res.json({ user_id: req.params.userId, banned: false });
  } catch (err) {
    next(err);
  }
}

export async function forceLogoutUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const revoked = await prisma.refreshToken.updateMany({
      where: { user_id: req.params.userId, is_revoked: false },
      data: { is_revoked: true },
    });

    const io = getIO();
    if (io) io.to(`user:${req.params.userId}`).disconnectSockets(true);

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'USER_FORCE_LOGOUT', targetType: 'user', targetId: req.params.userId, ipAddress: ip });

    res.json({ sessions_terminated: revoked.count });
  } catch (err) {
    next(err);
  }
}

export async function resetUserPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { password } = req.body;
    if (!password || password.length < 8) throw new AppError(400, 'INVALID_PASSWORD', 'Password must be at least 8 characters');

    const bcrypt = await import('bcrypt');
    const password_hash = await bcrypt.hash(password, 12);
    await prisma.user.update({
      where: { id: req.params.userId },
      data: { password_hash, password_reset_token: null, password_reset_expires: null },
    });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}

// ── BADGES ────────────────────────────────────────────────────────────────

export async function getBadges(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const badges = await prisma.badge.findMany({ orderBy: { priority: 'asc' } });
    const withCounts = await Promise.all(
      badges.map(async (b) => ({
        ...b,
        assigned_count: await prisma.userBadge.count({ where: { badge_id: b.id } }),
      }))
    );
    res.json(withCounts);
  } catch (err) {
    next(err);
  }
}

export async function createBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const badge = await prisma.badge.create({
      data: {
        id: generateSnowflake(),
        name: req.body.name,
        label: req.body.label || req.body.name,
        description: req.body.description || null,
        icon: req.body.icon,
        type: req.body.type || 'admin',
        auto_rule: req.body.auto_rule ? JSON.stringify(req.body.auto_rule) : null,
        color: req.body.color || null,
        priority: req.body.priority ?? 100,
      },
    });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'BADGE_CREATE', targetType: 'badge', targetId: badge.id, details: { name: badge.name }, ipAddress: ip });

    res.status(201).json(badge);
  } catch (err) {
    next(err);
  }
}

export async function updateBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const badge = await prisma.badge.update({
      where: { id: req.params.badgeId },
      data: {
        name: req.body.name,
        label: req.body.label,
        description: req.body.description,
        icon: req.body.icon,
        color: req.body.color,
        priority: req.body.priority,
      },
    });
    res.json(badge);
  } catch (err) {
    next(err);
  }
}

export async function deleteBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userBadge.deleteMany({ where: { badge_id: req.params.badgeId } });
    await prisma.badge.delete({ where: { id: req.params.badgeId } });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'BADGE_DELETE', targetType: 'badge', targetId: req.params.badgeId, ipAddress: ip });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function assignBadgeToUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { userId } = req.body;
    if (!userId) throw new AppError(400, 'MISSING_FIELD', 'userId required');

    const badge = await prisma.badge.findUnique({ where: { id: req.params.badgeId } });
    if (!badge) throw new AppError(404, 'NOT_FOUND', 'Badge not found');

    const now = new Date();
    await prisma.userBadge.upsert({
      where: { user_id_badge_id: { user_id: userId, badge_id: badge.id } },
      create: { id: generateSnowflake(), user_id: userId, badge_id: badge.id, assigned_by: req.user!.userId, assigned_at: now },
      update: {},
    });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'BADGE_ASSIGN', targetType: 'user', targetId: userId, details: { badge_id: badge.id }, ipAddress: ip });

    res.json({ badge_id: badge.id, user_id: userId, assigned_at: now, assigned_by: req.user!.userId });
  } catch (err) {
    next(err);
  }
}

export async function revokeBadgeFromUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userBadge.deleteMany({ where: { badge_id: req.params.badgeId, user_id: req.params.userId } });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'BADGE_REVOKE', targetType: 'user', targetId: req.params.userId, details: { badge_id: req.params.badgeId }, ipAddress: ip });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getBadgeUsers(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const [entries, total] = await Promise.all([
      prisma.userBadge.findMany({
        where: { badge_id: req.params.badgeId },
        skip: (page - 1) * limit,
        take: limit,
        include: { user: { select: { id: true, username: true, discriminator: true, avatar: true } } },
        orderBy: { assigned_at: 'desc' },
      }),
      prisma.userBadge.count({ where: { badge_id: req.params.badgeId } }),
    ]);
    res.json({ users: entries.map((e) => ({ ...e.user, assigned_at: e.assigned_at })), total });
  } catch (err) {
    next(err);
  }
}

export async function assignBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userBadge.create({
      data: { id: generateSnowflake(), user_id: req.params.userId, badge_id: req.body.badge_id },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function removeBadge(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.userBadge.deleteMany({
      where: { user_id: req.params.userId, badge_id: req.params.badgeId },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ── GUILDS ────────────────────────────────────────────────────────────────

export async function getGuildsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const search = req.query.search as string | undefined;
    const where: any = search ? { name: { contains: search } } : {};

    const [guilds, total] = await Promise.all([
      prisma.guild.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          owner: { select: { id: true, username: true, discriminator: true } },
          _count: { select: { members: true } },
        },
        orderBy: { created_at: 'desc' },
      }),
      prisma.guild.count({ where }),
    ]);

    res.json({
      guilds: guilds.map((g) => ({
        id: g.id,
        name: g.name,
        icon: g.icon,
        owner: g.owner,
        member_count: g._count.members,
        boost_tier: g.premium_tier,
        features: JSON.parse(g.features || '[]'),
        created_at: g.created_at,
      })),
      total,
      page,
      limit,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    next(err);
  }
}

export async function getGuildAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const guild = await prisma.guild.findUnique({
      where: { id: req.params.guildId },
      include: {
        owner: { select: { id: true, username: true, discriminator: true } },
        _count: { select: { members: true, channels: true, roles: true, bans: true, boosts: true } },
      },
    });
    if (!guild) throw new AppError(404, 'NOT_FOUND', 'Guild not found');

    res.json({
      id: guild.id,
      name: guild.name,
      icon: guild.icon,
      description: guild.description,
      owner: guild.owner,
      member_count: guild._count.members,
      channel_count: guild._count.channels,
      role_count: guild._count.roles,
      boost_tier: guild.premium_tier,
      boost_count: guild._count.boosts,
      ban_count: guild._count.bans,
      features: JSON.parse(guild.features || '[]'),
      created_at: guild.created_at,
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteGuildAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { reason } = req.body || {};
    await prisma.guild.delete({ where: { id: req.params.guildId } });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'GUILD_DELETE', targetType: 'guild', targetId: req.params.guildId, details: { reason }, ipAddress: ip });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function updateGuildFeatures(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { features } = req.body;
    const guild = await prisma.guild.update({
      where: { id: req.params.guildId },
      data: { features: JSON.stringify(features || []) },
    });

    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'GUILD_FEATURE_UPDATE', targetType: 'guild', targetId: guild.id, details: { features }, ipAddress: ip });

    res.json({ id: guild.id, features: JSON.parse(guild.features || '[]') });
  } catch (err) {
    next(err);
  }
}

// ── STORAGE STATS ──────────────────────────────────────────────────────
export async function getStorageStats(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const uploadDir = process.env.UPLOAD_DIR || './uploads';
    const storageLimit = Number(process.env.STORAGE_LIMIT_PER_GUILD) || 5368709120;

    // Calculate storage breakdown
    const attachmentsSize = await prisma.attachment.aggregate({
      where: { deleted_at: null },
      _sum: { size: true },
    });

    const getDirSize = (dirPath: string): number => {
      let total = 0;
      try {
        if (!fs.existsSync(dirPath)) return 0;
        const files = fs.readdirSync(dirPath, { withFileTypes: true });
        for (const file of files) {
          const fullPath = path.join(dirPath, file.name);
          if (file.isDirectory()) {
            total += getDirSize(fullPath);
          } else {
            total += fs.statSync(fullPath).size;
          }
        }
      } catch { /* ignore */ }
      return total;
    };

    const avatarsSize = getDirSize(path.join(uploadDir, 'avatars'));
    const bannersSize = getDirSize(path.join(uploadDir, 'banners'));
    const guildIconsSize = getDirSize(path.join(uploadDir, 'guild-icons'));
    const guildBannersSize = getDirSize(path.join(uploadDir, 'guild-banners'));
    const emojisSize = getDirSize(path.join(uploadDir, 'emojis'));
    const stickersSize = getDirSize(path.join(uploadDir, 'stickers'));
    const attachmentsDiskSize = getDirSize(path.join(uploadDir, 'attachments'));

    const totalUsed = avatarsSize + bannersSize + guildIconsSize + guildBannersSize + emojisSize + stickersSize + attachmentsDiskSize;

    // Top guilds by storage
    const guilds = await prisma.guild.findMany({
      select: { id: true, name: true },
    });

    const topGuilds = [];
    for (const guild of guilds) {
      const channels = await prisma.channel.findMany({
        where: { guild_id: guild.id },
        select: { id: true },
      });
      const channelIds = channels.map(c => c.id);

      const usage = await prisma.attachment.aggregate({
        where: {
          message: { channel_id: { in: channelIds } },
          deleted_at: null,
        },
        _sum: { size: true },
      });

      if (usage._sum.size) {
        topGuilds.push({
          guildId: guild.id,
          guildName: guild.name,
          usedBytes: usage._sum.size,
        });
      }
    }

    topGuilds.sort((a, b) => b.usedBytes - a.usedBytes);
    const topGuildsByStorage = topGuilds.slice(0, 10);

    res.json({
      totalUsedBytes: totalUsed,
      breakdown: {
        attachments: attachmentsDiskSize,
        avatars: avatarsSize,
        guildsMedia: guildIconsSize + guildBannersSize,
        emojis: emojisSize,
        stickers: stickersSize,
      },
      topGuildsByStorage,
      limitBytes: storageLimit,
      usagePercent: totalUsed / storageLimit,
    });
  } catch (err) {
    next(err);
  }
}

// ── REPORTS ───────────────────────────────────────────────────────────────

export async function getReportsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const status = req.query.status as string | undefined;
    const targetType = req.query.target_type as string | undefined;
    const where: any = {};
    if (status) where.status = status;
    if (targetType) where.target_type = targetType;

    const [reports, total] = await Promise.all([
      prisma.report.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        include: { reporter: { select: { id: true, username: true, discriminator: true, avatar: true } } },
        orderBy: { created_at: 'desc' },
      }),
      prisma.report.count({ where }),
    ]);

    res.json({
      reports: reports.map((r) => ({
        id: r.id,
        reporter: r.reporter,
        target_type: r.target_type,
        target_id: r.target_id,
        reason: r.reason,
        status: r.status,
        created_at: r.created_at,
      })),
      total,
      page,
    });
  } catch (err) {
    next(err);
  }
}

export async function updateReportAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { status, notes } = req.body;
    const report = await prisma.report.update({
      where: { id: req.params.reportId },
      data: {
        status,
        notes: notes !== undefined ? String(notes) : undefined,
        reviewer_id: req.user!.userId,
        resolved_at: status === 'resolved' || status === 'dismissed' ? new Date() : undefined,
      },
    });

    if (status === 'resolved' || status === 'dismissed') {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
      await createAdminAuditLog({ adminId: req.user!.userId, action: 'REPORT_RESOLVE', targetType: 'report', targetId: report.id, details: { status, notes }, ipAddress: ip });
    }

    res.json(report);
  } catch (err) {
    next(err);
  }
}

export async function resolveReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await prisma.report.update({
      where: { id: req.params.reportId },
      data: { status: 'resolved', reviewer_id: req.user!.userId, resolved_at: new Date() },
    });
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'REPORT_RESOLVE', targetType: 'report', targetId: report.id, details: { status: 'resolved' }, ipAddress: ip });
    res.json(report);
  } catch (err) {
    next(err);
  }
}

export async function dismissReport(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const report = await prisma.report.update({
      where: { id: req.params.reportId },
      data: { status: 'dismissed', reviewer_id: req.user!.userId, resolved_at: new Date() },
    });
    const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
    await createAdminAuditLog({ adminId: req.user!.userId, action: 'REPORT_RESOLVE', targetType: 'report', targetId: report.id, details: { status: 'dismissed' }, ipAddress: ip });
    res.json(report);
  } catch (err) {
    next(err);
  }
}

// ── PLUGINS ───────────────────────────────────────────────────────────────

export async function getPlugins(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plugins = await prisma.plugin.findMany();
    const withStats = await Promise.all(
      plugins.map(async (p) => ({
        slug: p.slug,
        name: p.name,
        globally_enabled: p.enabled_by_default,
        users_enabled_count: await prisma.userPluginSettings.count({ where: { plugin_id: p.id, enabled: true } }),
        guilds_enabled_count: await prisma.guildPluginSettings.count({ where: { plugin_id: p.id, enabled: true } }),
      }))
    );
    res.json(withStats);
  } catch (err) {
    next(err);
  }
}

export async function updatePluginBySlug(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plugin = await prisma.plugin.update({
      where: { slug: req.params.slug },
      data: {
        enabled_by_default: req.body.globally_enabled !== undefined ? req.body.globally_enabled : undefined,
        name: req.body.name,
        description: req.body.description,
        version: req.body.version,
      },
    });

    if (req.body.globally_enabled !== undefined) {
      const ip = (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
      await createAdminAuditLog({ adminId: req.user!.userId, action: 'PLUGIN_TOGGLE', targetType: 'plugin', targetId: plugin.id, details: { globally_enabled: req.body.globally_enabled }, ipAddress: ip });
    }

    res.json(plugin);
  } catch (err) {
    next(err);
  }
}

export async function createPlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plugin = await prisma.plugin.create({
      data: {
        id: generateSnowflake(),
        name: req.body.name,
        slug: req.body.slug,
        description: req.body.description || null,
        version: req.body.version,
        type: req.body.type,
        author: req.body.author,
        icon: req.body.icon || null,
        settings_schema: req.body.settings_schema || null,
      },
    });
    res.status(201).json(plugin);
  } catch (err) {
    next(err);
  }
}

export async function getPlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const plugin = await prisma.plugin.findUnique({ where: { slug: req.params.slug } });
    if (!plugin) throw new AppError(404, 'NOT_FOUND', 'Plugin not found');
    res.json(plugin);
  } catch (err) {
    next(err);
  }
}

export async function deletePlugin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.plugin.delete({ where: { slug: req.params.slug } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// ── AUDIT LOGS ────────────────────────────────────────────────────────────

export async function getAuditLogs(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const page = Number(req.query.page) || 1;
    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const where: any = {};
    if (req.query.admin_id) where.admin_id = req.query.admin_id;
    if (req.query.action) where.action = req.query.action;
    if (req.query.target_type) where.target_type = req.query.target_type;
    if (req.query.from || req.query.to) {
      where.created_at = {};
      if (req.query.from) where.created_at.gte = new Date(req.query.from as string);
      if (req.query.to) where.created_at.lte = new Date(req.query.to as string);
    }

    const [logs, total] = await Promise.all([
      prisma.adminAuditLog.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { created_at: 'desc' },
        include: { admin: { select: { id: true, username: true, discriminator: true, avatar: true } } },
      }),
      prisma.adminAuditLog.count({ where }),
    ]);

    res.json({
      logs: logs.map((l) => ({ ...l, details: l.details || null })),
      total,
      page,
    });
  } catch (err) {
    next(err);
  }
}

// ── MISC ──────────────────────────────────────────────────────────────────

export async function getAllRolesAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const roles = await prisma.role.findMany({
      include: { guild: { select: { id: true, name: true } } },
      orderBy: { position: 'desc' },
    });
    res.json({ roles });
  } catch (err) {
    next(err);
  }
}

export async function getAllChannelsAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const channels = await prisma.channel.findMany({
      include: { guild: { select: { id: true, name: true } } },
      orderBy: { position: 'asc' },
    });
    res.json({ channels });
  } catch (err) {
    next(err);
  }
}

import { createBackup as svcCreateBackup, getBackupList as svcGetBackupList, restoreBackup as svcRestoreBackup, deleteBackup as svcDeleteBackup, startBackupCron, uploadBackup as svcUploadBackup } from '../services/backup.service.js';

export async function getBackupList(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const result = await svcGetBackupList();
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function createBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const includeUploads = req.body.include_uploads !== false;
    const result = await svcCreateBackup(includeUploads, req.user!.userId);
    res.status(202).json({
      status: 'in_progress',
      estimated_duration_seconds: 120,
    });
  } catch (err) {
    next(err);
  }
}

export async function restoreBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { confirm, restore_uploads } = req.body;
    if (confirm !== 'RESTORE') throw new AppError(400, 'INVALID_CONFIRM', 'confirm field must be exactly "RESTORE"');
    const result = await svcRestoreBackup(req.params.backupId, restore_uploads === true, req.user!.userId);
    res.status(202).json({
      status: 'in_progress',
      warning: 'Le serveur va redémarrer après la restauration. Toutes les sessions seront terminées.',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await svcDeleteBackup(req.params.backupId, req.user!.userId);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function downloadBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const backupDir = process.env.BACKUP_DIR || './backups';
    const backupPath = path.join(backupDir, req.params.filename);
    if (!backupPath.startsWith(path.resolve(backupDir))) throw new AppError(403, 'FORBIDDEN', 'Invalid path');
    if (!fs.existsSync(backupPath)) throw new AppError(404, 'NOT_FOUND', 'Backup not found');
    res.set('Content-Disposition', `attachment; filename="${req.params.filename}"`);
    res.set('Cache-Control', 'no-store');
    res.sendFile(backupPath);
  } catch (err) {
    next(err);
  }
}

export async function uploadBackup(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    // Assume multer middleware handled the upload
    const file = (req as any).file;
    if (!file) throw new AppError(400, 'NO_FILE', 'No backup file uploaded');
    const result = await svcUploadBackup(file.path, req.user!.userId);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}


export async function testEmailConfig(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = (req as any).user;
    if (!user?.email) throw new AppError(400, 'NO_EMAIL', 'Admin email not found');
    const result = await testSmtpConfig(user.email);
    if (!result.sent) throw new AppError(500, 'SMTP_TEST_FAILED', result.error || 'Unknown error');
    res.json({ sent: true, message_id: result.messageId });
  } catch (err) {
    next(err);
  }
}

// ── BULK ACTIONS ─────────────────────────────────────────────────────

function getReqIp(req: Request): string {
  return (req.headers['x-forwarded-for'] as string)?.split(',')[0] || req.socket.remoteAddress || 'unknown';
}

function parseBulkIds(req: Request): string[] {
  const raw = req.body?.ids;
  if (!Array.isArray(raw)) throw new AppError(400, 'INVALID_IDS', 'ids must be an array');
  const ids = raw.filter((v) => typeof v === 'string' && v.length > 0);
  if (ids.length === 0) throw new AppError(400, 'INVALID_IDS', 'ids must contain at least one id');
  if (ids.length > 500) throw new AppError(400, 'TOO_MANY_IDS', 'No more than 500 ids per bulk request');
  return ids;
}

export async function bulkUserAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const adminId = req.user!.userId;
    const ip = getReqIp(req);

    const selfIncluded = ids.includes(adminId);
    if (selfIncluded && action !== 'force-logout') {
      throw new AppError(400, 'INVALID_TARGET', 'You cannot apply this action to yourself');
    }

    const results: { id: string; ok: boolean; error?: string }[] = [];
    const io = getIO();

    const adminUser = await prisma.user.findUnique({ where: { id: adminId } });
    if (!adminUser) throw new AppError(401, 'UNAUTHORIZED', 'Not found');

    const protectedIds = new Set<string>();
    if (action === 'ban' || action === 'disable' || action === 'delete') {
      const higherOrEqual = await prisma.user.findMany({
        where: { id: { in: ids }, admin_level: { gte: adminUser.admin_level } },
        select: { id: true },
      });
      higherOrEqual.forEach((u) => { if (u.id !== adminId) protectedIds.add(u.id); });
    }

    for (const id of ids) {
      if (id === adminId && action !== 'force-logout') {
        results.push({ id, ok: false, error: 'Cannot target yourself' });
        continue;
      }
      if (protectedIds.has(id)) {
        results.push({ id, ok: false, error: 'Insufficient privileges' });
        continue;
      }
      try {
        switch (action) {
          case 'ban': {
            const now = new Date();
            await prisma.user.update({ where: { id }, data: { banned: true, ban_reason: reason, banned_at: now, banned_by: adminId } });
            await prisma.refreshToken.updateMany({ where: { user_id: id, is_revoked: false }, data: { is_revoked: true } });
            if (io) io.to(`user:${id}`).disconnectSockets(true);
            await createAdminAuditLog({ adminId, action: 'USER_BAN', targetType: 'user', targetId: id, details: { reason, bulk: true }, ipAddress: ip });
            break;
          }
          case 'unban': {
            await prisma.user.update({ where: { id }, data: { banned: false, ban_reason: null, banned_at: null, banned_by: null } });
            await createAdminAuditLog({ adminId, action: 'USER_UNBAN', targetType: 'user', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          case 'disable': {
            await prisma.user.update({ where: { id }, data: { disabled: true } });
            await prisma.refreshToken.updateMany({ where: { user_id: id, is_revoked: false }, data: { is_revoked: true } });
            if (io) io.to(`user:${id}`).disconnectSockets(true);
            await createAdminAuditLog({ adminId, action: 'USER_DISABLE', targetType: 'user', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          case 'enable': {
            await prisma.user.update({ where: { id }, data: { disabled: false } });
            await createAdminAuditLog({ adminId, action: 'USER_ENABLE', targetType: 'user', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          case 'force-logout': {
            await prisma.refreshToken.updateMany({ where: { user_id: id, is_revoked: false }, data: { is_revoked: true } });
            if (io) io.to(`user:${id}`).disconnectSockets(true);
            await createAdminAuditLog({ adminId, action: 'USER_FORCE_LOGOUT', targetType: 'user', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          case 'delete': {
            if (adminUser.admin_level < 3) throw new AppError(403, 'FORBIDDEN', 'Only super admins can delete users');
            const { executeAccountDeletion } = await import('../services/export.service.js');
            await executeAccountDeletion(id, reason || 'Admin bulk deletion');
            await createAdminAuditLog({ adminId, action: 'USER_FORCE_DELETE', targetType: 'user', targetId: id, details: { reason, bulk: true }, ipAddress: ip });
            break;
          }
          default:
            throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkGuildAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const reason = typeof req.body?.reason === 'string' ? req.body.reason : null;
    const adminId = req.user!.userId;
    const ip = getReqIp(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'delete': {
            await prisma.guild.delete({ where: { id } });
            await createAdminAuditLog({ adminId, action: 'GUILD_DELETE', targetType: 'guild', targetId: id, details: { reason, bulk: true }, ipAddress: ip });
            break;
          }
          default:
            throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkReportAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const adminId = req.user!.userId;
    const ip = getReqIp(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        let status: 'resolved' | 'dismissed';
        if (action === 'resolve') status = 'resolved';
        else if (action === 'dismiss') status = 'dismissed';
        else throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);

        await prisma.report.update({
          where: { id },
          data: { status, reviewer_id: adminId, resolved_at: new Date() },
        });
        await createAdminAuditLog({ adminId, action: 'REPORT_RESOLVE', targetType: 'report', targetId: id, details: { status, bulk: true }, ipAddress: ip });
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkAnnouncementAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const adminId = req.user!.userId;
    const ip = getReqIp(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'delete': {
            await prisma.announcement.delete({ where: { id } });
            await createAdminAuditLog({ adminId, action: 'ANNOUNCEMENT_DELETE', targetType: 'announcement', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          case 'activate': {
            await prisma.announcement.update({ where: { id }, data: { active: true } });
            break;
          }
          case 'deactivate': {
            await prisma.announcement.update({ where: { id }, data: { active: false } });
            break;
          }
          default:
            throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkBadgeAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const adminId = req.user!.userId;
    const ip = getReqIp(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        switch (action) {
          case 'delete': {
            await prisma.userBadge.deleteMany({ where: { badge_id: id } });
            await prisma.badge.delete({ where: { id } });
            await createAdminAuditLog({ adminId, action: 'BADGE_DELETE', targetType: 'badge', targetId: id, details: { bulk: true }, ipAddress: ip });
            break;
          }
          default:
            throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        }
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkPluginAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const adminId = req.user!.userId;
    const ip = getReqIp(req);
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const slug of ids) {
      try {
        switch (action) {
          case 'enable': {
            await prisma.plugin.updateMany({ where: { slug }, data: { enabled_by_default: true } });
            await createAdminAuditLog({ adminId, action: 'PLUGIN_TOGGLE', targetType: 'plugin', targetId: slug, details: { action: 'enable', bulk: true }, ipAddress: ip });
            break;
          }
          case 'disable': {
            await prisma.plugin.updateMany({ where: { slug }, data: { enabled_by_default: false } });
            await createAdminAuditLog({ adminId, action: 'PLUGIN_TOGGLE', targetType: 'plugin', targetId: slug, details: { action: 'disable', bulk: true }, ipAddress: ip });
            break;
          }
          default:
            throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        }
        results.push({ id: slug, ok: true });
      } catch (e: any) {
        results.push({ id: slug, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

export async function bulkBackupAction(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const ids = parseBulkIds(req);
    const action = String(req.body?.action || '');
    const adminId = req.user!.userId;
    const results: { id: string; ok: boolean; error?: string }[] = [];

    for (const id of ids) {
      try {
        if (action !== 'delete') throw new AppError(400, 'INVALID_ACTION', `Unknown action: ${action}`);
        await svcDeleteBackup(id, adminId);
        results.push({ id, ok: true });
      } catch (e: any) {
        results.push({ id, ok: false, error: e?.message || 'failed' });
      }
    }

    res.json({
      action,
      total: results.length,
      succeeded: results.filter((r) => r.ok).length,
      failed: results.filter((r) => !r.ok).length,
      results,
    });
  } catch (err) {
    next(err);
  }
}

// ── GDPR - FORCE DELETE USER ──────────────────────────────────────────
export async function forceDeleteUser(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { executeAccountDeletion } = await import('../services/export.service.js');
    const reason = req.body.reason || 'Admin forced deletion';
    await executeAccountDeletion(req.params.userId, reason);
    await createAdminAuditLog({
      adminId: (req as any).user.userId,
      action: 'USER_FORCE_DELETE',
      targetId: req.params.userId,
      targetType: 'user',
      details: { reason },
    });
    res.json({ status: 'deleted', message: 'User has been permanently deleted' });
  } catch (err) {
    next(err);
  }
}
