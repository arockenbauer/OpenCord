import { computeChannelPermissions } from '@opencord/shared';

export interface PermissionOverwriteBits {
  allow: bigint;
  deny: bigint;
}

export function computeEffectivePermissions(
  basePermissions: bigint,
  everyoneOverwrite: PermissionOverwriteBits | null,
  roleOverwrites: PermissionOverwriteBits[],
  memberOverwrite: PermissionOverwriteBits | null,
): bigint {
  return computeChannelPermissions(basePermissions, everyoneOverwrite, roleOverwrites, memberOverwrite);
}
