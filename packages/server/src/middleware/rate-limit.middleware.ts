import { Request, Response, NextFunction } from 'express';

interface RateLimitEntry {
  count: number;
  resetAt: number;
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

export function rateLimit(bucket: string, limit: number, windowMs: number, silent = false) {
  if (!stores.has(bucket)) stores.set(bucket, new Map());
  const store = stores.get(bucket)!;

  return (req: Request, res: Response, next: NextFunction): void => {
    const userId = req.user?.userId;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';
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
      const retryAfter = (entry.resetAt - now) / 1000;
      res.set('Retry-After', String(Math.ceil(retryAfter)));
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
export const authRateLimit = rateLimit('auth', 5, 60000);
export const messageSendRateLimit = rateLimit('message_send', 5, 5000);
export const messageEditDeleteRateLimit = rateLimit('message_edit_delete', 10, 10000);
export const channelManageRateLimit = rateLimit('channel_manage', 5, 30000);
export const guildOperationsRateLimit = rateLimit('guild_operations', 5, 30000);
export const userProfileUpdateRateLimit = rateLimit('user_profile_update', 2, 10000);
export const reactionAddRateLimit = rateLimit('reaction_add', 10, 10000);
export const bulkDeleteRateLimit = rateLimit('bulk_delete', 1, 30000);
export const searchRateLimit = rateLimit('search', 2, 10000);
export const fileUploadRateLimit = rateLimit('file_upload', 5, 60000);
export const typingRateLimit = rateLimit('typing', 5, 5000, true);
