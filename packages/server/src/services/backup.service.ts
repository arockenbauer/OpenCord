import * as fs from 'fs';
import * as path from 'path';
import archiver from 'archiver';
import { prisma } from '../utils/prisma.js';
import { createAdminAuditLog } from '../utils/audit-log.js';
import { getIO } from '../gateway/index.js';
import { GatewayEvents } from '@opencord/shared';

function getDbPath(): string {
  const url = process.env.DATABASE_URL || 'file:./prisma/opencord.db';
  return path.resolve(url.replace('file:', '').replace(/\?.*$/, ''));
}

function getBackupDir(): string {
  return path.resolve(process.env.BACKUP_DIR || './backups');
}

function isBackupEnabled(): boolean {
  if (process.env.BACKUP_ENABLED !== undefined) return process.env.BACKUP_ENABLED === 'true';
  return true;
}

function getBackupCron(): string {
  return process.env.BACKUP_CRON || '0 3 * * *';
}

function getRetentionDays(): number {
  return Number(process.env.BACKUP_RETENTION_DAYS) || 30;
}

function getIncludeUploads(): boolean {
  if (process.env.BACKUP_INCLUDE_UPLOADS !== undefined) return process.env.BACKUP_INCLUDE_UPLOADS === 'true';
  return true;
}

function getMaxSizeGB(): number {
  return Number(process.env.BACKUP_MAX_SIZE_GB) || 10;
}

function getUploadDir(): string {
  return path.resolve(process.env.UPLOAD_DIR || './uploads');
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

async function getDbSize(): Promise<number> {
  const dbPath = getDbPath();
  try {
    const stats = fs.statSync(dbPath);
    return stats.size;
  } catch {
    return 0;
  }
}

async function getUploadsSize(): Promise<number> {
  const uploadDir = getUploadDir();
  let total = 0;
  try {
    const walk = (dir: string) => {
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const f of entries) {
        const full = path.join(dir, f.name);
        if (f.isDirectory()) walk(full);
        else total += fs.statSync(full).size;
      }
    };
    if (fs.existsSync(uploadDir)) walk(uploadDir);
  } catch { /* ignore */ }
  return total;
}

async function getUserCount(): Promise<number> {
  return prisma.user.count({ where: { bot: false } });
}

async function getGuildCount(): Promise<number> {
  return prisma.guild.count();
}

async function getMessageCount(): Promise<number> {
  return prisma.message.count();
}

export interface BackupMetadata {
  version: string;
  created_at: string;
  opencord_version: string;
  database_size_bytes: number;
  uploads_size_bytes: number;
  total_size_bytes: number;
  includes_uploads: boolean;
  user_count: number;
  guild_count: number;
  message_count: number;
}

export interface BackupInfo {
  filename: string;
  created_at: string;
  size_bytes: number;
  size_human: string;
  includes_uploads: boolean;
  metadata: Partial<BackupMetadata>;
}

