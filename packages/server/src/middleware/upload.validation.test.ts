import { describe, expect, it, beforeEach, vi } from 'vitest';
import type { Request, Response } from 'express';
import { sanitizeFilename, validateUploadedFile, ALLOWED_MIME_TYPES, BLOCKED_EXTENSIONS } from './upload.middleware.js';

describe('upload.middleware - validation', () => {
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
    it('accepts allowed MIME types', () => {
      for (const mime of ALLOWED_MIME_TYPES) {
        const result = validateUploadedFile(Buffer.from('test'), mime, 'test.png', 1000);
        expect(result.valid).toBe(true);
      }
    });

    it('rejects blocked extensions even with allowed MIME', () => {
      const blockedExts = ['.exe', '.bat', '.sh', '.ps1', '.cmd', '.scr', '.vbs', '.msi', '.dmg', '.app'];
      for (const ext of blockedExts) {
        const result = validateUploadedFile(Buffer.from('test'), 'application/octet-stream', `file${ext}`, 1000);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('not allowed');
      }
    });

    it('rejects files that are too large for non-premium', () => {
      const largeFile = Buffer.alloc(9 * 1024 * 1024); // 9MB
      const result = validateUploadedFile(largeFile, 'image/png', 'test.png', 9 * 1024 * 1024, false);
      expect(result.valid).toBe(false);
      expect(result.error).toContain('too large');
    });

    it('allows larger files for premium users', () => {
      const largeFile = Buffer.alloc(20 * 1024 * 1024); // 20MB
      const result = validateUploadedFile(largeFile, 'image/png', 'test.png', 20 * 1024 * 1024, true);
      expect(result.valid).toBe(true);
    });

    it('rejects empty files', () => {
      const result = validateUploadedFile(Buffer.alloc(0), 'image/png', 'test.png', 0);
      expect(result.valid).toBe(false);
    });

    it('validates image dimensions with sharp', async () => {
      const sharp = await import('sharp');
      const validImage = await sharp.default({
        create: { width: 100, height: 100, channels: 4, background: { r: 255, g: 0, b: 0, alpha: 0.5 } },
      }).png().toBuffer();

      const result = validateUploadedFile(validImage, 'image/png', 'test.png', validImage.length, false);
      expect(result.valid).toBe(true);
    });
  });

  describe('BLOCKED_EXTENSIONS', () => {
    it('contains all dangerous extensions', () => {
      expect(BLOCKED_EXTENSIONS).toContain('.exe');
      expect(BLOCKED_EXTENSIONS).toContain('.sh');
      expect(BLOCKED_EXTENSIONS).toContain('.bat');
      expect(BLOCKED_EXTENSIONS).toContain('.dmg');
    });
  });

  describe('ALLOWED_MIME_TYPES', () => {
    it('contains common image types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('image/jpeg');
      expect(ALLOWED_MIME_TYPES).toContain('image/png');
      expect(ALLOWED_MIME_TYPES).toContain('image/gif');
      expect(ALLOWED_MIME_TYPES).toContain('image/webp');
    });

    it('contains common document types', () => {
      expect(ALLOWED_MIME_TYPES).toContain('application/pdf');
      expect(ALLOWED_MIME_TYPES).toContain('text/plain');
    });
  });
});
