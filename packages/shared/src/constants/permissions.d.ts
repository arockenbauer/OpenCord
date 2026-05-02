export declare const PERMISSION_BITS: {
    readonly CREATE_INSTANT_INVITE: 1n;
    readonly KICK_MEMBERS: 2n;
    readonly BAN_MEMBERS: 4n;
    readonly ADMINISTRATOR: 8n;
    readonly MANAGE_CHANNELS: 16n;
    readonly MANAGE_GUILD: 32n;
    readonly ADD_REACTIONS: 64n;
    readonly VIEW_AUDIT_LOG: 128n;
    readonly VIEW_CHANNEL: 1024n;
    readonly SEND_MESSAGES: 2048n;
    readonly SEND_TTS_MESSAGES: 4096n;
    readonly MANAGE_MESSAGES: 8192n;
    readonly EMBED_LINKS: 16384n;
    readonly ATTACH_FILES: 32768n;
    readonly READ_MESSAGE_HISTORY: 65536n;
    readonly MENTION_EVERYONE: 131072n;
    readonly USE_EXTERNAL_EMOJIS: 262144n;
    readonly CONNECT: 1048576n;
    readonly SPEAK: 2097152n;
    readonly MUTE_MEMBERS: 4194304n;
    readonly DEAFEN_MEMBERS: 8388608n;
    readonly MOVE_MEMBERS: 16777216n;
    readonly CHANGE_NICKNAME: 67108864n;
    readonly MANAGE_NICKNAMES: 134217728n;
    readonly MANAGE_ROLES: 268435456n;
    readonly MANAGE_WEBHOOKS: 536870912n;
    readonly MANAGE_EMOJIS_AND_STICKERS: 1073741824n;
    readonly USE_APPLICATION_COMMANDS: 2147483648n;
    readonly MANAGE_THREADS: 17179869184n;
    readonly CREATE_PUBLIC_THREADS: 34359738368n;
    readonly CREATE_PRIVATE_THREADS: 68719476736n;
    readonly USE_EXTERNAL_STICKERS: 137438953472n;
    readonly SEND_MESSAGES_IN_THREADS: 274877906944n;
    readonly MANAGE_EVENTS: 549755813888n;
    readonly MODERATE_MEMBERS: 1099511627776n;
};
export declare const DEFAULT_EVERYONE_PERMISSIONS: bigint;
export declare const ALL_PERMISSIONS: bigint;
export declare function hasPermission(permissions: bigint, bit: bigint): boolean;
export declare function computeBasePermissions(memberRolePermissions: bigint[], everyonePermissions: bigint, isOwner: boolean): bigint;
export declare function computeChannelPermissions(basePermissions: bigint, everyoneOverwrite: {
    allow: bigint;
    deny: bigint;
} | null, roleOverwrites: {
    allow: bigint;
    deny: bigint;
}[], memberOverwrite: {
    allow: bigint;
    deny: bigint;
} | null): bigint;
//# sourceMappingURL=permissions.d.ts.map