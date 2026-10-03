export class AppError extends Error {
  constructor(
    public status: number,
    message: string,
    public code = "REQUEST_FAILED",
  ) {
    super(message);
  }
}
export function assert(
  condition: unknown,
  status: number,
  message: string,
): asserts condition {
  if (!condition) throw new AppError(status, message);
}
export function safeError(error: unknown) {
  if (error instanceof AppError)
    return { message: error.message, code: error.code, status: error.status };
  console.error(
    JSON.stringify({
      level: "ERROR",
      event: "request_failed",
      name: error instanceof Error ? error.name : "Unknown",
    }),
  );
  return {
    message: "服务暂时不可用，请稍后重试。",
    code: "SERVICE_UNAVAILABLE",
    status: 503,
  };
}
