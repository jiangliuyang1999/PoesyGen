const startedAt = Date.now();
let sequence = 0;

const urlKey = /(?:base[-_]?url|endpoint|url)$/iu;
const redacted = '[REDACTED]';

export type WebLogDetails = Readonly<Record<string, unknown>>;

export function logWebEvent(scope: string, event: string, details: WebLogDetails = {}): void {
  console.log(`[PoesyGen][${scope}] ${event}`, {
    sequence: ++sequence,
    timestamp: new Date().toISOString(),
    elapsedMs: Date.now() - startedAt,
    platform: currentPlatform(),
    details: sanitizeLogValue(details),
  });
}

export function logWebError(
  scope: string,
  event: string,
  error: unknown,
  details: WebLogDetails = {},
): void {
  logWebEvent(scope, event, {
    ...details,
    error: serializeError(error),
  });
}

export function logConfigSummary(config: {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly jsonMode: boolean;
  readonly rememberApiKey: boolean;
}): WebLogDetails {
  return {
    baseUrl: config.baseUrl,
    endpoint: config.endpoint,
    model: config.model,
    apiKeyConfigured: config.apiKey.trim() !== '',
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    jsonMode: config.jsonMode,
    rememberApiKey: config.rememberApiKey,
  };
}

export function parseLogBody(body: unknown): unknown {
  if (typeof body !== 'string') return body;
  try {
    return JSON.parse(body) as unknown;
  } catch {
    return body;
  }
}

function currentPlatform(): string {
  if (typeof document === 'undefined') return 'unknown';
  return document.documentElement.dataset['platform'] ?? 'web';
}

function sanitizeLogValue(value: unknown, key = '', seen = new WeakSet<object>()): unknown {
  if (isSensitiveKey(key)) return redacted;
  if (typeof value === 'string') {
    const sanitized = urlKey.test(key) ? redactUrlQuery(value) : value;
    return sanitized.length > 20_000
      ? `${sanitized.slice(0, 20_000)}…[truncated ${sanitized.length - 20_000} chars]`
      : sanitized;
  }
  if (
    value === null ||
    typeof value === 'number' ||
    typeof value === 'boolean' ||
    typeof value === 'undefined'
  ) {
    return value;
  }
  if (value instanceof Error) return serializeError(value);
  if (value instanceof Headers) {
    return sanitizeLogValue(Object.fromEntries(value.entries()), key, seen);
  }
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeLogValue(item, '', seen));
  }
  if (typeof value !== 'object') return String(value);
  if (seen.has(value)) return '[Circular]';
  seen.add(value);
  const sanitized = Object.fromEntries(
    Object.entries(value).map(([entryKey, entryValue]) => [
      entryKey,
      sanitizeLogValue(entryValue, entryKey, seen),
    ]),
  );
  seen.delete(value);
  return sanitized;
}

function redactUrlQuery(value: string): string {
  try {
    const url = new URL(value);
    for (const parameter of [...url.searchParams.keys()]) {
      if (isSensitiveKey(parameter)) {
        url.searchParams.set(parameter, redacted);
      }
    }
    return url.toString();
  } catch {
    return value;
  }
}

function isSensitiveKey(key: string): boolean {
  const normalized = key.replace(/[-_]/gu, '').toLocaleLowerCase('en-US');
  if (normalized === 'rememberapikey') return false;
  return ['apikey', 'authorization', 'cookie', 'credential', 'password', 'secret', 'token'].some(
    (suffix) => normalized === suffix || normalized.endsWith(suffix),
  );
}

function serializeError(error: unknown): WebLogDetails {
  if (!(error instanceof Error)) return { value: error };
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
    ...(error.cause === undefined ? {} : { cause: serializeError(error.cause) }),
  };
}
