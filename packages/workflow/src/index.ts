import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type {
  CiPattern,
  GenerationRequest,
  GenerationResult,
  ProsodyReport,
  WorkDraft,
} from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';
import { checkProsody, type ProsodyLexicon } from '@poesygen/prosody';

export interface RepairDraftInput {
  readonly request: GenerationRequest;
  readonly pattern: CiPattern;
  readonly draft: WorkDraft;
  readonly report: ProsodyReport;
}

export interface DraftEngine {
  createDraft(
    request: GenerationRequest,
    pattern: CiPattern,
    signal?: AbortSignal,
  ): Promise<WorkDraft>;
  repairDraft(input: RepairDraftInput, signal?: AbortSignal): Promise<WorkDraft>;
}

interface LlmDraftPayload {
  readonly title?: string;
  readonly lines: ReadonlyArray<string>;
}

export class LlmDraftEngine implements DraftEngine {
  readonly #provider: LlmProvider;

  public constructor(provider: LlmProvider) {
    this.#provider = provider;
  }

  public async createDraft(
    request: GenerationRequest,
    pattern: CiPattern,
    signal?: AbortSignal,
  ): Promise<WorkDraft> {
    if (request.sourceDraft !== undefined || request.selections !== undefined) {
      if (request.sourceDraft === undefined || request.selections === undefined) {
        throw new Error('Refinement requires both sourceDraft and selections');
      }
      return this.#refineDraft(request, pattern, signal);
    }

    const result = await this.#provider.generateStructured(
      {
        operation: 'draft',
        messages: [
          {
            role: 'system',
            content: [
              '你是严谨的宋词创作者。',
              '根据给定词牌、主题和格律创作一首完整词作。',
              '只输出 JSON 对象：{"title":"可选题目","lines":["逐句文本"]}。',
              'lines 必须严格按模板顺序，每个数组元素只含一句正文，不含序号、标点或解释。',
              '“中”表示可平可仄；韵脚须遵守指定词林正韵韵部。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: createDraftPrompt(request, pattern),
          },
        ],
        parse: parseDraftPayload,
        temperature: 0.75,
        metadata: {
          patternId: pattern.id,
          promptVersion: 'draft-v1',
        },
      },
      signal,
    );
    return payloadToDraft(result.value, request, pattern, 1);
  }

  async #refineDraft(
    request: GenerationRequest,
    pattern: CiPattern,
    signal?: AbortSignal,
  ): Promise<WorkDraft> {
    const sourceDraft = request.sourceDraft!;
    const result = await this.#provider.generateStructured(
      {
        operation: 'refine',
        messages: [
          {
            role: 'system',
            content: [
              '你是宋词局部修改编辑。',
              '严格按照用户对选中字、词或句的意见修改，同时保持全词主题、意象和语气连贯。',
              '只输出 JSON 对象：{"title":"可选题目","lines":["逐句文本"]}。',
              'lines 必须包含修改后的完整词稿，不含序号、标点或解释。',
              '未被选中的内容尽量保持不变；仅在语义衔接、平仄或押韵确有必要时做最小联动修改。',
              '修改后仍须满足给定词牌的字数、平仄和押韵约束。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: createRefinementPrompt(request, pattern),
          },
        ],
        parse: parseDraftPayload,
        temperature: 0.45,
        metadata: {
          patternId: pattern.id,
          promptVersion: 'refine-v1',
          version: String(sourceDraft.version),
        },
      },
      signal,
    );
    const payload =
      result.value.title === undefined && sourceDraft.title !== undefined
        ? { ...result.value, title: sourceDraft.title }
        : result.value;
    return payloadToDraft(payload, request, pattern, sourceDraft.version + 1);
  }

  public async repairDraft(input: RepairDraftInput, signal?: AbortSignal): Promise<WorkDraft> {
    const result = await this.#provider.generateStructured(
      {
        operation: 'repair',
        messages: [
          {
            role: 'system',
            content: [
              '你是宋词格律修订者。',
              '依据程序给出的确定性校验错误修订词稿，同时保持主题、意象和语义连贯。',
              '只输出 JSON 对象：{"title":"可选题目","lines":["逐句文本"]}。',
              'lines 必须包含完整词稿，不含序号、标点或解释。',
              '优先只修改报错位置；若为押韵冲突，可联动修改同组韵脚。',
            ].join('\n'),
          },
          {
            role: 'user',
            content: createRepairPrompt(input),
          },
        ],
        parse: parseDraftPayload,
        temperature: 0.35,
        metadata: {
          patternId: input.pattern.id,
          promptVersion: 'repair-v1',
          version: String(input.draft.version),
        },
      },
      signal,
    );
    return payloadToDraft(result.value, input.request, input.pattern, input.draft.version + 1);
  }
}

