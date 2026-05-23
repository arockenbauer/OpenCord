import { describe, expect, it, vi } from 'vitest';

describe('middleware - error', () => {
  it('errorHandler function exists', async () => {
    const { errorHandler } = await import('./error.middleware.js');
    expect(typeof errorHandler).toBe('function');
  });
});
