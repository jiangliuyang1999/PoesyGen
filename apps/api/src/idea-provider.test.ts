import { afterEach, describe, expect, it, vi } from 'vitest';

import { createIdeaProvider } from './idea-provider.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createIdeaProvider', () => {
  it('uses the dedicated fast model and bounded output settings', async () => {
    const fetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) =>
        new Response(
          JSON.stringify({
            model: 'fast-idea-model',
            choices: [{ message: { content: '{"suggestions":["甲","乙","丙"]}' } }],
            usage: { prompt_tokens: 10, completion_tokens: 12 },
          }),
          {
            status: 200,
            headers: { 'content-type': 'application/json' },
          },
        ),
    );
    vi.stubGlobal('fetch', fetch);

    const provider = createIdeaProvider({
      LLM_MODEL: 'full-generation-model',
      LLM_API_KEY: 'shared-key',
      IDEA_LLM_MODEL: 'fast-idea-model',
      IDEA_LLM_BASE_URL: 'https://ideas.example/v1',
      IDEA_LLM_MAX_TOKENS: '192',
    });
    expect(provider).toBeDefined();

    await provider!.generateStructured({
      operation: 'recommend',
      messages: [{ role: 'user', content: '推荐主题' }],
      parse: (value) => value,
    });

    expect(fetch).toHaveBeenCalledOnce();
    expect(fetch.mock.calls[0]?.[0]).toBe('https://ideas.example/v1/chat/completions');
    const request = fetch.mock.calls[0]?.[1];
    const body = JSON.parse(String(request?.body)) as {
      model: string;
      max_tokens: number;
    };
    expect(body.model).toBe('fast-idea-model');
    expect(body.max_tokens).toBe(192);
  });
});
