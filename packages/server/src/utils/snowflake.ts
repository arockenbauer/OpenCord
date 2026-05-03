const EPOCH = 1704067200000; // 2024-01-01T00:00:00Z

let workerId = 1;
if (typeof process !== 'undefined' && process.env && process.env.WORKER_ID) {
  const parsed = parseInt(process.env.WORKER_ID, 10);
  if (parsed >= 0 && parsed <= 31) workerId = parsed;
}

let sequence = 0;
let lastTimestamp = -1;

export function generateSnowflake(): string {
  let timestamp = Date.now() - EPOCH;

  if (timestamp === lastTimestamp) {
    sequence = (sequence + 1) & 0x3FFFF; // 18 bits
    if (sequence === 0) {
      // Attendre la prochaine milliseconde
      while (timestamp <= lastTimestamp) {
        timestamp = Date.now() - EPOCH;
      }
    }
  } else {
    sequence = 0;
  }

  lastTimestamp = timestamp;

  // Structure: 41 bits timestamp | 5 bits workerId | 18 bits sequence
  const id = (timestamp << 23) | ((workerId & 31) << 18) | (sequence & 0x3FFFF);
  return id.toString();
}

export function snowflakeToDate(snowflake: string): Date {
  const id = parseInt(snowflake, 10);
  const timestamp = (id >> 23) + EPOCH;
  return new Date(timestamp);
}
