const EPOCH = BigInt(1704067200000); // 2024-01-01T00:00:00Z

let workerId = BigInt(1);
if (typeof process !== 'undefined' && process.env && process.env.WORKER_ID) {
  const parsed = parseInt(process.env.WORKER_ID, 10);
  if (parsed >= 0 && parsed <= 31) workerId = BigInt(parsed);
}

let counter = BigInt(0);

export function generateSnowflake(): string {
  const timestamp = BigInt(Date.now()) - EPOCH;

  counter = (counter + BigInt(1)) & BigInt(0x3FFFF);

  const id = (timestamp << BigInt(23)) | (workerId << BigInt(18)) | counter;

  return id.toString();
}

export function isValidSnowflake(id: string): boolean {
  if (!id || id.trim() === '') return false;
  try {
    BigInt(id);
    return true;
  } catch {
    return false;
  }
}

export function snowflakeToDate(snowflake: string): Date {
  const id = BigInt(snowflake);
  const timestamp = (id >> BigInt(23)) + EPOCH;
  return new Date(Number(timestamp));
}
