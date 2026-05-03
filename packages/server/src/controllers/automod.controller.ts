import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { getMemberPermissions, checkPermission } from './guild.controller.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

const MANAGE_GUILD = BigInt(0x20);
const ADMINISTRATOR = BigInt(0x8);

export async function getMemberPermissionsCached(guildId: string, userId: string): Promise<bigint> {
  return getMemberPermissions(guildId, userId);
}

function serializeRule(rule: any) {
  return {
    ...rule,
    trigger_metadata: JSON.parse(rule.trigger_metadata || '{}'),
    actions: JSON.parse(rule.actions || '[]'),
    exempt_roles: JSON.parse(rule.exempt_roles || '[]'),
    exempt_channels: JSON.parse(rule.exempt_channels || '[]'),
  };
}

export async function getRules(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, MANAGE_GUILD);
    const rules = await prisma.autoModRule.findMany({
      where: { guild_id: req.params.guildId },
      orderBy: { created_at: 'asc' },
    });
    res.json({ rules: rules.map(serializeRule) });
  } catch (err) {
    next(err);
  }
}

export async function createRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, MANAGE_GUILD);
    const count = await prisma.autoModRule.count({ where: { guild_id: req.params.guildId } });
    if (count >= 6) throw new AppError(400, 'MAX_RULES', 'Maximum of 6 AutoMod rules per server');
    const rule = await prisma.autoModRule.create({
      data: {
        id: generateSnowflake(),
        guild_id: req.params.guildId,
        name: req.body.name,
        creator_id: req.user!.userId,
        event_type: req.body.event_type ?? 1,
        trigger_type: req.body.trigger_type,
        trigger_metadata: JSON.stringify(req.body.trigger_metadata || {}),
        actions: JSON.stringify(req.body.actions || [{ type: 1 }]),
        enabled: req.body.enabled ?? true,
        exempt_roles: JSON.stringify(req.body.exempt_roles || []),
        exempt_channels: JSON.stringify(req.body.exempt_channels || []),
      },
    });
    res.status(201).json(serializeRule(rule));
  } catch (err) {
    next(err);
  }
}

export async function updateRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, MANAGE_GUILD);
    const data: Record<string, any> = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.enabled !== undefined) data.enabled = req.body.enabled;
    if (req.body.trigger_metadata !== undefined) data.trigger_metadata = JSON.stringify(req.body.trigger_metadata);
    if (req.body.actions !== undefined) data.actions = JSON.stringify(req.body.actions);
    if (req.body.exempt_roles !== undefined) data.exempt_roles = JSON.stringify(req.body.exempt_roles);
    if (req.body.exempt_channels !== undefined) data.exempt_channels = JSON.stringify(req.body.exempt_channels);
    const rule = await prisma.autoModRule.update({ where: { id: req.params.ruleId }, data });
    res.json(serializeRule(rule));
  } catch (err) {
    next(err);
  }
}

export async function deleteRule(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, MANAGE_GUILD);
    await prisma.autoModRule.delete({ where: { id: req.params.ruleId } });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function getAutoModExecutions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const perms = await getMemberPermissions(req.params.guildId, req.user!.userId);
    checkPermission(perms, MANAGE_GUILD);

    const limit = Math.min(Number(req.query.limit) || 50, 100);
    const executions = await prisma.autoModExecution.findMany({
      where: { guild_id: req.params.guildId },
      include: {
        rule: { select: { id: true, name: true } },
        user: { select: { id: true, username: true, discriminator: true } },
      },
      orderBy: { created_at: 'desc' },
      take: limit,
    });
    res.json({ executions });
  } catch (err) {
    next(err);
  }
}

