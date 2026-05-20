import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error.js';
import { logError } from '../utils/logger.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
    if (err.code === 'VALIDATION_ERROR' && Array.isArray(err.details)) {
      res.status(400).json({ errors: err.details });
      return;
    }
    res.status(err.statusCode).json({
      error: {
        code: err.code,
        message: err.message,
        details: err.details,
      },
    });
    return;
  }

  if (err.message === 'INVALID_FILE_TYPE') {
    res.status(400).json({ error: { code: 'INVALID_FILE_TYPE', message: 'File type not allowed' } });
    return;
  }

  if ((err as any).type === 'entity.too.large' || err.message?.includes('File too large')) {
    res.status(413).json({ error: { code: 'FILE_TOO_LARGE', message: 'File size exceeds the allowed limit' } });
    return;
  }

  if ((err as any).code === 'P2025') {
    res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Resource not found' } });
    return;
  }

  if ((err as any).name === 'PrismaClientValidationError') {
    res.status(400).json({ error: { code: 'INVALID_INPUT', message: 'Invalid request data' } });
    return;
  }

  logError('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
