import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    application: {
      findUnique: vi.fn(),
    },
    oAuth2AuthorizationCode: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

import {
  exchangeCodeForTokens,
  parseJsonField,
  stringifyJsonField,
  validateRedirectUri,
  validateScopes,
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

  describe('exchangeCodeForTokens', () => {
    it('throws an application error when the authorization code is missing', async () => {
      mocks.prisma.oAuth2AuthorizationCode.findUnique.mockResolvedValue(null);

      await expect(exchangeCodeForTokens('missing-code', 'app-1', 'https://app.test/callback'))
        .rejects.toEqual(new AppError(400, 'INVALID_CODE', 'Invalid or expired authorization code'));
    });
  });
});
