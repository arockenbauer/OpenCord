import bcrypt from 'bcrypt';
import crypto from 'crypto';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const ACCESS_TOKEN_EXPIRY_MS = 7 * 24 * 60 * 60 * 1000;
const CLIENT_CREDENTIALS_EXPIRY_MS = 1 * 60 * 60 * 1000;

export function parseJsonField(field: string): string[] {
  try {
    return JSON.parse(field) as string[];
  } catch {
    return [];
  }
}

export function stringifyJsonField(arr: string[]): string {
  return JSON.stringify(arr);
}

export async function validateRedirectUri(applicationId: string, redirectUri: string): Promise<boolean> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { redirect_uris: true },
  });
  if (!application) return false;
  const uris = parseJsonField((application.redirect_uris as string));
  return uris.includes(redirectUri);
}

export async function validateScopes(applicationId: string, scopes: string[]): Promise<boolean> {
  const application = await prisma.application.findUnique({
    where: { id: applicationId },
    select: { scopes_allowed: true },
  });
  if (!application) return false;
  const allowed = parseJsonField((application.scopes_allowed as string));
  return scopes.every((s) => allowed.includes(s));
}

export async function createAuthorizationCode(
  applicationId: string,
  userId: string,
  scopes: string[],
  redirectUri: string
): Promise<string> {
  const code = crypto.randomBytes(16).toString('hex');
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);

  await prisma.oAuth2AuthorizationCode.create({
    data: {
      id: crypto.randomBytes(16).toString('hex'),
      code,
      app_id: applicationId,
      user_id: userId,
      scopes: stringifyJsonField(scopes),
      redirect_uri: redirectUri,
      expires_at: expiresAt,
    },
  });

  return code;
}

export async function exchangeCodeForTokens(code: string, clientId: string, redirectUri: string) {
  const authCode = await prisma.oAuth2AuthorizationCode.findUnique({
    where: { code },
    include: { app: true, user: true },
  });

  if (!authCode) {
    throw new AppError(400, 'INVALID_CODE', 'Invalid or expired authorization code');
  }

  if (authCode.app_id !== clientId) {
    throw new AppError(400, 'INVALID_CLIENT', 'Client ID mismatch');
  }

  if (authCode.redirect_uri !== redirectUri) {
    throw new AppError(400, 'INVALID_REDIRECT', 'Redirect URI mismatch');
  }

  if (authCode.used) {
    throw new AppError(400, 'CODE_USED', 'Authorization code already used');
  }

  if (authCode.expires_at < new Date()) {
    throw new AppError(400, 'CODE_EXPIRED', 'Authorization code expired');
  }

  await prisma.oAuth2AuthorizationCode.update({
    where: { code },
    data: { used: true },
  });

  const scopes = parseJsonField(authCode.scopes);
  const accessToken = crypto.randomBytes(32).toString('hex');
  const refreshToken = crypto.randomBytes(32).toString('hex');
  const accessTokenHash = await bcrypt.hash(accessToken, 12);
  const refreshTokenHash = await bcrypt.hash(refreshToken, 12);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);

  await prisma.oAuth2AccessToken.create({
    data: {
      id: crypto.randomBytes(16).toString('hex'),
      app_id: clientId,
      user_id: authCode.user_id,
      token: accessTokenHash,
      refresh_token_hash: refreshTokenHash,
      scopes: stringifyJsonField(scopes),
      expires_at: expiresAt,
    },
  });

  return {
    token: accessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_MS / 1000,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  };
}

export async function refreshAccessToken(refreshToken: string, clientId: string) {
  const tokens = await prisma.oAuth2AccessToken.findMany({
    where: { app_id: clientId },
    include: { app: true },
  });

  let matchedToken = null;
  for (const t of tokens) {
    if (t.refresh_token_hash && await bcrypt.compare(refreshToken, t.refresh_token_hash)) {
      matchedToken = t;
      break;
    }
  }

  if (!matchedToken) {
    throw new AppError(400, 'INVALID_TOKEN', 'Invalid refresh token');
  }

  if (matchedToken.expires_at < new Date()) {
    throw new AppError(400, 'TOKEN_EXPIRED', 'Refresh token expired');
  }

  const scopes = parseJsonField(matchedToken.scopes);
  const newAccessToken = crypto.randomBytes(32).toString('hex');
  const newAccessTokenHash = await bcrypt.hash(newAccessToken, 12);
  const newRefreshToken = crypto.randomBytes(32).toString('hex');
  const newRefreshTokenHash = await bcrypt.hash(newRefreshToken, 12);
  const expiresAt = new Date(Date.now() + ACCESS_TOKEN_EXPIRY_MS);

  await prisma.oAuth2AccessToken.update({
    where: { id: matchedToken.id },
    data: {
      token: newAccessTokenHash,
      refresh_token_hash: newRefreshTokenHash,
      expires_at: expiresAt,
    },
  });

  return {
    token: newAccessToken,
    token_type: 'Bearer',
    expires_in: ACCESS_TOKEN_EXPIRY_MS / 1000,
    refresh_token: refreshToken,
    scope: scopes.join(' '),
  };
}

