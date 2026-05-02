import { Request, Response, NextFunction } from 'express';
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import { authenticator } from 'otplib';
import QRCode from 'qrcode';
import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';
import { AppError } from '../utils/app-error.js';
import { blacklistToken } from '../middleware/auth.middleware.js';
import { sendPasswordResetEmail, sendVerificationEmail } from '../utils/email.js';

const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret';
const JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || 'dev_refresh_secret';
const ACCESS_TOKEN_EXPIRY = '15m';
const REFRESH_TOKEN_EXPIRY_SECONDS = 7 * 24 * 60 * 60;
const PARTIAL_TOKEN_EXPIRY = '5m';
const BCRYPT_ROUNDS = 12;

function generateAccessToken(userId: string): string {
  return jwt.sign({ userId, type: 'access' }, JWT_SECRET, { expiresIn: ACCESS_TOKEN_EXPIRY, jwtid: uuidv4() });
}

function generateRefreshToken(userId: string): { token: string; tokenId: string } {
  const tokenId = uuidv4();
  const token = jwt.sign({ userId, tokenId, type: 'refresh' }, JWT_REFRESH_SECRET, { expiresIn: REFRESH_TOKEN_EXPIRY_SECONDS });
  return { token, tokenId };
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

    // Send verification email (logs in dev mode if SMTP not configured)
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

    res.status(201).json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        email: user.email,
        verified: user.verified,
        created_at: user.created_at,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

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
      if (attempts >= 5) {
        updateData.locked_until = new Date(Date.now() + 30 * 60 * 1000);
        updateData.login_attempts = 0;
      }
      await prisma.user.update({ where: { id: user.id }, data: updateData });
      throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid email or password');
    }

    await prisma.user.update({ where: { id: user.id }, data: { login_attempts: 0, locked_until: null, last_seen_at: new Date() } });

    if (user.two_factor_enabled) {
      const partialToken = jwt.sign({ userId: user.id, type: 'partial', twoFactorRequired: true }, JWT_SECRET, { expiresIn: PARTIAL_TOKEN_EXPIRY });
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

    res.json({
      user: {
        id: user.id,
        username: user.username,
        discriminator: user.discriminator,
        avatar: user.avatar,
        email: user.email,
      },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refresh_token } = req.body;

    let payload: any;
    try {
      payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired refresh token');
    }

    const tokenHash = hashToken(refresh_token);
    const stored = await prisma.refreshToken.findUnique({ where: { id: payload.tokenId } });

    if (!stored || stored.token_hash !== tokenHash) {
      throw new AppError(401, 'INVALID_TOKEN', 'Token not found');
    }
    if (stored.is_revoked) {
      throw new AppError(401, 'TOKEN_REVOKED', 'Token has been revoked');
    }
    if (stored.expires_at < new Date()) {
      throw new AppError(401, 'INVALID_TOKEN', 'Token expired');
    }

    await prisma.refreshToken.update({
      where: { id: stored.id },
      data: { is_revoked: true, last_used_at: new Date() },
    });

    const accessToken = generateAccessToken(payload.userId);
    const { token: newRefresh, tokenId } = generateRefreshToken(payload.userId);

    await prisma.refreshToken.create({
      data: {
        id: tokenId,
        user_id: payload.userId,
        token_hash: hashToken(newRefresh),
        device_info: req.headers['user-agent'] || null,
        ip_address: req.ip || null,
        expires_at: new Date(Date.now() + REFRESH_TOKEN_EXPIRY_SECONDS * 1000),
      },
    });

    res.json({ access_token: accessToken, refresh_token: newRefresh });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { refresh_token } = req.body;
    let payload: any;
    try {
      payload = jwt.verify(refresh_token, JWT_REFRESH_SECRET);
    } catch {
      res.status(204).send();
      return;
    }

    await prisma.refreshToken.updateMany({
      where: { id: payload.tokenId, user_id: req.user!.userId },
      data: { is_revoked: true },
    });

    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function logoutAll(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.refreshToken.updateMany({
      where: { user_id: req.user!.userId, is_revoked: false },
      data: { is_revoked: true },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function twoFactorEnable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (user.two_factor_enabled) throw new AppError(400, 'ALREADY_ENABLED', '2FA is already enabled');

    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    const secret = authenticator.generateSecret();
    const otpauthUri = authenticator.keyuri(user.email, 'OpenCord', secret);
    const qrCode = await QRCode.toDataURL(otpauthUri);

    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = `${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`;
      backupCodes.push(code);
      hashedBackupCodes.push(await bcrypt.hash(code, 10));
    }

    await prisma.user.update({
      where: { id: user.id },
      data: {
        two_factor_secret: secret,
        two_factor_backup_codes: JSON.stringify(hashedBackupCodes),
      },
    });

    res.json({ secret, otpauth_uri: otpauthUri, qr_code: qrCode, backup_codes: backupCodes });
  } catch (err) {
    next(err);
  }
}

export async function twoFactorVerify(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user || !user.two_factor_secret) throw new AppError(400, 'NO_2FA_PENDING', 'No 2FA setup pending');

    const isValid = authenticator.verify({ token: req.body.code, secret: user.two_factor_secret });
    if (!isValid) throw new AppError(400, 'INVALID_CODE', 'Invalid 2FA code');

    await prisma.user.update({ where: { id: user.id }, data: { two_factor_enabled: true } });

    await prisma.refreshToken.updateMany({
      where: { user_id: user.id, is_revoked: false },
      data: { is_revoked: true },
    });

    res.json({ two_factor_enabled: true, message: 'two_factor_activated' });
  } catch (err) {
    next(err);
  }
}