export class ExampleDraftEngine implements DraftEngine {
  public createDraft(
    request: GenerationRequest,
    pattern: CiPattern,
    _signal?: AbortSignal,
  ): Promise<WorkDraft> {
    if (request.sourceDraft !== undefined && request.selections !== undefined) {
      return Promise.resolve({
        ...request.sourceDraft,
        id: globalThis.crypto.randomUUID(),
        version: request.sourceDraft.version + 1,
      });
    }
    if (pattern.example === undefined) {
      return Promise.reject(new Error(`Pattern ${pattern.id} has no example draft`));
    }
    return Promise.resolve(
      payloadToDraft(
        {
          title: `${pattern.name}·${request.theme.slice(0, 12)}`,
          lines: pattern.example.lines,
        },
        request,
        pattern,
        1,
      ),
    );
  }

  public repairDraft(input: RepairDraftInput, _signal?: AbortSignal): Promise<WorkDraft> {
    return Promise.resolve({
      ...input.draft,
      id: globalThis.crypto.randomUUID(),
      version: input.draft.version + 1,
    });
  }
}

export interface GenerationWorkflowDependencies {
  readonly draftEngine: DraftEngine;
  readonly lexicon: ProsodyLexicon;
  readonly onProgress?: (progress: GenerationWorkflowProgress) => void;
}

export type GenerationWorkflowStage = 'drafting' | 'validating' | 'repairing' | 'completed';

export interface GenerationWorkflowProgress {
  readonly stage: GenerationWorkflowStage;
  readonly message: string;
  readonly round: number;
  readonly maxRounds: number;
  readonly issueCount?: number;
}

export interface GenerationWorkflowInput {
  readonly request: GenerationRequest;
  readonly pattern: CiPattern;
}

export type GenerationWorkflowResult = GenerationResult;

export interface GenerationWorkflow {
  run(input: GenerationWorkflowInput, signal?: AbortSignal): Promise<GenerationWorkflowResult>;
}

const WorkflowState = Annotation.Root({
  request: Annotation<GenerationRequest>(),
  pattern: Annotation<CiPattern>(),
  draft: Annotation<WorkDraft | undefined>(),
  report: Annotation<ProsodyReport | undefined>(),
  bestDraft: Annotation<WorkDraft | undefined>(),
  bestReport: Annotation<ProsodyReport | undefined>(),
  round: Annotation<number>(),
  maxRounds: Annotation<number>(),
});