export async function clientCredentialsGrant(clientId: string, clientSecret: string, scope: string) {
  const application = await prisma.application.findUnique({
    where: { id: clientId },
  });

  if (!application || !application.client_secret) {
    throw new AppError(401, 'INVALID_CLIENT', 'Invalid client credentials');
  }

  const validSecret = await bcrypt.compare(clientSecret, application.client_secret);
  if (!validSecret) {
    throw new AppError(401, 'INVALID_CLIENT', 'Invalid client credentials');
  }

  const scopes = scope ? scope.split(' ') : [];
  const allowed = parseJsonField((application.scopes_allowed as string));
  const validScopes = scopes.filter((s) => allowed.includes(s));

  const accessToken = crypto.randomBytes(32).toString('hex');
  const accessTokenHash = await bcrypt.hash(accessToken, 12);
  const expiresAt = new Date(Date.now() + CLIENT_CREDENTIALS_EXPIRY_MS);

  await prisma.oAuth2AccessToken.create({
    data: {
      id: crypto.randomBytes(16).toString('hex'),
      app_id: clientId,
      user_id: application.id,
      token: accessTokenHash,
      scopes: stringifyJsonField(validScopes),
      expires_at: expiresAt,
    },
  });

  return {
    token: accessToken,
    token_type: 'Bearer',
    expires_in: CLIENT_CREDENTIALS_EXPIRY_MS / 1000,
    scope: validScopes.join(' '),
  };
}

export async function revokeToken(token: string, clientId: string, clientSecret: string) {
  const application = await prisma.application.findUnique({
    where: { id: clientId },
  });

  if (!application || !application.client_secret) {
    throw new AppError(401, 'INVALID_CLIENT', 'Invalid client credentials');
  }

  const validSecret = await bcrypt.compare(clientSecret, application.client_secret);
  if (!validSecret) {
    throw new AppError(401, 'INVALID_CLIENT', 'Invalid client credentials');
  }

  const tokens = await prisma.oAuth2AccessToken.findMany({
    where: { app_id: clientId },
  });

  for (const t of tokens) {
    if (await bcrypt.compare(token, t.token)) {
      await prisma.oAuth2AccessToken.delete({ where: { id: t.id } });
      return { success: true };
    }
    if (t.refresh_token_hash && await bcrypt.compare(token, t.refresh_token_hash)) {
      await prisma.oAuth2AccessToken.delete({ where: { id: t.id } });
      return { success: true };
    }
  }

  return { success: false };
}

export async function getTokenInfo(accessToken: string) {
  const tokens = await prisma.oAuth2AccessToken.findMany({
    include: { app: true, user: true },
  });

  for (const t of tokens) {
    if (await bcrypt.compare(accessToken, t.token)) {
      if (t.expires_at < new Date()) {
        throw new AppError(401, 'TOKEN_EXPIRED', 'Token expired');
      }
      return {
        application: {
          id: t.app.id,
          name: t.app.name,
          icon: t.app.icon,
        },
        user: t.user
          ? {
              id: t.user.id,
              username: t.user.username,
              discriminator: t.user.discriminator,
              avatar: t.user.avatar,
            }
          : null,
        scopes: parseJsonField(t.scopes),
        expires_at: t.expires_at,
      };
    }
  }

  throw new AppError(401, 'INVALID_TOKEN', 'Invalid access token');
}

export async function revokeAllUserGrants(userId: string, applicationId: string) {
  await prisma.oAuth2Grant.deleteMany({
    where: { user_id: userId, app_id: applicationId },
  });

  await prisma.oAuth2AccessToken.deleteMany({
    where: { user_id: userId, app_id: applicationId },
  });

  return { success: true };
}

export async function getUserGrants(userId: string) {
  const grants = await prisma.oAuth2Grant.findMany({
    where: { user_id: userId },
    include: { app: true },
  });

  return grants.map((g) => ({
    application: {
      id: g.app.id,
      name: g.app.name,
      icon: g.app.icon,
    },
    scopes: parseJsonField(g.scopes),
    created_at: g.created_at,
  }));
}
