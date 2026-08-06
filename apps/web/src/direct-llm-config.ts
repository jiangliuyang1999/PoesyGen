export interface DirectLlmConfig {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly jsonMode: boolean;
  readonly rememberApiKey: boolean;
}

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

interface StoredDirectLlmConfig {
  readonly version: 1;
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly jsonMode: boolean;
  readonly rememberApiKey: boolean;
  readonly apiKey?: string;
}

export const defaultDirectLlmConfig: DirectLlmConfig = {
  baseUrl: 'https://api.openai.com/v1',
  endpoint: '',
  model: '',
  apiKey: '',
  timeoutMs: 120_000,
  maxTokens: 4_096,
  jsonMode: true,
  rememberApiKey: false,
};

export const directLlmConfigStorageKey = 'poesygen:direct-llm-config:v1';
const directLlmSessionKey = 'poesygen:direct-llm-api-key:v1';

export function loadDirectLlmConfig(
  localStorage: StorageLike | undefined = browserStorage('localStorage'),
  sessionStorage: StorageLike | undefined = browserStorage('sessionStorage'),
): DirectLlmConfig {
  if (localStorage === undefined) return defaultDirectLlmConfig;

  try {
    const raw = localStorage.getItem(directLlmConfigStorageKey);
    if (raw === null) {
      return {
        ...defaultDirectLlmConfig,
        apiKey: sessionStorage?.getItem(directLlmSessionKey) ?? '',
      };
    }
    const stored = JSON.parse(raw) as unknown;
    if (!isStoredDirectLlmConfig(stored)) return defaultDirectLlmConfig;
    return {
      baseUrl: stored.baseUrl,
      endpoint: stored.endpoint,
      model: stored.model,
      timeoutMs: stored.timeoutMs,
      maxTokens: stored.maxTokens,
      jsonMode: stored.jsonMode,
      rememberApiKey: stored.rememberApiKey,
      apiKey: stored.rememberApiKey
        ? (stored.apiKey ?? '')
        : (sessionStorage?.getItem(directLlmSessionKey) ?? ''),
    };
  } catch {
    return defaultDirectLlmConfig;
  }
}

export function saveDirectLlmConfig(
  config: DirectLlmConfig,
  localStorage: StorageLike | undefined = browserStorage('localStorage'),
  sessionStorage: StorageLike | undefined = browserStorage('sessionStorage'),
): boolean {
  if (localStorage === undefined) return false;

  const stored: StoredDirectLlmConfig = {
    version: 1,
    baseUrl: config.baseUrl.trim(),
    endpoint: config.endpoint.trim(),
    model: config.model.trim(),
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    jsonMode: config.jsonMode,
    rememberApiKey: config.rememberApiKey,
    ...(config.rememberApiKey ? { apiKey: config.apiKey } : {}),
  };

  try {
    localStorage.setItem(directLlmConfigStorageKey, JSON.stringify(stored));
    if (config.rememberApiKey) {
      sessionStorage?.removeItem(directLlmSessionKey);
    } else if (config.apiKey === '') {
      sessionStorage?.removeItem(directLlmSessionKey);
    } else {
      sessionStorage?.setItem(directLlmSessionKey, config.apiKey);
    }
    return true;
  } catch {
    return false;
  }
}

export function isDirectLlmConfigReady(config: DirectLlmConfig): boolean {
  return (
    config.apiKey.trim() !== '' &&
    config.model.trim() !== '' &&
    (config.endpoint.trim() !== '' || config.baseUrl.trim() !== '') &&
    Number.isInteger(config.timeoutMs) &&
    config.timeoutMs > 0 &&
    Number.isInteger(config.maxTokens) &&
    config.maxTokens > 0
  );
}

function isStoredDirectLlmConfig(value: unknown): value is StoredDirectLlmConfig {
  if (!isRecord(value)) return false;
  return (
    value['version'] === 1 &&
    typeof value['baseUrl'] === 'string' &&
    typeof value['endpoint'] === 'string' &&
    typeof value['model'] === 'string' &&
    typeof value['timeoutMs'] === 'number' &&
    Number.isInteger(value['timeoutMs']) &&
    value['timeoutMs'] > 0 &&
    typeof value['maxTokens'] === 'number' &&
    Number.isInteger(value['maxTokens']) &&
    value['maxTokens'] > 0 &&
    typeof value['jsonMode'] === 'boolean' &&
    typeof value['rememberApiKey'] === 'boolean' &&
    (value['apiKey'] === undefined || typeof value['apiKey'] === 'string')
  );
}

function browserStorage(name: 'localStorage' | 'sessionStorage'): StorageLike | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window[name];
  } catch {
    return undefined;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
