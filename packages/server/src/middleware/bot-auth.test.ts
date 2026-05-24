import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { prisma } from '../utils/prisma.js';
import { AppError } from '../utils/app-error.js';

function botTokenFor(botId: string): string {
  return `${Buffer.from(botId).toString('base64url')}.timestamp.signature`;
}

const mocks = vi.hoisted(() => ({
  prisma: {
    user: {
      findFirst: vi.fn(),
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
  compare: mocks.bcrypt.compare,
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
      mocks.prisma.user.findFirst.mockResolvedValue(botUser);
      mocks.bcrypt.compare.mockResolvedValue(true);

      const req = {
        headers: { authorization: `Bot ${botTokenFor('bot-1')}` },
        user: undefined,
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalled();
      expect(req.user).toEqual({
        userId: 'bot-1',
        type: 'bot',
      });
    });

    it('passes a 401 AppError when authorization header is missing', async () => {
      const req = {
        headers: {},
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
      expect(res.status).not.toHaveBeenCalled();
    });

    it('passes a 401 AppError when authorization scheme is not Bot', async () => {
      const req = {
        headers: { authorization: 'Bearer some-token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'UNAUTHORIZED' }));
    });

    it('passes a 401 AppError when bot user is not found', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null);

      const req = {
        headers: { authorization: `Bot ${botTokenFor('missing-bot')}` },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    });

    it('passes a 401 AppError when bot token is invalid', async () => {
      const botUser = {
        id: 'bot-1',
        bot: true,
        bot_token: 'hashed-token',
      };
      mocks.prisma.user.findFirst.mockResolvedValue(botUser);
      mocks.bcrypt.compare.mockResolvedValue(false);

      const req = {
        headers: { authorization: `Bot ${botTokenFor('bot-1')}` },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    });

    it('passes a 401 AppError when user is not a bot', async () => {
      mocks.prisma.user.findFirst.mockResolvedValue(null);

      const req = {
        headers: { authorization: `Bot ${botTokenFor('user-1')}` },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    });

    it('handles malformed bot token gracefully', async () => {
      const req = {
        headers: { authorization: 'Bot malformed..token' },
      } as Request;
      const res = {
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      await authenticateBot(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.objectContaining({ statusCode: 401, code: 'INVALID_TOKEN' }));
    });
  });
});
