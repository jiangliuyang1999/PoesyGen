import { afterEach, describe, expect, it } from 'vitest';

import type { LlmProvider, StructuredGenerationRequest } from '@poesygen/llm';
import type { GenerationJobData, GenerationQueue } from '@poesygen/queue';

import { buildApp } from './app.js';

const apps: Array<Awaited<ReturnType<typeof buildApp>>> = [];

afterEach(async () => {
  await Promise.all(apps.splice(0).map(async (app) => app.close()));
});

describe('API', () => {
  it('reports health', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/health' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      status: 'ok',
      service: 'poesygen-api',
    });
  });

  it('lists versioned patterns', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({ method: 'GET', url: '/v1/patterns' });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toHaveLength(231);
    expect(response.json()).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'ru-meng-ling-standard',
          reviewStatus: 'imported',
        }),
        expect.objectContaining({
          id: 'ru-meng-ling-variant-06',
          variant: '格六',
        }),
      ]),
    );
  });

  it('generates bounded creation idea suggestions with the configured LLM', async () => {
    const ideaProvider: LlmProvider = {
      name: 'test-provider',
      async generateStructured<T>(request: StructuredGenerationRequest<T>) {
        expect(request.operation).toBe('recommend');
        expect(request.messages.at(-1)?.content).toContain('如梦令');
        return {
          value: request.parse({
            suggestions: [
              `1. ${'暮春江上归舟，远帆入暮云，忽忆故人旧约。'.repeat(3)}`,
              '雪夜独坐小楼，听梅枝落雪，思念远行未归的人',
              '重回江南旧巷，在新雨与青苔间寻找少年往事',
            ],
          }),
          model: 'test-model',
          usage: { inputTokens: 10, outputTokens: 20 },
        };
      },
    };
    const app = await buildApp({ ideaProvider });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/creation/idea-suggestions',
      payload: { patternId: 'ru-meng-ling-standard' },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ suggestions: string[] }>();
    expect(body.suggestions).toHaveLength(3);
    expect(body.suggestions.every((suggestion) => Array.from(suggestion).length <= 50)).toBe(true);
    expect(body.suggestions[0]?.startsWith('1.')).toBe(false);
  });

  it('exposes rhyme groups and traditional pronunciation data', async () => {
    const app = await buildApp();
    apps.push(app);

    const groups = await app.inject({
      method: 'GET',
      url: '/v1/rhyme-books/cilin-zhengyun/groups',
    });
    const pronunciation = await app.inject({
      method: 'GET',
      url: `/v1/characters/${encodeURIComponent('一')}/pronunciations`,
    });

    expect(groups.statusCode).toBe(200);
    expect(groups.json()).toHaveLength(19);
    expect(pronunciation.statusCode).toBe(200);
    expect(pronunciation.json()).toEqual(
      expect.objectContaining({
        character: '一',
        readings: expect.objectContaining({ mandarin: ['yī'] }),
        prosody: [
          expect.objectContaining({
            tone: 'oblique',
            rhymeGroups: ['cilin-17'],
          }),
        ],
      }),
    );
  });

  it('rejects generation when the queue is not configured', async () => {
    const app = await buildApp();
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/generation-sessions',
      payload: {
        patternId: 'ru-meng-ling-standard',
        theme: '暮春归舟',
      },
    });

    expect(response.statusCode).toBe(503);
  });

  it('queues a valid generation request', async () => {
    const jobs: GenerationJobData[] = [];
    const queue: GenerationQueue = {
      async enqueue(data) {
        jobs.push(data);
        return 'job-1';
      },
      async getSession() {
        return undefined;
      },
      async getHealth() {
        return { redis: 'ok', workers: 1 };
      },
      async close() {},
    };
    const app = await buildApp({ generationQueue: queue });
    apps.push(app);

    const response = await app.inject({
      method: 'POST',
      url: '/v1/generation-sessions',
      payload: {
        patternId: 'ru-meng-ling-standard',
        theme: '暮春归舟',
      },
    });

    expect(response.statusCode).toBe(202);
    expect(response.json()).toEqual(
      expect.objectContaining({
        jobId: 'job-1',
        status: 'queued',
      }),
    );
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.request.maxRounds).toBe(8);
  });

  it('returns generation progress and final results from the queue', async () => {
    const queue: GenerationQueue = {
      async enqueue() {
        return 'session-1';
      },
      async getSession(sessionId) {
        return {
          id: sessionId,
          jobId: sessionId,
          status: 'completed',
          progress: 100,
          result: {
            sessionId,
            status: 'completed',
            rounds: 2,
            draft: {
              id: 'draft-1',
              patternId: 'ru-meng-ling-standard',
              theme: '暮春',
              version: 2,
              lines: [{ id: 'line-1', text: '春归' }],
            },
            report: {
              passed: true,
              issues: [],
            },
          },
        };
      },
      async getHealth() {
        return { redis: 'ok', workers: 1 };
      },
      async close() {},
    };
    const app = await buildApp({ generationQueue: queue });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/generation-sessions/session-1',
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(
      expect.objectContaining({
        id: 'session-1',
        status: 'completed',
        result: expect.objectContaining({
          rounds: 2,
          report: { passed: true, issues: [] },
        }),
      }),
    );
  });

  it('reports whether a generation worker is connected', async () => {
    const queue: GenerationQueue = {
      async enqueue() {
        return 'session-1';
      },
      async getSession() {
        return undefined;
      },
      async getHealth() {
        return { redis: 'ok', workers: 1 };
      },
      async close() {},
    };
    const app = await buildApp({ generationQueue: queue });
    apps.push(app);

    const response = await app.inject({
      method: 'GET',
      url: '/v1/generation/health',
    });

    expect(response.json()).toEqual({
      available: true,
      redis: 'ok',
      workers: 1,
    });
  });
});
