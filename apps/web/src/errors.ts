export function toUserMessage(error: unknown): string {
  return error instanceof Error ? error.message : '发生未知错误';
}
