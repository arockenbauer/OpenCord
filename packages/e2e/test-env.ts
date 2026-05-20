import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repositoryRoot = path.resolve(__dirname, '../..');

export const e2eDatabasePath = path.join(repositoryRoot, 'packages/server/prisma/opencord.e2e.db');
export const e2eUploadsDir = path.join(repositoryRoot, 'uploads', 'tests-e2e');
export const e2eBackupDir = path.join(repositoryRoot, 'exports', 'tests-e2e-backups');
export const e2eExportDir = path.join(repositoryRoot, 'exports', 'tests-e2e-exports');
export const e2eLogFile = path.join(repositoryRoot, 'logs', 'tests-e2e.log');

export const e2eServerEnv: Record<string, string> = {
  NODE_ENV: 'test',
  OPENCORD_DISABLE_STARTUP: 'false',
  DATABASE_URL: `file:${e2eDatabasePath}`,
  JWT_SECRET: 'opencord-test-jwt-secret-1234567890',
  JWT_ACCESS_SECRET: 'opencord-test-access-secret-1234567890',
  JWT_REFRESH_SECRET: 'opencord-test-refresh-secret-1234567890',
  BOT_SECRET: 'opencord-test-bot-secret-1234567890',
  CORS_ORIGIN: 'http://127.0.0.1:5173',
  CLIENT_URL: 'http://127.0.0.1:5173',
  FRONTEND_URL: 'http://127.0.0.1:5173',
  UPLOAD_DIR: e2eUploadsDir,
  BACKUP_DIR: e2eBackupDir,
  EXPORT_DIR: e2eExportDir,
  LOG_FILE_PATH: e2eLogFile,
  LOG_FILE_ENABLED: 'false',
  SMTP_ENABLED: 'false',
  BACKUP_ENABLED: 'false',
};

export const e2eAccounts = {
  user: {
    email: 'smoke-user@opencord.test',
    password: 'Passw0rd!123',
  },
  admin: {
    email: 'smoke-admin@opencord.test',
    password: 'Passw0rd!123',
  },
};

export const e2eInviteCode = 'smoke-invite';
