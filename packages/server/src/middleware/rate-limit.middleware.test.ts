import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  prisma: {
    rateLimit: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
  },
  logWarn: vi.fn(),
}));

vi.mock('../utils/prisma.js', () => ({ prisma: mocks.prisma }));
vi.mock('../utils/logger.js', () => ({ logWarn: mocks.logWarn }));

import { createRateLimitMiddleware } from './rate-limit.middleware.js';

describe('rate-limit.middleware', () => {
  let req: any, res: any, next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = { ip: '127.0.0.1', path: '/api/auth/login' };
    res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
      setHeader: vi.fn(),
    };
    next = vi.fn();
  });

  it('allows requests under the limit', async () => {
    mocks.prisma.rateLimit.findUnique.mockResolvedValue(null);
    mocks.prisma.rateLimit.create.mockResolvedValue({});

    const middleware = createRateLimitMiddleware({ windowMs: 60000, max: 5 });
    await middleware(req, res, next);

    expect(next).toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalledWith(429);
  });

  it('blocks requests over the limit', async () => {
    const now = new Date();
    mocks.prisma.rateLimit.findUnique.mockResolvedValue({
      id: 'rl-1',
      count: 10,
      expires_at: new Date(now.getTime() + 60000),
    });

    const middleware = createRateLimitMiddleware({ windowMs: 60000, max: 5 });
    await middleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(429);
    expect(next).not.toHaveBeenCalled();
  });

  it('sets rate limit headers', async () => {
    mocks.prisma.rateLimit.findUnique.mockResolvedValue(null);
    mocks.prisma.rateLimit.create.mockResolvedValue({});

    const middleware = createRateLimitMiddleware({ windowMs: 60000, max: 5 });
    await middleware(req, res, next);

    expect(res.setHeader).toHaveBeenCalledWith('X-RateLimit-Limit', 5);
  });
});
