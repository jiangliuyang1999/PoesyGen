import { describe, expect, it } from 'vitest';

import { listMissingCliLlmFields, loadCliLlmConfig } from './generation.js';

describe('CLI LLM configuration', () => {
  it('requires connection, model and API key before generation', () => {
    expect(listMissingCliLlmFields({})).toEqual(['connection', 'model', 'apiKey']);
    expect(() => loadCliLlmConfig({})).toThrow(
      'LLM_BASE_URL（或 LLM_ENDPOINT）、LLM_MODEL、LLM_API_KEY',
    );
  });

  it('loads an OpenAI-compatible configuration', () => {
    expect(
      listMissingCliLlmFields({
        LLM_ENDPOINT: 'https://example.com/v1/chat/completions',
        LLM_MODEL: 'example-model',
        LLM_API_KEY: 'secret',
      }),
    ).toEqual([]);
    expect(
      loadCliLlmConfig({
        LLM_BASE_URL: 'https://example.com/v1',
        LLM_MODEL: 'example-model',
        LLM_API_KEY: 'secret',
        LLM_JSON_MODE: 'false',
      }),
    ).toMatchObject({
      baseUrl: 'https://example.com/v1',
      model: 'example-model',
      apiKey: 'secret',
      jsonMode: false,
    });
  });
});