export async function createBackup(includeUploads: boolean = true, adminId?: string): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const backupName = `opencord-backup-${timestamp}`;
  const backupPath = path.join(backupDir, `${backupName}.tar.gz`);
  const tempDir = path.join(backupDir, backupName);
  fs.mkdirSync(tempDir, { recursive: true });

  console.log('[BACKUP] Starting backup...');

  try {
    // 1. Backup database using better-sqlite3
    const dbPath = getDbPath();
    const dbBackupPath = path.join(tempDir, 'database', 'opencord.db');
    fs.mkdirSync(path.dirname(dbBackupPath), { recursive: true });

    console.log('[BACKUP] Database backup starting...');
    const Database = (await import('better-sqlite3')).default as any;
    const db = new Database(dbPath);
    await db.backup(dbBackupPath);
    db.close();
    console.log(`[BACKUP] Database backup completed (${formatBytes(fs.statSync(dbBackupPath).size)})`);

    // 2. Backup uploads if requested
    let uploadsSize = 0;
    if (includeUploads) {
      console.log('[BACKUP] Uploads backup starting...');
      const uploadDir = getUploadDir();
      const uploadsBackupPath = path.join(tempDir, 'uploads');
      if (fs.existsSync(uploadDir)) {
        fs.cpSync(uploadDir, uploadsBackupPath, { recursive: true });
        uploadsSize = await getUploadsSize();
        console.log(`[BACKUP] Uploads backup completed (${formatBytes(uploadsSize)})`);
      }
    }

    // 3. Create metadata.json
    const dbSize = fs.statSync(dbBackupPath).size;
    const metadata: BackupMetadata = {
      version: '1.0.0',
      created_at: new Date().toISOString(),
      opencord_version: process.env.npm_package_version || '0.1.0',
      database_size_bytes: dbSize,
      uploads_size_bytes: uploadsSize,
      total_size_bytes: dbSize + uploadsSize,
      includes_uploads: includeUploads,
      user_count: await getUserCount(),
      guild_count: await getGuildCount(),
      message_count: await getMessageCount(),
    };
    fs.writeFileSync(path.join(tempDir, 'metadata.json'), JSON.stringify(metadata, null, 2));

    // 4. Create tar.gz archive
    console.log('[BACKUP] Creating archive...');
    await createTarGz(tempDir, backupPath);
    const stats = fs.statSync(backupPath);
    console.log(`[BACKUP] Backup saved: ${path.basename(backupPath)} (${formatBytes(stats.size)})`);

    // 5. Cleanup temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });

    // 6. Rotate old backups
    await rotateBackups();

    // 7. Audit log
    if (adminId) {
      await createAdminAuditLog({
        adminId,
        action: 'BACKUP_CREATE',
        targetType: 'backup',
        targetId: path.basename(backupPath),
        details: { include_uploads: includeUploads, size_bytes: stats.size },
        ipAddress: 'system',
      });
    }

    // 8. Notify admins via Socket.IO
    const io = getIO();
    if (io) {
      io.to('admin').emit(GatewayEvents.ADMIN_BACKUP_COMPLETE, {
        backup: {
          filename: path.basename(backupPath),
          size_bytes: stats.size,
          size_human: formatBytes(stats.size),
          created_at: metadata.created_at,
          includes_uploads: includeUploads,
        },
      });
    }

    return {
      filename: path.basename(backupPath),
      created_at: metadata.created_at,
      size_bytes: stats.size,
      size_human: formatBytes(stats.size),
      includes_uploads: includeUploads,
      metadata,
    };
  } catch (err) {
    // Cleanup on error
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    console.error('[BACKUP] ERROR:', err);
    throw err;
  }
}

function createTarGz(sourceDir: string, outputPath: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const output = fs.createWriteStream(outputPath);
    const archive = archiver('tar', { gzip: true });

    output.on('close', resolve);
    archive.on('error', reject);

    archive.pipe(output);
    archive.directory(sourceDir, false);
    archive.finalize();
  });
}

export async function getBackupList(): Promise<{ backups: BackupInfo[]; total_size_bytes: number; total_size_human: string; next_scheduled?: string }> {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) {
    return { backups: [], total_size_bytes: 0, total_size_human: '0 B' };
  }

  const files = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return {
        filename: f,
        created_at: stats.mtime.toISOString(),
        size_bytes: stats.size,
        size_human: formatBytes(stats.size),
        includes_uploads: true,
        metadata: {},
      };
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const totalSize = files.reduce((sum, b) => sum + b.size_bytes, 0);

  // Calculate next scheduled backup
  const cron = getBackupCron();
  const nextScheduled = calculateNextCron(cron);

  return {
    backups: files,
    total_size_bytes: totalSize,
    total_size_human: formatBytes(totalSize),
    next_scheduled: nextScheduled,
  };
}

function calculateNextCron(cronExpression: string): string {
  // Simplified: just return next day at 3am
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(3, 0, 0, 0);
  return tomorrow.toISOString();
}

