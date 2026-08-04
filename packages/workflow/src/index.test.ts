import { describe, expect, it, vi } from 'vitest';

import type { CiPattern, GenerationRequest, WorkDraft } from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';
import type { ProsodyLexicon } from '@poesygen/prosody';

import { createGenerationWorkflow, LlmDraftEngine, type DraftEngine } from './index.js';

const pattern: CiPattern = {
  id: 'test-pattern',
  name: '测试词牌',
  variant: '正体',
  source: 'test',
  dataVersion: '1.0.0',
  reviewStatus: 'verified',
  sections: [
    {
      id: 'section',
      name: '单调',
      lines: [{ id: 'expected-line', positions: [{ tone: 'level' }] }],
    },
  ],
};

const request: GenerationRequest = {
  patternId: pattern.id,
  theme: '春日',
  maxRounds: 3,
};

function draft(text: string, version: number): WorkDraft {
  return {
    id: `draft-${version}`,
    patternId: pattern.id,
    theme: request.theme,
    lines: [{ id: 'line-1', text }],
    version,
  };
}

const lexicon: ProsodyLexicon = {
  resolve({ character }) {
    if (character === '春') return [{ tone: 'level', rhymeGroups: [] }];
    if (character === '晚') return [{ tone: 'oblique', rhymeGroups: [] }];
    return [];
  },
};

describe('generation workflow', () => {
  it('repairs hard prosody failures until validation passes', async () => {
    const engine: DraftEngine = {
      createDraft: vi.fn(async () => draft('晚', 1)),
      repairDraft: vi.fn(async () => draft('春', 2)),
    };
    const workflow = createGenerationWorkflow({ draftEngine: engine, lexicon });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(2);
    expect(result.draft.lines[0]?.text).toBe('春');
    expect(engine.repairDraft).toHaveBeenCalledOnce();
  });

  it('stops at the configured round limit', async () => {
    const engine: DraftEngine = {
      createDraft: vi.fn(async () => draft('晚', 1)),
      repairDraft: vi.fn(async ({ draft: currentDraft }) => draft('晚', currentDraft.version + 1)),
    };
    const workflow = createGenerationWorkflow({ draftEngine: engine, lexicon });

    const result = await workflow.run({
      request: { ...request, maxRounds: 2 },
      pattern,
    });

    expect(result.status).toBe('round_limit_reached');
    expect(result.rounds).toBe(2);
    expect(engine.repairDraft).toHaveBeenCalledOnce();
  });
});

describe('LlmDraftEngine', () => {
  it('normalizes structured model output into stable pattern lines', async () => {
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        const value = generationRequest.parse({
          title: '春归',
          lines: ['1. 春。'],
        });
        return {
          value,
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const engine = new LlmDraftEngine(provider);

    const result = await engine.createDraft(request, pattern);

    expect(result).toEqual(
      expect.objectContaining({
        patternId: pattern.id,
        title: '春归',
        version: 1,
        lines: [{ id: 'expected-line', text: '春' }],
      }),
    );
  });
});
