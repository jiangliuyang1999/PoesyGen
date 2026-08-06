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
    const onProgress = vi.fn();
    const engine: DraftEngine = {
      createDraft: vi.fn(async () => draft('晚', 1)),
      repairDraft: vi.fn(async () => draft('春', 2)),
    };
    const workflow = createGenerationWorkflow({ draftEngine: engine, lexicon, onProgress });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(2);
    expect(result.draft.lines[0]?.text).toBe('春');
    expect(engine.repairDraft).toHaveBeenCalledOnce();
    expect(onProgress.mock.calls.map(([progress]) => progress.stage)).toEqual([
      'drafting',
      'validating',
      'repairing',
      'validating',
      'completed',
    ]);
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '格律校验通过，共完成 2 轮',
        round: 2,
      }),
    );
  });

  it('stops at the configured round limit', async () => {
    const onProgress = vi.fn();
    const engine: DraftEngine = {
      createDraft: vi.fn(async () => draft('晚', 1)),
      repairDraft: vi.fn(async ({ draft: currentDraft }) => draft('晚', currentDraft.version + 1)),
    };
    const workflow = createGenerationWorkflow({ draftEngine: engine, lexicon, onProgress });

    const result = await workflow.run({
      request: { ...request, maxRounds: 2 },
      pattern,
    });

    expect(result.status).toBe('round_limit_reached');
    expect(result.rounds).toBe(2);
    expect(engine.repairDraft).toHaveBeenCalledOnce();
    expect(onProgress).toHaveBeenLastCalledWith(
      expect.objectContaining({
        message: '达到 2 轮上限，已保留最佳版本',
        round: 2,
      }),
    );
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

  it('uses the refine operation with selected text and preserves the title', async () => {
    const operations: string[] = [];
    const prompts: string[] = [];
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        operations.push(generationRequest.operation);
        prompts.push(generationRequest.messages.at(-1)?.content ?? '');
        return {
          value: generationRequest.parse({ lines: ['晚'] }),
          model: 'test-model',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const engine = new LlmDraftEngine(provider);
    const sourceDraft: WorkDraft = {
      ...draft('春', 2),
      title: '春归',
    };

    const result = await engine.createDraft(
      {
        ...request,
        sourceDraft,
        selections: [
          {
            lineId: 'line-1',
            start: 0,
            end: 1,
            instruction: '改为更清冷的意象',
          },
        ],
      },
      pattern,
    );

    expect(operations).toEqual(['refine']);
    expect(prompts[0]).toContain('第1句“春”：改为更清冷的意象');
    expect(result).toEqual(
      expect.objectContaining({
        title: '春归',
        version: 3,
        lines: [{ id: 'expected-line', text: '晚' }],
      }),
    );
  });
});
