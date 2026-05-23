import { describe, expect, it } from 'vitest';
import { generateSnowflake, isValidSnowflake, snowflakeToDate } from './snowflake.js';

describe('snowflake', () => {
  it('generates a valid snowflake string', () => {
    const id = generateSnowflake();
    expect(typeof id).toBe('string');
    expect(isValidSnowflake(id)).toBe(true);
  });

  it('generates unique snowflakes', () => {
    const id1 = generateSnowflake();
    const id2 = generateSnowflake();
    expect(id1).not.toBe(id2);
  });

  it('validates snowflake strings correctly', () => {
    expect(isValidSnowflake('123456789')).toBe(true);
    expect(isValidSnowflake('0')).toBe(true);
    expect(isValidSnowflake('not-a-number')).toBe(false);
    // Empty string is not valid
    expect(isValidSnowflake('')).toBe(false);
  });

  it('converts snowflake to date', () => {
    const before = Date.now();
    const id = generateSnowflake();
    const after = Date.now();
    const date = snowflakeToDate(id);
    expect(date.getTime()).toBeGreaterThanOrEqual(before - 1000);
    expect(date.getTime()).toBeLessThanOrEqual(after + 1000);
  });
});
