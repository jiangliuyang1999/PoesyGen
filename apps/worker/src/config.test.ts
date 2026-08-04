import { describe, expect, it } from 'vitest';

import { ExampleDraftEngine, LlmDraftEngine } from '@poesygen/workflow';

import { loadWorkerConfig } from './config.js';

describe('worker configuration', () => {
  it('requires Redis and real provider credentials by default', () => {
    expect(() => loadWorkerConfig({})).toThrow('REDIS_URL is required');
    expect(() => loadWorkerConfig({ REDIS_URL: 'redis://localhost:6379' })).toThrow(
      'LLM_API_KEY is required',
    );
  });

  it('creates an OpenAI-compatible draft engine', () => {
    const config = loadWorkerConfig({
      REDIS_URL: 'redis://localhost:6379',
      LLM_PROVIDER: 'openai-compatible',
      LLM_API_KEY: 'secret',
      LLM_MODEL: 'example-model',
      LLM_BASE_URL: 'https://example.com/v1',
      WORKER_CONCURRENCY: '2',
    });

    expect(config.draftEngine).toBeInstanceOf(LlmDraftEngine);
    expect(config).toEqual(
      expect.objectContaining({
        providerName: 'openai-compatible',
        model: 'example-model',
        concurrency: 2,
      }),
    );
  });

  it('allows an explicit deterministic provider only for local verification', () => {
    const config = loadWorkerConfig({
      REDIS_URL: 'redis://localhost:6379',
      LLM_PROVIDER: 'mock',
    });

    expect(config.draftEngine).toBeInstanceOf(ExampleDraftEngine);
    expect(config.providerName).toBe('mock');
  });
});
