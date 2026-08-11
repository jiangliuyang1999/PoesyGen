import { describe, expect, it } from 'vitest';

import {
  defaultDirectLlmConfig,
  directLlmConfigStorageKey,
  directLlmProviderOptions,
  isDirectLlmConfigReady,
  loadDirectLlmConfig,
  saveDirectLlmConfig,
  type DirectLlmConfig,
} from './direct-llm-config.js';

describe('direct LLM configuration storage', () => {
  it('keeps every provider API key in session storage by default', () => {
    const local = createStorage();
    const session = createStorage();
    const config = createMultiProviderConfig(false);

    expect(saveDirectLlmConfig(config, local, session)).toBe(true);
    expect(local.getItem(directLlmConfigStorageKey)).not.toContain('openai-secret');
    expect(local.getItem(directLlmConfigStorageKey)).not.toContain('deepseek-secret');
    expect(local.getItem(directLlmConfigStorageKey)).toContain('gpt-4.1-mini');
    expect(local.getItem(directLlmConfigStorageKey)).toContain('deepseek-chat');
    expect(loadDirectLlmConfig(local, session)).toEqual(config);
  });

  it('persists every provider API key only after explicit opt-in', () => {
    const local = createStorage();
    const session = createStorage();
    const config = createMultiProviderConfig(true);

    expect(saveDirectLlmConfig(config, local, session)).toBe(true);
    expect(local.getItem(directLlmConfigStorageKey)).toContain('openai-secret');
    expect(local.getItem(directLlmConfigStorageKey)).toContain('deepseek-secret');
    expect(loadDirectLlmConfig(local, session)).toEqual(config);
  });

  it('exposes only the supported provider base URLs', () => {
    expect(directLlmProviderOptions).toEqual([
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
    ]);
  });

  it('migrates a supported v1 provider profile and session API key', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(
      directLlmConfigStorageKey,
      JSON.stringify({
        version: 1,
        baseUrl: 'https://api.deepseek.com/',
        endpoint: '',
        model: 'deepseek-chat',
        timeoutMs: 30_000,
        maxTokens: 2_048,
        jsonMode: true,
        rememberApiKey: false,
      }),
    );
    session.setItem('poesygen:direct-llm-api-key:v1', 'legacy-session-secret');

    expect(loadDirectLlmConfig(local, session)).toEqual({
      ...defaultDirectLlmConfig,
      baseUrl: 'https://api.deepseek.com',
      model: 'deepseek-chat',
      apiKey: 'legacy-session-secret',
      providerProfiles: {
        deepseek: {
          model: 'deepseek-chat',
          apiKey: 'legacy-session-secret',
        },
      },
      timeoutMs: 30_000,
      maxTokens: 2_048,
    });
  });

  it('migrates custom URLs and endpoints to the default provider', () => {
    const local = createStorage();
    const session = createStorage();
    local.setItem(
      directLlmConfigStorageKey,
      JSON.stringify({
        version: 1,
        baseUrl: 'https://llm.example/v1',
        endpoint: 'https://llm.example/custom',
        model: 'legacy-model',
        timeoutMs: 30_000,
        maxTokens: 2_048,
        jsonMode: true,
        rememberApiKey: true,
        apiKey: 'legacy-secret',
      }),
    );

    expect(loadDirectLlmConfig(local, session)).toEqual({
      ...defaultDirectLlmConfig,
      timeoutMs: 30_000,
      maxTokens: 2_048,
    });
  });

  it('rejects programmatic configurations outside the URL allowlist', () => {
    expect(isDirectLlmConfigReady(createConfig({}))).toBe(true);
    expect(
      isDirectLlmConfigReady(
        createConfig({
          baseUrl: 'https://llm.example/v1',
        }),
      ),
    ).toBe(false);
    expect(
      isDirectLlmConfigReady(
        createConfig({
          endpoint: 'https://api.openai.com/v1/chat/completions',
        }),
      ),
    ).toBe(false);
  });
});

function createConfig(overrides: Partial<DirectLlmConfig>): DirectLlmConfig {
  return {
    baseUrl: 'https://api.deepseek.com',
    endpoint: '',
    model: 'test-model',
    apiKey: 'secret-key',
    providerProfiles: {
      deepseek: {
        model: 'test-model',
        apiKey: 'secret-key',
      },
    },
    timeoutMs: 30_000,
    maxTokens: 2_048,
    jsonMode: true,
    rememberApiKey: false,
    ...overrides,
  };
}

function createMultiProviderConfig(rememberApiKey: boolean): DirectLlmConfig {
  return {
    baseUrl: 'https://api.deepseek.com',
    endpoint: '',
    model: 'deepseek-chat',
    apiKey: 'deepseek-secret',
    providerProfiles: {
      openai: {
        model: 'gpt-4.1-mini',
        apiKey: 'openai-secret',
      },
      deepseek: {
        model: 'deepseek-chat',
        apiKey: 'deepseek-secret',
      },
    },
    timeoutMs: 30_000,
    maxTokens: 2_048,
    jsonMode: true,
    rememberApiKey,
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
    removeItem(key: string): void {
      values.delete(key);
    },
  };
}
