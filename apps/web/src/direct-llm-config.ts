import { logConfigSummary, logWebError, logWebEvent } from './web-logger.js';

export interface DirectLlmConfig {
  readonly baseUrl: string;
  readonly endpoint: string;
  readonly model: string;
  readonly apiKey: string;
  readonly providerProfiles: DirectLlmProviderProfiles;
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

interface StoredDirectLlmConfigV1 {
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

interface StoredDirectLlmProviderProfile {
  readonly model: string;
  readonly apiKey?: string;
}

interface StoredDirectLlmConfigV2 {
  readonly version: 2;
  readonly baseUrl: string;
  readonly providerProfiles: Partial<
    Readonly<Record<DirectLlmProviderId, StoredDirectLlmProviderProfile>>
  >;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly jsonMode: boolean;
  readonly rememberApiKey: boolean;
}

type StoredDirectLlmConfig = StoredDirectLlmConfigV1 | StoredDirectLlmConfigV2;

export type DirectLlmProviderId = 'openai' | 'deepseek' | 'ark' | 'qwen';

export interface DirectLlmProviderProfile {
  readonly model: string;
  readonly apiKey: string;
}

export type DirectLlmProviderProfiles = Partial<
  Readonly<Record<DirectLlmProviderId, DirectLlmProviderProfile>>
>;

export interface DirectLlmProviderOption {
  readonly id: DirectLlmProviderId;
  readonly name: string;
  readonly baseUrl: string;
}

export const directLlmProviderOptions: ReadonlyArray<DirectLlmProviderOption> = [
  {
    id: 'openai',
    name: 'OpenAI',
    baseUrl: 'https://api.openai.com/v1',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
  },
  {
    id: 'ark',
    name: '方舟',
    baseUrl: 'https://ark.cn-beijing.volces.com/api/v3',
  },
  {
    id: 'qwen',
    name: '千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
  },
];

export const defaultDirectLlmConfig: DirectLlmConfig = {
  baseUrl: directLlmProviderOptions[0]!.baseUrl,
  endpoint: '',
  model: '',
  apiKey: '',
  providerProfiles: {
    openai: {
      model: '',
      apiKey: '',
    },
  },
  timeoutMs: 120_000,
  maxTokens: 4_096,
  jsonMode: true,
  rememberApiKey: false,
};

export const directLlmConfigStorageKey = 'poesygen:direct-llm-config:v1';
const directLlmSessionKey = 'poesygen:direct-llm-api-key:v1';
const directLlmSessionProfilesKey = 'poesygen:direct-llm-api-keys:v2';

export function loadDirectLlmConfig(
  localStorage: StorageLike | undefined = browserStorage('localStorage'),
  sessionStorage: StorageLike | undefined = browserStorage('sessionStorage'),
): DirectLlmConfig {
  if (localStorage === undefined) {
    logWebEvent('config', '无法访问本地存储，使用默认 LLM 配置');
    return defaultDirectLlmConfig;
  }

  try {
    const raw = localStorage.getItem(directLlmConfigStorageKey);
    if (raw === null) {
      const apiKey =
        loadSessionProviderProfiles(sessionStorage).openai ??
        sessionStorage?.getItem(directLlmSessionKey) ??
        '';
      const config = {
        ...defaultDirectLlmConfig,
        apiKey,
        providerProfiles: {
          openai: {
            model: '',
            apiKey,
          },
        },
      };
      logWebEvent('config', '未找到持久配置，使用默认配置', logConfigSummary(config));
      return config;
    }
    const stored = JSON.parse(raw) as unknown;
    if (!isStoredDirectLlmConfig(stored)) {
      logWebEvent('config', '本地 LLM 配置格式无效，使用默认配置');
      return defaultDirectLlmConfig;
    }
    const config =
      stored.version === 1
        ? loadLegacyDirectLlmConfig(stored, sessionStorage)
        : loadCurrentDirectLlmConfig(stored, sessionStorage);
    logWebEvent('config', '已加载 LLM 配置', logConfigSummary(config));
    return config;
  } catch (error) {
    logWebError('config', '加载 LLM 配置失败，使用默认配置', error);
    return defaultDirectLlmConfig;
  }
}

export function saveDirectLlmConfig(
  config: DirectLlmConfig,
  localStorage: StorageLike | undefined = browserStorage('localStorage'),
  sessionStorage: StorageLike | undefined = browserStorage('sessionStorage'),
): boolean {
  if (localStorage === undefined) {
    logWebEvent('config', '无法访问本地存储，未保存 LLM 配置');
    return false;
  }

  const normalized = normalizeDirectLlmConfig(config);
  const stored: StoredDirectLlmConfigV2 = {
    version: 2,
    baseUrl: normalized.baseUrl,
    providerProfiles: createStoredProviderProfiles(
      normalized.providerProfiles,
      normalized.rememberApiKey,
    ),
    timeoutMs: normalized.timeoutMs,
    maxTokens: normalized.maxTokens,
    jsonMode: normalized.jsonMode,
    rememberApiKey: normalized.rememberApiKey,
  };

  try {
    localStorage.setItem(directLlmConfigStorageKey, JSON.stringify(stored));
    sessionStorage?.removeItem(directLlmSessionKey);
    if (normalized.rememberApiKey) {
      sessionStorage?.removeItem(directLlmSessionProfilesKey);
    } else {
      const sessionProfiles = createSessionProviderProfiles(normalized.providerProfiles);
      if (Object.keys(sessionProfiles).length === 0) {
        sessionStorage?.removeItem(directLlmSessionProfilesKey);
      } else {
        sessionStorage?.setItem(directLlmSessionProfilesKey, JSON.stringify(sessionProfiles));
      }
    }
    logWebEvent('config', '已保存 LLM 配置', logConfigSummary(normalized));
    return true;
  } catch (error) {
    logWebError('config', '保存 LLM 配置失败', error, logConfigSummary(config));
    return false;
  }
}

export function isDirectLlmConfigReady(config: DirectLlmConfig): boolean {
  return (
    config.apiKey.trim() !== '' &&
    config.model.trim() !== '' &&
    isDirectLlmBaseUrl(config.baseUrl) &&
    config.endpoint === '' &&
    Number.isInteger(config.timeoutMs) &&
    config.timeoutMs > 0 &&
    Number.isInteger(config.maxTokens) &&
    config.maxTokens > 0
  );
}

export function switchDirectLlmProvider(
  config: DirectLlmConfig,
  nextBaseUrl: string,
): DirectLlmConfig {
  const currentProvider = findDirectLlmProvider(config.baseUrl);
  const nextProvider = findDirectLlmProvider(nextBaseUrl) ?? directLlmProviderOptions[0]!;
  const providerProfiles: DirectLlmProviderProfiles =
    currentProvider === undefined
      ? config.providerProfiles
      : {
          ...config.providerProfiles,
          [currentProvider.id]: {
            model: config.model,
            apiKey: config.apiKey,
          },
        };
  const nextProfile = providerProfiles[nextProvider.id] ?? emptyProviderProfile();
  return {
    ...config,
    baseUrl: nextProvider.baseUrl,
    endpoint: '',
    model: nextProfile.model,
    apiKey: nextProfile.apiKey,
    providerProfiles,
  };
}

export function updateDirectLlmProviderProfile(
  config: DirectLlmConfig,
  update: Partial<DirectLlmProviderProfile>,
): DirectLlmConfig {
  const provider = findDirectLlmProvider(config.baseUrl) ?? directLlmProviderOptions[0]!;
  const profile = {
    model: config.model,
    apiKey: config.apiKey,
    ...update,
  };
  return {
    ...config,
    ...profile,
    providerProfiles: {
      ...config.providerProfiles,
      [provider.id]: profile,
    },
  };
}

export function normalizeDirectLlmConfig(config: DirectLlmConfig): DirectLlmConfig {
  const provider = findDirectLlmProvider(config.baseUrl);
  const providerSupported = provider !== undefined && config.endpoint.trim() === '';
  if (!providerSupported) {
    return {
      ...defaultDirectLlmConfig,
      timeoutMs: config.timeoutMs,
      maxTokens: config.maxTokens,
      jsonMode: config.jsonMode,
    };
  }
  const profile = {
    model: config.model.trim(),
    apiKey: config.apiKey,
  };
  return {
    ...config,
    baseUrl: provider.baseUrl,
    endpoint: '',
    ...profile,
    providerProfiles: {
      ...sanitizeProviderProfiles(config.providerProfiles),
      [provider.id]: profile,
    },
  };
}

export function isDirectLlmBaseUrl(value: string): boolean {
  const normalized = trimTrailingSlashes(value);
  return directLlmProviderOptions.some(({ baseUrl }) => baseUrl === normalized);
}

function findDirectLlmProvider(value: string): DirectLlmProviderOption | undefined {
  const normalized = trimTrailingSlashes(value);
  return directLlmProviderOptions.find(({ baseUrl }) => baseUrl === normalized);
}

function trimTrailingSlashes(value: string): string {
  return value.trim().replace(/\/+$/u, '');
}

function loadLegacyDirectLlmConfig(
  stored: StoredDirectLlmConfigV1,
  sessionStorage: StorageLike | undefined,
): DirectLlmConfig {
  const provider = findDirectLlmProvider(stored.baseUrl);
  if (provider === undefined || stored.endpoint.trim() !== '') {
    return {
      ...defaultDirectLlmConfig,
      timeoutMs: stored.timeoutMs,
      maxTokens: stored.maxTokens,
      jsonMode: stored.jsonMode,
    };
  }
  const profile = {
    model: stored.model,
    apiKey: stored.rememberApiKey
      ? (stored.apiKey ?? '')
      : (sessionStorage?.getItem(directLlmSessionKey) ?? ''),
  };
  return {
    ...defaultDirectLlmConfig,
    baseUrl: provider.baseUrl,
    ...profile,
    providerProfiles: {
      [provider.id]: profile,
    },
    timeoutMs: stored.timeoutMs,
    maxTokens: stored.maxTokens,
    jsonMode: stored.jsonMode,
    rememberApiKey: stored.rememberApiKey,
  };
}

function loadCurrentDirectLlmConfig(
  stored: StoredDirectLlmConfigV2,
  sessionStorage: StorageLike | undefined,
): DirectLlmConfig {
  const provider = findDirectLlmProvider(stored.baseUrl);
  if (provider === undefined) {
    return {
      ...defaultDirectLlmConfig,
      timeoutMs: stored.timeoutMs,
      maxTokens: stored.maxTokens,
      jsonMode: stored.jsonMode,
    };
  }
  const sessionProfiles = stored.rememberApiKey ? {} : loadSessionProviderProfiles(sessionStorage);
  const providerProfiles: Partial<Record<DirectLlmProviderId, DirectLlmProviderProfile>> = {};
  for (const option of directLlmProviderOptions) {
    const storedProfile = stored.providerProfiles[option.id];
    const apiKey = stored.rememberApiKey
      ? (storedProfile?.apiKey ?? '')
      : (sessionProfiles[option.id] ?? '');
    if (storedProfile !== undefined || apiKey !== '' || option.id === provider.id) {
      providerProfiles[option.id] = {
        model: storedProfile?.model ?? '',
        apiKey,
      };
    }
  }
  const profile = providerProfiles[provider.id] ?? emptyProviderProfile();
  return {
    ...defaultDirectLlmConfig,
    baseUrl: provider.baseUrl,
    ...profile,
    providerProfiles,
    timeoutMs: stored.timeoutMs,
    maxTokens: stored.maxTokens,
    jsonMode: stored.jsonMode,
    rememberApiKey: stored.rememberApiKey,
  };
}

function createStoredProviderProfiles(
  profiles: DirectLlmProviderProfiles,
  includeApiKeys: boolean,
): StoredDirectLlmConfigV2['providerProfiles'] {
  const stored: Partial<Record<DirectLlmProviderId, StoredDirectLlmProviderProfile>> = {};
  for (const option of directLlmProviderOptions) {
    const profile = profiles[option.id];
    if (profile === undefined) continue;
    stored[option.id] = {
      model: profile.model.trim(),
      ...(includeApiKeys && profile.apiKey !== '' ? { apiKey: profile.apiKey } : {}),
    };
  }
  return stored;
}

function createSessionProviderProfiles(
  profiles: DirectLlmProviderProfiles,
): Partial<Record<DirectLlmProviderId, string>> {
  const stored: Partial<Record<DirectLlmProviderId, string>> = {};
  for (const option of directLlmProviderOptions) {
    const apiKey = profiles[option.id]?.apiKey ?? '';
    if (apiKey !== '') stored[option.id] = apiKey;
  }
  return stored;
}

function loadSessionProviderProfiles(
  sessionStorage: StorageLike | undefined,
): Partial<Record<DirectLlmProviderId, string>> {
  const raw = sessionStorage?.getItem(directLlmSessionProfilesKey);
  if (raw === null || raw === undefined) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return {};
    const profiles: Partial<Record<DirectLlmProviderId, string>> = {};
    for (const option of directLlmProviderOptions) {
      const apiKey = parsed[option.id];
      if (typeof apiKey === 'string') profiles[option.id] = apiKey;
    }
    return profiles;
  } catch {
    return {};
  }
}

function sanitizeProviderProfiles(profiles: DirectLlmProviderProfiles): DirectLlmProviderProfiles {
  const sanitized: Partial<Record<DirectLlmProviderId, DirectLlmProviderProfile>> = {};
  for (const option of directLlmProviderOptions) {
    const profile = profiles[option.id];
    if (profile === undefined) continue;
    sanitized[option.id] = {
      model: profile.model.trim(),
      apiKey: profile.apiKey,
    };
  }
  return sanitized;
}

function emptyProviderProfile(): DirectLlmProviderProfile {
  return {
    model: '',
    apiKey: '',
  };
}

function isStoredDirectLlmConfig(value: unknown): value is StoredDirectLlmConfig {
  if (!isRecord(value)) return false;
  if (
    typeof value['baseUrl'] !== 'string' ||
    typeof value['timeoutMs'] !== 'number' ||
    !Number.isInteger(value['timeoutMs']) ||
    value['timeoutMs'] <= 0 ||
    typeof value['maxTokens'] !== 'number' ||
    !Number.isInteger(value['maxTokens']) ||
    value['maxTokens'] <= 0 ||
    typeof value['jsonMode'] !== 'boolean' ||
    typeof value['rememberApiKey'] !== 'boolean'
  ) {
    return false;
  }
  if (value['version'] === 1) {
    return (
      typeof value['endpoint'] === 'string' &&
      typeof value['model'] === 'string' &&
      (value['apiKey'] === undefined || typeof value['apiKey'] === 'string')
    );
  }
  return value['version'] === 2 && isStoredProviderProfiles(value['providerProfiles']);
}

function isStoredProviderProfiles(
  value: unknown,
): value is StoredDirectLlmConfigV2['providerProfiles'] {
  if (!isRecord(value)) return false;
  return Object.entries(value).every(
    ([id, profile]) =>
      isDirectLlmProviderId(id) &&
      isRecord(profile) &&
      typeof profile['model'] === 'string' &&
      (profile['apiKey'] === undefined || typeof profile['apiKey'] === 'string'),
  );
}

function isDirectLlmProviderId(value: string): value is DirectLlmProviderId {
  return directLlmProviderOptions.some(({ id }) => id === value);
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
