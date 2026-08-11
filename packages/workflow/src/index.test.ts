import { describe, expect, it, vi } from 'vitest';

import type {
  CiPattern,
  CompositionPlan,
  GenerationRequest,
  QualityReport,
  ThemeBrief,
  WorkDraft,
} from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';
import type { ProsodyLexicon } from '@poesygen/prosody';

import {
  type CompositionEngine,
  createGenerationWorkflow,
  createPatternBlueprint,
  LlmCompositionEngine,
  type OptimizationMode,
} from './index.js';

const pattern: CiPattern = {
  id: 'test-pattern',
  name: '测试词牌',
  variant: '正体',
  source: 'test',
  dataVersion: '1.0.0',
  reviewStatus: 'verified',
  sections: [
    {
      id: 'upper',
      name: '上阕',
      lines: [{ id: 'expected-line', positions: [{ tone: 'level' }] }],
    },
  ],
};

const request: GenerationRequest = {
  patternId: pattern.id,
  theme: '暮春江上归舟，怀念故友',
  maxRounds: 3,
};

const brief: ThemeBrief = {
  coreTheme: '暮春归舟怀友',
  subject: '归舟人',
  setting: '暮春江上',
  perspective: '第一人称',
  emotionalArc: ['见景', '忆旧', '克制收束'],
  keyFacts: ['暮春', '归舟', '故友'],
  imagery: ['江', '暮云', '归舟'],
  avoid: ['直白呼告'],
  assumptions: [],
};

const plan: CompositionPlan = {
  thesis: '以归舟所见寄托怀友',
  style: '清空含蓄',
  voice: '第一人称',
  imagery: ['江', '暮云'],
  allusions: [],
  sections: [
    {
      sectionId: 'upper',
      task: '写暮春江面，由景入情',
      arc: '由静景转怀念，以暮色收束',
    },
  ],
  lines: [
    {
      lineId: 'expected-line',
      task: '以江上春色建立暮春氛围，作为全篇起笔',
      emotion: '清寂',
      image: '江',
      ending: '落在春意',
    },
  ],
};

const passingQuality: QualityReport = {
  passed: true,
  summary: '主题集中，语言凝练。',
  themeRecognizable: true,
  themeEvidence: [
    {
      requirement: request.theme,
      status: 'clear',
      lineIds: ['expected-line'],
      quotes: ['春'],
      explanation: '测试证据',
    },
  ],
  scores: {
    themeFidelity: 5,
    coherence: 5,
    emotionalArc: 4,
    imagery: 4,
    diction: 4,
    originality: 4,
    allusionFitness: 5,
  },
  issues: [],
};

const lowThemeQuality: QualityReport = {
  passed: false,
  summary: '没有落实怀友主题。',
  themeRecognizable: false,
  themeEvidence: [
    {
      requirement: request.theme,
      status: 'missing',
      lineIds: [],
      quotes: [],
      explanation: '没有可辨认的主题证据',
    },
  ],
  scores: {
    themeFidelity: 2,
    coherence: 4,
    emotionalArc: 3,
    imagery: 4,
    diction: 4,
    originality: 3,
    allusionFitness: 5,
  },
  issues: [
    {
      dimension: 'themeFidelity',
      severity: 'error',
      lineId: 'expected-line',
      message: '只写春景，没有怀友线索',
      suggestion: '在景物中加入旧约或故人痕迹',
    },
  ],
};

const lexicon: ProsodyLexicon = {
  resolve({ character }) {
    if (character === '春') return [{ tone: 'level', rhymeGroups: [] }];
    if (character === '晚') return [{ tone: 'oblique', rhymeGroups: [] }];
    if (character === '疑') {
      return [
        { tone: 'level', rhymeGroups: [] },
        { tone: 'oblique', rhymeGroups: [] },
      ];
    }
    return [];
  },
};

function draft(text: string, version: number): WorkDraft {
  return {
    id: `draft-${version}-${text}`,
    patternId: pattern.id,
    theme: request.theme,
    lines: [{ id: 'expected-line', text }],
    version,
  };
}

function createEngine(overrides: Partial<CompositionEngine> = {}): CompositionEngine {
  return {
    prepareComposition: vi.fn(async () => ({ brief, plan })),
    generateCandidates: vi.fn(async () => [draft('春', 1)]),
    evaluateDrafts: vi.fn(async ({ drafts }) => drafts.map(() => passingQuality)),
    optimizeDraft: vi.fn(async ({ draft: current }) => draft('春', current.version + 1)),
    ...overrides,
  };
}

