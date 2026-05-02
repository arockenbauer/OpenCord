import { z } from 'zod';
export declare const createGuildSchema: z.ZodObject<{
    name: z.ZodString;
}, "strip", z.ZodTypeAny, {
    name: string;
}, {
    name: string;
}>;
export declare const updateGuildSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    verification_level: z.ZodOptional<z.ZodNumber>;
    default_message_notifications: z.ZodOptional<z.ZodNumber>;
    explicit_content_filter: z.ZodOptional<z.ZodNumber>;
    system_channel_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    system_channel_flags: z.ZodOptional<z.ZodNumber>;
    afk_channel_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    afk_timeout: z.ZodOptional<z.ZodNumber>;
    preferred_locale: z.ZodOptional<z.ZodEnum<["fr", "en"]>>;
    vanity_url_code: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    invites_disabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    default_message_notifications?: number | undefined;
    explicit_content_filter?: number | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    verification_level?: number | undefined;
    system_channel_id?: string | null | undefined;
    system_channel_flags?: number | undefined;
    afk_channel_id?: string | null | undefined;
    afk_timeout?: number | undefined;
    preferred_locale?: "fr" | "en" | undefined;
    vanity_url_code?: string | null | undefined;
    invites_disabled?: boolean | undefined;
}, {
    default_message_notifications?: number | undefined;
    explicit_content_filter?: number | undefined;
    name?: string | undefined;
    description?: string | null | undefined;
    verification_level?: number | undefined;
    system_channel_id?: string | null | undefined;
    system_channel_flags?: number | undefined;
    afk_channel_id?: string | null | undefined;
    afk_timeout?: number | undefined;
    preferred_locale?: "fr" | "en" | undefined;
    vanity_url_code?: string | null | undefined;
    invites_disabled?: boolean | undefined;
}>;
export declare const deleteGuildSchema: z.ZodObject<{
    confirmation: z.ZodString;
}, "strip", z.ZodTypeAny, {
    confirmation: string;
}, {
    confirmation: string;
}>;
export declare const createChannelSchema: z.ZodObject<{
    name: z.ZodString;
    type: z.ZodNumber;
    parent_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    topic: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nsfw: z.ZodOptional<z.ZodBoolean>;
    position: z.ZodOptional<z.ZodNumber>;
    slowmode_delay: z.ZodOptional<z.ZodNumber>;
    bitrate: z.ZodOptional<z.ZodNumber>;
    user_limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    type: number;
    name: string;
    parent_id?: string | null | undefined;
    topic?: string | null | undefined;
    nsfw?: boolean | undefined;
    position?: number | undefined;
    slowmode_delay?: number | undefined;
    bitrate?: number | undefined;
    user_limit?: number | undefined;
}, {
    type: number;
    name: string;
    parent_id?: string | null | undefined;
    topic?: string | null | undefined;
    nsfw?: boolean | undefined;
    position?: number | undefined;
    slowmode_delay?: number | undefined;
    bitrate?: number | undefined;
    user_limit?: number | undefined;
}>;
export declare const updateChannelSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    topic: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    nsfw: z.ZodOptional<z.ZodBoolean>;
    position: z.ZodOptional<z.ZodNumber>;
    parent_id: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    slowmode_delay: z.ZodOptional<z.ZodNumber>;
    bitrate: z.ZodOptional<z.ZodNumber>;
    user_limit: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    parent_id?: string | null | undefined;
    topic?: string | null | undefined;
    nsfw?: boolean | undefined;
    position?: number | undefined;
    slowmode_delay?: number | undefined;
    bitrate?: number | undefined;
    user_limit?: number | undefined;
}, {
    name?: string | undefined;
    parent_id?: string | null | undefined;
    topic?: string | null | undefined;
    nsfw?: boolean | undefined;
    position?: number | undefined;
    slowmode_delay?: number | undefined;
    bitrate?: number | undefined;
    user_limit?: number | undefined;
}>;
//# sourceMappingURL=guild.validators.d.ts.map