import { describe, expect, it, vi } from 'vitest';

describe('middleware - auth', () => {
  it('authenticateToken function exists', async () => {
    const { authenticate } = await import('./auth.middleware.js');
    expect(typeof authenticate).toBe('function');
  });

  it('requireAdmin function exists', async () => {
    const { requireAdmin } = await import('./auth.middleware.js');
    expect(typeof requireAdmin).toBe('function');
  });

  it('blacklistToken function exists', async () => {
    const { blacklistToken } = await import('./auth.middleware.js');
    expect(typeof blacklistToken).toBe('function');
  });
});
