import { execSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default async function globalSetup(): Promise<void> {
  const repoRoot = path.resolve(__dirname, '../..');
  
  console.log('Running E2E database seeding...');
  
  try {
    execSync('npx tsx packages/e2e/run-seed.mjs', {
      env: process.env,
      cwd: repoRoot,
      stdio: 'inherit',
    });
    console.log('E2E database seeding completed.');
  } catch (error) {
    console.error('Failed to seed E2E database:', error);
    throw error;
  }
}
