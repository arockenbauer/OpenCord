import { Request, Response, NextFunction } from 'express';
import * as bcrypt from 'bcrypt';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const jwt = require('jsonwebtoken');
import * as crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import * as QRCode from 'qrcode';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { blacklistToken } from '../middleware/auth.middleware.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../utils/email.js';

const JWT_ACCESS_SECRET = process.env.JWT_ACCESS_SECRET || process.env.JWT_SECRET;
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;

if (process.env.NODE_ENV === 'production' && (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET)) {
  throw new Error('JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be set in production');
}

const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_SECONDS = 30 * 24 * 60 * 60;
const PARTIAL_TOKEN_EXPIRY = '5m';
const BCRYPT_ROUNDS = 12;

function generateAccessToken(userId: string): string {
  if (!JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET is not configured');
  return jwt.sign({ userId: userId, type: 'access' }, JWT_ACCESS_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY, jwtid: uuidv4() });
}

function generateRefreshToken(userId: string): { token: string; tokenId: string } {
  if (!JWT_REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET is not configured');
  const tokenId = uuidv4();
  const token = jwt.sign({ userId: userId, tokenId: tokenId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS });
  return { token: token, tokenId: tokenId };
}

function generatePartialToken(userId: string): string {
  if (!JWT_ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET is not configured');
  return jwt.sign({ userId: userId, type: 'partial', twoFactorRequired: true }, JWT_ACCESS_SECRET, { expiresIn: PARTIAL_TOKEN_EXPIRY });
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

async function findAvailableDiscriminator(username: string): Promise<string | null> {
  const taken = await prisma.user.findMany({ where: { username }, select: { discriminator: true } });
  const takenSet = new Set(taken.map((u) => u.discriminator));
  const available: string[] = [];
  for (let i = 1; i <= 9999; i++) {
    const d = String(i).padStart(4, '0');
    if (!takenSet.has(d)) available.push(d);
  }
  if (available.length === 0) return null;
  return available[Math.floor(Math.random() * available.length)]!;
}

// 4.1 Inscription
export async function register(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, username, password, date_of_birth } = req.body;

    const existing = await prisma.user.findUnique({ where: { email } });
    if (existing) {
      if (existing.banned || existing.disabled) {
        throw new AppError(403, 'ACCOUNT_BANNED', 'This account is banned or disabled');
      }
      throw new AppError(409, 'EMAIL_TAKEN', 'Email already in use');
    }

    const discriminator = await findAvailableDiscriminator(username);
    if (!discriminator) throw new AppError(409, 'USERNAME_TAKEN', 'All discriminators taken for this username');

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = generateSnowflake();

    const user = await prisma.user.create({
      data: {
        id: userId,
        email,
        username,
        discriminator,
        password_hash: passwordHash,
        date_of_birth: new Date(date_of_birth),
        verified: false,
        email_verify_token: uuidv4(),
      },
    });

    await sendVerificationEmail(user.email, user.email_verify_token!, user.username);

    const accessToken = generateAccessToken(user.id);
    const { token: refreshToken, tokenId } = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        user_id: user.id,
        token_hash: hashToken(refreshToken),
        device_info: req.headers['user-agent'] || null,
        ip_address: req.ip || null,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      },
    });

    res.cookie('access_token', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000 });

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        email: user.email,
        verified: user.verified,
        created_at: user.created_at,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 4.2 Connexion
export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    if (user.disabled) throw new AppError(403, 'ACCOUNT_DISABLED', 'Account is disabled');
    if (user.banned) throw new AppError(403, 'ACCOUNT_BANNED', 'Account is banned');

    if (user.locked_until && user.locked_until > new Date()) {
      throw new AppError(403, 'ACCOUNT_LOCKED', 'Account is temporarily locked');
    }

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) {
      const attempts = user.login_attempts + 1;
      const updateData: any = { login_attempts: attempts };
      if (attempts >= 10) {
        updateData.locked_until = new Date(Date.now() + 30 * 60 * 1000);
        updateData.login_attempts = 0;
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    await prisma.user.update({ where: { id: user.id }, data: { login_attempts: 0, locked_until: null, last_seen_at: new Date() } });

    if (user.two_factor_enabled) {
      const partialToken = generatePartialToken(user.id);
      res.json({ two_factor_required: true, partial_token: partialToken });
      return;
    }

    const accessToken = generateAccessToken(user.id);
    const { token: refreshToken, tokenId } = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        user_id: user.id,
        token_hash: hashToken(refreshToken),
        device_info: req.headers['user-agent'] || null,
        ip_address: req.ip || null,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      },
    });

    res.cookie('access_token', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000 });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
      },
    });
  } catch (err) {
    next(err);
  }
}

