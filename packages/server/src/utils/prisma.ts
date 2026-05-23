import { PrismaClient } from '@prisma/client';
import { config } from 'dotenv';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const envPath = process.env.NODE_ENV === 'test'
  ? join(__dirname, '../../.env.e2e')
  : join(__dirname, '../../.env');

config({ path: envPath });

export const prisma = new PrismaClient();

// Gestion propre de la fermeture
process.on('beforeExit', async () => {
  await prisma.$disconnect();
  console.log('Prisma disconnected');
});

process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