export async function deleteBackup(filename: string, adminId?: string): Promise<void> {
  const backupDir = getBackupDir();
  const backupPath = path.join(backupDir, filename);

  // Security check: ensure path is within backup dir
  if (!backupPath.startsWith(backupDir)) throw new Error('Invalid backup path');
  if (!fs.existsSync(backupPath)) throw new Error('Backup not found');

  fs.unlinkSync(backupPath);

  if (adminId) {
    await createAdminAuditLog({
      adminId,
      action: 'BACKUP_DELETE',
      targetType: 'backup',
      targetId: filename,
      details: {},
      ipAddress: 'system',
    });
  }

  console.log(`[BACKUP] Deleted backup: ${filename}`);
}

export async function rotateBackups(): Promise<void> {
  const backupDir = getBackupDir();
  if (!fs.existsSync(backupDir)) return;

  const retentionDays = getRetentionDays();
  const maxSizeBytes = getMaxSizeGB() * 1024 * 1024 * 1024;
  const now = Date.now();

  let backups = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return { filename: f, path: filePath, mtime: stats.mtime, size: stats.size };
    })
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

  // Delete old backups based on retention
  let deleted = 0;
  for (const backup of backups) {
    const ageDays = (now - backup.mtime.getTime()) / (1000 * 60 * 60 * 24);
    if (ageDays > retentionDays) {
      fs.unlinkSync(backup.path);
      deleted++;
    }
  }

  if (deleted > 0) {
    console.log(`[BACKUP] Rotated ${deleted} old backups`);
  }

  // Check total size and delete oldest if over limit
  backups = fs.readdirSync(backupDir)
    .filter((f) => f.endsWith('.tar.gz'))
    .map((f) => {
      const filePath = path.join(backupDir, f);
      const stats = fs.statSync(filePath);
      return { filename: f, path: filePath, mtime: stats.mtime, size: stats.size };
    })
    .sort((a, b) => a.mtime.getTime() - b.mtime.getTime());

  let totalSize = backups.reduce((sum, b) => sum + b.size, 0);
  while (totalSize > maxSizeBytes && backups.length > 0) {
    const oldest = backups.shift()!;
    fs.unlinkSync(oldest.path);
    totalSize -= oldest.size;
    deleted++;
    console.log(`[BACKUP] Deleted old backup due to size limit: ${oldest.filename}`);
  }
}

export async function restoreBackup(filename: string, restoreUploads: boolean, adminId?: string): Promise<void> {
  const backupDir = getBackupDir();
  const backupPath = path.join(backupDir, filename);

  // Security check
  if (!backupPath.startsWith(backupDir)) throw new Error('Invalid backup path');
  if (!fs.existsSync(backupPath)) throw new Error('Backup not found');

  console.log(`[BACKUP] Starting restore of ${filename}...`);

  // 1. Verify archive integrity (basic check)
  // In production, you'd verify checksum here

  // 2. Set maintenance mode
  await setMaintenanceMode(true);
  console.log('[BACKUP] Maintenance mode enabled');

  // 3. Disconnect all sockets
  const io = getIO();
  if (io) {
    io.disconnectSockets(true);
    console.log('[BACKUP] All sockets disconnected');
  }

  // 4. Close Prisma connection
  await prisma.$disconnect();
  console.log('[BACKUP] Database connection closed');

  try {
    // 5. Extract archive to temp dir
    const tempDir = path.join(backupDir, 'restore-temp');
    if (fs.existsSync(tempDir)) fs.rmSync(tempDir, { recursive: true, force: true });
    fs.mkdirSync(tempDir, { recursive: true });

    await extractTarGz(backupPath, tempDir);

    // 6. Replace database
    const dbBackupPath = path.join(tempDir, 'database', 'opencord.db');
    if (!fs.existsSync(dbBackupPath)) throw new Error('Invalid backup: missing database file');
    const dbPath = getDbPath();
    fs.copyFileSync(dbBackupPath, dbPath);
    console.log('[BACKUP] Database restored');

    // 7. Replace uploads if requested
    if (restoreUploads) {
      const uploadsBackupPath = path.join(tempDir, 'uploads');
      const uploadDir = getUploadDir();
      if (fs.existsSync(uploadsBackupPath)) {
        if (fs.existsSync(uploadDir)) fs.rmSync(uploadDir, { recursive: true, force: true });
        fs.cpSync(uploadsBackupPath, uploadDir, { recursive: true });
        console.log('[BACKUP] Uploads restored');
      }
    }

    // 8. Cleanup
    fs.rmSync(tempDir, { recursive: true, force: true });

    // 9. Audit log
    if (adminId) {
      await createAdminAuditLog({
        adminId,
        action: 'BACKUP_RESTORE',
        targetType: 'backup',
        targetId: filename,
        details: { restore_uploads: restoreUploads },
        ipAddress: 'system',
      });
    }

    console.log('[BACKUP] Restore completed successfully');
  } catch (err) {
    console.error('[BACKUP] Restore failed:', err);
    throw err;
  } finally {
    // 10. Restart process (PM2 will auto-restart)
    console.log('[BACKUP] Server will restart...');
    setTimeout(() => process.exit(0), 1000);
  }
}

