import { z } from 'zod';
export declare const createMessageSchema: z.ZodObject<{
    content: z.ZodOptional<z.ZodString>;
    tts: z.ZodOptional<z.ZodBoolean>;
    message_reference: z.ZodOptional<z.ZodObject<{
        message_id: z.ZodString;
        channel_id: z.ZodOptional<z.ZodString>;
        guild_id: z.ZodOptional<z.ZodString>;
    }, "strip", z.ZodTypeAny, {
        message_id: string;
        channel_id?: string | undefined;
        guild_id?: string | undefined;
    }, {
        message_id: string;
        channel_id?: string | undefined;
        guild_id?: string | undefined;
    }>>;
    sticker_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    flags: z.ZodOptional<z.ZodNumber>;
    embeds: z.ZodOptional<z.ZodArray<z.ZodObject<{
        title: z.ZodOptional<z.ZodString>;
        description: z.ZodOptional<z.ZodString>;
        url: z.ZodOptional<z.ZodString>;
        color: z.ZodOptional<z.ZodNumber>;
        timestamp: z.ZodOptional<z.ZodString>;
        footer: z.ZodOptional<z.ZodObject<{
            text: z.ZodString;
            icon_url: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            text: string;
            icon_url?: string | undefined;
        }, {
            text: string;
            icon_url?: string | undefined;
        }>>;
        image: z.ZodOptional<z.ZodObject<{
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            url: string;
        }, {
            url: string;
        }>>;
        thumbnail: z.ZodOptional<z.ZodObject<{
            url: z.ZodString;
        }, "strip", z.ZodTypeAny, {
            url: string;
        }, {
            url: string;
        }>>;
        author: z.ZodOptional<z.ZodObject<{
            name: z.ZodString;
            url: z.ZodOptional<z.ZodString>;
            icon_url: z.ZodOptional<z.ZodString>;
        }, "strip", z.ZodTypeAny, {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        }, {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        }>>;
        fields: z.ZodOptional<z.ZodArray<z.ZodObject<{
            name: z.ZodString;
            value: z.ZodString;
            inline: z.ZodOptional<z.ZodBoolean>;
        }, "strip", z.ZodTypeAny, {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }, {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }>, "many">>;
    }, "strip", z.ZodTypeAny, {
        description?: string | undefined;
        title?: string | undefined;
        url?: string | undefined;
        color?: number | undefined;
        timestamp?: string | undefined;
        footer?: {
            text: string;
            icon_url?: string | undefined;
        } | undefined;
        image?: {
            url: string;
        } | undefined;
        thumbnail?: {
            url: string;
        } | undefined;
        author?: {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        } | undefined;
        fields?: {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }[] | undefined;
    }, {
        description?: string | undefined;
        title?: string | undefined;
        url?: string | undefined;
        color?: number | undefined;
        timestamp?: string | undefined;
        footer?: {
            text: string;
            icon_url?: string | undefined;
        } | undefined;
        image?: {
            url: string;
        } | undefined;
        thumbnail?: {
            url: string;
        } | undefined;
        author?: {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        } | undefined;
        fields?: {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }[] | undefined;
    }>, "many">>;
}, "strip", z.ZodTypeAny, {
    content?: string | undefined;
    tts?: boolean | undefined;
    message_reference?: {
        message_id: string;
        channel_id?: string | undefined;
        guild_id?: string | undefined;
    } | undefined;
    sticker_ids?: string[] | undefined;
    flags?: number | undefined;
    embeds?: {
        description?: string | undefined;
        title?: string | undefined;
        url?: string | undefined;
        color?: number | undefined;
        timestamp?: string | undefined;
        footer?: {
            text: string;
            icon_url?: string | undefined;
        } | undefined;
        image?: {
            url: string;
        } | undefined;
        thumbnail?: {
            url: string;
        } | undefined;
        author?: {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        } | undefined;
        fields?: {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }[] | undefined;
    }[] | undefined;
}, {
    content?: string | undefined;
    tts?: boolean | undefined;
    message_reference?: {
        message_id: string;
        channel_id?: string | undefined;
        guild_id?: string | undefined;
    } | undefined;
    sticker_ids?: string[] | undefined;
    flags?: number | undefined;
    embeds?: {
        description?: string | undefined;
        title?: string | undefined;
        url?: string | undefined;
        color?: number | undefined;
        timestamp?: string | undefined;
        footer?: {
            text: string;
            icon_url?: string | undefined;
        } | undefined;
        image?: {
            url: string;
        } | undefined;
        thumbnail?: {
            url: string;
        } | undefined;
        author?: {
            name: string;
            url?: string | undefined;
            icon_url?: string | undefined;
        } | undefined;
        fields?: {
            value: string;
            name: string;
            inline?: boolean | undefined;
        }[] | undefined;
    }[] | undefined;
}>;
export declare const editMessageSchema: z.ZodObject<{
    content: z.ZodOptional<z.ZodString>;
    flags: z.ZodOptional<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    content?: string | undefined;
    flags?: number | undefined;
}, {
    content?: string | undefined;
    flags?: number | undefined;
}>;
export declare const bulkDeleteSchema: z.ZodObject<{
    ids: z.ZodArray<z.ZodString, "many">;
}, "strip", z.ZodTypeAny, {
    ids: string[];
}, {
    ids: string[];
}>;
export declare const getMessagesSchema: z.ZodObject<{
    limit: z.ZodDefault<z.ZodNumber>;
    before: z.ZodOptional<z.ZodString>;
    after: z.ZodOptional<z.ZodString>;
    around: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    before?: string | undefined;
    after?: string | undefined;
    around?: string | undefined;
}, {
    limit?: number | undefined;
    before?: string | undefined;
    after?: string | undefined;
    around?: string | undefined;
}>;
export declare const searchMessagesSchema: z.ZodObject<{
    q: z.ZodString;
    limit: z.ZodDefault<z.ZodNumber>;
    offset: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    limit: number;
    q: string;
    offset: number;
}, {
    q: string;
    limit?: number | undefined;
    offset?: number | undefined;
}>;
//# sourceMappingURL=message.validators.d.ts.map