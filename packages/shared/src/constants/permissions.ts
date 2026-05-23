export const PERMISSION_BITS = {
  // General permissions (bits 0-7)
  CREATE_INSTANT_INVITE: 0x1n,        // 1 << 0
  KICK_MEMBERS: 0x2n,                // 1 << 1
  BAN_MEMBERS: 0x4n,                 // 1 << 2
  ADMINISTRATOR: 0x8n,               // 1 << 3
  MANAGE_CHANNELS: 0x10n,            // 1 << 4
  MANAGE_GUILD: 0x20n,              // 1 << 5
  ADD_REACTIONS: 0x40n,              // 1 << 6
  VIEW_AUDIT_LOG: 0x80n,             // 1 << 7

  // General permissions (bits 8-12)
  PRIORITY_SPEAKER: 0x100n,          // 1 << 8
  STREAM: 0x200n,                    // 1 << 9
  VIEW_CHANNEL: 0x400n,              // 1 << 10
  SEND_MESSAGES: 0x800n,            // 1 << 11
  SEND_TTS_MESSAGES: 0x1000n,       // 1 << 12

  // Text permissions (bits 13-19)
  MANAGE_MESSAGES: 0x2000n,         // 1 << 13
  EMBED_LINKS: 0x4000n,             // 1 << 14
  ATTACH_FILES: 0x8000n,            // 1 << 15
  READ_MESSAGE_HISTORY: 0x10000n,    // 1 << 16
  MENTION_EVERYONE: 0x20000n,       // 1 << 17
  USE_EXTERNAL_EMOJIS: 0x40000n,    // 1 << 18
  VIEW_GUILD_INSIGHTS: 0x80000n,    // 1 << 19

  // Voice permissions (bits 20-25)
  CONNECT: 0x100000n,               // 1 << 20
  SPEAK: 0x200000n,                 // 1 << 21
  MUTE_MEMBERS: 0x400000n,          // 1 << 22
  DEAFEN_MEMBERS: 0x800000n,        // 1 << 23
  MOVE_MEMBERS: 0x1000000n,         // 1 << 24
  USE_VAD: 0x2000000n,              // 1 << 25

  // General permissions (bits 26-28)
  CHANGE_NICKNAME: 0x4000000n,      // 1 << 26
  MANAGE_NICKNAMES: 0x8000000n,     // 1 << 27
  MANAGE_ROLES: 0x10000000n,         // 1 << 28
  MANAGE_WEBHOOKS: 0x20000000n,     // 1 << 29
  MANAGE_EMOJIS_AND_STICKERS: 0x40000000n, // 1 << 30

  // General permissions (bits 31-32)
  USE_APPLICATION_COMMANDS: 0x80000000n,    // 1 << 31
  REQUEST_TO_SPEAK: 0x100000000n,           // 1 << 32

  // Thread permissions (bits 34-36)
  MANAGE_THREADS: 0x400000000n,             // 1 << 34
  CREATE_PUBLIC_THREADS: 0x800000000n,      // 1 << 35
  CREATE_PRIVATE_THREADS: 0x1000000000n,    // 1 << 36
  USE_EXTERNAL_STICKERS: 0x2000000000n,     // 1 << 37
  SEND_MESSAGES_IN_THREADS: 0x4000000000n,  // 1 << 38

  // Advanced permissions (bits 39-52)
  USE_EMBEDDED_ACTIVITIES: 0x8000000000n,   // 1 << 39
  MODERATE_MEMBERS: 0x10000000000n,         // 1 << 40
  VIEW_CREATOR_ANALYTICS: 0x20000000000n,   // 1 << 41
  USE_SOUNDBOARD: 0x40000000000n,           // 1 << 42
  CREATE_GUILD_EXPRESSIONS: 0x80000000000n,  // 1 << 43
  CREATE_EVENTS: 0x100000000000n,           // 1 << 44
  USE_EXTERNAL_SOUNDS: 0x200000000000n,     // 1 << 45
  SEND_VOICE_MESSAGES: 0x400000000000n,     // 1 << 46
  SET_VOICE_CHANNEL_STATUS: 0x1000000000000n, // 1 << 48
  SEND_POLLS: 0x2000000000000n,             // 1 << 49
  USE_EXTERNAL_APPS: 0x4000000000000n,      // 1 << 50
  PIN_MESSAGES: 0x8000000000000n,           // 1 << 51
  BYPASS_SLOWMODE: 0x10000000000000n,       // 1 << 52
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

// Permissions implicitly denied when VIEW_CHANNEL is denied (text channels)
export const IMPLICIT_DENY_VIEW_CHANNEL = 
  PERMISSION_BITS.SEND_MESSAGES |
  PERMISSION_BITS.ADD_REACTIONS |
  PERMISSION_BITS.EMBED_LINKS |
  PERMISSION_BITS.ATTACH_FILES |
  PERMISSION_BITS.READ_MESSAGE_HISTORY |
  PERMISSION_BITS.MENTION_EVERYONE |
  PERMISSION_BITS.USE_EXTERNAL_EMOJIS |
  PERMISSION_BITS.SEND_TTS_MESSAGES |
  PERMISSION_BITS.USE_APPLICATION_COMMANDS |
  PERMISSION_BITS.SEND_MESSAGES_IN_THREADS |
  PERMISSION_BITS.USE_EXTERNAL_STICKERS |
  PERMISSION_BITS.SEND_POLLS |
  PERMISSION_BITS.PIN_MESSAGES;

// Permissions implicitly denied when SEND_MESSAGES is denied (text channels)
export const IMPLICIT_DENY_SEND_MESSAGES = 
  PERMISSION_BITS.MENTION_EVERYONE |
  PERMISSION_BITS.SEND_TTS_MESSAGES |
  PERMISSION_BITS.ATTACH_FILES |
  PERMISSION_BITS.EMBED_LINKS |
  PERMISSION_BITS.USE_EXTERNAL_EMOJIS |
  PERMISSION_BITS.SEND_POLLS;

// Permissions implicitly denied when CONNECT is denied (voice channels)
export const IMPLICIT_DENY_CONNECT = 
  PERMISSION_BITS.SPEAK |
  PERMISSION_BITS.MUTE_MEMBERS |
  PERMISSION_BITS.DEAFEN_MEMBERS |
  PERMISSION_BITS.MOVE_MEMBERS |
  PERMISSION_BITS.PRIORITY_SPEAKER |
  PERMISSION_BITS.STREAM |
  PERMISSION_BITS.USE_VAD |
  PERMISSION_BITS.SET_VOICE_CHANNEL_STATUS |
  PERMISSION_BITS.USE_SOUNDBOARD |
  PERMISSION_BITS.SEND_VOICE_MESSAGES;

// Permissions that a member timeout keeps (Discord behavior)
export const TIMEOUT_PRESERVED_PERMISSIONS = 
  PERMISSION_BITS.VIEW_CHANNEL |
  PERMISSION_BITS.READ_MESSAGE_HISTORY |
  PERMISSION_BITS.CONNECT; // To be able to join but not speak

export function computeChannelPermissions(
  basePermissions: bigint,
  everyoneOverwrite: { allow: bigint; deny: bigint } | null,
  roleOverwrites: { allow: bigint; deny: bigint }[],
  memberOverwrite: { allow: bigint; deny: bigint } | null,
  isTimeout: boolean = false
): bigint {
  if ((basePermissions & PERMISSION_BITS.ADMINISTRATOR) !== 0n) {
    // Even admins are subject to timeouts (Discord behavior: owners exempt, but we handle that in getMemberPermissions)
    if (isTimeout) {
      return TIMEOUT_PRESERVED_PERMISSIONS;
    }
    return ALL_PERMISSIONS;
  }
  
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

  // Apply implicit permissions (Discord behavior)
  // If VIEW_CHANNEL is denied, implicitly deny related permissions
  if ((perms & PERMISSION_BITS.VIEW_CHANNEL) === 0n) {
    perms &= ~IMPLICIT_DENY_VIEW_CHANNEL;
  }
  
  // If SEND_MESSAGES is denied, implicitly deny related permissions
  if ((perms & PERMISSION_BITS.SEND_MESSAGES) === 0n) {
    perms &= ~IMPLICIT_DENY_SEND_MESSAGES;
  }
  
  // If CONNECT is denied, implicitly deny related voice permissions
  if ((perms & PERMISSION_BITS.CONNECT) === 0n) {
    perms &= ~IMPLICIT_DENY_CONNECT;
  }

  // Apply timeout restrictions (Discord behavior: remove all except VIEW_CHANNEL and READ_MESSAGE_HISTORY)
  if (isTimeout) {
    perms &= TIMEOUT_PRESERVED_PERMISSIONS;
  }

  return perms;
}