export async function evaluateAutoMod(
  guildId: string,
  content: string | null | undefined,
  authorId: string,
  channelId: string,
): Promise<{ blocked: boolean; blockMessage?: string; timeoutSeconds?: number; warnMessage?: string; closeChannel?: boolean }> {
  if (!content) return { blocked: false };

  const rules = await prisma.autoModRule.findMany({
    where: { guild_id: guildId, enabled: true, event_type: 1 },
  });
  if (rules.length === 0) return { blocked: false };

  const memberRoles = await prisma.guildMemberRole.findMany({
    where: { guild_id: guildId, user_id: authorId },
    include: { role: true },
  });
  const isAdmin = memberRoles.some((mr) => (BigInt(mr.role.permissions) & ADMINISTRATOR) !== 0n);
  if (isAdmin) return { blocked: false };

  const authorRoleIds = memberRoles.map((mr) => mr.role_id);

  for (const rule of rules) {
    const exemptRoles: string[] = JSON.parse(rule.exempt_roles || '[]');
    const exemptChannels: string[] = JSON.parse(rule.exempt_channels || '[]');
    if (exemptChannels.includes(channelId)) continue;
    if (authorRoleIds.some((rid) => exemptRoles.includes(rid))) continue;

    const metadata = JSON.parse(rule.trigger_metadata || '{}');
    if (!checkTrigger(rule.trigger_type, content, metadata)) continue;

    const actions: any[] = JSON.parse(rule.actions || '[]');
    const result: { blocked: boolean; blockMessage?: string; timeoutSeconds?: number; warnMessage?: string; closeChannel?: boolean } = { blocked: false };
    let matchedKeyword: string | null = null;

    let sendAlertChannelId: string | null = null;
    for (const action of actions) {
      if (action.type === 1) {
        result.blocked = true;
        result.blockMessage = action.metadata?.custom_message || 'Message bloqué par AutoMod';
      } else if (action.type === 2) {
        sendAlertChannelId = action.metadata?.channel_id || null;
      } else if (action.type === 3) {
        result.timeoutSeconds = action.metadata?.duration_seconds || 60;
      }
    }

    // Envoyer le message d'alerte si configuré
    if (sendAlertChannelId) {
      try {
        await prisma.message.create({
          data: {
            id: generateSnowflake(),
            channel_id: sendAlertChannelId,
            author_id: '0',
            content: `⚠️ AutoMod a bloqué un message de <@${authorId}> dans <#${channelId}>\nRaison: ${rule.name}`,
            type: 20,
          },
        });
      } catch (err) {
        // Ignorer silencieusement si le salon n'existe plus
      }
    }

    if (rule.trigger_type === 1) {
      matchedKeyword = content;
    }

    const execution = await prisma.autoModExecution.create({
      data: {
        id: generateSnowflake(),
        rule_id: rule.id,
        guild_id: guildId,
        user_id: authorId,
        channel_id: channelId,
        content: content,
        matched_content: matchedKeyword,
        action: actions[0]?.type || 1,
      },
    });

    const io = getIO();
    if (io) {
      io.to(`guild:${guildId}`).emit(GatewayEvents.AUTO_MODERATION_ACTION_EXECUTION, {
        id: execution.id,
        guild_id: guildId,
        rule_id: rule.id,
        user_id: authorId,
        channel_id: channelId,
        action: actions[0]?.type || 1,
        rule_name: rule.name,
        matched_content: matchedKeyword,
        created_at: execution.created_at,
      });
    }

    return result;
  }

  return { blocked: false };
}

function checkTrigger(triggerType: number, content: string, metadata: any): boolean {
  const lower = content.toLowerCase();

  switch (triggerType) {
    case 1: {
      const keywords: string[] = metadata.keyword_filter || [];
      const regexPatterns: string[] = metadata.regex_patterns || [];
      const allowList: string[] = metadata.allow_list || [];
      if (allowList.some((w) => lower.includes(w.toLowerCase()))) return false;
      for (const keyword of keywords) {
        const escaped = keyword.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*');
        try {
          if (new RegExp(escaped, 'i').test(content)) return true;
        } catch { /* invalid pattern */ }
      }
      for (const pattern of regexPatterns) {
        try { if (new RegExp(pattern, 'i').test(content)) return true; } catch { /* invalid regex */ }
      }
      return false;
    }
    case 3:
      return /(.)\1{9,}/.test(content) || content.split('\n').length > 20;
    case 4: {
      const presets: number[] = metadata.presets || [];
      const allowList: string[] = metadata.allow_list || [];
      if (allowList.some((w) => lower.includes(w.toLowerCase()))) return false;
      const profanity = ['merde', 'putain', 'connard', 'salope', 'fuck', 'shit', 'bitch', 'asshole'];
      const sexual = ['porn', 'nude', 'nudes'];
      const slurs = ['nigger', 'faggot'];
      if (presets.includes(1) && profanity.some((w) => lower.includes(w))) return true;
      if (presets.includes(2) && sexual.some((w) => lower.includes(w))) return true;
      if (presets.includes(3) && slurs.some((w) => lower.includes(w))) return true;
      return false;
    }
    case 5: {
      const limit: number = metadata.mention_total_limit ?? 5;
      return (content.match(/<@[!&]?\d+>/g) || []).length >= limit;
    }
    default:
      return false;
  }
}