// 4.3 Rafraîchissement du Token
export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refresh_token } = req.body;
    if (!refresh_token) throw new AppError(400, 'INVALID_TOKEN', 'Refresh token required');

    if (!JWT_REFRESH_SECRET) throw new AppError(500, 'INTERNAL_ERROR', 'JWT_REFRESH_SECRET not configured');
    const payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET) as { userId: string; tokenId: string; type: string };

    if (payload.type !== 'refresh') throw new AppError(401, 'INVALID_TOKEN', 'Invalid token type');

    const storedToken = await prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });
    if (!storedToken) throw new AppError(401, 'INVALID_TOKEN', 'Token not found');
    if (storedToken.is_revoked) throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');
    if (storedToken.expires_at < new Date()) throw new AppError(401, 'INVALID_TOKEN', 'Token expired');

    // Invalider l'ancien token
    await prisma.refreshToken.update({ where: { id: storedToken.id }, data: { is_revoked: true, last_used_at: new Date() } });

    // Générer une nouvelle paire
    const newAccessToken = generateAccessToken(payload.userId);
    const { token: newRefreshToken, tokenId: newTokenId } = generateRefreshToken(payload.userId);

    await prisma.refreshToken.create({
      data: {
        id: newTokenId,
        user_id: payload.userId,
        token_hash: hashToken(newRefreshToken),
        device_info: req.headers['user-agent'] || null,
        ip_address: req.ip || null,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      },
    });

    res.cookie('access_token', newAccessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', newRefreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000 });

    res.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(new AppError(401, 'TOKEN_EXPIRED', 'Token expired'));
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError(401, 'INVALID_TOKEN', 'Invalid token'));
    next(err);
  }
}

// 4.4 Déconnexion
export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const refreshToken = req.cookies?.refresh_token;
    if (refreshToken && JWT_REFRESH_SECRET) {
      try {
        const payload = jwt.verify(refreshToken, JWT_REFRESH_SECRET) as { tokenId: string };
        await prisma.refreshToken.updateMany({ where: { id: payload.tokenId, is_revoked: false }, data: { is_revoked: true } });
      } catch {
        // Ignore token errors during logout
      }
    }

    res.clearCookie('access_token');
    res.clearCookie('refresh_token');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// 4.5 Déconnexion de tous les appareils
export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');

    await prisma.refreshToken.updateMany({ where: { user_id: req.user.userId, is_revoked: false }, data: { is_revoked: true } });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

// 5.1 Activation de la 2FA
export async function twoFactorEnable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');

    const valid = await bcrypt.compare(password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    const secret = authenticator.generateSecret();
    const otpauth = authenticator.keyuri(user.email, 'OpenCord', secret);
    const qrCode = await QRCode.toDataURL(otpauth);

    // Générer 10 codes de secours
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(2).toString('hex').slice(0, 4) + '-' + crypto.randomBytes(2).toString('hex').slice(0, 4);
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    // Stocker temporairement (pas encore activé)
    await prisma.user.update({
      where: { id: user.id },
      data: {
        two_factor_secret: secret,
        two_factor_backup_codes: JSON.stringify(hashedBackupCodes),
      },
    });

    res.json({
      secret,
      otpauth_uri: otpauth,
      qr_code: qrCode,
      backup_codes: backupCodes,
    });
  } catch (err) {
    next(err);
  }
}

// 5.2 Confirmation de l'activation
export async function twoFactorVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const { code } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');
    if (!user.two_factor_secret) throw new AppError(400, '2FA_NOT_INITIALIZED', '2FA not initialized');

    const isValid = authenticator.verify({ token: code, secret: user.two_factor_secret });
    if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');

    // Activer la 2FA
    await prisma.user.update({
      where: { id: user.id },
      data: { two_factor_enabled: true },
    });

    // Invalider tous les refresh tokens existants (forcer re-login)
    await prisma.refreshToken.updateMany({ where: { user_id: user.id, is_revoked: false }, data: { is_revoked: true } });

    res.json({ two_factor_enabled: true, message: 'two_factor_activated' });
  } catch (err) {
    next(err);
  }
}

// 5.3 Connexion avec 2FA
export async function twoFactorLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, partial_token } = req.body;
    if (!partial_token) throw new AppError(400, 'INVALID_TOKEN', 'Partial token required');

    if (!JWT_ACCESS_SECRET) throw new AppError(500, 'INTERNAL_ERROR', 'JWT_ACCESS_SECRET not configured');
    const payload = jwt.verify(partial_token, JWT_ACCESS_SECRET) as { userId: string; type: string };

    if (payload.type !== 'partial') throw new AppError(401, 'INVALID_TOKEN', 'Invalid token type');

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');
    if (!user.two_factor_enabled || !user.two_factor_secret) throw new AppError(400, '2FA_NOT_ENABLED', '2FA not enabled');

    // Vérifier si c'est un code TOTP (6 chiffres) ou un code de secours
    const isTOTP = /^\d{6}$/.test(code);
    let valid = false;

    if (isTOTP) {
      valid = authenticator.verify({ token: code, secret: user.two_factor_secret });
    } else {
      // Code de secours (format xxxx-xxxx)
      if (user.two_factor_backup_codes) {
        const hashedCodes: string[] = JSON.parse(user.two_factor_backup_codes);
        for (const hashedCode of hashedCodes) {
          if (await bcrypt.compare(code, hashedCode)) {
            valid = true;
            // Retirer le code utilisé
            const newCodes = hashedCodes.filter((c) => c !== hashedCode);
            await prisma.user.update({ where: { id: user.id }, data: { two_factor_backup_codes: JSON.stringify(newCodes) } });
            break;
          }
        }
      }
    }

    if (!valid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');

    // Générer les tokens complets
    const accessToken = generateAccessToken(user.id);
    const { token: refreshToken, tokenId } = generateRefreshToken(user.id);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        user_id: user.id,
        token_hash: hashToken(refreshToken),
        device_info: req.headers['user-agent'] || null,
        ip_address: req.ip || null,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      },
    });

    res.cookie('access_token', accessToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: 15 * 60 * 1000 });
    res.cookie('refresh_token', refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax', maxAge: REFRESH_TOKEN_EXPIRY_SECONDS * 1000 });

    res.json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
      },
    });
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) return next(new AppError(401, 'TOKEN_EXPIRED', 'Token expired'));
    if (err instanceof jwt.JsonWebTokenError) return next(new AppError(401, 'INVALID_TOKEN', 'Invalid token'));
    next(err);
  }
}

