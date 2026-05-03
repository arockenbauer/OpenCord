const EPOCH = 1704067200000n; // 2024-01-01T00:00:00Z

let workerId = 1n;
if (typeof process !== 'undefined' && process.env && process.env.WORKER_ID) {
  const parsed = BigInt(process.env.WORKER_ID);
  if (parsed >= 0n && parsed <= 31n) workerId = parsed;
}

let sequence = 0n;
let lastTimestamp = -1n;

export function generateSnowflake(): string {
  let timestamp = BigInt(Date.now()) - EPOCH;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & 0x3FFFFn; // 18 bits
    if (sequence === 0n) {
      while (timestamp <= lastTimestamp) {
        timestamp = BigInt(Date.now()) - EPOCH;
      }
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  const id = (timestamp << 23n) | ((workerId & 31n) << 18n) | (sequence & 0x3FFFFn);
  return id.toString();
}

export function snowflakeToDate(snowflake: string): Date {
  const id = BigInt(snowflake);
  const timestamp = (id >> 23n) + EPOCH;
  return new Date(Number(timestamp));
}
