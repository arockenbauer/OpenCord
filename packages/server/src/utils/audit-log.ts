import { prisma } from './prisma.js';
import { generateSnowflake } from './snowflake.js';

export async function createAdminAuditLog(params: {
  adminId: string;
  action: string;
  targetType?: string;
  targetId?: string;
  details?: any;
  ipAddress?: string;
}): Promise<void> {
  const detailsValue = params.details == null
    ? null
    : typeof params.details === 'string'
      ? params.details
      : JSON.stringify(params.details);

  await prisma.adminAuditLog.create({
    data: {
      id: generateSnowflake(),
      admin_id: params.adminId,
      action: params.action,
      target_type: params.targetType || null,
      target_id: params.targetId || null,
      details: detailsValue,
      ip_address: params.ipAddress || null,
    },
  });
}

export async function createGuildAuditLog(params: {
  guildId: string;
  userId: string;
  actionType: number;
  targetId?: string;
  targetType?: string;
  changes?: Array<{key: string; old_value: any; new_value: any}>;
  reason?: string;
}): Promise<void> {
  const changesValue: string | null = params.changes ? JSON.stringify(params.changes) : null;
  await prisma.auditLog.create({
    data: {
      id: generateSnowflake(),
      guild_id: params.guildId,
      user_id: params.userId,
      action_type: params.actionType,
      target_id: params.targetId || null,
      target_type: params.targetType || null,
      changes: changesValue,
      reason: params.reason || null,
    },
  });
}