// 5.4 Désactivation de la 2FA
export async function twoFactorDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const { password, code } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    // Vérifier le code 2FA
    if (user.two_factor_secret) {
      const isValid = authenticator.verify({ token: code, secret: user.two_factor_secret });
      if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        two_factor_enabled: false,
        two_factor_secret: null,
        two_factor_backup_codes: null,
      },
    });

    res.json({ two_factor_enabled: false });
  } catch (err) {
    next(err);
  }
}

// 5.5 Régénération des codes de secours
export async function regenerateBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const { password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');

    const validPass = await bcrypt.compare(password, user.password_hash);
    if (!validPass) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    // Générer 10 nouveaux codes
    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = crypto.randomBytes(2).toString('hex').slice(0, 4) + '-' + crypto.randomBytes(2).toString('hex').slice(0, 4);
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { two_factor_backup_codes: JSON.stringify(hashedBackupCodes) },
    });

    res.json({ backup_codes: backupCodes });
  } catch (err) {
    next(err);
  }
}

// 6.1 Changement de mot de passe (authentifié)
export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) throw new AppError(401, 'UNAUTHORIZED', 'Not authenticated');
    const { old_password, new_password } = req.body;

    const user = await prisma.user.findUnique({ where: { id: req.user.userId } });
    if (!user) throw new AppError(401, 'UNAUTHORIZED', 'User not found');

    const valid = await bcrypt.compare(old_password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid old password');

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });

    // Révoquer tous les refresh tokens sauf le courant (si possible)
    await prisma.refreshToken.updateMany({ where: { user_id: user.id, is_revoked: false }, data: { is_revoked: true } });

    res.json({ message: 'password_changed' });
  } catch (err) {
    next(err);
  }
}

// 6.2 Réinitialisation du mot de passe (non authentifié)
export async function requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    // Toujours retourner 200 pour éviter l'énumération d'emails
    if (!user) {
      res.json({ message: 'reset_email_sent' });
      return;
    }

    const token = uuidv4();
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 heure

    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_reset_token: token,
        password_reset_expires: expires,
      },
    });

    await sendPasswordResetEmail(user.email, token, user.username);

    res.json({ message: 'reset_email_sent' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, new_password } = req.body;

    const user = await prisma.user.findFirst({
      where: {
        password_reset_token: token,
        password_reset_expires: { gt: new Date() },
      },
    });

    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired token');

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newHash,
        password_reset_token: null,
        password_reset_expires: null,
      },
    });

    // Révoquer tous les refresh tokens
    await prisma.refreshToken.updateMany({ where: { user_id: user.id, is_revoked: false }, data: { is_revoked: true } });

    res.json({ message: 'password_reset_success' });
  } catch (err) {
    next(err);
  }
}

// 7. Vérification d'Email
export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;

    const user = await prisma.user.findFirst({ where: { email_verify_token: token } });
    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'Invalid token');

    await prisma.user.update({
      where: { id: user.id },
      data: {
        verified: true,
        email_verify_token: null,
      },
    });

    res.json({ message: 'email_verified' });
  } catch (err) {
    next(err);
  }
}

// Get user sessions (refresh tokens)
export async function getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const sessions = await prisma.refreshToken.findMany({
      where: { user_id: userId, is_revoked: false },
      orderBy: { created_at: 'desc' },
    });
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

// Revoke a session (refresh token)
export async function revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const userId = req.user!.userId;
    const sessionId = req.params.sessionId;
    const session = await prisma.refreshToken.findUnique({ where: { id: sessionId } });
    if (!session) throw new AppError(404, 'SESSION_NOT_FOUND', 'Session not found');
    if (session.user_id !== userId) throw new AppError(403, 'FORBIDDEN', 'Cannot revoke another user\'s session');
    await prisma.refreshToken.update({ where: { id: sessionId }, data: { is_revoked: true } });
    res.json({ message: 'session_revoked' });
  } catch (err) {
    next(err);
  }
}
