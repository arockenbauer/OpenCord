export class AppError extends Error {
  constructor(
    public statusCode: number,
    public code: string,
    public override message: string,
    public details?: unknown
  ) {
    super(message);
  }
}
