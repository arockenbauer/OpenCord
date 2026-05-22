export const PERMISSION_BITS = {
  CREATE_INSTANT_INVITE: 0x1n,
  KICK_MEMBERS: 0x2n,
  BAN_MEMBERS: 0x4n,
  ADMINISTRATOR: 0x8n,
  MANAGE_CHANNELS: 0x10n,
  MANAGE_GUILD: 0x20n,
  ADD_REACTIONS: 0x40n,
  VIEW_AUDIT_LOG: 0x80n,
  VIEW_CHANNEL: 0x400n,
  SEND_MESSAGES: 0x800n,
  SEND_TTS_MESSAGES: 0x1000n,
  MANAGE_MESSAGES: 0x2000n,
  EMBED_LINKS: 0x4000n,
  ATTACH_FILES: 0x8000n,
  READ_MESSAGE_HISTORY: 0x10000n,
  MENTION_EVERYONE: 0x20000n,
  USE_EXTERNAL_EMOJIS: 0x40000n,
  CONNECT: 0x100000n,
  SPEAK: 0x200000n,
  MUTE_MEMBERS: 0x400000n,
  DEAFEN_MEMBERS: 0x800000n,
  MOVE_MEMBERS: 0x1000000n,
  CHANGE_NICKNAME: 0x4000000n,
  MANAGE_NICKNAMES: 0x8000000n,
  MANAGE_ROLES: 0x10000000n,
  MANAGE_WEBHOOKS: 0x20000000n,
  MANAGE_EMOJIS_AND_STICKERS: 0x40000000n,
  USE_APPLICATION_COMMANDS: 0x80000000n,
  MANAGE_THREADS: 0x400000000n,
  CREATE_PUBLIC_THREADS: 0x800000000n,
  CREATE_PRIVATE_THREADS: 0x1000000000n,
  USE_EXTERNAL_STICKERS: 0x2000000000n,
  SEND_MESSAGES_IN_THREADS: 0x4000000000n,
  MANAGE_EVENTS: 0x8000000000n,
  MODERATE_MEMBERS: 0x10000000000n,
  VIEW_GUILD_ANALYTICS: 0x10000000000n, // 1 << 40
} as const;

export const DEFAULT_EVERYONE_PERMISSIONS =
  PERMISSION_BITS.VIEW_CHANNEL |
  PERMISSION_BITS.SEND_MESSAGES |
  PERMISSION_BITS.ADD_REACTIONS |
  PERMISSION_BITS.READ_MESSAGE_HISTORY |
  PERMISSION_BITS.ATTACH_FILES |
  PERMISSION_BITS.EMBED_LINKS |
  PERMISSION_BITS.USE_APPLICATION_COMMANDS |
  PERMISSION_BITS.CREATE_INSTANT_INVITE |
  PERMISSION_BITS.CHANGE_NICKNAME |
  PERMISSION_BITS.CONNECT |
  PERMISSION_BITS.SPEAK;

export const ALL_PERMISSIONS = Object.values(PERMISSION_BITS).reduce((a, b) => a | b, 0n);

export function hasPermission(permissions: bigint, bit: bigint): boolean {
  if ((permissions & PERMISSION_BITS.ADMINISTRATOR) !== 0n) return true;
  return (permissions & bit) !== 0n;
}

export function computeBasePermissions(
  memberRolePermissions: bigint[],
  everyonePermissions: bigint,
  isOwner: boolean
): bigint {
  if (isOwner) return ALL_PERMISSIONS;
  let perms = everyonePermissions;
  for (const rp of memberRolePermissions) {
    perms |= rp;
  }
  if ((perms & PERMISSION_BITS.ADMINISTRATOR) !== 0n) return ALL_PERMISSIONS;
  return perms;
}

export function computeChannelPermissions(
  basePermissions: bigint,
  everyoneOverwrite: { allow: bigint; deny: bigint } | null,
  roleOverwrites: { allow: bigint; deny: bigint }[],
  memberOverwrite: { allow: bigint; deny: bigint } | null
): bigint {
  if ((basePermissions & PERMISSION_BITS.ADMINISTRATOR) !== 0n) return ALL_PERMISSIONS;
  let perms = basePermissions;

  if (everyoneOverwrite) {
    perms = (perms & ~everyoneOverwrite.deny) | everyoneOverwrite.allow;
  }

  let roleAllow = 0n;
  let roleDeny = 0n;
  for (const ow of roleOverwrites) {
    roleAllow |= ow.allow;
    roleDeny |= ow.deny;
  }
  perms = (perms & ~roleDeny) | roleAllow;

  if (memberOverwrite) {
    perms = (perms & ~memberOverwrite.deny) | memberOverwrite.allow;
  }

  return perms;
}
