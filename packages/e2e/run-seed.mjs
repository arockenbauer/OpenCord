import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

// Set environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = `file:${path.join(repoRoot, 'packages/server/prisma/opencord.e2e.db')}`;
process.env.PORT = '3001';
process.env.JWT_SECRET = 'opencord-test-jwt-secret-1234567890';
process.env.JWT_ACCESS_SECRET = 'opencord-test-access-secret-1234567890';
process.env.JWT_REFRESH_SECRET = 'opencord-test-refresh-secret-1234567890';
process.env.BOT_SECRET = 'opencord-test-bot-secret-1234567890';
process.env.CORS_ORIGIN = 'http://127.0.0.1:5173';
process.env.CLIENT_URL = 'http://127.0.0.1:5173';
process.env.FRONTEND_URL = 'http://127.0.0.1:5173';
process.env.UPLOAD_DIR = path.join(repoRoot, 'uploads/tests-e2e');
process.env.BACKUP_DIR = path.join(repoRoot, 'exports/tests-e2e-backups');
process.env.EXPORT_DIR = path.join(repoRoot, 'exports/tests-e2e-exports');
process.env.LOG_FILE_ENABLED = 'false';
process.env.SMTP_ENABLED = 'false';
process.env.BACKUP_ENABLED = 'false';
process.env.OPENCORD_DISABLE_STARTUP = 'false';

console.log('Running seed script with DATABASE_URL:', process.env.DATABASE_URL);

async function main() {
  // Dynamic import to avoid loading at parse time
  const { rebuildTestDatabase, clearTestData, seedSmokeScenario } = await import('../server/src/test/test-db.js');
  
  console.log('Rebuilding database...');
  await rebuildTestDatabase();
  
  console.log('Clearing test data...');
  await clearTestData();
  
  console.log('Seeding smoke scenario...');
  await seedSmokeScenario();
  
  console.log('Seed completed successfully.');
}

main().catch(err => {
  console.error('Seed failed:', err);
  process.exit(1);
});
