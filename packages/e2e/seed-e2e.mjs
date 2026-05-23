import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../..');

// Load .env.e2e
config({ path: path.join(repoRoot, 'packages/server/.env.e2e') });

console.log('Seeding E2E database...');
console.log('DATABASE_URL:', process.env.DATABASE_URL);

// Run the seed using tsx
try {
  execSync('npx tsx packages/e2e/run-seed.mjs', {
    env: process.env,
    cwd: repoRoot,
    stdio: 'inherit',
  });
  console.log('E2E database seeded successfully.');
} catch (error) {
  console.error('Failed to seed E2E database:', error.message);
  process.exit(1);
}
