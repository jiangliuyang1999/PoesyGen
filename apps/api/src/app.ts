import { randomUUID } from 'node:crypto';

import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';

import { generationRequestSchema, refinementRequestSchema } from '@poesygen/contracts';
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

import { createIdeaSuggestionService } from './idea-suggestions.js';

const mobileAppOrigins = ['capacitor://localhost', 'https://localhost'];

export interface AppDependencies {
  readonly generationQueue?: GenerationQueue;
  readonly ideaProvider?: LlmProvider;
  readonly logger?: boolean;
}

export async function buildApp(dependencies: AppDependencies = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: dependencies.logger ?? false });
  const ideaSuggestions =
    dependencies.ideaProvider === undefined
      ? undefined
      : createIdeaSuggestionService(dependencies.ideaProvider);
  ideaSuggestions?.warm();

  await app.register(cors, {
    origin: mobileAppOrigins,
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

  app.post('/v1/creation/idea-suggestions', async (request, reply) => {
    if (ideaSuggestions === undefined) {
      return reply.code(503).send({
        error: 'idea_suggestions_unavailable',
        message: 'LLM provider is not configured for the API',
      });
    }

    try {
      return { suggestions: await ideaSuggestions.get() };
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

  app.post('/v1/refinement-sessions', async (request, reply) => {
    const parsed = refinementRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({
        error: 'invalid_request',
        details: parsed.error.issues,
      });
    }

    const pattern = findPattern(parsed.data.patternId);
    if (pattern === undefined) {
      return reply.code(404).send({
        error: 'pattern_not_found',
        patternId: parsed.data.patternId,
      });
    }
    if (parsed.data.draft.patternId !== pattern.id) {
      return reply.code(400).send({ error: 'draft_pattern_mismatch' });
    }

    const sourceLines = new Map(parsed.data.draft.lines.map((line) => [line.id, line.text]));
    const invalidSelection = parsed.data.selections.find((selection) => {
      const line = sourceLines.get(selection.lineId);
      return line === undefined || selection.end > Array.from(line).length;
    });
    if (invalidSelection !== undefined) {
      return reply.code(400).send({
        error: 'invalid_selection',
        selection: invalidSelection,
      });
    }

    if (dependencies.generationQueue === undefined) {
      return reply.code(503).send({
        error: 'generation_unavailable',
        message: 'Generation queue is not configured',
      });
    }

    const sessionId = randomUUID();
    const refinementRequest: GenerationRequest = {
      patternId: pattern.id,
      theme: parsed.data.theme,
      maxRounds: parsed.data.maxRounds,
      sourceDraft: {
        id: parsed.data.draft.id,
        patternId: parsed.data.draft.patternId,
        theme: parsed.data.draft.theme,
        lines: parsed.data.draft.lines,
        version: parsed.data.draft.version,
        ...(parsed.data.draft.title === undefined ? {} : { title: parsed.data.draft.title }),
        ...(parsed.data.draft.requestedRhymeGroup === undefined
          ? {}
          : { requestedRhymeGroup: parsed.data.draft.requestedRhymeGroup }),
      },
      selections: parsed.data.selections,
      ...(parsed.data.preferredRhymeGroup === undefined
        ? {}
        : { preferredRhymeGroup: parsed.data.preferredRhymeGroup }),
      ...(parsed.data.additionalRequirements === undefined
        ? {}
        : { additionalRequirements: parsed.data.additionalRequirements }),
    };
    const jobId = await dependencies.generationQueue.enqueue({
      sessionId,
      request: refinementRequest,
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

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme',
});

function countGraphemes(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}
