import { prisma } from '../utils/prisma.js';
import { generateSnowflake } from '../utils/snowflake.js';

export async function assignBadge(userId: string, badgeName: string, assignedBy?: string): Promise<void> {
  const badge = await prisma.badge.findFirst({ where: { name: badgeName } });
  if (!badge) return;
  await prisma.userBadge.upsert({
    where: { user_id_badge_id: { user_id: userId, badge_id: badge.id } },
    create: { id: generateSnowflake(), user_id: userId, badge_id: badge.id, assigned_by: assignedBy || null },
    update: {},
  });
}

export async function revokeBadge(userId: string, badgeName: string): Promise<void> {
  const badge = await prisma.badge.findFirst({ where: { name: badgeName } });
  if (!badge) return;
  await prisma.userBadge.deleteMany({ where: { user_id: userId, badge_id: badge.id } });
}

export async function getUserBadges(userId: string) {
  const entries = await prisma.userBadge.findMany({
    where: { user_id: userId },
    include: { badge: true },
    orderBy: { badge: { priority: 'asc' } },
  });
  return entries.map((e) => e.badge);
}

export async function syncPremiumBadge(userId: string, isPremium: boolean): Promise<void> {
  if (isPremium) {
    await assignBadge(userId, 'OPENCORD_PLUS_SUBSCRIBER');
  } else {
    await revokeBadge(userId, 'OPENCORD_PLUS_SUBSCRIBER');
  }
}
