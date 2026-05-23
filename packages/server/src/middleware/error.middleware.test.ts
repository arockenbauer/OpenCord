import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  logError: vi.fn(),
  maskEmail: vi.fn((e) => e),
}));

vi.mock('../utils/logger.js', () => ({ logError: mocks.logError }));
vi.mock('../utils/app-error.js', () => ({ maskEmail: mocks.maskEmail }));

import { errorHandler } from './error.middleware.js';
import { AppError } from '../utils/app-error.js';

describe('error.middleware', () => {
  let req: any, res: any, next: any;

  beforeEach(() => {
    vi.clearAllMocks();
    req = {};
    res = {
      status: vi.fn(() => res),
      json: vi.fn(() => res),
      headersSent: false,
    };
    next = vi.fn();
  });

  it('handles AppError with correct status and code', () => {
    const err = new AppError(404, 'NOT_FOUND', 'Resource not found');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'NOT_FOUND',
      message: 'Resource not found',
    }));
  });

  it('handles generic errors as 500', () => {
    const err = new Error('Something broke');
    errorHandler(err, req, res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: 'INTERNAL_ERROR',
    }));
  });

  it('does not overwrite response if already sent', () => {
    res.headersSent = true;
    const err = new Error('test');
    errorHandler(err, req, res, next);
    expect(res.status).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledWith(err);
  });

  it('includes details in response when present', () => {
    const err = new AppError(400, 'VALIDATION', 'Invalid', { field: 'email' });
    errorHandler(err, req, res, next);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      details: { field: 'email' },
    }));
  });
});
