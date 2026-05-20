import { applyServerTestEnv } from '../server/src/test/test-env.js';
import { rebuildTestDatabase, clearTestData, seedSmokeScenario } from '../server/src/test/test-db.js';
import { e2eServerEnv } from './test-env.js';

export default async function globalSetup(): Promise<void> {
  applyServerTestEnv(e2eServerEnv);
  await rebuildTestDatabase();
  await clearTestData();
  await seedSmokeScenario();
}
