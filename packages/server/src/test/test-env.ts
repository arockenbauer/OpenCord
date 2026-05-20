import path from 'path';
import { fileURLToPath } from 'url';

const testEnvFile = fileURLToPath(import.meta.url);
const testDir = path.dirname(testEnvFile);

export const serverRoot = path.resolve(testDir, '../..');
export const repositoryRoot = path.resolve(serverRoot, '../..');
export const defaultVitestDatabasePath = path.join(serverRoot, 'prisma', 'opencord.vitest.db');
export const defaultVitestUploadsDir = path.join(repositoryRoot, 'uploads', 'tests-vitest');
export const defaultVitestBackupDir = path.join(repositoryRoot, 'exports', 'tests-vitest-backups');
export const defaultVitestExportDir = path.join(repositoryRoot, 'exports', 'tests-vitest-exports');
export const defaultVitestLogFile = path.join(repositoryRoot, 'logs', 'tests-vitest.log');

type EnvOverrides = Partial<Record<string, string>>;

export function applyServerTestEnv(overrides: EnvOverrides = {}): void {
  const defaults: Record<string, string> = {
    NODE_ENV: 'test',
    OPENCORD_DISABLE_STARTUP: 'true',
    DATABASE_URL: `file:${defaultVitestDatabasePath}`,
    JWT_SECRET: 'opencord-test-jwt-secret-1234567890',
    JWT_ACCESS_SECRET: 'opencord-test-access-secret-1234567890',
    JWT_REFRESH_SECRET: 'opencord-test-refresh-secret-1234567890',
    BOT_SECRET: 'opencord-test-bot-secret-1234567890',
    CORS_ORIGIN: 'http://127.0.0.1:4173',
    CLIENT_URL: 'http://127.0.0.1:4173',
    FRONTEND_URL: 'http://127.0.0.1:4173',
    LOG_FILE_ENABLED: 'false',
    SMTP_ENABLED: 'false',
    BACKUP_ENABLED: 'false',
    UPLOAD_DIR: defaultVitestUploadsDir,
    BACKUP_DIR: defaultVitestBackupDir,
    EXPORT_DIR: defaultVitestExportDir,
    LOG_FILE_PATH: defaultVitestLogFile,
  };

  for (const [key, value] of Object.entries(defaults)) {
    if (!process.env[key]) {
      process.env[key] = value;
    }
  }

  for (const [key, value] of Object.entries(overrides)) {
    process.env[key] = value;
  }
}
