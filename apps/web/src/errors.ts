import { PoesyGenApiError } from '@poesygen/client-sdk';

export function toUserMessage(error: unknown): string {
  if (error instanceof PoesyGenApiError) {
    const body =
      typeof error.body === 'object' && error.body !== null
        ? (error.body as { error?: unknown; message?: unknown })
        : undefined;
    if (error.status === 503) {
      return '生成服务尚未配置，请启动 Redis 和 Worker 后重试。';
    }
    if (typeof body?.message === 'string') return body.message;
    if (typeof body?.error === 'string') return `请求失败：${body.error}`;
    return `请求失败（HTTP ${error.status}）`;
  }
  return error instanceof Error ? error.message : '发生未知错误';
}