export async function twoFactorLogin(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { code, partial_token } = req.body;

    let payload: any;
    try {
      payload = jwt.verify(partial_token, JWT_SECRET);
    } catch {
      throw new AppError(401, 'INVALID_TOKEN', 'Invalid or expired partial token');
    }

    if (payload.type !== 'partial') throw new AppError(401, 'INVALID_TOKEN', 'Not a partial token');

    const user = await prisma.user.findUnique({ where: { id: payload.userId } });
    if (!user || !user.two_factor_secret) throw new AppError(400, 'INVALID_STATE', '2FA not configured');

    let isValid = authenticator.verify({ token: code, secret: user.two_factor_secret });

    if (!isValid && user.two_factor_backup_codes) {
      const backupCodes: string[] = JSON.parse(user.two_factor_backup_codes);
      for (let i = 0; i < backupCodes.length; i++) {
        if (await bcrypt.compare(code, backupCodes[i]!)) {
          isValid = true;
          backupCodes.splice(i, 1);
          await prisma.user.update({
            where: { id: user.id },
            data: { two_factor_backup_codes: JSON.stringify(backupCodes) },
          });
          break;
        }
      }
    }

    if (!isValid) throw new AppError(401, 'INVALID_CODE', 'Invalid 2FA code');

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

    res.json({
      user: { id: user.id, username: user.username, discriminator: user.discriminator, avatar: user.avatar, email: user.email },
      access_token: accessToken,
      refresh_token: refreshToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function twoFactorDisable(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    // Verify 2FA code if 2FA is currently enabled
    if (user.two_factor_enabled && user.two_factor_secret) {
      if (!req.body.code) {
        throw new AppError(400, 'MISSING_2FA_CODE', '2FA code is required to disable 2FA');
      }
      const isValid = authenticator.verify({ token: req.body.code, secret: user.two_factor_secret });
      if (!isValid) throw new AppError(401, 'INVALID_2FA_CODE', 'Invalid 2FA code');
    }

    await prisma.user.update({
      where: { id: user.id },
      data: { two_factor_enabled: false, two_factor_secret: null, two_factor_backup_codes: null },
    });

    res.json({ two_factor_enabled: false });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');

    const valid = await bcrypt.compare(req.body.old_password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid current password');

    const newHash = await bcrypt.hash(req.body.new_password, BCRYPT_ROUNDS);
    await prisma.user.update({ where: { id: user.id }, data: { password_hash: newHash } });

    await prisma.refreshToken.updateMany({
      where: { user_id: user.id, is_revoked: false },
      data: { is_revoked: true },
    });

    res.json({ message: 'password_changed' });
  } catch (err) {
    next(err);
  }
}

export async function getSessions(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const sessions = await prisma.refreshToken.findMany({
      where: { user_id: req.user!.userId, is_revoked: false, expires_at: { gt: new Date() } },
      select: { id: true, device_info: true, ip_address: true, last_used_at: true, created_at: true },
      orderBy: { last_used_at: 'desc' },
    });
    res.json({ sessions });
  } catch (err) {
    next(err);
  }
}

export async function revokeSession(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    await prisma.refreshToken.updateMany({
      where: { id: req.params.sessionId, user_id: req.user!.userId },
      data: { is_revoked: true },
    });
    res.status(204).send();
  } catch (err) {
    next(err);
  }
}

export async function requestPasswordReset(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });

    // Security: don't reveal if email exists
    if (user && !user.disabled && !user.banned) {
      const token = uuidv4();
      const tokenHash = hashToken(token);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password_reset_token: tokenHash,
          password_reset_expires: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      await sendPasswordResetEmail(user.email, token, user.username);
    }

    res.json({ message: 'reset_email_sent' });
  } catch (err) {
    next(err);
  }
}

