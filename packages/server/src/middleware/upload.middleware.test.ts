import { describe, expect, it, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  multer: vi.fn(() => ({
    single: vi.fn(() => (req: any, res: any, next: any) => next()),
    array: vi.fn(() => (req: any, res: any, next: any) => next()),
    fields: vi.fn(() => (req: any, res: any, next: any) => next()),
  })),
}));

vi.mock('multer', () => ({ default: mocks.multer }));

import { uploadSingle, uploadArray, uploadFields, getUploadDir } from './upload.middleware.js';

describe('upload.middleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('uploadSingle returns a middleware', () => {
    const middleware = uploadSingle('file');
    expect(typeof middleware).toBe('function');
  });

  it('uploadArray returns a middleware', () => {
    const middleware = uploadArray('files', 5);
    expect(typeof middleware).toBe('function');
  });

  it('uploadFields returns a middleware', () => {
    const middleware = uploadFields([{ name: 'file' }]);
    expect(typeof middleware).toBe('function');
  });

  it('getUploadDir returns env value or default', () => {
    process.env.UPLOAD_DIR = '/tmp/uploads';
    expect(getUploadDir()).toBe('/tmp/uploads');
    delete process.env.UPLOAD_DIR;
    expect(getUploadDir()).toBe('./uploads');
  });
});