export function createGenerationWorkflow(
  dependencies: GenerationWorkflowDependencies,
): GenerationWorkflow {
  const graph = new StateGraph(WorkflowState)
    .addNode('generate', async (state, config) => {
      dependencies.onProgress?.({
        stage: 'drafting',
        message:
          state.request.sourceDraft === undefined ? '正在生成初稿' : '正在根据修改意见生成新版本',
        round: 1,
        maxRounds: state.maxRounds,
      });
      return {
        draft: await dependencies.draftEngine.createDraft(
          state.request,
          state.pattern,
          config.signal,
        ),
        round: 1,
      };
    })
    .addNode('validate', (state) => {
      if (state.draft === undefined) {
        throw new Error('Cannot validate before a draft has been generated');
      }

      const report = checkProsody(
        state.draft,
        state.pattern,
        dependencies.lexicon,
        state.request.preferredRhymeGroup === undefined
          ? {}
          : { expectedRhymeGroup: state.request.preferredRhymeGroup },
      );
      const issueCount = countErrors(report);
      dependencies.onProgress?.({
        stage: 'validating',
        message: report.passed
          ? `第 ${state.round} 轮格律校验通过`
          : `第 ${state.round} 轮校验发现 ${issueCount} 项错误`,
        round: state.round,
        maxRounds: state.maxRounds,
        issueCount,
      });
      const shouldReplaceBest =
        state.bestReport === undefined ||
        issueCount < countErrors(state.bestReport) ||
        (issueCount === countErrors(state.bestReport) &&
          report.issues.length < state.bestReport.issues.length);

      return {
        report,
        ...(shouldReplaceBest ? { bestDraft: state.draft, bestReport: report } : {}),
      };
    })
    .addNode('repair', async (state, config) => {
      if (state.draft === undefined || state.report === undefined) {
        throw new Error('Cannot repair before validation');
      }

      const nextRound = state.round + 1;
      dependencies.onProgress?.({
        stage: 'repairing',
        message: `正在进行第 ${nextRound} 轮格律修订`,
        round: nextRound,
        maxRounds: state.maxRounds,
        issueCount: countErrors(state.report),
      });
      return {
        draft: await dependencies.draftEngine.repairDraft(
          {
            request: state.request,
            pattern: state.pattern,
            draft: state.draft,
            report: state.report,
          },
          config.signal,
        ),
        round: nextRound,
      };
    })
    .addEdge(START, 'generate')
    .addEdge('generate', 'validate')
    .addConditionalEdges(
      'validate',
      (state) => {
        if (state.report?.passed === true || state.round >= state.maxRounds) {
          return 'done';
        }
        return 'repair';
      },
      {
        repair: 'repair',
        done: END,
      },
    )
    .addEdge('repair', 'validate')
    .compile();

  return {
    async run(input, signal): Promise<GenerationWorkflowResult> {
      const result = await graph.invoke(
        {
          request: input.request,
          pattern: input.pattern,
          draft: undefined,
          report: undefined,
          bestDraft: undefined,
          bestReport: undefined,
          round: 0,
          maxRounds: input.request.maxRounds ?? 8,
        },
        signal === undefined ? undefined : { signal },
      );
      const draft = result.bestDraft ?? result.draft;
      const report = result.bestReport ?? result.report;
      if (draft === undefined || report === undefined) {
        throw new Error('Generation workflow completed without a validated draft');
      }

      const workflowResult: GenerationWorkflowResult = {
        status: report.passed ? 'completed' : 'round_limit_reached',
        draft,
        report,
        rounds: result.round,
      };
      dependencies.onProgress?.({
        stage: 'completed',
        message: report.passed
          ? `格律校验通过，共完成 ${result.round} 轮`
          : `达到 ${result.round} 轮上限，已保留最佳版本`,
        round: result.round,
        maxRounds: input.request.maxRounds ?? 8,
        issueCount: countErrors(report),
      });
      return workflowResult;
    },
  };
}

function countErrors(report: ProsodyReport): number {
  return report.issues.filter(({ severity }) => severity === 'error').length;
}