export async function resetPassword(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token, new_password } = req.body;
    if (!token || !new_password || new_password.length < 8) {
      throw new AppError(400, 'INVALID_INPUT', 'Token and password (min 8 chars) are required');
    }

    const tokenHash = hashToken(token);
    const user = await prisma.user.findFirst({
      where: {
        password_reset_token: tokenHash,
        password_reset_expires: { gt: new Date() },
      },
    });
    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or expired reset token');

    const newHash = await bcrypt.hash(new_password, BCRYPT_ROUNDS);
    await prisma.user.update({
      where: { id: user.id },
      data: {
        password_hash: newHash,
        password_reset_token: null,
        password_reset_expires: null,
      },
    });

    await prisma.refreshToken.updateMany({
      where: { user_id: user.id, is_revoked: false },
      data: { is_revoked: true },
    });

    res.json({ message: 'password_reset_success' });
  } catch (err) {
    next(err);
  }
}

export async function verifyEmail(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { token } = req.body;
    if (!token) throw new AppError(400, 'INVALID_INPUT', 'Token is required');

    const user = await prisma.user.findFirst({
      where: { email_verify_token: token, verified: false },
    });
    if (!user) throw new AppError(400, 'INVALID_TOKEN', 'Invalid or already used verification token');

    await prisma.user.update({
      where: { id: user.id },
      data: { verified: true, email_verify_token: null },
    });

    res.json({ message: 'email_verified' });
  } catch (err) {
    next(err);
  }
}

export async function regenerateBackupCodes(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user!.userId } });
    if (!user) throw new AppError(404, 'USER_NOT_FOUND', 'User not found');
    if (!user.two_factor_enabled) throw new AppError(400, 'TWO_FA_NOT_ENABLED', '2FA is not enabled');

    const valid = await bcrypt.compare(req.body.password, user.password_hash);
    if (!valid) throw new AppError(401, 'INVALID_CREDENTIALS', 'Invalid password');

    const backupCodes: string[] = [];
    const hashedBackupCodes: string[] = [];
    for (let i = 0; i < 10; i++) {
      const code = `${crypto.randomBytes(2).toString('hex')}-${crypto.randomBytes(2).toString('hex')}`;
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
