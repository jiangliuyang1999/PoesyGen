import { describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from './index.js';

describe('OpenAiCompatibleProvider', () => {
  it('calls a chat-completions endpoint and parses structured JSON', async () => {
    const fetch = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) =>
      Response.json({
        id: 'request-1',
        model: 'test-model',
        choices: [
          {
            message: {
              content: '```json\n{"title":"春归","lines":["春风"]}\n```',
            },
          },
        ],
        usage: {
          prompt_tokens: 12,
          completion_tokens: 8,
        },
      }),
    );
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'secret',
      model: 'test-model',
      baseUrl: 'https://example.com/v1/',
      fetch,
    });

    const result = await provider.generateStructured({
      operation: 'draft',
      messages: [{ role: 'user', content: '写词' }],
      maxTokens: 512,
      parse(value) {
        return value as { title: string; lines: string[] };
      },
    });

    expect(fetch).toHaveBeenCalledWith(
      'https://example.com/v1/chat/completions',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          authorization: 'Bearer secret',
        }),
      }),
    );
    const requestBody = JSON.parse(String(fetch.mock.calls[0]?.[1]?.body)) as {
      max_tokens: number;
    };
    expect(requestBody.max_tokens).toBe(512);
    expect(result).toEqual({
      value: {
        title: '春归',
        lines: ['春风'],
      },
      model: 'test-model',
      requestId: 'request-1',
      usage: {
        inputTokens: 12,
        outputTokens: 8,
      },
    });
  });

  it('surfaces provider errors without exposing the API key', async () => {
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'secret',
      model: 'test-model',
      fetch: vi.fn(async () =>
        Response.json(
          {
            error: {
              message: 'invalid model',
            },
          },
          { status: 400 },
        ),
      ),
    });

    await expect(
      provider.generateStructured({
        operation: 'draft',
        messages: [{ role: 'user', content: '写词' }],
        parse: (value) => value,
      }),
    ).rejects.toThrow('LLM request failed (400): invalid model');
  });

  it('does not tolerate an extra closing brace', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '{"brief":{"coreTheme":"春归"},"plan":{}}}' } }],
      }),
    );
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'secret',
      model: 'test-model',
      fetch,
    });

    await expect(
      provider.generateStructured({
        operation: 'plan',
        messages: [{ role: 'user', content: '规划' }],
        parse: (value) => value,
      }),
    ).rejects.toThrow('LLM response was not valid JSON');
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('rejects incomplete JSON instead of guessing missing structure', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        choices: [{ message: { content: '{"brief":{"coreTheme":"春归"}' } }],
      }),
    );
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'secret',
      model: 'test-model',
      fetch,
    });

    await expect(
      provider.generateStructured({
        operation: 'plan',
        messages: [{ role: 'user', content: '规划' }],
        parse: (value) => value,
      }),
    ).rejects.toThrow('LLM response was not valid JSON');
    expect(fetch).toHaveBeenCalledTimes(6);
  });

  it('retries malformed JSON until valid and accumulates usage', async () => {
    const fetch = vi
      .fn()
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: '{"brief":}' } }],
          usage: { prompt_tokens: 10, completion_tokens: 5 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          choices: [{ message: { content: '{"brief":' } }],
          usage: { prompt_tokens: 11, completion_tokens: 6 },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          id: 'retry-request',
          choices: [{ message: { content: '{"brief":{"coreTheme":"春归"},"plan":{}}' } }],
          usage: { prompt_tokens: 12, completion_tokens: 8 },
        }),
      );
    const provider = new OpenAiCompatibleProvider({
      apiKey: 'secret',
      model: 'test-model',
      fetch,
    });

    const result = await provider.generateStructured({
      operation: 'plan',
      messages: [{ role: 'user', content: '规划' }],
      parse: (value) => value as { brief: { coreTheme: string }; plan: object },
    });

    expect(fetch).toHaveBeenCalledTimes(3);
    const retryBody = JSON.parse(String(fetch.mock.calls[2]?.[1]?.body)) as {
      messages: ReadonlyArray<{ role: string; content: string }>;
    };
    expect(retryBody.messages.at(-1)).toEqual({
      role: 'user',
      content: expect.stringContaining('JSON 语法无效'),
    });
    expect(result).toEqual({
      value: {
        brief: { coreTheme: '春归' },
        plan: {},
      },
      model: 'test-model',
      requestId: 'retry-request',
      usage: {
        inputTokens: 33,
        outputTokens: 19,
      },
    });
  });
});
