import { PrismaClient } from '@prisma/client';

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
