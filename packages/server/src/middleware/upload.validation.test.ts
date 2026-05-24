import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';

const mocks = vi.hoisted(() => ({
  fileTypeFromFile: vi.fn(),
}));

vi.mock('file-type', () => ({
  fileTypeFromFile: mocks.fileTypeFromFile,
}));

import { sanitizeFilename, validateUploadedFile, ALLOWED_ATTACHMENT_TYPES, FORBIDDEN_EXTENSIONS } from './upload.middleware.js';
import { validateMagicBytes } from './upload.middleware.js';

describe('upload.middleware - validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('sanitizeFilename', () => {
    it('keeps normal filenames unchanged', () => {
      expect(sanitizeFilename('document.pdf')).toBe('document.pdf');
      expect(sanitizeFilename('my file.jpg')).toBe('my file.jpg');
    });

    it('replaces dangerous characters', () => {
      expect(sanitizeFilename('file/with/slashes.txt')).toBe('file_with_slashes.txt');
      expect(sanitizeFilename('file\\with\\backslashes.txt')).toBe('file_with_backslashes.txt');
      expect(sanitizeFilename('file:with:colons.txt')).toBe('file_with_colons.txt');
      expect(sanitizeFilename('file*with*wildcards.txt')).toBe('file_with_wildcards.txt');
      expect(sanitizeFilename('file?with&query=1.txt')).toBe('file_with_query_1.txt');
    });

    it('handles SPOILER_ prefix correctly', () => {
      expect(sanitizeFilename('SPOILER_image.png')).toBe('SPOILER_image.png');
      expect(sanitizeFilename('spoiler_image.png')).toBe('spoiler_image.png');
    });

    it('limits filename length', () => {
      const longName = 'a'.repeat(300) + '.txt';
      const result = sanitizeFilename(longName);
      expect(result.length).toBeLessThanOrEqual(255);
    });
  });

  describe('validateUploadedFile', () => {
    it('returns middleware that accepts allowed MIME types', async () => {
      const middleware = validateUploadedFile(ALLOWED_ATTACHMENT_TYPES, ['.png', '.jpg']);
      mocks.fileTypeFromFile.mockResolvedValue({ mime: 'image/png' });
      
      const req = {
        files: [{
          originalname: 'test.png',
          path: '/tmp/test.png',
          mimetype: 'image/png',
        }],
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(); // called without error
    });

    it('returns middleware that rejects blocked extensions', async () => {
      const middleware = validateUploadedFile(ALLOWED_ATTACHMENT_TYPES, ['.png', '.jpg']);
      mocks.fileTypeFromFile.mockResolvedValue({ mime: 'application/octet-stream' });
      
      const req = {
        files: [{
          originalname: 'file.exe',
          path: '/tmp/file.exe',
          mimetype: 'application/octet-stream',
        }],
      } as any;
      const res = {} as any;
      const next = vi.fn();

      await middleware(req, res, next);

      expect(next).toHaveBeenCalledWith(expect.any(Error));
    });
  });

  describe('FORBIDDEN_EXTENSIONS', () => {
    it('contains all dangerous extensions', () => {
      expect(FORBIDDEN_EXTENSIONS).toContain('.exe');
      expect(FORBIDDEN_EXTENSIONS).toContain('.sh');
      expect(FORBIDDEN_EXTENSIONS).toContain('.bat');
      expect(FORBIDDEN_EXTENSIONS).toContain('.dmg');
    });
  });

  describe('ALLOWED_ATTACHMENT_TYPES', () => {
    it('contains common image types', () => {
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('image/jpeg');
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('image/png');
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('image/gif');
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('image/webp');
    });

    it('contains common document types', () => {
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('application/pdf');
      expect(ALLOWED_ATTACHMENT_TYPES).toContain('text/plain');
    });
  });

  describe('validateMagicBytes', () => {
    it('returns true for valid file types', async () => {
      mocks.fileTypeFromFile.mockResolvedValue({ mime: 'image/png' });
      const result = await validateMagicBytes('/tmp/test.png', ['image/png']);
      expect(result).toBe(true);
    });
  });
});
