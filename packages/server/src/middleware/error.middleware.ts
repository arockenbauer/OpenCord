import { Request, Response, NextFunction } from 'express';
import { AppError } from '../utils/app-error.js';

export function errorHandler(err: Error, _req: Request, res: Response, _next: NextFunction): void {
  if (err instanceof AppError) {
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

  console.error('Unhandled error:', err);
  res.status(500).json({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
}
