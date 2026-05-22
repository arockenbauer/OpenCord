import { computeChannelPermissions, TIMEOUT_PRESERVED_PERMISSIONS } from '@opencord/shared';

export interface PermissionOverwriteBits {
  allow: bigint;
  deny: bigint;
}

export function computeEffectivePermissions(
  basePermissions: bigint,
  everyoneOverwrite: PermissionOverwriteBits | null,
  roleOverwrites: PermissionOverwriteBits[],
  memberOverwrite: PermissionOverwriteBits | null,
  isTimeout: boolean = false,
): bigint {
  return computeChannelPermissions(basePermissions, everyoneOverwrite, roleOverwrites, memberOverwrite, isTimeout);
}

// Helper to check if a channel is synced with its parent category
// A channel is synced if it has the same overwrites as its parent category
export async function isChannelSynced(channelId: string, parentId: string): Promise<boolean> {
  const prisma = (await import('../utils/prisma.js')).prisma;
  
  const channelOverwrites = await prisma.permissionOverwrite.findMany({
    where: { channel_id: channelId },
  });
  
  const parentOverwrites = await prisma.permissionOverwrite.findMany({
    where: { channel_id: parentId },
  });
  
  // Compare overwrites (same target_id, target_type, allow, deny)
  if (channelOverwrites.length !== parentOverwrites.length) return false;
  
  const channelMap = new Map();
  for (const ow of channelOverwrites) {
    channelMap.set(`${ow.target_id}:${ow.target_type}`, ow);
  }
  
  for (const parentOw of parentOverwrites) {
    const key = `${parentOw.target_id}:${parentOw.target_type}`;
    const channelOw = channelMap.get(key);
    if (!channelOw) return false;
    if (channelOw.allow !== parentOw.allow || channelOw.deny !== parentOw.deny) return false;
  }
  
  return true;
}

// Sync child channel permissions with parent category
export async function syncChannelWithParent(channelId: string, parentId: string): Promise<void> {
  const prisma = (await import('../utils/prisma.js')).prisma;
  
  // Delete existing overwrites for the child channel
  await prisma.permissionOverwrite.deleteMany({
    where: { channel_id: channelId },
  });
  
  // Copy parent overwrites to child
  const parentOverwrites = await prisma.permissionOverwrite.findMany({
    where: { channel_id: parentId },
  });
  
  for (const ow of parentOverwrites) {
    await prisma.permissionOverwrite.create({
      data: {
        id: (await import('../utils/snowflake.js')).generateSnowflake(),
        channel_id: channelId,
        target_id: ow.target_id,
        target_type: ow.target_type,
        allow: ow.allow,
        deny: ow.deny,
      },
    });
  }
}
