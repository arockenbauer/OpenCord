import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateSnowflake, snowflakeToDate } from './snowflake';

describe('snowflake utilities', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-05-20T12:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('generates increasing snowflakes', () => {
    const first = BigInt(generateSnowflake());
    const second = BigInt(generateSnowflake());

    expect(second).toBeGreaterThan(first);
  });

  it('decodes a snowflake back to its timestamp', () => {
    const id = generateSnowflake();
    expect(snowflakeToDate(id).toISOString()).toBe('2026-05-20T12:00:00.000Z');
  });
});
