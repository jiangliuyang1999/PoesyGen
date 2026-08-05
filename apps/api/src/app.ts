import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import { generationRequestSchema } from '@poesygen/contracts';
import type { GenerationRequest } from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';
import { findPattern, listPatterns } from '@poesygen/patterns';
import {
  cilinZhengyunLexicon,
  findCilinRhymeGroup,
  getCharacterReading,
  listCilinRhymeGroups,
} from '@poesygen/prosody';
import type { GenerationQueue } from '@poesygen/queue';

export interface AppDependencies {
  readonly generationQueue?: GenerationQueue;
  readonly ideaProvider?: LlmProvider;
  readonly logger?: boolean;
}

export async function buildApp(dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: dependencies.logger ?? false });

  await app.register(cors, {
    origin: false,
  });

  app.get('/health', async () => ({
    status: 'ok' as const,
    service: 'poesygen-api',
  }));

  app.get('/v1/generation/health', async () => {
    if (dependencies.generationQueue === undefined) {
      return {
        available: false,
        redis: 'unconfigured' as const,
        workers: 0,
      };
    }
    const health = await dependencies.generationQueue.getHealth();
    return {
      available: health.workers > 0,
      ...health,
    };
  });

  app.get('/v1/patterns', async () => listPatterns());

  app.post<{ Body: unknown }>('/v1/creation/idea-suggestions', async (request, reply) => {
    const patternId =
      isRecord(request.body) && typeof request.body['patternId'] === 'string'
        ? request.body['patternId']
        : undefined;
    if (patternId === undefined || patternId.trim() === '') {
      return reply.code(400).send({ error: 'pattern_id_required' });
    }

    const pattern = findPattern(patternId);
    if (pattern === undefined) {
      return reply.code(404).send({ error: 'pattern_not_found', patternId });
    }
    if (dependencies.ideaProvider === undefined) {
      return reply.code(503).send({
        error: 'idea_suggestions_unavailable',
        message: 'LLM provider is not configured for the API',
      });
    }

    const lines = pattern.sections.flatMap((section) => section.lines);
    const characters = lines.reduce((total, line) => total + line.positions.length, 0);
    try {
      const generated = await dependencies.ideaProvider.generateStructured({
        operation: 'recommend',
        temperature: 0.85,
        metadata: {
          feature: 'creation-idea-suggestions',
          patternId: pattern.id,
        },
        messages: [
          {
            role: 'system',
            content: [
              '你是宋词创作的主题策划编辑。',
              '仅返回 JSON 对象，格式为 {"suggestions":["主题1","主题2","主题3"]}。',
              '必须恰好提供 3 条互不重复的中文创作主题。',
              '每条主题必须意象明确、情境清楚，尽量包含时令、场景、人物行动或情感转折。',
              '每条不超过 50 个汉字；允许约 10 个字的简短主题，不要为了凑长度添加空话。',
              '不要写词作正文，不要添加序号、标题、引号或格律说明。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: [
              `请为词牌《${pattern.name}》${pattern.variant}推荐创作主题。`,
              `该体共 ${characters} 字、${lines.length} 句、${pattern.sections.length === 1 ? '单调' : '双调'}。`,
              '三条主题在季节、场景和情绪上应有明显差异。',
            ].join('\n'),
          },
        ],
        parse: parseIdeaSuggestions,
      });
      return { suggestions: generated.value };
    } catch (error) {
      request.log.error({ err: error }, 'Failed to generate creation idea suggestions');
      return reply.code(502).send({ error: 'idea_suggestions_failed' });
    }
  });

  app.get('/v1/rhyme-books/cilin-zhengyun/groups', async () =>
    listCilinRhymeGroups().map((group) => ({
      id: group.id,
      number: group.number,
      name: group.name,
      sections: group.sections.map((section) => ({
        name: section.name,
        tone: section.tone,
        characterCount: countGraphemes(section.characters),
      })),
    })),
  );

  app.get<{ Params: { groupId: string } }>(
    '/v1/rhyme-books/cilin-zhengyun/groups/:groupId',
    async (request, reply) => {
      const group = findCilinRhymeGroup(request.params.groupId);
      return group === undefined ? reply.code(404).send({ error: 'rhyme_group_not_found' }) : group;
    },
  );

  app.get<{ Params: { character: string } }>(
    '/v1/characters/:character/pronunciations',
    async (request, reply) => {
      const { character } = request.params;
      if (countGraphemes(character) !== 1) {
        return reply.code(400).send({ error: 'single_character_required' });
      }

      const readings = getCharacterReading(character);
      const prosody = cilinZhengyunLexicon.resolve({
        character,
        line: character,
        charIndex: 0,
      });
      if (readings === undefined && prosody.length === 0) {
        return reply.code(404).send({ error: 'character_not_found' });
      }
      return { character, readings, prosody };
    },
  );

  app.post('/v1/generation-sessions', async (request, reply) => {
    const parsed = generationRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.issues,
      });
    }

    if (findPattern(parsed.data.patternId) === undefined) {
      return reply.code(404).send({
        error: 'pattern_not_found',
        patternId: parsed.data.patternId,
      });
    }

    if (dependencies.generationQueue === undefined) {
      return reply.code(503).send({
        error: 'generation_unavailable',
        message: 'Generation queue is not configured',
      });
    }

    const sessionId = randomUUID();
    const generationRequest: GenerationRequest = {
      patternId: parsed.data.patternId,
      theme: parsed.data.theme,
      maxRounds: parsed.data.maxRounds,
      ...(parsed.data.preferredRhymeGroup === undefined
        ? {}
        : { preferredRhymeGroup: parsed.data.preferredRhymeGroup }),
      ...(parsed.data.additionalRequirements === undefined
        ? {}
        : { additionalRequirements: parsed.data.additionalRequirements }),
    };
    const jobId = await dependencies.generationQueue.enqueue({
      sessionId,
      request: generationRequest,
    });

    return reply.code(202).send({
      id: sessionId,
      jobId,
      status: 'queued',
    });
  });

  app.get<{ Params: { sessionId: string } }>(
    '/v1/generation-sessions/:sessionId',
    async (request, reply) => {
      if (dependencies.generationQueue === undefined) {
        return reply.code(503).send({
          error: 'generation_unavailable',
          message: 'Generation queue is not configured',
        });
      }
      const session = await dependencies.generationQueue.getSession(request.params.sessionId);
      return session === undefined
        ? reply.code(404).send({ error: 'generation_session_not_found' })
        : session;
    },
  );

  return app;
}

function parseIdeaSuggestions(value: unknown): ReadonlyArray<string> {
  const rawSuggestions =
    isRecord(value) && Array.isArray(value['suggestions']) ? value['suggestions'] : [];
  const suggestions: string[] = [];
  for (const rawSuggestion of rawSuggestions) {
    if (typeof rawSuggestion !== 'string') continue;
    const normalized = rawSuggestion
      .trim()
      .replace(/^(?:\d+|[一二三])[.、:：]\s*/u, '')
      .replace(/\s+/gu, ' ');
    if (normalized === '') continue;
    const bounded = Array.from(normalized).slice(0, 50).join('');
    if (!suggestions.includes(bounded)) suggestions.push(bounded);
    if (suggestions.length === 3) break;
  }
  if (suggestions.length !== 3) {
    throw new Error('LLM must return three unique idea suggestions');
  }
  return suggestions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme',
});

function countGraphemes(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}
