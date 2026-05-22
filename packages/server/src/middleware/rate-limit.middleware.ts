import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
}

function getLimit(defaultLimit: number, testLimit = defaultLimit): number {
  if (process.env.NODE_ENV === 'test') return testLimit;
  return defaultLimit;
}

const stores = new Map<string, Map<string, RateLimitEntry>>();

setInterval(() => {
  const now = Date.now();
  for (const [, store] of stores) {
    for (const [key, entry] of store) {
      if (entry.resetAt < now) store.delete(key);
    }
  }
}, 300000);

function getClientIp(req: Request): string {
  if (process.env.TRUST_PROXY === 'true') {
    const forwarded = req.headers['x-forwarded-for'];
    if (forwarded) {
      const ips = Array.isArray(forwarded) ? forwarded[0] : forwarded.split(',')[0];
      return ips?.trim() || req.ip || req.socket.remoteAddress || 'unknown';
    }
  }
  return req.ip || req.socket.remoteAddress || 'unknown';
}

export function rateLimit(bucket: string, limit: number, windowMs: number, silent = false) {
  if (!stores.has(bucket)) stores.set(bucket, new Map());
  const store = stores.get(bucket)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId;
    const ip = getClientIp(req);
    const key = `${bucket}:${userId || ip}`;

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, limit - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    res.set('X-RateLimit-Reset-After', String(resetSeconds));
    res.set('X-RateLimit-Bucket', bucket);

    if (entry.count > limit) {
      if (silent) return next();
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        message: 'You are being rate limited.',
        retry_after: retryAfter,
        global: bucket === 'global',
      });
      return;
    }

    next();
  };
}

export function rateLimitWithKey(bucket: string, limit: number, windowMs: number, getKey: (req: Request) => string, silent = false) {
  if (!stores.has(bucket)) stores.set(bucket, new Map());
  const store = stores.get(bucket)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    const ip = getClientIp(req);
    const key = `${bucket}:${getKey(req)}`;

    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt < now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count++;

    const remaining = Math.max(0, limit - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    res.set('X-RateLimit-Limit', String(limit));
    res.set('X-RateLimit-Remaining', String(remaining));
    res.set('X-RateLimit-Reset', String(Math.ceil(entry.resetAt / 1000)));
    res.set('X-RateLimit-Reset-After', String(resetSeconds));
    res.set('X-RateLimit-Bucket', bucket);

    if (entry.count > limit) {
      if (silent) return next();
      const retryAfter = Math.ceil((entry.resetAt - now) / 1000);
      res.set('Retry-After', String(retryAfter));
      res.status(429).json({
        message: 'You are being rate limited.',
        retry_after: retryAfter,
        global: bucket === 'global',
      });
      return;
    }

    next();
  };
}

export const globalRateLimit = rateLimit('global', 50, 1000);
export const authRateLimit = rateLimit('auth', getLimit(5, 100), 60000);
// Removed loginRateLimit and registerRateLimit - merged into authRateLimit per spec 15
export const messageSendRateLimit = rateLimitWithKey('message_send', 5, 5000, (req) => {
  const userId = req.user?.userId || 'anonymous';
  const channelId = req.params.id || 'unknown';
  return `${userId}:${channelId}`;
});
export const messageSendBotRateLimit = rateLimitWithKey('bot_message_send', 30, 10000, (req) => {
  const userId = req.user?.userId || 'anonymous';
  const channelId = req.params.id || 'unknown';
  return `${userId}:${channelId}`;
});
export const messageEditDeleteRateLimit = rateLimit('message_edit_delete', 10, 10000);
export const channelManageRateLimit = rateLimit('channel_manage', 5, 30000);
export const guildOperationsRateLimit = rateLimit('guild_operations', 5, 30000);
export const createReportRateLimit = rateLimit('create_report', 3, 600000); // 3 rapports par 10 min
export const userProfileUpdateRateLimit = rateLimit('user_profile_update', 2, 10000);
export const reactionAddRateLimit = rateLimit('reaction_add', 10, 10000);
export const reactionAddBotRateLimit = rateLimit('bot_reaction_add', 20, 10000);
export const bulkDeleteRateLimit = rateLimit('bulk_delete', 1, 30000);
export const searchRateLimit = rateLimit('search', 2, 10000);
export const fileUploadRateLimit = rateLimit('file_upload', 5, 60000);
export const typingRateLimit = rateLimit('typing', 5, 5000, true);
export const botGlobalRateLimit = rateLimit('bot_global', 50, 1000);
export const analyticsRateLimit = rateLimit('analytics', 10, 60000); // 10 req/min for analytics
export const dataExportRateLimit = rateLimit('data_export', 1, 86400000); // 1 req per 24 hours
export const deleteAccountRateLimit = rateLimit('delete_account', 3, 3600000); // 3 req per hour
