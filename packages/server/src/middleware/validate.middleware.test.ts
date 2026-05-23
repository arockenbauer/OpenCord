import { describe, expect, it, vi } from 'vitest';
import { validate } from './validate.middleware.js';
import { AppError } from '../utils/app-error.js';

describe('validate.middleware', () => {
  it('calls next if validation passes', () => {
    const schema = { safeParse: vi.fn(() => ({ success: true })) };
    const middleware = validate(schema as any);
    const req = { body: { email: '[EMAIL]' } };
    const res = {};
    const next = vi.fn();

    middleware(req as any, res as any, next);
    expect(next).toHaveBeenCalled();
  });

  it('throws AppError if validation fails', () => {
    const schema = {
      safeParse: vi.fn(() => ({
        success: false,
        error: { issues: [{ message: 'Invalid email' }] },
      })),
    };
    const middleware = validate(schema as any);
    const req = { body: { email: 'bad' } };
    const res = {};
    const next = vi.fn();

    middleware(req as any, res as any, next);
    expect(next).toHaveBeenCalledWith(expect.any(AppError));
    expect(next.mock.calls[0][0].statusCode).toBe(400);
  });
});
