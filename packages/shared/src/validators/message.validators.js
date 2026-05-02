import { z } from 'zod';
import { LIMITS } from '../constants/limits.js';
export const createMessageSchema = z.object({
    content: z.string().max(LIMITS.MAX_MESSAGE_LENGTH).optional(),
    tts: z.boolean().optional(),
    message_reference: z.object({
        message_id: z.string(),
        channel_id: z.string().optional(),
        guild_id: z.string().optional(),
    }).optional(),
    sticker_ids: z.array(z.string()).max(1).optional(),
    flags: z.number().int().optional(),
    embeds: z.array(z.object({
        title: z.string().max(LIMITS.MAX_EMBED_TITLE_LENGTH).optional(),
        description: z.string().max(LIMITS.MAX_EMBED_DESCRIPTION_LENGTH).optional(),
        url: z.string().url().optional(),
        color: z.number().int().optional(),
        timestamp: z.string().datetime().optional(),
        footer: z.object({
            text: z.string().max(2048),
            icon_url: z.string().optional(),
        }).optional(),
        image: z.object({ url: z.string() }).optional(),
        thumbnail: z.object({ url: z.string() }).optional(),
        author: z.object({
            name: z.string().max(256),
            url: z.string().optional(),
            icon_url: z.string().optional(),
        }).optional(),
        fields: z.array(z.object({
            name: z.string().max(LIMITS.MAX_EMBED_FIELD_NAME_LENGTH),
            value: z.string().max(LIMITS.MAX_EMBED_FIELD_VALUE_LENGTH),
            inline: z.boolean().optional(),
        })).max(LIMITS.MAX_EMBED_FIELDS).optional(),
    })).max(LIMITS.MAX_EMBEDS_PER_MESSAGE).optional(),
}).strip();
export const editMessageSchema = z.object({
    content: z.string().max(LIMITS.MAX_MESSAGE_LENGTH).optional(),
    flags: z.number().int().optional(),
}).strip();
export const bulkDeleteSchema = z.object({
    ids: z.array(z.string()).min(1).max(LIMITS.BULK_DELETE_MAX),
});
export const getMessagesSchema = z.object({
    limit: z.coerce.number().int().min(1).max(100).default(50),
    before: z.string().optional(),
    after: z.string().optional(),
    around: z.string().optional(),
});
export const searchMessagesSchema = z.object({
    q: z.string().min(1).max(200),
    limit: z.coerce.number().int().min(1).max(25).default(25),
    offset: z.coerce.number().int().min(0).default(0),
});
//# sourceMappingURL=message.validators.js.map