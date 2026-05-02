import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';

export const createRoleSchema = z.object({
  name: z.string().max(LIMITS.MAX_ROLE_NAME_LENGTH).default('new role'),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  permissions: z.string().optional(),
  icon: z.string().optional().nullable(),
  unicode_emoji: z.string().optional().nullable(),
}).strip();

export const updateRoleSchema = z.object({
  name: z.string().max(LIMITS.MAX_ROLE_NAME_LENGTH).optional(),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  hoist: z.boolean().optional(),
  mentionable: z.boolean().optional(),
  permissions: z.string().optional(),
  icon: z.string().optional().nullable(),
  unicode_emoji: z.string().optional().nullable(),
}).strip();

export const updateRolePositionsSchema = z.array(z.object({
  id: z.string(),
  position: z.number().int(),
}));

export const updateMemberSchema = z.object({
  nickname: z.string().max(LIMITS.MAX_NICKNAME_LENGTH).optional().nullable(),
  roles: z.array(z.string()).optional(),
  communication_disabled_until: z.string().datetime().optional().nullable(),
  reason: z.string().max(LIMITS.MAX_AUDIT_LOG_REASON_LENGTH).optional(),
}).strip();
