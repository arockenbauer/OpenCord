import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions } from './guild.controller.js';
import { GatewayEvents } from '@opencord/shared';
import { getIO } from '../gateway/index.js';

const VIEW_GUILD_ANALYTICS = BigInt(1 << 40);

// ── Helpers ─────────────────────────────────────────────────────────────────

function dateToISO(date: Date): string {
  return date.toISOString().split('T')[0];
}

async function requireAnalyticsPermission(guildId: string, userId: string) {
  const perms = await getMemberPermissions(guildId, userId);
  if ((perms & VIEW_GUILD_ANALYTICS) === BigInt(0)) {
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
          action_type: 'MEMBER_JOIN',
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