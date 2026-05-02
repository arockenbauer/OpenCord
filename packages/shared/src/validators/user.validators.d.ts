import { z } from 'zod';
export declare const updateUserSchema: z.ZodObject<{
    username: z.ZodOptional<z.ZodString>;
    bio: z.ZodOptional<z.ZodString>;
    banner_color: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    locale: z.ZodOptional<z.ZodEnum<["fr", "en"]>>;
    theme: z.ZodOptional<z.ZodEnum<["dark"]>>;
    status: z.ZodOptional<z.ZodEnum<["online", "idle", "dnd", "invisible", "offline"]>>;
    custom_status_text: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    custom_status_emoji: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    custom_status_expires_at: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    default_message_notifications: z.ZodOptional<z.ZodNumber>;
    explicit_content_filter: z.ZodOptional<z.ZodNumber>;
    allow_dms_from: z.ZodOptional<z.ZodNumber>;
    discriminator: z.ZodOptional<z.ZodString>;
    global_name: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    username?: string | undefined;
    status?: "online" | "idle" | "dnd" | "invisible" | "offline" | undefined;
    bio?: string | undefined;
    banner_color?: string | null | undefined;
    locale?: "fr" | "en" | undefined;
    theme?: "dark" | undefined;
    custom_status_text?: string | null | undefined;
    custom_status_emoji?: string | null | undefined;
    custom_status_expires_at?: string | null | undefined;
    default_message_notifications?: number | undefined;
    explicit_content_filter?: number | undefined;
    allow_dms_from?: number | undefined;
    discriminator?: string | undefined;
    global_name?: string | null | undefined;
}, {
    username?: string | undefined;
    status?: "online" | "idle" | "dnd" | "invisible" | "offline" | undefined;
    bio?: string | undefined;
    banner_color?: string | null | undefined;
    locale?: "fr" | "en" | undefined;
    theme?: "dark" | undefined;
    custom_status_text?: string | null | undefined;
    custom_status_emoji?: string | null | undefined;
    custom_status_expires_at?: string | null | undefined;
    default_message_notifications?: number | undefined;
    explicit_content_filter?: number | undefined;
    allow_dms_from?: number | undefined;
    discriminator?: string | undefined;
    global_name?: string | null | undefined;
}>;
export declare const deleteUserSchema: z.ZodObject<{
    password: z.ZodString;
}, "strip", z.ZodTypeAny, {
    password: string;
}, {
    password: string;
}>;
//# sourceMappingURL=user.validators.d.ts.map