import { describe, expect, it, vi } from 'vitest';

import { OpenAiCompatibleProvider } from './index.js';

describe('OpenAiCompatibleProvider', () => {
  it('calls a chat-completions endpoint and parses structured JSON', async () => {
    const fetch = vi.fn(async () =>
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
});
