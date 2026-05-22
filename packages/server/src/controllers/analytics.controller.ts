import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';
import { GatewayEvents, PERMISSION_BITS } from '@opencord/shared';
import { getIO } from '../gateway/index.js';
import { logInfo, logError } from '../utils/logger.js';

// ── Helpers ─────────────────────────────────────────────────────────────────

function dateToISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function requireAnalyticsPermission(guildId: string, userId: string) {
  const perms = await getMemberPermissions(guildId, userId);
  if ((perms & PERMISSION_BITS.VIEW_GUILD_ANALYTICS) === 0n) {
    throw new AppError(403, 'MISSING_PERMISSIONS', 'Requires VIEW_GUILD_ANALYTICS permission');
  }
}

// ── Overview ───────────────────────────────────────────────────────────────

export async function getOverview(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId } = req.params;
    const period = (req.query.period as string) || '7d';

    await requireAnalyticsPermission(guildId, req.user!.userId);

    const days = period === '24h' ? 1 : period === '7d' ? 7 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    // Get snapshots for period
    const snapshots = await prisma.guildAnalyticsSnapshot.findMany({
      where: { guild_id: guildId, date: { gte: startDate } },
      orderBy: { date: 'asc' },
    });

    if (snapshots.length === 0) {
      // Fallback: compute from current state
      const guild = await prisma.guild.findUnique({ where: { id: guildId } });
      const memberCount = await prisma.guildMember.count({ where: { guild_id: guildId } });
      res.json({
        guild_id: guildId,
        period,
        member_count: memberCount,
        member_count_change: 0,
        total_joins: 0,
        total_leaves: 0,
        total_messages: 0,
        total_messages_change_percent: 0,
        active_members: 0,
        active_members_percent: 0,
        top_channels: [],
        join_sources: { invite: 0, discovery: 0, vanity: 0, bot: 0 },
      });
      return;
    }

    const latest = snapshots[snapshots.length - 1];
    const oldest = snapshots[0];

    // Sum metrics
    let totalJoins = 0, totalLeaves = 0, totalMessages = 0;
    const channelMessages: Record<string, number> = {};
    const joinSources = { invite: 0, discovery: 0, vanity: 0, bot: 0 };

    for (const s of snapshots) {
      totalJoins += s.member_joins;
      totalLeaves += s.member_leaves;
      totalMessages += s.message_count;

      const topChannels = typeof s.top_channels === 'string' ? JSON.parse(s.top_channels) : s.top_channels;
      for (const c of topChannels) {
        channelMessages[c.channel_id] = (channelMessages[c.channel_id] || 0) + c.message_count;
      }

      const sources = typeof s.join_sources === 'string' ? JSON.parse(s.join_sources) : s.join_sources;
      for (const [k, v] of Object.entries(sources)) {
        (joinSources as any)[k] = ((joinSources as any)[k] || 0) + (v as number);
      }
    }

    // Top 3 channels
    const sortedChannels = Object.entries(channelMessages)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 3);

    const channelsWithNames = await Promise.all(sortedChannels.map(async ([channelId, count]) => {
      const ch = await prisma.channel.findUnique({ where: { id: channelId }, select: { id: true, name: true } });
      return { channel_id: channelId, channel_name: ch?.name || 'unknown', message_count: count };
    }));

    // Get active members from latest snapshot
    const activeMembersPercent = latest.member_count > 0
      ? Number((latest.active_members / latest.member_count * 100).toFixed(1))
      : 0;

    // Compute change vs previous period
    const prevStart = new Date(startDate.getTime() - days * 24 * 60 * 60 * 1000);
    const prevSnapshots = await prisma.guildAnalyticsSnapshot.findMany({
      where: { guild_id: guildId, date: { gte: prevStart, lt: startDate } },
    });

    let messagesChangePercent = 0;
    if (prevSnapshots.length > 0) {
      const prevTotal = prevSnapshots.reduce((s, snap) => s + snap.message_count, 0);
      if (prevTotal > 0) {
        messagesChangePercent = Number(((totalMessages - prevTotal) / prevTotal * 100).toFixed(1));
      }
    }

    res.json({
      guild_id: guildId,
      period,
      member_count: latest.member_count,
      member_count_change: latest.member_count - oldest.member_count,
      total_joins: totalJoins,
      total_leaves: totalLeaves,
      total_messages: totalMessages,
      total_messages_change_percent: messagesChangePercent,
      active_members: latest.active_members,
      active_members_percent: activeMembersPercent,
      top_channels: channelsWithNames,
      join_sources: joinSources,
    });
  } catch (err) {
    next(err);
  }
}

// ── Timeseries ──────────────────────────────────────────────────────────────

