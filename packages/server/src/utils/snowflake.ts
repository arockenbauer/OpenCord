const EPOCH = 1704067200000n;
const WORKER_ID = 1n;
let sequence = 0n;
let lastTimestamp = -1n;

export function generateSnowflake(): string {
  let timestamp = BigInt(Date.now()) - EPOCH;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1n) & 0x3FFFFn;
    if (sequence === 0n) {
      while (timestamp <= lastTimestamp) {
        timestamp = BigInt(Date.now()) - EPOCH;
      }
    }
  } else {
    sequence = 0n;
  }

  lastTimestamp = timestamp;

  const id = (timestamp << 23n) | (WORKER_ID << 18n) | sequence;
  return id.toString();
}

export function snowflakeToDate(snowflake: string): Date {
  const id = BigInt(snowflake);
  const timestamp = (id >> 23n) + EPOCH;
  return new Date(Number(timestamp));
}
