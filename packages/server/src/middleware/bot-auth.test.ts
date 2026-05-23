import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
  },
  bcrypt: {
    compare: vi.fn(),
  },
  jwt: {
    verify: vi.fn(),
  },
  getIO: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({
  prisma: mocks.prisma,
}));

vi.mock('bcrypt', () => ({
  default: mocks.bcrypt,
}));

vi.mock('jsonwebtoken', () => ({
  default: mocks.jwt,
}));

vi.mock('../gateway/index.js', () => ({
  getIO: mocks.getIO,
}));

import { authenticateBot } from './auth.middleware.js';

describe('bot authentication', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('authenticateBot', () => {
    it('authenticates valid bot token', async () => {
      const botUser = {
        id: 'bot-1',
        username: 'Test Bot',
        bot: true,
        bot_token: 'hashed-token',
        application_id: 'app-1',
      };
      mocks.prisma.user.findUnique.mockResolvedValue(botUser);
      mocks.bcrypt.compare.mockResolvedValue(true);

      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bot valid-bot-token' },
        user: undefined,
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        userId: 'bot-1',
        username: 'Test Bot',
        bot: true,
        appId: 'app-1',
      });
    });

    it('returns 401 when authorization header is missing', async () => {
      const middleware = authenticateBot();
      const req = {
        headers: {},
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    });

    it('returns 401 when authorization scheme is not Bot', async () => {
      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bearer some-token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when bot user is not found', async () => {
      mocks.prisma.user.findUnique.mockResolvedValue(null);

      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bot invalid-token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when bot token is invalid', async () => {
      const botUser = {
        id: 'bot-1',
        bot: true,
        bot_token: 'hashed-token',
      };
      mocks.prisma.user.findUnique.mockResolvedValue(botUser);
      mocks.bcrypt.compare.mockResolvedValue(false);

      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bot invalid-token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('returns 401 when user is not a bot', async () => {
      const regularUser = {
        id: 'user-1',
        bot: false,
        bot_token: null,
      };
      mocks.prisma.user.findUnique.mockResolvedValue(regularUser);

      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bot some-token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });

    it('handles malformed bot token gracefully', async () => {
      const middleware = authenticateBot();
      const req = {
        headers: { authorization: 'Bot malformed..token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(res.status).toHaveBeenCalledWith(401);
    });
  });
});
