import { describe, expect, it, vi } from 'vitest';

describe('middleware - rate-limit', () => {
  it('createRateLimitMiddleware function exists', async () => {
    const { createRateLimitMiddleware } = await import('./rate-limit.middleware.js');
    expect(typeof createRateLimitMiddleware).toBe('function');
  });
});