describe('generation workflow', () => {
  it('runs parse, plan, hard repair and literary evaluation in order', async () => {
    const onProgress = vi.fn();
    const onStageResult = vi.fn();
    const optimizeDraft = vi.fn(async ({ draft: current }) => draft('春', current.version + 1));
    const engine = createEngine({
      generateCandidates: vi.fn(async () => [draft('晚', 1)]),
      optimizeDraft,
    });
    const workflow = createGenerationWorkflow({
      compositionEngine: engine,
      lexicon,
      onProgress,
      onStageResult,
    });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(2);
    expect(result.draft.lines[0]?.text).toBe('春');
    expect(result.context).toEqual({ themeBrief: brief, plan });
    expect(result.qualityReport).toEqual(passingQuality);
    expect(engine.generateCandidates).toHaveBeenCalledWith(
      expect.objectContaining({ candidateCount: 1 }),
      expect.any(AbortSignal),
    );
    expect(optimizeDraft).toHaveBeenCalledWith(
      expect.objectContaining({ mode: 'prosody_repair' }),
      expect.any(AbortSignal),
    );
    expect(
      onProgress.mock.calls
        .map(([event]) => event)
        .filter(({ activity }) => activity === 'completed')
        .map(({ stage }) => stage),
    ).toEqual([
      'parsing',
      'planning',
      'drafting',
      'validating',
      'optimizing',
      'validating',
      'evaluating',
      'completed',
    ]);
    expect(onStageResult.mock.calls.map(([event]) => event.kind)).toEqual([
      'pattern_blueprint',
      'theme_brief',
      'composition_plan',
      'draft_candidates',
      'prosody_reports',
      'optimized_draft',
      'prosody_reports',
      'quality_reports',
    ]);
    expect(onStageResult).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'prosody_reports',
        value: expect.objectContaining({
          selectedDraftId: expect.any(String),
        }),
      }),
    );
  });

  it('optimizes theme quality after prosody has passed and revalidates the result', async () => {
    const modes: OptimizationMode[] = [];
    const evaluateDrafts = vi
      .fn<CompositionEngine['evaluateDrafts']>()
      .mockResolvedValueOnce([lowThemeQuality])
      .mockResolvedValueOnce([passingQuality]);
    const engine = createEngine({
      evaluateDrafts,
      optimizeDraft: vi.fn(async (input) => {
        modes.push(input.mode);
        return draft('春', input.draft.version + 1);
      }),
    });
    const workflow = createGenerationWorkflow({ compositionEngine: engine, lexicon });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(2);
    expect(modes).toEqual(['theme_repair']);
    expect(evaluateDrafts).toHaveBeenCalledTimes(2);
  });

  it('keeps the candidate with the fewest hard errors at the round limit', async () => {
    const engine = createEngine({
      generateCandidates: vi.fn(async () => [draft('晚', 1), draft('未知', 1)]),
    });
    const workflow = createGenerationWorkflow({ compositionEngine: engine, lexicon });

    const result = await workflow.run({
      request: { ...request, maxRounds: 1 },
      pattern,
    });

    expect(result.status).toBe('round_limit_reached');
    expect(result.rounds).toBe(1);
    expect(result.draft.lines[0]?.text).toBe('晚');
    expect(engine.evaluateDrafts).not.toHaveBeenCalled();
    expect(engine.optimizeDraft).not.toHaveBeenCalled();
  });

  it('ranks literary quality before non-blocking prosody warnings', async () => {
    const acceptableQuality: QualityReport = {
      ...passingQuality,
      summary: '基本达标。',
      scores: {
        themeFidelity: 4,
        coherence: 4,
        emotionalArc: 3,
        imagery: 3,
        diction: 3,
        originality: 3,
        allusionFitness: 5,
      },
    };
    const engine = createEngine({
      generateCandidates: vi.fn(async () => [draft('疑', 1), draft('春', 1)]),
      evaluateDrafts: vi.fn(async () => [passingQuality, acceptableQuality]),
    });
    const workflow = createGenerationWorkflow({ compositionEngine: engine, lexicon });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.draft.lines[0]?.text).toBe('疑');
    expect(result.report.issues).toEqual([
      expect.objectContaining({ severity: 'warning', rule: 'tone' }),
    ]);
  });

  it('emits one start and one completion event for each model stage', async () => {
    const onProgress = vi.fn();
    const engine = createEngine({
      prepareComposition: vi.fn(async () => ({ brief, plan })),
    });
    const workflow = createGenerationWorkflow({
      compositionEngine: engine,
      lexicon,
      onProgress,
    });

    await workflow.run({ request, pattern });

    expect(
      onProgress.mock.calls
        .map(([event]) => event)
        .filter(({ stepId }) => stepId === 'prepare-composition')
        .map(({ activity }) => activity),
    ).toEqual(['started', 'completed']);
    const completed = onProgress.mock.calls
      .map(([event]) => event)
      .find(({ stepId, activity }) => stepId === 'prepare-composition' && activity === 'completed');
    expect(completed?.message).not.toMatch(/（\d+ (?:毫秒|秒)）/u);
    expect(completed?.elapsedMs).toEqual(expect.any(Number));
  });
});

