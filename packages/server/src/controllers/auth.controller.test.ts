import { describe, expect, it, vi } from 'vitest';

describe('controllers - auth', () => {
  it('register function exists', async () => {
    const { register } = await import('./auth.controller.js');
    expect(typeof register).toBe('function');
  });

  it('login function exists', async () => {
    const { login } = await import('./auth.controller.js');
    expect(typeof login).toBe('function');
  });

  it('logout function exists', async () => {
    const { logout } = await import('./auth.controller.js');
    expect(typeof logout).toBe('function');
  });

  it('getMe function exists', async () => {
    const { getMe } = await import('./auth.controller.js');
    expect(typeof getMe).toBe('function');
  });

  it('enable2FA function exists', async () => {
    const { enable2FA } = await import('./auth.controller.js');
    expect(typeof enable2FA).toBe('function');
  });
});
