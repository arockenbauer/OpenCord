import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    refreshToken: { findFirst: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  jwt: {
    verify: vi.fn(),
  },
  AppError: vi.fn().mockImplementation((status, code, msg) => ({ statusCode: status, code, message: msg })),
}));

vi.mock('../utils/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('jsonwebtoken', () => mocks.jwt);
vi.mock('../utils/app-error.js', () => ({ AppError: mocks.AppError }));

import { authenticateToken, requireAuth, optionalAuth } from './auth.middleware.js';

describe('auth.middleware', () => {
  let req: any, res: any, next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { headers: {}, ip: '127.0.0.1' };
    res = { status: vi.fn(() => res), json: vi.fn(() => res) };
    next = vi.fn();
  });

  describe('authenticateToken', () => {
    it('returns 401 if no token provided', async () => {
      await authenticateToken(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('authenticates with valid access token', async () => {
      req.headers.authorization = 'Bearer valid-token';
      mocks.jwt.verify.mockReturnValue({ userId: 'user-1' });
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', admin_level: 0 });

      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
      expect(req.user).toBeDefined();
    });

    it('falls back to refresh token', async () => {
      req.cookies = { refresh_token: 'refresh-token' };
      mocks.prisma.refreshToken.findFirst.mockResolvedValue({
        user_id: 'user-1',
        user: { id: 'user-1' },
      });

      await authenticateToken(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });

  describe('requireAuth', () => {
    it('calls next if user is authenticated', () => {
      req.user = { id: 'user-1' };
      requireAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });

    it('returns 401 if user not authenticated', () => {
      requireAuth(req, res, next);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });

  describe('optionalAuth', () => {
    it('calls next with or without user', () => {
      optionalAuth(req, res, next);
      expect(next).toHaveBeenCalled();
    });
  });
});
