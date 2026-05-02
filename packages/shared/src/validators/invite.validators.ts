import { z } from 'zod';

export const createInviteSchema = z.object({
  max_age: z.number().int().min(0).default(86400),
  max_uses: z.number().int().min(0).default(0),
  temporary: z.boolean().default(false),
  unique: z.boolean().default(true),
}).strip();

export const createRelationshipSchema = z.object({
  username: z.string().min(1),
  discriminator: z.string().regex(/^\d{4}$/),
}).strip();

export const createDMSchema = z.object({
  recipient_id: z.string().optional(),
  recipient_ids: z.array(z.string()).max(9).optional(),
}).strip();

export const banUserSchema = z.object({
  reason: z.string().max(512).optional(),
  delete_message_seconds: z.number().int().min(0).max(604800).default(0),
}).strip();

export const autoModRuleSchema = z.object({
  name: z.string().min(1).max(100),
  event_type: z.number().int().default(1),
  trigger_type: z.number().int().min(1).max(5),
  trigger_metadata: z.record(z.unknown()).default({}),
  actions: z.array(z.object({
    type: z.number().int().min(1).max(3),
    metadata: z.record(z.unknown()).default({}),
  })).min(1),
  enabled: z.boolean().default(true),
  exempt_roles: z.array(z.string()).default([]),
  exempt_channels: z.array(z.string()).default([]),
}).strip();
