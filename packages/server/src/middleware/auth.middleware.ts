import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcrypt';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
import * as crypto from 'crypto';
import { AppError } from '../utils/app-error.js';
import { prisma } from '../utils/prisma.js';

export interface AuthPayload {
  userId: string;
  type: 'access' | 'partial' | 'bot';
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload;

    }
  }
}

const tokenBlacklist = new Set<string>();

export function blacklistToken(jti: string, expiresIn: number): void {
  tokenBlacklist.add(jti);
  setTimeout(() => tokenBlacklist.delete(jti), expiresIn * 1000);
}

export async function authenticate(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    let token: string | undefined;

    // Try Authorization header first
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    } else if (req.cookies?.access_token) {
      // Fall back to cookie
      token = req.cookies.access_token;
    }

    if (!token) throw new AppError(401, 'UNAUTHORIZED', 'No token provided');

    if (authHeader?.startsWith('Bot ')) {
      const botToken = authHeader.slice(4);
      const parts = botToken.split('.');
      if (parts.length !== 3) throw new AppError(401, 'INVALID_TOKEN', 'Invalid bot token format');

      const botIdB64 = parts[0]!;
      const timestampB64 = parts[1]!;
      const providedHmac = parts[2]!;

      const expectedHmac = crypto.createHmac('sha256', process.env.BOT_SECRET || 'opencord_dev_bot_secret')
        .update(`${botIdB64}.${timestampB64}`)
        .digest('base64url');

      if (expectedHmac !== providedHmac) {
        throw new AppError(401, 'INVALID_TOKEN', 'Invalid bot token signature');
      }

      const botId = Buffer.from(botIdB64, 'base64url').toString();
      const botUser = await prisma.user.findFirst({ where: { id: botId, bot: true } });
      if (!botUser) throw new AppError(401, 'INVALID_TOKEN', 'Bot not found');
      if (!botUser.bot_token) throw new AppError(401, 'INVALID_TOKEN', 'Bot token missing');

      const valid = await bcrypt.compare(botToken, botUser.bot_token);
      if (!valid) throw new AppError(401, 'INVALID_TOKEN', 'Invalid bot token');

      req.user = { userId: botUser.id, type: 'bot' };
      return next();
    }

    const jwtAccessSecret = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
    if (!jwtAccessSecret) throw new AppError(500, 'INTERNAL_ERROR', 'JWT_ACCESS_SECRET not configured');
    const payload = jwt.verify(token, jwtAccessSecret) as AuthPayload & { jti?: string };

    if (payload.jti && tokenBlacklist.has(payload.jti)) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');
    }

    if (payload.type === 'partial') {
      throw new AppError(401, 'UNAUTHORIZED', '2FA required');
    }

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');
    if (user.disabled) throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is disabled');
    if (user.banned) throw new AppError(403, 'ACCOUNT_BANNED', 'Account is banned');
    if (user.locked_until && user.locked_until > new Date()) {
      throw new AppError(403, 'ACCOUNT_LOCKED', 'Account is temporarily locked');
    }

    req.user = { userId: payload.userId, type: payload.type };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    if (err instanceof jwt.TokenExpiredError) return next(new AppError(401, 'TOKEN_EXPIRED', 'Token expired'));
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError(401, 'TOKEN_INVALID', 'Invalid token'));
    next(err);
  }
}

export async function authenticateBot(req: Request, _res: Response, next: NextFunction): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) throw new AppError(401, 'UNAUTHORIZED', 'No token provided');
    if (!authHeader.startsWith('Bot ')) throw new AppError(401, 'UNAUTHORIZED', 'Bot token required');

    const botToken = authHeader.slice(4);
    const parts = botToken.split('.');
    if (parts.length < 3) throw new AppError(401, 'INVALID_TOKEN', 'Invalid bot token');

    const botId = Buffer.from(parts[0]!, 'base64url').toString();
    const botUser = await prisma.user.findFirst({ where: { id: botId, bot: true } });
    if (!botUser) throw new AppError(401, 'INVALID_TOKEN', 'Bot not found');
    if (!botUser.bot_token) throw new AppError(401, 'INVALID_TOKEN', 'Bot token missing');

    const valid = await bcrypt.compare(botToken, botUser.bot_token);
    if (!valid) throw new AppError(401, 'INVALID_TOKEN', 'Invalid bot token');

    req.user = { userId: botUser.id, type: 'bot' };
    next();
  } catch (err) {
    if (err instanceof AppError) return next(err);
    next(err);
  }
}

export function requireAdmin(minLevel: number) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
      const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
      if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');
      const userLevel = Number(user.admin_level) || 0;
      if (userLevel < minLevel) {
        throw new AppError(403, 'FORBIDDEN', `Admin level ${userLevel} < ${minLevel}`);
      }
      next();
    } catch (err) {
      next(err);
    }
  };
}
