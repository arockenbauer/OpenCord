import { describe, expect, it } from 'vitest';
import {
  GatewayEvents,
  LIMITS,
  PERMISSION_BITS,
  generateSnowflake,
  hasPermission,
  snowflakeToDate,
} from './index';

describe('shared package index exports', () => {
  it('re-exports the main constants and helpers', () => {
    expect(GatewayEvents.READY).toBe('READY');
    expect(LIMITS.MAX_MESSAGE_LENGTH).toBe(2000);
    expect(hasPermission(PERMISSION_BITS.ADMINISTRATOR, PERMISSION_BITS.BAN_MEMBERS)).toBe(true);
  });

  it('re-exports snowflake helpers', () => {
    const id = generateSnowflake();
    expect(typeof id).toBe('string');
    expect(snowflakeToDate(id)).toBeInstanceOf(Date);
  });
});
