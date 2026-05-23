import { describe, expect, it } from 'vitest';
import { AppError, maskEmail } from './app-error.js';

describe('AppError', () => {
  it('creates error with statusCode, code, message and details', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found', { id: '123' });
    expect(err.statusCode).toBe(404);
    expect(err.code).toBe('NOT_FOUND');
    expect(err.message).toBe('Resource not found');
    expect(err.details).toEqual({ id: '123' });
    expect(err instanceof Error).toBe(true);
  });

  it('creates error without details', () => {
    const err = new AppError(500, 'SERVER_ERROR', 'Internal error');
    expect(err.details).toBeUndefined();
  });
});

describe('maskEmail', () => {
  it('masks email with more than 2 characters in local part', () => {
    expect(maskEmail('john.doe@gmail.com')).toBe('jo***@gmail.com');
    expect(maskEmail('test@example.org')).toBe('te***@example.org');
  });

  it('masks email with 2 or fewer characters', () => {
    expect(maskEmail('ab@gmail.com')).toBe('a***@gmail.com');
    expect(maskEmail('a@gmail.com')).toBe('a***@gmail.com');
  });

  it('returns email unchanged if no @ symbol', () => {
    expect(maskEmail('invalid-email')).toBe('invalid-email');
  });

  it('returns empty string unchanged', () => {
    expect(maskEmail('')).toBe('');
  });

  it('handles email with only @', () => {
    expect(maskEmail('@domain.com')).toBe('@domain.com');
  });
});
