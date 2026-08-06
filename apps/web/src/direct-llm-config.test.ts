import { describe, expect, it } from 'vitest';

import {
  directLlmConfigStorageKey,
  loadDirectLlmConfig,
  saveDirectLlmConfig,
  type DirectLlmConfig,
} from './direct-llm-config.js';

describe('direct LLM configuration storage', () => {
  it('keeps the API key in session storage by default', () => {
    const local = createStorage();
    const session = createStorage();
    const config = createConfig({ rememberApiKey: false });

    expect(saveDirectLlmConfig(config, local, session)).toBe(true);
    expect(local.getItem(directLlmConfigStorageKey)).not.toContain('secret-key');
    expect(loadDirectLlmConfig(local, session)).toEqual(config);
  });

  it('persists the API key only after explicit opt-in', () => {
    const local = createStorage();
    const session = createStorage();
    const config = createConfig({ rememberApiKey: true });

    expect(saveDirectLlmConfig(config, local, session)).toBe(true);
    expect(local.getItem(directLlmConfigStorageKey)).toContain('secret-key');
    expect(loadDirectLlmConfig(local, session)).toEqual(config);
  });
});

function createConfig(overrides: Partial<DirectLlmConfig>): DirectLlmConfig {
  return {
    baseUrl: 'https://llm.example/v1',
    endpoint: '',
    model: 'test-model',
    apiKey: 'secret-key',
    timeoutMs: 30_000,
    maxTokens: 2_048,
    jsonMode: true,
    rememberApiKey: false,
    ...overrides,
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
