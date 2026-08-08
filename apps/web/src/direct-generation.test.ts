// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DirectLlmConfig } from './direct-llm-config.js';
import { runDirectIdeaSuggestions } from './direct-generation.js';

const config: DirectLlmConfig = {
  baseUrl: 'https://example.com/v1',
  endpoint: '',
  model: 'test-model',
  apiKey: 'test-secret',
  timeoutMs: 30_000,
  maxTokens: 1_024,
  jsonMode: true,
  rememberApiKey: false,
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('direct generation logging', () => {
  it('logs LLM requests and responses without exposing authorization', async () => {
    const fetch = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          id: 'request-1',
          model: 'test-model',
          choices: [
            {
              message: {
                content: JSON.stringify({
                  suggestions: ['江上春归', '雪夜怀人', '重游故园'],
                }),
              },
            },
          ],
          usage: {
            prompt_tokens: 10,
            completion_tokens: 20,
          },
        }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );
    vi.stubGlobal('fetch', fetch);
    const consoleLog = vi.spyOn(console, 'log').mockImplementation(() => undefined);

    await expect(runDirectIdeaSuggestions(config)).resolves.toEqual([
      '江上春归',
      '雪夜怀人',
      '重游故园',
    ]);

    const requestLog = consoleLog.mock.calls.find(
      ([message]) => message === '[PoesyGen][http] 发送 LLM 请求',
    );
    const responseLog = consoleLog.mock.calls.find(
      ([message]) => message === '[PoesyGen][http] 收到 LLM 响应',
    );
    expect(requestLog).toBeDefined();
    expect(responseLog).toBeDefined();
    expect(requestLog?.[1]).toMatchObject({
      details: {
        method: 'POST',
        url: 'https://example.com/v1/chat/completions',
        headers: {
          authorization: '[REDACTED]',
        },
        body: {
          model: 'test-model',
        },
      },
    });
    expect(responseLog?.[1]).toMatchObject({
      details: {
        status: 200,
        ok: true,
        body: {
          id: 'request-1',
        },
      },
    });
    expect(JSON.stringify(requestLog?.[1])).not.toContain('test-secret');
  });
});
