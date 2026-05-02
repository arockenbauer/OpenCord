import { z } from 'zod';
export declare const createRoleSchema: z.ZodObject<{
    name: z.ZodDefault<z.ZodString>;
    color: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    hoist: z.ZodOptional<z.ZodBoolean>;
    mentionable: z.ZodOptional<z.ZodBoolean>;
    permissions: z.ZodOptional<z.ZodString>;
    icon: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    unicode_emoji: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    color?: string | null | undefined;
    hoist?: boolean | undefined;
    mentionable?: boolean | undefined;
    permissions?: string | undefined;
    icon?: string | null | undefined;
    unicode_emoji?: string | null | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    hoist?: boolean | undefined;
    mentionable?: boolean | undefined;
    permissions?: string | undefined;
    icon?: string | null | undefined;
    unicode_emoji?: string | null | undefined;
}>;
export declare const updateRoleSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    color: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    hoist: z.ZodOptional<z.ZodBoolean>;
    mentionable: z.ZodOptional<z.ZodBoolean>;
    permissions: z.ZodOptional<z.ZodString>;
    icon: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    unicode_emoji: z.ZodNullable<z.ZodOptional<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    color?: string | null | undefined;
    hoist?: boolean | undefined;
    mentionable?: boolean | undefined;
    permissions?: string | undefined;
    icon?: string | null | undefined;
    unicode_emoji?: string | null | undefined;
}, {
    name?: string | undefined;
    color?: string | null | undefined;
    hoist?: boolean | undefined;
    mentionable?: boolean | undefined;
    permissions?: string | undefined;
    icon?: string | null | undefined;
    unicode_emoji?: string | null | undefined;
}>;
export declare const updateRolePositionsSchema: z.ZodArray<z.ZodObject<{
    id: z.ZodString;
    position: z.ZodNumber;
}, "strip", z.ZodTypeAny, {
    position: number;
    id: string;
}, {
    position: number;
    id: string;
}>, "many">;
export declare const updateMemberSchema: z.ZodObject<{
    nickname: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    roles: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    communication_disabled_until: z.ZodNullable<z.ZodOptional<z.ZodString>>;
    reason: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    nickname?: string | null | undefined;
    roles?: string[] | undefined;
    communication_disabled_until?: string | null | undefined;
    reason?: string | undefined;
}, {
    nickname?: string | null | undefined;
    roles?: string[] | undefined;
    communication_disabled_until?: string | null | undefined;
    reason?: string | undefined;
}>;
//# sourceMappingURL=role.validators.d.ts.map