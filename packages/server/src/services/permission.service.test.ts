import { describe, expect, it } from 'vitest';
import { PERMISSION_BITS } from '@opencord/shared';
import { computeEffectivePermissions } from './permission.service.js';

describe('permission.service', () => {
  it('applies overwrites consistently with shared permission logic', () => {
    const basePermissions =
      PERMISSION_BITS.VIEW_CHANNEL |
      PERMISSION_BITS.SEND_MESSAGES |
      PERMISSION_BITS.ADD_REACTIONS;

    const result = computeEffectivePermissions(
      basePermissions,
      { allow: 0n, deny: PERMISSION_BITS.SEND_MESSAGES },
      [{ allow: PERMISSION_BITS.ATTACH_FILES, deny: PERMISSION_BITS.ADD_REACTIONS }],
      { allow: PERMISSION_BITS.SEND_MESSAGES, deny: 0n },
    );

    expect((result & PERMISSION_BITS.VIEW_CHANNEL) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.SEND_MESSAGES) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.ATTACH_FILES) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.ADD_REACTIONS) !== 0n).toBe(false);
  });

  it('preserves administrator privileges', () => {
    const result = computeEffectivePermissions(
      PERMISSION_BITS.ADMINISTRATOR,
      { allow: 0n, deny: PERMISSION_BITS.VIEW_CHANNEL },
      [],
      null,
    );

    expect((result & PERMISSION_BITS.VIEW_CHANNEL) !== 0n).toBe(true);
    expect((result & PERMISSION_BITS.BAN_MEMBERS) !== 0n).toBe(true);
  });
});
