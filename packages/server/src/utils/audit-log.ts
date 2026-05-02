import { prisma } from './prisma.js';
import { generateSnowflake } from './snowflake.js';

export async function createAdminAuditLog(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: Record<string, any>;
  ipAddress?: string;
}): Promise<void> {
  await prisma.adminAuditLog.create({
    data: {
      id: generateSnowflake(),
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      details: params.details ? JSON.stringify(params.details) : null,
      ip_address: params.ipAddress || null,
    },
  });
}

export async function createGuildAuditLog(params: {
  guildId: string;
  userId: string;
  actionType: string;
  targetId?: string;
  targetType?: string;
  changes?: Record<string, any>;
  reason?: string;
}): Promise<void> {
  await prisma.auditLog.create({
    data: {
      id: generateSnowflake(),
      guild_id: params.guildId,
      user_id: params.userId,
      action_type: params.actionType,
      target_id: params.targetId || null,
      target_type: params.targetType || null,
      changes: params.changes ? JSON.stringify(params.changes) : null,
      reason: params.reason || null,
    },
  });
}
