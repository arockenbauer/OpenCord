import { z } from 'zod';
export declare const createInviteSchema: z.ZodObject<{
    max_age: z.ZodDefault<z.ZodNumber>;
    max_uses: z.ZodDefault<z.ZodNumber>;
    temporary: z.ZodDefault<z.ZodBoolean>;
    unique: z.ZodDefault<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    max_age: number;
    max_uses: number;
    temporary: boolean;
    unique: boolean;
}, {
    max_age?: number | undefined;
    max_uses?: number | undefined;
    temporary?: boolean | undefined;
    unique?: boolean | undefined;
}>;
export declare const createRelationshipSchema: z.ZodObject<{
    username: z.ZodString;
    discriminator: z.ZodString;
}, "strip", z.ZodTypeAny, {
    username: string;
    discriminator: string;
}, {
    username: string;
    discriminator: string;
}>;
export declare const createDMSchema: z.ZodObject<{
    recipient_id: z.ZodOptional<z.ZodString>;
    recipient_ids: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    recipient_id?: string | undefined;
    recipient_ids?: string[] | undefined;
}, {
    recipient_id?: string | undefined;
    recipient_ids?: string[] | undefined;
}>;
export declare const banUserSchema: z.ZodObject<{
    reason: z.ZodOptional<z.ZodString>;
    delete_message_seconds: z.ZodDefault<z.ZodNumber>;
}, "strip", z.ZodTypeAny, {
    delete_message_seconds: number;
    reason?: string | undefined;
}, {
    reason?: string | undefined;
    delete_message_seconds?: number | undefined;
}>;
export declare const autoModRuleSchema: z.ZodObject<{
    name: z.ZodString;
    event_type: z.ZodDefault<z.ZodNumber>;
    trigger_type: z.ZodNumber;
    trigger_metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    actions: z.ZodArray<z.ZodObject<{
        type: z.ZodNumber;
        metadata: z.ZodDefault<z.ZodRecord<z.ZodString, z.ZodUnknown>>;
    }, "strip", z.ZodTypeAny, {
        type: number;
        metadata: Record<string, unknown>;
    }, {
        type: number;
        metadata?: Record<string, unknown> | undefined;
    }>, "many">;
    enabled: z.ZodDefault<z.ZodBoolean>;
    exempt_roles: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
    exempt_channels: z.ZodDefault<z.ZodArray<z.ZodString, "many">>;
}, "strip", z.ZodTypeAny, {
    name: string;
    event_type: number;
    trigger_type: number;
    trigger_metadata: Record<string, unknown>;
    actions: {
        type: number;
        metadata: Record<string, unknown>;
    }[];
    enabled: boolean;
    exempt_roles: string[];
    exempt_channels: string[];
}, {
    name: string;
    trigger_type: number;
    actions: {
        type: number;
        metadata?: Record<string, unknown> | undefined;
    }[];
    event_type?: number | undefined;
    trigger_metadata?: Record<string, unknown> | undefined;
    enabled?: boolean | undefined;
    exempt_roles?: string[] | undefined;
    exempt_channels?: string[] | undefined;
}>;
//# sourceMappingURL=invite.validators.d.ts.map