function extractTarGz(sourcePath: string, outputDir: string): Promise<void> {
  return new Promise((resolve, reject) => {
    try {
      const tar = require('tar');
      tar.x({ file: sourcePath, cwd: outputDir, gzip: true }, (err: any) => {
        if (err) reject(err);
        else resolve();
      });
    } catch (err) {
      reject(err);
    }
  });
}

async function setMaintenanceMode(enabled: boolean): Promise<void> {
  await prisma.platformSettings.upsert({
    where: { key: 'maintenance_mode' },
    create: { key: 'maintenance_mode', value: String(enabled), updated_by: 'system' },
    update: { value: String(enabled), updated_by: 'system' },
  });
}

export async function uploadBackup(filePath: string, adminId?: string): Promise<BackupInfo> {
  const backupDir = getBackupDir();
  fs.mkdirSync(backupDir, { recursive: true });

  const filename = path.basename(filePath);
  const destPath = path.join(backupDir, filename);
  fs.copyFileSync(filePath, destPath);

  const stats = fs.statSync(destPath);

  if (adminId) {
    await createAdminAuditLog({
      adminId,
      action: 'BACKUP_UPLOAD',
      targetType: 'backup',
      targetId: filename,
      details: { size_bytes: stats.size },
      ipAddress: 'system',
    });
  }

  return {
    filename,
    created_at: stats.mtime.toISOString(),
    size_bytes: stats.size,
    size_human: formatBytes(stats.size),
    includes_uploads: true,
    metadata: {},
  };
}

export function startBackupCron(): void {
  if (!isBackupEnabled()) {
    console.log('[BACKUP] Automatic backups disabled');
    return;
  }

  const cron = getBackupCron();
  console.log(`[BACKUP] Automatic backups enabled: ${cron}`);

  // Simple cron parser for basic expressions
  const parts = cron.split(' ');
  if (parts.length !== 5) {
    console.error('[BACKUP] Invalid cron expression, using default');
    return;
  }

  // For simplicity, we'll use setInterval to check every hour
  const checkInterval = 60 * 60 * 1000; // Check every hour
  setInterval(() => {
    const now = new Date();
    const [minute, hour, day, month, dayOfWeek] = parts;

    const currentMinute = now.getMinutes();
    const currentHour = now.getHours();

    // Very basic check: matches if minute and hour match
    const minuteMatch = minute === '*' || parseInt(minute) === currentMinute;
    const hourMatch = hour === '*' || parseInt(hour) === currentHour;

    if (minuteMatch && hourMatch) {
      console.log('[BACKUP] Cron triggered');
      createBackup(getIncludeUploads())
        .catch((err) => console.error('[BACKUP] Cron backup failed:', err));
    }
  }, checkInterval);

  console.log('[BACKUP] Cron scheduler started');
}
