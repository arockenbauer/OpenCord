import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: { findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() },
    refreshToken: { create: vi.fn(), findFirst: vi.fn(), deleteMany: vi.fn() },
    session: { create: vi.fn(), findMany: vi.fn() },
    dataExport: { findFirst: vi.fn() },
    auditLog: { findMany: vi.fn() },
  },
  bcrypt: { hash: vi.fn(() => 'hashed'), compare: vi.fn(() => true) },
  jwt: { sign: vi.fn(() => 'token'), verify: vi.fn() },
  generateSnowflake: vi.fn(() => 'snowflake-123'),
  AppError: vi.fn().mockImplementation((status, code, msg) => ({ statusCode: status, code, message: msg })),
  setTokens: vi.fn(),
  clearTokens: vi.fn(),
  logInfo: vi.fn(),
  logWarn: vi.fn(),
  logError: vi.fn(),
  createGuildAuditLog: vi.fn().mockResolvedValue(undefined),
  createAdminAuditLog: vi.fn().mockResolvedValue(undefined),
  getIO: vi.fn(() => null),
  sendEmail: vi.fn().mockResolvedValue(undefined),
  blacklistToken: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('bcrypt', () => mocks.bcrypt);
vi.mock('jsonwebtoken', () => mocks.jwt);
vi.mock('../utils/snowflake.js', () => ({ generateSnowflake: mocks.generateSnowflake }));
vi.mock('../utils/app-error.js', () => ({ AppError: mocks.AppError }));
vi.mock('../services/auth.service.js', () => ({
  setTokens: mocks.setTokens,
  clearTokens: mocks.clearTokens,
}));
vi.mock('../utils/logger.js', () => ({
  logInfo: mocks.logInfo,
  logWarn: mocks.logWarn,
  logError: mocks.logError,
}));
vi.mock('../utils/audit-log.js', () => ({
  createGuildAuditLog: mocks.createGuildAuditLog,
  createAdminAuditLog: mocks.createAdminAuditLog,
}));
vi.mock('../gateway/index.js', () => ({ getIO: mocks.getIO }));
vi.mock('../utils/email.js', () => ({ sendEmail: mocks.sendEmail }));

import { register, login, logout, getMe, enable2FA, verify2FA, disable2FA } from './auth.controller.js';

describe('auth.controller', () => {
  let req: any, res: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { body: {}, user: null, ip: '127.0.0.1', headers: {} };
    res = { json: vi.fn(() => res), status: vi.fn(() => res) };
  });

  describe('register', () => {
    it('registers a new user successfully', async () => {
      req.body = { email: '[EMAIL]', username: 'john', password: 'Passw0rd!123', date_of_birth: '2000-01-01' };
      mocks.prisma.user.findFirst.mockResolvedValue(null);
      mocks.prisma.user.create.mockResolvedValue({ id: 'user-1' });

      await register(req, res);

      expect(mocks.bcrypt.hash).toHaveBeenCalled();
      expect(mocks.prisma.user.create).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(Object) }));
    });

    it('throws if email already exists', async () => {
      req.body = { email: '[EMAIL]', username: 'john', password: 'Passw0rd!123', date_of_birth: '2000-01-01' };
      mocks.prisma.user.findFirst.mockResolvedValue({ id: 'existing' });

      await register(req, res);
      expect(res.status).toHaveBeenCalledWith(409);
    });
  });

  describe('login', () => {
    it('logs in with valid credentials', async () => {
      req.body = { email: '[EMAIL]', password: 'Passw0rd!123' };
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        email: '[EMAIL]',
        password_hash: 'hashed',
        two_factor_enabled: false,
      });
      mocks.bcrypt.compare.mockResolvedValue(true);

      await login(req, res);

      expect(mocks.setTokens).toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ user: expect.any(Object) }));
    });

    it('returns 2FA required when enabled', async () => {
      req.body = { email: '[EMAIL]', password: 'Passw0rd!123' };
      mocks.prisma.user.findUnique.mockResolvedValue({
        id: 'user-1',
        two_factor_enabled: true,
      });

      await login(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ two_factor_required: true }));
    });
  });

  describe('getMe', () => {
    it('returns user when authenticated', async () => {
      req.user = { userId: 'user-1' };
      mocks.prisma.user.findUnique.mockResolvedValue({ id: 'user-1', username: 'john' });

      await getMe(req, res);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ id: 'user-1' }));
    });

    it('returns 401 when not authenticated', async () => {
      await getMe(req, res);
      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
