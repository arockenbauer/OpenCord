import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
export const createGuildSchema = z.object({
    name: z.string().min(LIMITS.MIN_GUILD_NAME_LENGTH).max(LIMITS.MAX_GUILD_NAME_LENGTH),
}).strip();
export const updateGuildSchema = z.object({
    name: z.string().min(LIMITS.MIN_GUILD_NAME_LENGTH).max(LIMITS.MAX_GUILD_NAME_LENGTH).optional(),
    description: z.string().max(LIMITS.MAX_GUILD_DESCRIPTION_LENGTH).optional().nullable(),
    verification_level: z.number().int().min(0).max(4).optional(),
    default_message_notifications: z.number().int().min(0).max(1).optional(),
    explicit_content_filter: z.number().int().min(0).max(2).optional(),
    system_channel_id: z.string().optional().nullable(),
    system_channel_flags: z.number().int().optional(),
    afk_channel_id: z.string().optional().nullable(),
    afk_timeout: z.number().int().optional(),
    preferred_locale: z.enum(['fr', 'en']).optional(),
    vanity_url_code: z.string().min(3).max(32).regex(/^[a-zA-Z0-9-]+$/).optional().nullable(),
    invites_disabled: z.boolean().optional(),
}).strip();
export const deleteGuildSchema = z.object({
    confirmation: z.string().min(1),
});
export const createChannelSchema = z.object({
    name: z.string().min(LIMITS.MIN_CHANNEL_NAME_LENGTH).max(LIMITS.MAX_CHANNEL_NAME_LENGTH),
    type: z.number().int().min(0).max(15),
    parent_id: z.string().optional().nullable(),
    topic: z.string().max(LIMITS.MAX_CHANNEL_TOPIC_LENGTH).optional().nullable(),
    nsfw: z.boolean().optional(),
    position: z.number().int().optional(),
    slowmode_delay: z.number().int().min(0).max(21600).optional(),
    bitrate: z.number().int().optional(),
    user_limit: z.number().int().min(0).max(99).optional(),
}).strip();
export const updateChannelSchema = z.object({
    name: z.string().min(LIMITS.MIN_CHANNEL_NAME_LENGTH).max(LIMITS.MAX_CHANNEL_NAME_LENGTH).optional(),
    topic: z.string().max(LIMITS.MAX_CHANNEL_TOPIC_LENGTH).optional().nullable(),
    nsfw: z.boolean().optional(),
    position: z.number().int().optional(),
    parent_id: z.string().optional().nullable(),
    slowmode_delay: z.number().int().min(0).max(21600).optional(),
    bitrate: z.number().int().optional(),
    user_limit: z.number().int().min(0).max(99).optional(),
}).strip();
//# sourceMappingURL=guild.validators.js.map