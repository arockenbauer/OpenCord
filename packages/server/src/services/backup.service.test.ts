import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { formatBytes, getDbPath, getBackupDir, isBackupEnabled, getRetentionDays, getMaxSizeGB } from './backup.service.js';

vi.mock('better-sqlite3', () => ({
  default: vi.fn(() => ({
    backup: vi.fn().mockResolvedValue(undefined),
    close: vi.fn(),
  })),
}));

vi.mock('../utils/audit-log.js', () => ({
  createAdminAuditLog: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('../gateway/index.js', () => ({
  getIO: vi.fn(() => null),
}));

vi.mock('archiver', () => ({
  default: vi.fn(() => ({
    pipe: vi.fn(),
    directory: vi.fn(),
    finalize: vi.fn().mockResolvedValue(undefined),
    on: vi.fn(),
  })),
}));

describe('backup.service - utils', () => {
  it('formatBytes formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(1024)).toBe('1 KB');
    expect(formatBytes(1048576)).toBe('1 MB');
    expect(formatBytes(1073741824)).toBe('1 GB');
  });

  it('getDbPath returns correct path', () => {
    process.env.DATABASE_URL = 'file:./test.db';
    expect(getDbPath()).toContain('test.db');
  });

  it('getBackupDir uses env or default', () => {
    process.env.BACKUP_DIR = '/tmp/backups';
    expect(getBackupDir()).toBe('/tmp/backups');
    delete process.env.BACKUP_DIR;
    expect(getBackupDir()).toBe('./backups');
  });

  it('isBackupEnabled returns correct value', () => {
    process.env.BACKUP_ENABLED = 'false';
    expect(isBackupEnabled()).toBe(false);
    process.env.BACKUP_ENABLED = 'true';
    expect(isBackupEnabled()).toBe(true);
    delete process.env.BACKUP_ENABLED;
    expect(isBackupEnabled()).toBe(true);
  });

  it('getRetentionDays returns configured or default value', () => {
    process.env.BACKUP_RETENTION_DAYS = '60';
    expect(getRetentionDays()).toBe(60);
    delete process.env.BACKUP_RETENTION_DAYS;
    expect(getRetentionDays()).toBe(30);
  });

  it('getMaxSizeGB returns configured or default value', () => {
    process.env.BACKUP_MAX_SIZE_GB = '20';
    expect(getMaxSizeGB()).toBe(20);
    delete process.env.BACKUP_MAX_SIZE_GB;
    expect(getMaxSizeGB()).toBe(10);
  });
});

describe('backup.service - createBackup', () => {
  beforeEach(() => {
    vi.spyOn(fs, 'mkdirSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'statSync').mockImplementation(() => ({ size: 1024 } as any));
    vi.spyOn(fs, 'existsSync').mockReturnValue(false);
    vi.spyOn(fs, 'cpSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'writeFileSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'rmSync').mockImplementation(() => undefined);
    vi.spyOn(fs, 'readdirSync').mockReturnValue([]);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('creates backup successfully', async () => {
    const { createBackup } = await import('./backup.service.js');
    const result = await createBackup(false);
    expect(result).toHaveProperty('filename');
    expect(result).toHaveProperty('size_bytes');
    expect(result.includes_uploads).toBe(false);
  });
});
