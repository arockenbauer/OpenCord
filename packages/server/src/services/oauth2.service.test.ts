import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    oAuth2AuthorizationCode: {
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
      findMany: vi.fn((): any[] => []),
    },
    oAuth2AccessToken: {
      findMany: vi.fn((): any[] => []),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
      delete: vi.fn(),
    },
    oAuth2Grant: {
      findMany: vi.fn((): any[] => []),
      deleteMany: vi.fn(),
    },
  },
  bcrypt: {
    hash: vi.fn(() => 'hashed'),
    compare: vi.fn(() => false),
  },
  crypto: {
    randomBytes: vi.fn(() => ({ toString: () => 'random-token' })),
  },
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('bcrypt', () => ({
  default: mocks.bcrypt,
}));

vi.mock('crypto', () => ({
  default: mocks.crypto,
}));

import {
  exchangeCodeForTokens,
  parseJsonField,
  stringifyJsonField,
  validateRedirectUri,
  validateScopes,
  refreshAccessToken,
  clientCredentialsGrant,
  revokeToken,
  getTokenInfo,
  revokeAllUserGrants,
  getUserGrants,
  createAuthorizationCode,
} from './oauth2.service.js';

describe('oauth2.service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('parseJsonField', () => {
    it('parses JSON arrays and falls back to an empty array on invalid input', () => {
      expect(parseJsonField('["identify","email"]')).toEqual(['identify', 'email']);
      expect(parseJsonField('invalid-json')).toEqual([]);
    });
  });

  describe('stringifyJsonField', () => {
    it('serializes scopes as JSON', () => {
      expect(stringifyJsonField(['identify', 'email'])).toBe('["identify","email"]');
    });
  });

  describe('validateRedirectUri', () => {
    it('returns true only when the redirect uri is registered', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        redirect_uris: '["https://app.test/callback","https://app.test/alt"]',
      });

      await expect(validateRedirectUri('app-1', 'https://app.test/callback')).resolves.toBe(true);
      await expect(validateRedirectUri('app-1', 'https://evil.test/callback')).resolves.toBe(false);
    });
  });

  describe('validateScopes', () => {
    it('ensures every requested scope is allowed by the application', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        scopes_allowed: '["identify","email","guilds"]',
      });

      await expect(validateScopes('app-1', ['identify', 'email'])).resolves.toBe(true);
      await expect(validateScopes('app-1', ['identify', 'admin'])).resolves.toBe(false);
    });
  });

  describe('createAuthorizationCode', () => {
    it('creates an authorization code with expiry', async () => {
      mocks.prisma.oAuth2AuthorizationCode.create.mockResolvedValue({});
      const code = await createAuthorizationCode('app-1', 'user-1', ['identify'], 'https://app.test/callback');
      expect(code).toBe('random-token');
      expect(mocks.prisma.oAuth2AuthorizationCode.create).toHaveBeenCalled();
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('throws an application error when the authorization code is missing', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue(null);

      await expect(exchangeCodeForTokens('missing-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Invalid or expired authorization code');
    });

    it('throws when client ID mismatches', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue({
        app_id: 'other-app',
        user: { id: 'user-1' },
        scopes: '["identify"]',
        redirect_uri: 'https://app.test/callback',
        used: false,
        expires_at: new Date(Date.now() + 10000),
      });

      await expect(exchangeCodeForTokens('valid-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Client ID mismatch');
    });
  });

  describe('refreshAccessToken', () => {
    it('throws when no matching refresh token is found', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);
      await expect(refreshAccessToken('invalid-refresh', 'app-1'))
        .rejects.toThrow('Invalid refresh token');
    });
  });

  describe('clientCredentialsGrant', () => {
    it('throws when client credentials are invalid', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue(null);
      await expect(clientCredentialsGrant('app-1', 'secret', 'identify'))
        .rejects.toThrow('Invalid client credentials');
    });
  });

  describe('revokeToken', () => {
    it('returns success false when token is not found', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({ client_secret: 'hashed' });
      mocks.bcrypt.compare
        .mockResolvedValueOnce(true) // client secret valid
        .mockResolvedValue(false); // token not found
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);
      const result = await revokeToken('invalid-token', 'app-1', 'secret');
      expect(result.success).toBe(false);
    });

    it('throws when client credentials are invalid', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue(null);
      await expect(revokeToken('token', 'app-1', 'secret'))
        .rejects.toThrow('Invalid client credentials');
    });
  });

  describe('getTokenInfo', () => {
    it('throws when token is invalid', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);
      await expect(getTokenInfo('invalid-token'))
        .rejects.toThrow('Invalid access token');
    });
  });

  describe('revokeAllUserGrants', () => {
    it('deletes all grants and tokens for a user and application', async () => {
      await revokeAllUserGrants('user-1', 'app-1');
      expect(mocks.prisma.oAuth2Grant.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', app_id: 'app-1' },
      });
      expect(mocks.prisma.oAuth2AccessToken.deleteMany).toHaveBeenCalledWith({
        where: { user_id: 'user-1', app_id: 'app-1' },
      });
    });
  });

  describe('getUserGrants', () => {
    it('returns mapped grants with application info', async () => {
      mocks.prisma.oAuth2Grant.findMany.mockResolvedValue([
        {
          app: { id: 'app-1', name: 'Test App', icon: null },
          scopes: '["identify"]',
          created_at: new Date(),
        },
      ]);
      const grants = await getUserGrants('user-1');
      expect(grants).toBeInstanceOf(Array);
      expect(grants[0]?.application.id).toBe('app-1');
    });
  });
});
