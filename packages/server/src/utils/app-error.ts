export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public message: string,
    public details?: unknown
  ) {
    super(message);
  }
}

// Masquage email pour tiers (ax***@gmail.com)
export function maskEmail(email: string): string {
  if (!email || !email.includes('@')) return email;
  const [local, domain] = email.split('@');
  if (!local || !domain) return email;
  const maskedLocal = local.length > 2 ? local.slice(0, 2) + '***' : local[0] + '***';
  return `${maskedLocal}@${domain}`;
}
