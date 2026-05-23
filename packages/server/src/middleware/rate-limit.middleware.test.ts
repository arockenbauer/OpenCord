import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { rateLimit, rateLimitWithKey, stores } from './rate-limit.middleware.js';

describe('rate-limit.middleware', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-23T12:00:00.000Z'));
    stores.clear();
  });

  describe('rateLimit', () => {
    it('allows requests under the limit', () => {
      const middleware = rateLimit('test-bucket', 3, 60000);
      const req = { user: { userId: 'user-1' }, ip: '127.0.0.1', headers: {} } as Request;
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalledWith(429);
    });

    it('blocks requests over the limit with 429', () => {
      const middleware = rateLimit('test-bucket', 2, 60000);
      const req = { user: { userId: 'user-1' }, ip: '127.0.0.1', headers: {} } as Request;
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);

      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('resets the counter after window expires', () => {
      const middleware = rateLimit('test-bucket', 2, 60000);
      const req = { user: { userId: 'user-1' }, ip: '127.0.0.1', headers: {} } as Request;
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);
      middleware(req, res, next);
      middleware(req, res, next);
      expect(res.status).toHaveBeenCalledWith(429);

      vi.advanceTimersByTime(60001);
      const res2 = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      middleware(req, res2, next);
      expect(next).toHaveBeenCalledTimes(3);
    });

    it('sets correct rate limit headers', () => {
      const middleware = rateLimit('test-bucket', 5, 60000);
      const req = { user: { userId: 'user-1' }, ip: '127.0.0.1', headers: {} } as Request;
      const setMock = vi.fn();
      const res = {
        set: setMock,
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);

      expect(setMock).toHaveBeenCalledWith('X-RateLimit-Limit', '5');
      expect(setMock).toHaveBeenCalledWith('X-RateLimit-Remaining', '4');
    });

    it('uses IP when user is not authenticated', () => {
      const middleware = rateLimit('test-bucket', 1, 60000);
      const req1 = { ip: '10.0.0.1', headers: {} } as Request;
      const req2 = { ip: '10.0.0.2', headers: {} } as Request;
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req1, res, next);
      expect(next).toHaveBeenCalledTimes(1);

      middleware(req2, res, next);
      expect(next).toHaveBeenCalledTimes(2);
    });

    it('silent mode skips 429 but still counts', () => {
      const middleware = rateLimit('test-bucket', 1, 60000, true);
      const req = { user: { userId: 'user-1' }, ip: '127.0.0.1', headers: {} } as Request;
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      middleware(req, res, next);
      middleware(req, res, next);
      expect(next).toHaveBeenCalledTimes(2);
      expect(res.status).not.toHaveBeenCalledWith(429);
    });
  });

  describe('rateLimitWithKey', () => {
    it('uses custom key function for rate limiting', () => {
      const middleware = rateLimitWithKey('test-bucket', 2, 60000, (req) => (req as any).customKey);
      const res = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
        setHeader: vi.fn(),
      } as unknown as Response;
      const next = vi.fn();

      const req1 = { customKey: 'key-1', headers: {} } as any as Request;
      const req2 = { customKey: 'key-2', headers: {} } as any as Request;

      middleware(req1, res, next);
      middleware(req1, res, next);
      middleware(req1, res, next);
      expect(res.status).toHaveBeenCalledWith(429);

      const res2 = {
        set: vi.fn(),
        status: vi.fn().mockReturnThis(),
        json: vi.fn(),
      } as unknown as Response;
      middleware(req2, res2, next);
      expect(next).toHaveBeenCalledTimes(3);
    });
  });
});