describe('composition contracts', () => {
  it('rejects a high theme score when quoted evidence is absent from the poem', async () => {
    const recoveryRequest: GenerationRequest = {
      ...request,
      theme: '久病初愈',
    };
    const recoveryBrief: ThemeBrief = {
      ...brief,
      coreTheme: '久病初愈后的身心变化',
      keyFacts: ['久病初愈', '久病', '初愈'],
    };
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        return {
          value: generationRequest.parse({
            evaluations: [
              {
                candidate: 1,
                summary: '模型声称主题充分。',
                themeRecognizable: true,
                themeEvidence: recoveryBrief.keyFacts.map((requirement) => ({
                  requirement,
                  status: 'clear',
                  lineIds: ['expected-line'],
                  quotes: ['病榻新起'],
                  explanation: '声称表现了病愈',
                })),
                scores: passingQuality.scores,
                issues: [],
              },
            ],
          }),
          model: 'test',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const engine = new LlmCompositionEngine(provider);
    const blueprint = createPatternBlueprint(pattern, recoveryRequest);

    const [report] = await engine.evaluateDrafts({
      request: recoveryRequest,
      pattern,
      blueprint,
      brief: recoveryBrief,
      plan,
      drafts: [
        {
          ...draft('春', 1),
          theme: recoveryRequest.theme,
        },
      ],
    });

    expect(report).toEqual(
      expect.objectContaining({
        passed: false,
        themeRecognizable: false,
        scores: expect.objectContaining({ themeFidelity: 2 }),
        issues: [
          expect.objectContaining({
            dimension: 'themeFidelity',
            severity: 'error',
          }),
        ],
      }),
    );
  });

  it('runs the complete structured LLM protocol through the workflow', async () => {
    const operations: string[] = [];
    const roleIds: string[] = [];
    const skillIds: string[] = [];
    const tokenLimits: number[] = [];
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        operations.push(generationRequest.operation);
        roleIds.push(generationRequest.metadata?.['roleId'] ?? '');
        skillIds.push(generationRequest.metadata?.['skillIds'] ?? '');
        tokenLimits.push(generationRequest.maxTokens ?? 0);
        let payload: unknown;
        if (generationRequest.operation === 'plan') {
          payload = { brief, plan };
        } else if (generationRequest.operation === 'draft') {
          payload = {
            candidates: [{ title: '春归', lines: [{ lineId: 'expected-line', text: '春' }] }],
          };
        } else if (generationRequest.operation === 'evaluate') {
          const requirements = [request.theme, ...brief.keyFacts];
          payload = {
            evaluations: [
              {
                candidate: 1,
                summary: '主题集中，语言凝练。',
                themeRecognizable: true,
                themeEvidence: requirements.map((requirement) => ({
                  requirement,
                  status: 'clear',
                  lineIds: ['expected-line'],
                  quotes: ['春'],
                  explanation: '测试证据',
                })),
                scores: passingQuality.scores,
                issues: [],
              },
            ],
          };
        } else {
          throw new Error(`Unexpected operation ${generationRequest.operation}`);
        }
        return {
          value: generationRequest.parse(payload),
          model: 'test',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const workflow = createGenerationWorkflow({
      compositionEngine: new LlmCompositionEngine(provider),
      lexicon,
    });

    const result = await workflow.run({ request, pattern });

    expect(result.status).toBe('completed');
    expect(result.draft.lines).toEqual([{ id: 'expected-line', text: '春' }]);
    expect(operations).toEqual(['plan', 'draft', 'evaluate']);
    expect(roleIds).toEqual(['composition-architect', 'draft-writer', 'literary-critic']);
    expect(skillIds).toEqual([
      'theme-analysis,composition-planning,allusion-safety',
      'ci-writing,theme-fidelity,prosody-awareness,allusion-safety',
      'literary-evaluation,theme-evidence,allusion-safety',
    ]);
    expect(tokenLimits).toEqual([1_200, 800, 848]);
  });

  it('creates a stable blueprint with requested rhyme information', () => {
    const rhymedPattern: CiPattern = {
      ...pattern,
      sections: [
        {
          ...pattern.sections[0]!,
          lines: [
            {
              id: 'expected-line',
              positions: [{ tone: 'level', rhyme: 'main', rhymeTone: 'level' }],
            },
          ],
        },
      ],
    };

    expect(
      createPatternBlueprint(rhymedPattern, {
        ...request,
        preferredRhymeGroup: 'cilin-01',
      }).lines[0],
    ).toEqual(
      expect.objectContaining({
        lineId: 'expected-line',
        characterCount: 1,
        tonePattern: '平韵',
        rhymeLabel: 'main',
        requestedRhymeGroup: 'cilin-01',
        nonRhymeEnding: false,
      }),
    );
  });

  it('rejects plans whose line ids do not match the pattern blueprint', async () => {
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        return {
          value: generationRequest.parse({
            brief,
            plan: {
              thesis: '立意',
              style: '清雅',
              voice: '第一人称',
              imagery: ['江'],
              allusions: [],
              sections: [{ sectionId: 'upper', task: '起笔写景', arc: '转入怀人' }],
              lines: [
                {
                  lineId: 'invented-line',
                  task: '以江景开篇',
                  emotion: '清寂',
                  image: '江',
                  ending: '春意',
                },
              ],
            },
          }),
          model: 'test',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const engine = new LlmCompositionEngine(provider);
    const blueprint = createPatternBlueprint(pattern, request);

    await expect(engine.prepareComposition({ request, pattern, blueprint })).rejects.toThrow(
      'lineId 必须与词谱蓝图完全一致',
    );
  });

  it('compacts legacy planning fields when refining an existing work', async () => {
    const legacyPlan = {
      thesis: '借春景怀人',
      style: '含蓄',
      voice: '第一人称',
      imageryPalette: ['江'],
      allusions: [],
      sections: [
        {
          sectionId: 'upper',
          purpose: '由景入情',
          content: '写暮春江面',
          emotionalMovement: '由静景转怀念',
          transition: '以暮色收束',
        },
      ],
      lines: [
        {
          lineId: 'expected-line',
          purpose: '建立氛围',
          content: '写江上春色',
          emotion: '清寂',
          imagery: ['江'],
          connection: '全篇起笔',
          endingIntent: '落在春意',
        },
      ],
    };
    let prompt = '';
    const provider: LlmProvider = {
      name: 'test',
      async generateStructured(generationRequest) {
        prompt = generationRequest.messages.map(({ content }) => content).join('\n');
        return {
          value: generationRequest.parse({ plan: legacyPlan }),
          model: 'test',
          usage: { inputTokens: 1, outputTokens: 1 },
        };
      },
    };
    const engine = new LlmCompositionEngine(provider);
    const blueprint = createPatternBlueprint(pattern, request);
    const prepared = await engine.prepareComposition({
      request: {
        ...request,
        sourceContext: {
          themeBrief: brief,
          plan: legacyPlan as unknown as CompositionPlan,
        },
      },
      pattern,
      blueprint,
    });

    expect(prepared.plan).toEqual({
      thesis: '借春景怀人',
      style: '含蓄',
      voice: '第一人称',
      imagery: ['江'],
      allusions: [],
      sections: [
        {
          sectionId: 'upper',
          task: '由景入情；写暮春江面',
          arc: '由静景转怀念；以暮色收束',
        },
      ],
      lines: [
        {
          lineId: 'expected-line',
          task: '建立氛围；写江上春色；全篇起笔',
          emotion: '清寂',
          image: '江',
          ending: '落在春意',
        },
      ],
    });
    expect(prompt).not.toContain('"imageryPalette"');
    expect(prompt).not.toContain('"purpose"');
  });
});
