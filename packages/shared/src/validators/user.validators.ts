import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';

export const updateUserSchema = z.object({
  username: z.string().min(LIMITS.MIN_USERNAME_LENGTH).max(LIMITS.MAX_USERNAME_LENGTH).regex(/^[a-zA-Z0-9_.\-]+$/).optional(),
  bio: z.string().max(LIMITS.MAX_BIO_LENGTH_PREMIUM).optional(),
  banner_color: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  locale: z.enum(['fr', 'en']).optional(),
  theme: z.enum(['dark', 'light', 'amoled']).optional(),
  status: z.enum(['online', 'idle', 'dnd', 'invisible', 'offline']).optional(),
  custom_status_text: z.string().max(LIMITS.MAX_CUSTOM_STATUS_LENGTH).optional().nullable(),
  custom_status_emoji: z.string().optional().nullable(),
  custom_status_expires_at: z.string().datetime().optional().nullable(),
  default_message_notifications: z.number().int().min(0).max(1).optional(),
  explicit_content_filter: z.number().int().min(0).max(2).optional(),
  allow_dms_from: z.number().int().min(0).max(2).optional(),
  discriminator: z.string().regex(/^\d{4}$/).optional(),
  global_name: z.string().max(LIMITS.MAX_USERNAME_LENGTH).optional().nullable(),
}).strip();

export const deleteUserSchema = z.object({
  password: z.string().min(1),
});
