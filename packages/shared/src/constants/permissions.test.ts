import { describe, expect, it } from 'vitest';
import {
  ALL_PERMISSIONS,
  PERMISSION_BITS,
  computeBasePermissions,
  computeChannelPermissions,
  hasPermission,
} from './permissions';

describe('permissions helpers', () => {
  it('treats administrators as having any permission', () => {
    expect(hasPermission(PERMISSION_BITS.ADMINISTRATOR, PERMISSION_BITS.BAN_MEMBERS)).toBe(true);
    expect(hasPermission(PERMISSION_BITS.VIEW_CHANNEL, PERMISSION_BITS.BAN_MEMBERS)).toBe(false);
  });

  it('computes base permissions from everyone, roles and ownership', () => {
    expect(computeBasePermissions([], PERMISSION_BITS.VIEW_CHANNEL, true)).toBe(ALL_PERMISSIONS);

    const perms = computeBasePermissions(
      [PERMISSION_BITS.SEND_MESSAGES, PERMISSION_BITS.ADD_REACTIONS],
      PERMISSION_BITS.VIEW_CHANNEL,
      false,
    );

    expect(perms).toBe(
      PERMISSION_BITS.VIEW_CHANNEL |
      PERMISSION_BITS.SEND_MESSAGES |
      PERMISSION_BITS.ADD_REACTIONS,
    );
  });

  it('returns all permissions when any base role has administrator', () => {
    const perms = computeBasePermissions([PERMISSION_BITS.ADMINISTRATOR], PERMISSION_BITS.VIEW_CHANNEL, false);
    expect(perms).toBe(ALL_PERMISSIONS);
  });

  it('applies everyone, role and member overwrites in order', () => {
    const base = PERMISSION_BITS.VIEW_CHANNEL | PERMISSION_BITS.SEND_MESSAGES | PERMISSION_BITS.ADD_REACTIONS;

    const result = computeChannelPermissions(
      base,
      { allow: 0n, deny: PERMISSION_BITS.SEND_MESSAGES },
      [{ allow: PERMISSION_BITS.ATTACH_FILES, deny: PERMISSION_BITS.ADD_REACTIONS }],
      { allow: PERMISSION_BITS.SEND_MESSAGES, deny: 0n },
    );

    expect((result & PERMISSION_BITS.VIEW_CHANNEL) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.SEND_MESSAGES) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.ATTACH_FILES) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.ADD_REACTIONS) !== 0n).toBe(false);
  });

  it('preserves administrator access at channel level', () => {
    expect(
      computeChannelPermissions(PERMISSION_BITS.ADMINISTRATOR, null, [], null),
    ).toBe(ALL_PERMISSIONS);
  });
});