export async function getTimeseries(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId } = req.params;
    const metric = req.query.metric as string;
    const period = (req.query.period as string) || '30d';

    await requireAnalyticsPermission(guildId, req.user!.userId);

    const days = period === '7d' ? 7 : period === '90d' ? 90 : 30;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await prisma.guildAnalyticsSnapshot.findMany({
      where: { guild_id: guildId, date: { gte: startDate } },
      orderBy: { date: 'asc' },
      select: { date: true, member_count: true, message_count: true, member_joins: true, member_leaves: true, active_members: true },
    });

    let data: { date: string; value: number }[];
    switch (metric) {
      case 'members':
        data = snapshots.map(s => ({ date: dateToISO(s.date), value: s.member_count }));
        break;
      case 'messages':
        data = snapshots.map(s => ({ date: dateToISO(s.date), value: s.message_count }));
        break;
      case 'joins':
        data = snapshots.map(s => ({ date: dateToISO(s.date), value: s.member_joins }));
        break;
      case 'leaves':
        data = snapshots.map(s => ({ date: dateToISO(s.date), value: s.member_leaves }));
        break;
      case 'active_members':
        data = snapshots.map(s => ({ date: dateToISO(s.date), value: s.active_members }));
        break;
      default:
        throw new AppError(400, 'INVALID_METRIC', 'Invalid metric');
    }

    res.json({ metric, period, data });
  } catch (err) {
    next(err);
  }
}

// ── Hourly distribution ─────────────────────────────────────────────────────

export async function getHourly(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId } = req.params;
    const period = (req.query.period as string) || '7d';

    await requireAnalyticsPermission(guildId, req.user!.userId);

    const days = period === '24h' ? 1 : 7;
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const snapshots = await prisma.guildAnalyticsSnapshot.findMany({
      where: { guild_id: guildId, date: { gte: startDate } },
    });

    // Aggregate hourly data
    const hourlyTotals = new Array(24).fill(0);
    let count = 0;

    for (const s of snapshots) {
      const hourly = typeof s.hourly_messages === 'string' ? JSON.parse(s.hourly_messages) : s.hourly_messages;
      if (Array.isArray(hourly) && hourly.length === 24) {
        for (let h = 0; h < 24; h++) {
          hourlyTotals[h] += (hourly[h] as number) || 0;
        }
        count++;
      }
    }

    // Average
    const hours = hourlyTotals.map(v => count > 0 ? Math.round(v / count) : 0);

    res.json({ period, hours });
  } catch (err) {
    next(err);
  }
}

// ── Retention ───────────────────────────────────────────────────────────────

export async function getRetention(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { guildId } = req.params;
    await requireAnalyticsPermission(guildId, req.user!.userId);

    // Get last 4 weeks of cohorts
    const now = new Date();
    const weeks: { cohort_start: string; cohort_size: number; retention: number[] }[] = [];

    for (let w = 3; w >= 0; w--) {
      const cohortStart = new Date(now.getTime() - (w + 1) * 7 * 24 * 60 * 60 * 1000);
      const cohortEnd = new Date(cohortStart.getTime() + 7 * 24 * 60 * 60 * 1000);
      const nextWeekStart = new Date(cohortEnd.getTime());

      // Count members who joined during this week
      const joinedMembers = await prisma.auditLog.count({
        where: {
          guild_id: guildId,
          action_type: 20, // MEMBER_JOIN
          created_at: { gte: cohortStart, lt: cohortEnd },
        },
      });

      if (joinedMembers === 0) {
        weeks.push({ cohort_start: dateToISO(cohortStart), cohort_size: 0, retention: [100] });
        continue;
      }

      const retention: number[] = [100];

      // For each subsequent week, check how many are still members
      for (let wk = 1; wk <= w; wk++) {
        const weekEnd = new Date(cohortStart.getTime() + wk * 7 * 24 * 60 * 60 * 1000);
        const weekStart = new Date(weekEnd.getTime() - 7 * 24 * 60 * 60 * 1000);

        // Count members who joined in cohort week and are still in guild
        const stillMembers = await prisma.guildMember.count({
          where: {
            guild_id: guildId,
            joined_at: { gte: cohortStart, lt: cohortEnd },
            // Can't easily query "has not left" — simplified: check current member count trend
          },
        });

        // Simplified retention calculation
        const currentMembers = await prisma.guildMember.count({ where: { guild_id: guildId } });
        const retentionPct = Math.min(100, Math.round((stillMembers / joinedMembers) * 100));
        retention.push(retentionPct);
      }

      weeks.push({ cohort_start: dateToISO(cohortStart), cohort_size: joinedMembers, retention });
    }

    res.json({ weeks });
  } catch (err) {
    next(err);
  }
}

// ── Snapshot creation (cron job) ──────────────────────────────────────

