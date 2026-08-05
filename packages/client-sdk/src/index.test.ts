import { describe, expect, it, vi } from 'vitest';

import { PoesyGenApiError, PoesyGenClient } from './index.js';

describe('PoesyGenClient', () => {
  it('binds the default fetch implementation to the global object', async () => {
    const fetch = vi.fn(function (this: typeof globalThis) {
      if (this !== globalThis) throw new TypeError('Illegal invocation');
      return Promise.resolve(
        Response.json({
          status: 'ok',
          service: 'poesygen-api',
        }),
      );
    });
    vi.stubGlobal('fetch', fetch);

    try {
      const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000' });

      await expect(client.health()).resolves.toEqual({
        status: 'ok',
        service: 'poesygen-api',
      });
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('returns the queued job identity', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          id: 'session-1',
          jobId: 'job-1',
          status: 'queued',
        },
        { status: 202 },
      ),
    );
    const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000', fetch });

    await expect(
      client.createGenerationSession({
        patternId: 'ru-meng-ling-standard',
        theme: '暮春',
        maxRounds: 8,
      }),
    ).resolves.toEqual({
      id: 'session-1',
      jobId: 'job-1',
      status: 'queued',
    });
  });

  it('submits a refinement session with the source draft and selections', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          id: 'refinement-1',
          jobId: 'refinement-job-1',
          status: 'queued',
        },
        { status: 202 },
      ),
    );
    const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000', fetch });
    const request = {
      patternId: 'ru-meng-ling-standard',
      theme: '暮春',
      draft: {
        id: 'draft-1',
        patternId: 'ru-meng-ling-standard',
        theme: '暮春',
        version: 2,
        lines: [{ id: 'line-1', text: '春晚' }],
      },
      selections: [{ lineId: 'line-1', start: 0, end: 1, instruction: '改写此字' }],
      maxRounds: 8,
    };

    await expect(client.createRefinementSession(request)).resolves.toEqual({
      id: 'refinement-1',
      jobId: 'refinement-job-1',
      status: 'queued',
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/refinement-sessions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify(request),
      }),
    );
  });

  it('requests creation idea suggestions without a pattern', async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        suggestions: ['暮春归舟', '雪夜怀人', '故园新雨'],
      }),
    );
    const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000', fetch });

    await expect(client.suggestCreationIdeas()).resolves.toEqual({
      suggestions: ['暮春归舟', '雪夜怀人', '故园新雨'],
    });
    expect(fetch).toHaveBeenCalledWith(
      'http://localhost:3000/v1/creation/idea-suggestions',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({}),
      }),
    );
  });

  it('preserves the HTTP status and structured error body', async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: 'generation_unavailable',
          message: 'Generation queue is not configured',
        },
        { status: 503 },
      ),
    );
    const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000', fetch });

    const error = await client
      .createGenerationSession({
        patternId: 'ru-meng-ling-standard',
        theme: '暮春',
        maxRounds: 8,
      })
      .catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(PoesyGenApiError);
    expect(error).toEqual(
      expect.objectContaining({
        status: 503,
        body: {
          error: 'generation_unavailable',
          message: 'Generation queue is not configured',
        },
      }),
    );
  });

  it('polls until a generation session reaches a terminal state', async () => {
    const responses: unknown[] = [
      {
        id: 'session-1',
        jobId: 'session-1',
        status: 'running',
        progress: { phase: 'generating' },
      },
      {
        id: 'session-1',
        jobId: 'session-1',
        status: 'completed',
        progress: 100,
        result: {
          sessionId: 'session-1',
          status: 'completed',
          rounds: 1,
          draft: {
            id: 'draft-1',
            patternId: 'ru-meng-ling-standard',
            theme: '暮春',
            version: 1,
            lines: [],
          },
          report: {
            passed: true,
            issues: [],
          },
        },
      },
    ];
    const fetch = vi.fn(async () => Response.json(responses.shift()));
    const updates = vi.fn();
    const client = new PoesyGenClient({ baseUrl: 'http://localhost:3000', fetch });

    const session = await client.waitForGenerationSession('session-1', {
      intervalMs: 1,
      onUpdate: updates,
    });

    expect(session.status).toBe('completed');
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(updates).toHaveBeenCalledTimes(2);
  });
});
