import { Request, Response, NextFunction } from 'express';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import crypto from 'crypto';

const ENCRYPTION_KEY = process.env.JWT_SECRET || 'default-dev-key-32-chars-long!';

function encrypt(text: string): string {
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  const encrypted = Buffer.concat([cipher.update(text, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return iv.toString('hex') + ':' + tag.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text: string): string {
  const parts = text.split(':');
  const iv = Buffer.from(parts[0], 'hex');
  const tag = Buffer.from(parts[1], 'hex');
  const encrypted = Buffer.from(parts[2], 'hex');
  const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from(ENCRYPTION_KEY.padEnd(32, '0').slice(0, 32)), iv);
  decipher.setAuthTag(tag);
  return decipher.update(encrypted) + decipher.final('utf8');
}

// GET /api/users/@me/connections
export async function getConnections(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const accounts = await prisma.connectedAccount.findMany({
      where: { user_id: userId },
      orderBy: { created_at: 'desc' },
    });
    const result = accounts.map(acc => ({
      id: acc.id,
      type: acc.type,
      name: acc.name,
      friend_sync: acc.friend_sync,
      show_activity: acc.show_activity,
      visibility: acc.visibility,
      verified: acc.verified,
      created_at: acc.created_at,
    }));
    res.json(result);
  } catch (err) {
    next(err);
  }
}

// POST /api/users/@me/connections/:type/callback - OAuth callback
export async function connectionCallback(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { type } = req.params;
    const { code } = req.body;

    if (!code) throw new AppError(400, 'MISSING_CODE', 'Authorization code is required');

    const validTypes = ['github', 'twitter', 'twitch', 'youtube', 'spotify', 'steam', 'reddit', 'linkedin', 'xbox', 'playstation', 'battlenet', 'epicgames', 'leagueoflegends'];
    if (!validTypes.includes(type)) throw new AppError(400, 'INVALID_TYPE', 'Invalid platform type');

    // Exchange code for token (simplified - in production, use actual OAuth flows)
    // This is a mock implementation
    const accessToken = 'mock_access_' + generateSnowflake();
    const refreshToken = 'mock_refresh_' + generateSnowflake();
    const platformUsername = 'user_' + generateSnowflake().slice(-6);

    const encryptedAccess = encrypt(accessToken);
    const encryptedRefresh = encrypt(refreshToken);

    const account = await prisma.connectedAccount.upsert({
      where: { user_id_type: { user_id: userId, type } },
      create: {
        id: generateSnowflake(),
        user_id: userId,
        type,
        name: platformUsername,
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: new Date(Date.now() + 3600000), // 1 hour
        verified: true,
      },
      update: {
        access_token: encryptedAccess,
        refresh_token: encryptedRefresh,
        token_expires_at: new Date(Date.now() + 3600000),
        verified: true,
      },
    });

    res.json({
      id: account.id,
      type: account.type,
      name: account.name,
      friend_sync: account.friend_sync,
      show_activity: account.show_activity,
      visibility: account.visibility,
      verified: account.verified,
    });
  } catch (err) {
    next(err);
  }
}

// PATCH /api/users/@me/connections/:connectionId
export async function updateConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { connectionId } = req.params;
    const { friend_sync, show_activity, visibility } = req.body;

    const account = await prisma.connectedAccount.findUnique({ where: { id: connectionId } });
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Connection not found');
    if (account.user_id !== userId) throw new AppError(403, 'FORBIDDEN', 'Cannot modify another user\'s connection');

    const updated = await prisma.connectedAccount.update({
      where: { id: connectionId },
      data: {
        ...(friend_sync !== undefined && { friend_sync }),
        ...(show_activity !== undefined && { show_activity }),
        ...(visibility !== undefined && { visibility }),
      },
    });

    res.json({
      id: updated.id,
      type: updated.type,
      name: updated.name,
      friend_sync: updated.friend_sync,
      show_activity: updated.show_activity,
      visibility: updated.visibility,
      verified: updated.verified,
    });
  } catch (err) {
    next(err);
  }
}

// DELETE /api/users/@me/connections/:connectionId
export async function deleteConnection(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = (req as any).user?.userId;
    const { connectionId } = req.params;

    const account = await prisma.connectedAccount.findUnique({ where: { id: connectionId } });
    if (!account) throw new AppError(404, 'NOT_FOUND', 'Connection not found');
    if (account.user_id !== userId) throw new AppError(403, 'FORBIDDEN', 'Cannot delete another user\'s connection');

    await prisma.connectedAccount.delete({ where: { id: connectionId } });
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
}