export async function createSnapshotForGuild(guildId: string): Promise<void> {
  try {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);

    // Check if snapshot already exists for today
    const existing = await prisma.guildAnalyticsSnapshot.findFirst({
      where: { guild_id: guildId, date: today },
    });
    if (existing) return;

    // 1. Member count
    const memberCount = await prisma.guildMember.count({ where: { guild_id: guildId } });

    // 2. Joins/leaves today (from audit log)
    const todayStart = new Date(today);
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    const joinsToday = await prisma.auditLog.count({
      where: { guild_id: guildId, action_type: 20, created_at: { gte: todayStart, lt: tomorrow } }, // MEMBER_JOIN
    });
    const leavesToday = await prisma.auditLog.count({
      where: { guild_id: guildId, action_type: 21, created_at: { gte: todayStart, lt: tomorrow } }, // MEMBER_LEAVE
    });

    // 3. Messages today
    const messagesToday = await prisma.message.count({
      where: {
        channel: { guild_id: guildId },
        created_at: { gte: todayStart, lt: tomorrow },
      },
    });

    // 4. Active members (sent at least 1 message today)
    const activeMembersResult = await prisma.$queryRaw<[{ count: number }]>`
      SELECT COUNT(DISTINCT author_id) as count
      FROM messages m
      JOIN channels c ON m.channel_id = c.id
      WHERE c.guild_id = ${guildId} AND m.created_at >= ${todayStart} AND m.created_at < ${tomorrow}
    `;
    const activeMembers = Number(activeMembersResult[0]?.count || 0);

    // 5. Active communicators (message + reaction/thread) - simplified: just active members for now
    const activeCommunicators = activeMembers;

    // 6. Top channels (top 10 by message count today)
    const topChannelsResult = await prisma.$queryRaw<Array<{ channel_id: string; message_count: number }>>`
      SELECT channel_id, COUNT(*) as message_count
      FROM messages
      WHERE channel_id IN (SELECT id FROM channels WHERE guild_id = ${guildId})
        AND created_at >= ${todayStart} AND created_at < ${tomorrow}
      GROUP BY channel_id
      ORDER BY message_count DESC
      LIMIT 10
    `;
    const topChannels = topChannelsResult.map(c => ({ channel_id: c.channel_id, message_count: Number(c.message_count) }));

    // 7. Hourly distribution
    const hourlyResult = await prisma.$queryRaw<Array<{ hour: number; count: number }>>`
      SELECT CAST(strftime('%H', created_at) AS INTEGER) as hour, COUNT(*) as count
      FROM messages
      WHERE channel_id IN (SELECT id FROM channels WHERE guild_id = ${guildId})
        AND created_at >= ${todayStart} AND created_at < ${tomorrow}
      GROUP BY hour
    `;
    const hourlyMessages = new Array(24).fill(0);
    for (const row of hourlyResult) {
      hourlyMessages[row.hour] = Number(row.count);
    }

    // 8. Join sources (from invites, discovery, vanity, bot)
    // Simplified: check invite usage, vanity URL usage, discovery joins
    const joinSources: Record<string, number> = { invite: 0, discovery: 0, vanity: 0, bot: 0 };

    // Count invites used today
    const invitesUsed = await prisma.invite.findMany({
      where: { guild_id: guildId, created_at: { gte: todayStart } },
      select: { uses: true },
    });
    joinSources.invite = invitesUsed.reduce((sum, inv) => sum + inv.uses, 0);

    // Check if guild has vanity URL and count uses (simplified)
    const guild = await prisma.guild.findUnique({ where: { id: guildId }, select: { vanity_url_code: true } });
    if (guild?.vanity_url_code) {
      // Vanity URL joins would need tracking - simplified for now
      joinSources.vanity = 0;
    }

    // Create snapshot
    await prisma.guildAnalyticsSnapshot.create({
      data: {
        id: generateSnowflake(),
        guild_id: guildId,
        date: today,
        member_count: memberCount,
        member_joins: joinsToday,
        member_leaves: leavesToday,
        message_count: messagesToday,
        active_members: activeMembers,
        active_communicators: activeCommunicators,
        voice_minutes: 0, // DIFFÉRÉ - voice not implemented
        top_channels: topChannels as any,
        hourly_messages: hourlyMessages as any,
        join_sources: joinSources as any,
      },
    });

    logInfo(`Created analytics snapshot for guild ${guildId}`);
  } catch (err) {
    logError(`Error creating snapshot for guild ${guildId}:`, err);
  }
}

export async function runSnapshotCron(): Promise<void> {
  try {
    const now = new Date();
    // Only run at 00:05 UTC
    if (now.getUTCHours() !== 0 || now.getUTCMinutes() < 5 || now.getUTCMinutes() > 10) {
      return;
    }

    logInfo('Running analytics snapshot cron...');
    const guilds = await prisma.guild.findMany({ select: { id: true } });

    for (const guild of guilds) {
      await createSnapshotForGuild(guild.id);
    }

    // Cleanup old snapshots (> 90 days)
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.guildAnalyticsSnapshot.deleteMany({
      where: { date: { lt: ninetyDaysAgo } },
    });
    if (deleted.count > 0) {
      logInfo(`Cleaned up ${deleted.count} old analytics snapshots`);
    }

    logInfo('Analytics snapshot cron completed');
  } catch (err) {
    logError('Error in analytics snapshot cron:', err);
  }
}