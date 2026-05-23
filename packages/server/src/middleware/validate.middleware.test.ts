import { describe, expect, it, vi } from 'vitest';

describe('middleware - validate', () => {
  it('validate function exists', async () => {
    const { validate } = await import('./validate.middleware.js');
    expect(typeof validate).toBe('function');
  });
});