function createDraftPrompt(request: GenerationRequest, pattern: CiPattern): string {
  return [
    `词牌：${pattern.name}·${pattern.variant}`,
    `主题：${request.theme}`,
    `格律模板：\n${formatPatternConstraints(pattern, request)}`,
    request.additionalRequirements === undefined
      ? ''
      : `附加要求：\n${request.additionalRequirements.map((value) => `- ${value}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function createRepairPrompt(input: RepairDraftInput): string {
  return [
    `词牌：${input.pattern.name}·${input.pattern.variant}`,
    `主题：${input.request.theme}`,
    `格律模板：\n${formatPatternConstraints(input.pattern, input.request)}`,
    `当前词稿：\n${input.draft.lines
      .map((line, index) => `${index + 1}. ${line.text}`)
      .join('\n')}`,
    `程序校验错误：\n${input.report.issues
      .map(
        (issue) =>
          `- ${issue.lineId}${issue.charIndex === undefined ? '' : ` 第${issue.charIndex + 1}字`}：${issue.message}` +
          `${issue.expected === undefined ? '' : `；期望 ${issue.expected}`}` +
          `${issue.actual === undefined ? '' : `；实际 ${issue.actual}`}`,
      )
      .join('\n')}`,
    input.request.sourceDraft === undefined || input.request.selections === undefined
      ? ''
      : `用户局部修改要求：\n${formatSelections(
          input.request.sourceDraft,
          input.request.selections,
        )}`,
  ].join('\n\n');
}

function createRefinementPrompt(request: GenerationRequest, pattern: CiPattern): string {
  const sourceDraft = request.sourceDraft!;
  const selections = request.selections!;
  return [
    `词牌：${pattern.name}·${pattern.variant}`,
    `主题：${request.theme}`,
    `格律模板：\n${formatPatternConstraints(pattern, request)}`,
    `当前标题：${sourceDraft.title ?? '无题'}`,
    `当前词稿：\n${sourceDraft.lines
      .map((line, index) => `${index + 1}. ${line.text}`)
      .join('\n')}`,
    `用户局部修改要求：\n${formatSelections(sourceDraft, selections)}`,
    request.additionalRequirements === undefined
      ? ''
      : `原附加要求：\n${request.additionalRequirements.map((value) => `- ${value}`).join('\n')}`,
  ]
    .filter(Boolean)
    .join('\n\n');
}

function formatSelections(
  draft: WorkDraft,
  selections: NonNullable<GenerationRequest['selections']>,
): string {
  const lineNumbers = new Map(draft.lines.map((line, index) => [line.id, index + 1]));
  const lines = new Map(draft.lines.map((line) => [line.id, line.text]));
  return selections
    .map((selection) => {
      const line = lines.get(selection.lineId) ?? '';
      const selectedText = Array.from(line).slice(selection.start, selection.end).join('');
      return `- 第${lineNumbers.get(selection.lineId) ?? '?'}句“${selectedText}”：${selection.instruction}`;
    })
    .join('\n');
}

function formatPatternConstraints(pattern: CiPattern, request: GenerationRequest): string {
  let lineNumber = 0;
  return pattern.sections
    .flatMap((section) => [
      `[${section.name}]`,
      ...section.lines.map((line) => {
        lineNumber += 1;
        const tones = line.positions
          .map(({ tone, rhyme }) => {
            const marker = tone === 'level' ? '平' : tone === 'oblique' ? '仄' : '中';
            if (rhyme === undefined) return marker;
            const requested =
              typeof request.preferredRhymeGroup === 'string'
                ? request.preferredRhymeGroup
                : request.preferredRhymeGroup?.[rhyme];
            return `${marker}韵${requested === undefined ? '' : `(${requested})`}`;
          })
          .join('');
        return `${lineNumber}. ${line.positions.length}字：${tones}`;
      }),
    ])
    .join('\n');
}

function parseDraftPayload(value: unknown): LlmDraftPayload {
  if (typeof value !== 'object' || value === null) {
    throw new Error('LLM draft must be a JSON object');
  }
  const candidate = value as { title?: unknown; lines?: unknown };
  if (!Array.isArray(candidate.lines) || candidate.lines.length === 0) {
    throw new Error('LLM draft must contain a non-empty lines array');
  }
  const lines = candidate.lines.map((line) => {
    if (typeof line !== 'string' || normalizeLine(line) === '') {
      throw new Error('Every LLM draft line must be a non-empty string');
    }
    return normalizeLine(line);
  });
  return {
    lines,
    ...(typeof candidate.title === 'string' && candidate.title.trim() !== ''
      ? { title: candidate.title.trim() }
      : {}),
  };
}

function payloadToDraft(
  payload: LlmDraftPayload,
  request: GenerationRequest,
  pattern: CiPattern,
  version: number,
): WorkDraft {
  const expectedLines = pattern.sections.flatMap((section) => section.lines);
  return {
    id: globalThis.crypto.randomUUID(),
    patternId: pattern.id,
    theme: request.theme,
    ...(typeof request.preferredRhymeGroup === 'string'
      ? { requestedRhymeGroup: request.preferredRhymeGroup }
      : {}),
    lines: payload.lines.map((text, index) => ({
      id: expectedLines[index]?.id ?? `extra-line-${index + 1}`,
      text: normalizeLine(text),
    })),
    version,
    ...(payload.title === undefined ? {} : { title: payload.title }),
  };
}

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:第?[一二三四五六七八九十\d]+[.、:：)]\s*)/u, '')
    .replace(/[，。！？；：、,.!?;:]+$/u, '')
    .replace(/\s+/gu, '');
}
