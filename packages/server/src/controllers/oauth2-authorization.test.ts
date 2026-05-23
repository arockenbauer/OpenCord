import { describe, expect, it, beforeEach, vi } from 'vitest';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    oAuth2AuthorizationCode: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    oAuth2AccessToken: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
    },
  },
  bcrypt: {
    compare: vi.fn(),
    hash: vi.fn(),
  },
  crypto: {
    randomBytes: vi.fn(() => ({ toString: () => 'auth-code-123' })),
  },
  jwt: {
    sign: vi.fn(() => 'jwt-token'),
    verify: vi.fn(),
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

vi.mock('jsonwebtoken', () => ({
  default: mocks.jwt,
}));

import {
  validateRedirectUri,
  validateScopes,
  createAuthorizationCode,
  exchangeCodeForTokens,
  refreshAccessToken,
  clientCredentialsGrant,
  revokeToken,
  getTokenInfo,
} from './oauth2.service.js';

describe('OAuth2 authorization flow', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('validateRedirectUri', () => {
    it('returns true for registered redirect URI', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        redirect_uris: '["https://app.test/callback","https://app.test/alt"]',
      });

      const result = await validateRedirectUri('app-1', 'https://app.test/callback');
      expect(result).toBe(true);
    });

    it('returns false for unregistered redirect URI', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        redirect_uris: '["https://app.test/callback"]',
      });

      const result = await validateRedirectUri('app-1', 'https://evil.test/callback');
      expect(result).toBe(false);
    });

    it('handles invalid JSON in redirect_uris', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        redirect_uris: 'invalid-json',
      });

      const result = await validateRedirectUri('app-1', 'https://app.test/callback');
      expect(result).toBe(false);
    });
  });

  describe('validateScopes', () => {
    it('allows requested scopes that are permitted', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        scopes_allowed: '["identify","email","guilds"]',
      });

      const result = await validateScopes('app-1', ['identify', 'email']);
      expect(result).toBe(true);
    });

    it('denies requested scopes that are not permitted', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        scopes_allowed: '["identify","email"]',
      });

      const result = await validateScopes('app-1', ['identify', 'admin']);
      expect(result).toBe(false);
    });

    it('handles empty scopes', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        scopes_allowed: '["identify"]',
      });

      const result = await validateScopes('app-1', []);
      expect(result).toBe(true);
    });
  });

  describe('createAuthorizationCode', () => {
    it('creates authorization code with correct expiry', async () => {
      mocks.prisma.oAuth2AuthorizationCode.create.mockResolvedValue({});

      const code = await createAuthorizationCode('app-1', 'user-1', ['identify'], 'https://app.test/callback');

      expect(code).toBe('auth-code-123');
      expect(mocks.prisma.oAuth2AuthorizationCode.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          app_id: 'app-1',
          user_id: 'user-1',
          scopes: '["identify"]',
          redirect_uri: 'https://app.test/callback',
          used: false,
        }),
      });
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('throws when authorization code is missing', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue(null);

      await expect(exchangeCodeForTokens('missing-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Invalid or expired authorization code');
    });

    it('throws when code is already used', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue({
        app_id: 'app-1',
        used: true,
        expires_at: new Date(Date.now() + 10000),
      });

      await expect(exchangeCodeForTokens('used-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Authorization code already used');
    });

    it('throws when code is expired', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue({
        app_id: 'app-1',
        used: false,
        expires_at: new Date(Date.now() - 10000), // Past
      });

      await expect(exchangeCodeForTokens('expired-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Invalid or expired authorization code');
    });

    it('throws when client ID mismatches', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue({
        app_id: 'other-app',
        used: false,
        expires_at: new Date(Date.now() + 10000),
      });

      await expect(exchangeCodeForTokens('valid-code', 'app-1', 'https://app.test/callback'))
        .rejects.toThrow('Client ID mismatch');
    });

    it('throws when redirect URI mismatches', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue({
        app_id: 'app-1',
        used: false,
        expires_at: new Date(Date.now() + 10000),
        redirect_uri: 'https://app.test/callback',
      });

      await expect(exchangeCodeForTokens('valid-code', 'app-1', 'https://evil.test/callback'))
        .rejects.toThrow('Redirect URI mismatch');
    });
  });

  describe('refreshAccessToken', () => {
    it('throws when no matching refresh token is found', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);

      await expect(refreshAccessToken('invalid-refresh', 'app-1'))
        .rejects.toThrow('Invalid refresh token');
    });

    it('throws when refresh token is expired', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([
        {
          token_hash: 'hashed',
          expires_at: new Date(Date.now() - 10000), // Past
          revoked: false,
        },
      ]);

      await expect(refreshAccessToken('expired-refresh', 'app-1'))
        .rejects.toThrow('Refresh token expired');
    });

    it('throws when refresh token is revoked', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([
        {
          token_hash: 'hashed',
          expires_at: new Date(Date.now() + 10000),
          revoked: true,
        },
      ]);

      await expect(refreshAccessToken('revoked-refresh', 'app-1'))
        .rejects.toThrow('Refresh token revoked');
    });
  });

  describe('clientCredentialsGrant', () => {
    it('throws when client credentials are invalid', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue(null);

      await expect(clientCredentialsGrant('app-1', 'wrong-secret', 'identify'))
        .rejects.toThrow('Invalid client credentials');
    });

    it('throws when client secret does not match', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        client_secret: 'hashed-secret',
      });
      mocks.bcrypt.compare.mockResolvedValue(false);

      await expect(clientCredentialsGrant('app-1', 'wrong-secret', 'identify'))
        .rejects.toThrow('Invalid client credentials');
    });
  });

  describe('revokeToken', () => {
    it('returns success false when token is not found', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        client_secret: 'hashed',
      });
      mocks.bcrypt.compare
        .mockResolvedValueOnce(true) // client secret valid
        .mockResolvedValue(false); // token not found
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);

      const result = await revokeToken('invalid-token', 'app-1', 'secret');
      expect(result.success).toBe(false);
    });

    it('revokes token successfully', async () => {
      mocks.prisma.application.findUnique.mockResolvedValue({
        client_secret: 'hashed',
      });
      mocks.bcrypt.compare
        .mockResolvedValueOnce(true) // client secret valid
        .mockResolvedValueOnce(true); // token valid
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([
        { id: 'token-1', revoked: false },
      ]);

      const result = await revokeToken('valid-token', 'app-1', 'secret');
      expect(result.success).toBe(true);
      expect(mocks.prisma.oAuth2AccessToken.update).toHaveBeenCalledWith({
        where: { id: 'token-1' },
        data: { revoked: true },
      });
    });
  });

  describe('getTokenInfo', () => {
    it('throws when token is invalid', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([]);

      await expect(getTokenInfo('invalid-token'))
        .rejects.toThrow('Invalid access token');
    });

    it('returns token info when valid', async () => {
      mocks.prisma.oAuth2AccessToken.findMany.mockResolvedValue([
        {
          id: 'token-1',
          app_id: 'app-1',
          user_id: 'user-1',
          scopes: '["identify"]',
          expires_at: new Date(Date.now() + 10000),
          revoked: false,
          app: { id: 'app-1', name: 'Test App' },
        },
      ]);

      const info = await getTokenInfo('valid-token');
      expect(info.app_id).toBe('app-1');
      expect(info.user_id).toBe('user-1');
    });
  });
});
