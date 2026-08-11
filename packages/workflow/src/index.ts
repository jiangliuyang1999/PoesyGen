import { Annotation, END, START, StateGraph } from '@langchain/langgraph';

import type {
  CiPattern,
  CompositionPlan,
  GenerationRequest,
  GenerationResult,
  PatternBlueprint,
  ProsodyReport,
  QualityReport,
  ThemeBrief,
  WorkDraft,
} from '@poesygen/domain';
import type { ProsodyLexicon } from '@poesygen/prosody';

import { LlmCompositionEngine } from './agent/engine.js';
import { PatternParserRole } from './agent/roles/pattern-parser.js';
import { ProsodyValidatorRole } from './agent/roles/prosody-validator.js';
import { defaultAgentSkillRegistry, type SkillRegistry } from './agent/skills/index.js';
import { type CompositionEngine, type OptimizationMode } from './composition.js';

export { LlmCompositionEngine, type LlmCompositionEngineOptions } from './agent/engine.js';
export { CompositionArchitectRole } from './agent/roles/composition-architect.js';
export { DraftWriterRole } from './agent/roles/draft-writer.js';
export { LiteraryCriticRole } from './agent/roles/literary-critic.js';
export { PatternParserRole } from './agent/roles/pattern-parser.js';
export { ProsodyValidatorRole } from './agent/roles/prosody-validator.js';
export { RevisionEditorRole } from './agent/roles/revision-editor.js';
export type { AgentRole } from './agent/roles/types.js';
export {
  type AgentSkill,
  type AgentSkillKind,
  defaultAgentSkillRegistry,
  defaultAgentSkills,
  SkillRegistry,
} from './agent/skills/index.js';
export { createPatternBlueprint } from './agent/tools/pattern-blueprint.js';
export {
  type CompositionEngine,
  type EvaluateDraftsInput,
  type GenerateCandidatesInput,
  type OptimizationMode,
  type OptimizeDraftInput,
  type PreparedComposition,
  type PrepareCompositionInput,
} from './composition.js';

// Kept as a source-compatible name for integrations that constructed the old engine directly.
export class LlmDraftEngine extends LlmCompositionEngine {}

export interface GenerationWorkflowDependencies {
  readonly compositionEngine: CompositionEngine;
  readonly lexicon: ProsodyLexicon;
  readonly skills?: SkillRegistry;
  readonly onProgress?: (progress: GenerationWorkflowProgress) => void;
  readonly onStageResult?: (result: GenerationWorkflowStageResult) => void;
}

export type GenerationWorkflowStage =
  'parsing' | 'planning' | 'drafting' | 'validating' | 'evaluating' | 'optimizing' | 'completed';

export type GenerationProgressActivity = 'started' | 'completed';

export interface GenerationWorkflowProgress {
  readonly stepId: string;
  readonly stage: GenerationWorkflowStage;
  readonly activity: GenerationProgressActivity;
  readonly message: string;
  readonly round?: number;
  readonly maxRounds?: number;
  readonly issueCount?: number;
  readonly elapsedMs?: number;
}

export type GenerationWorkflowStageResultKind =
  | 'pattern_blueprint'
  | 'theme_brief'
  | 'composition_plan'
  | 'draft_candidates'
  | 'prosody_reports'
  | 'quality_reports'
  | 'optimized_draft';

export interface GenerationWorkflowStageResult {
  readonly stepId: string;
  readonly stage: Exclude<GenerationWorkflowStage, 'completed'>;
  readonly kind: GenerationWorkflowStageResultKind;
  readonly value: unknown;
  readonly round?: number;
  readonly maxRounds?: number;
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
  blueprint: Annotation<PatternBlueprint | undefined>(),
  brief: Annotation<ThemeBrief | undefined>(),
  plan: Annotation<CompositionPlan | undefined>(),
  candidates: Annotation<ReadonlyArray<WorkDraft>>(),
  candidateReports: Annotation<ReadonlyArray<ProsodyReport>>(),
  draft: Annotation<WorkDraft | undefined>(),
  report: Annotation<ProsodyReport | undefined>(),
  qualityReport: Annotation<QualityReport | undefined>(),
  bestDraft: Annotation<WorkDraft | undefined>(),
  bestReport: Annotation<ProsodyReport | undefined>(),
  bestQualityReport: Annotation<QualityReport | undefined>(),
  round: Annotation<number>(),
  maxRounds: Annotation<number>(),
});

export function createGenerationWorkflow(
  dependencies: GenerationWorkflowDependencies,
): GenerationWorkflow {
  const progress = createProgressReporter(dependencies);
  const skills = dependencies.skills ?? defaultAgentSkillRegistry;
  const patternParser = new PatternParserRole(skills);
  const prosodyValidator = new ProsodyValidatorRole(dependencies.lexicon, skills);

  const graph = new StateGraph(WorkflowState)
    .addNode('parse', (state) => {
      const stepId = 'parse-pattern';
      progress.emit({
        stepId,
        stage: 'parsing',
        activity: 'started',
        message: '正在解析词谱结构、逐句字数、平仄与韵位',
      });
      const blueprint = patternParser.execute({
        pattern: state.pattern,
        request: state.request,
      });
      progress.emit({
        stepId,
        stage: 'parsing',
        activity: 'completed',
        message: `词谱解析完成：${state.pattern.sections.length} 个分段、${blueprint.lines.length} 句`,
        elapsedMs: 0,
      });
      emitStageResult(dependencies, {
        stepId,
        stage: 'parsing',
        kind: 'pattern_blueprint',
        value: blueprint,
      });
      return { blueprint };
    })
    .addNode('prepare', async (state, config) => {
      if (state.blueprint === undefined) throw new Error('Cannot plan before parsing');
      const prepared = await progress.run(
        {
          stepId: 'prepare-composition',
          stage: 'planning',
          start:
            state.request.sourceContext === undefined
              ? '正在解析主题并规划全篇立意、分阕内容和逐句任务'
              : '正在根据局部修改意见调整受影响的逐句规划',
          complete: (value) =>
            `创作准备完成：提取 ${value.brief.keyFacts.length} 项主题事实，形成 ${value.plan.sections.length} 个分阕计划、${value.plan.lines.length} 个逐句任务`,
        },
        () =>
          dependencies.compositionEngine.prepareComposition(
            {
              request: state.request,
              pattern: state.pattern,
              blueprint: state.blueprint!,
            },
            config.signal,
          ),
      );
      emitStageResult(dependencies, {
        stepId: 'prepare-composition',
        stage: 'planning',
        kind: 'theme_brief',
        value: prepared.brief,
      });
      emitStageResult(dependencies, {
        stepId: 'prepare-composition',
        stage: 'planning',
        kind: 'composition_plan',
        value: prepared.plan,
      });
      return prepared;
    })
    .addNode('generate', async (state, config) => {
      if (state.blueprint === undefined || state.brief === undefined || state.plan === undefined) {
        throw new Error('Cannot generate before planning');
      }
      const candidateCount = state.request.sourceDraft === undefined ? 2 : 1;
      const candidates = await progress.run(
        {
          stepId: 'generate-candidates',
          stage: 'drafting',
          round: 1,
          maxRounds: state.maxRounds,
          start:
            candidateCount === 1
              ? '正在按修改意见和原篇规划生成完整新版本'
              : '正在按逐句规划生成两个完整候选词稿',
          complete: (value: ReadonlyArray<WorkDraft>) =>
            `候选生成完成：收到 ${value.length} 个完整词稿，准备执行程序校验`,
        },
        () =>
          dependencies.compositionEngine.generateCandidates(
            {
              request: state.request,
              pattern: state.pattern,
              blueprint: state.blueprint!,
              brief: state.brief!,
              plan: state.plan!,
              candidateCount,
            },
            config.signal,
          ),
      );
      emitStageResult(dependencies, {
        stepId: 'generate-candidates',
        stage: 'drafting',
        kind: 'draft_candidates',
        value: candidates,
        round: 1,
        maxRounds: state.maxRounds,
      });
      return {
        candidates,
        candidateReports: [],
        round: 1,
        qualityReport: undefined,
      };
    })
    .addNode('validate', (state) => {
      if (state.candidates.length === 0) throw new Error('Cannot validate without candidates');
      const stepId = `validate-round-${state.round}`;
      progress.emit({
        stepId,
        stage: 'validating',
        activity: 'started',
        message: `正在执行第 ${state.round} 轮确定性格律校验`,
        round: state.round,
        maxRounds: state.maxRounds,
      });
      const reports = state.candidates.map((draft) =>
        prosodyValidator.execute({
          draft,
          pattern: state.pattern,
          request: state.request,
        }),
      );
      const passing = state.candidates
        .map((draft, index) => ({ draft, report: reports[index]! }))
        .filter(({ report }) => report.passed);
      const ranked = [
        ...(passing.length > 0
          ? passing
          : state.candidates.map((draft, index) => ({ draft, report: reports[index]! }))),
      ].sort(compareProsodyArtifacts);
      const selected = ranked[0]!;
      const issueCount = countErrors(selected.report);
      const nextBest = chooseBestProsody(
        {
          draft: state.bestDraft,
          report: state.bestReport,
          quality: state.bestQualityReport,
        },
        selected,
      );
      progress.emit({
        stepId,
        stage: 'validating',
        activity: 'completed',
        message:
          passing.length > 0
            ? `第 ${state.round} 轮格律校验完成：${passing.length} 个候选通过硬性规则`
            : `第 ${state.round} 轮发现 ${issueCount} 项格律错误，已选取问题最少的候选准备修订`,
        round: state.round,
        maxRounds: state.maxRounds,
        issueCount,
      });
      emitStageResult(dependencies, {
        stepId,
        stage: 'validating',
        kind: 'prosody_reports',
        value: {
          candidates: state.candidates.map((draft, index) => ({
            draft,
            report: reports[index],
          })),
          passingDraftIds: passing.map(({ draft }) => draft.id),
          selectedDraftId: selected.draft.id,
        },
        round: state.round,
        maxRounds: state.maxRounds,
      });
      return {
        candidates: passing.length > 0 ? passing.map(({ draft }) => draft) : [selected.draft],
        candidateReports:
          passing.length > 0 ? passing.map(({ report }) => report) : [selected.report],
        draft: selected.draft,
        report: selected.report,
        qualityReport: undefined,
        bestDraft: nextBest.draft,
        bestReport: nextBest.report,
        bestQualityReport: nextBest.quality,
      };
    })
    .addNode('evaluate', async (state, config) => {
      if (
        state.blueprint === undefined ||
        state.brief === undefined ||
        state.plan === undefined ||
        state.candidates.length === 0
      ) {
        throw new Error('Cannot evaluate before valid candidates exist');
      }
      const reports = await progress.run(
        {
          stepId: `evaluate-round-${state.round}`,
          stage: 'evaluating',
          round: state.round,
          maxRounds: state.maxRounds,
          start: `正在评价第 ${state.round} 轮候选的主题、结构、意象与语言质量`,
          complete: (value: ReadonlyArray<QualityReport>) => {
            const passed = value.filter((report) => report.passed).length;
            return passed > 0
              ? `文学评价完成：${passed} 个候选达到质量标准`
              : '文学评价完成：已定位需要继续优化的具体句子和维度';
          },
        },
        () =>
          dependencies.compositionEngine.evaluateDrafts(
            {
              request: state.request,
              pattern: state.pattern,
              blueprint: state.blueprint!,
              brief: state.brief!,
              plan: state.plan!,
              drafts: state.candidates,
            },
            config.signal,
          ),
      );
      emitStageResult(dependencies, {
        stepId: `evaluate-round-${state.round}`,
        stage: 'evaluating',
        kind: 'quality_reports',
        value: state.candidates.map((draft, index) => ({
          draft,
          report: reports[index],
        })),
        round: state.round,
        maxRounds: state.maxRounds,
      });
      const evaluated = state.candidates
        .map((draft, index) => ({
          draft,
          report: state.candidateReports[index]!,
          quality: reports[index]!,
        }))
        .sort(compareCompleteArtifacts);
      const selected = evaluated[0]!;
      const nextBest = chooseBestComplete(
        {
          draft: state.bestDraft,
          report: state.bestReport,
          quality: state.bestQualityReport,
        },
        selected,
      );
      return {
        candidates: [selected.draft],
        candidateReports: [selected.report],
        draft: selected.draft,
        report: selected.report,
        qualityReport: selected.quality,
        bestDraft: nextBest.draft,
        bestReport: nextBest.report,
        bestQualityReport: nextBest.quality,
      };
    })
    .addNode('optimize', async (state, config) => {
      if (
        state.blueprint === undefined ||
        state.brief === undefined ||
        state.plan === undefined ||
        state.draft === undefined ||
        state.report === undefined
      ) {
        throw new Error('Cannot optimize before validation');
      }
      const mode = selectOptimizationMode(state.report, state.qualityReport);
      const nextRound = state.round + 1;
      const optimized = await progress.run(
        {
          stepId: `optimize-${mode}-${nextRound}`,
          stage: 'optimizing',
          round: nextRound,
          maxRounds: state.maxRounds,
          start: optimizationStartMessage(mode, nextRound),
          complete: () => `第 ${nextRound} 轮优化稿已生成，正在重新执行格律校验`,
          issueCount:
            mode === 'prosody_repair'
              ? countErrors(state.report)
              : countQualityErrors(state.qualityReport),
        },
        () =>
          dependencies.compositionEngine.optimizeDraft(
            {
              request: state.request,
              pattern: state.pattern,
              blueprint: state.blueprint!,
              brief: state.brief!,
              plan: state.plan!,
              draft: state.draft!,
              prosodyReport: state.report!,
              ...(state.qualityReport === undefined ? {} : { qualityReport: state.qualityReport }),
              mode,
            },
            config.signal,
          ),
      );
      emitStageResult(dependencies, {
        stepId: `optimize-${mode}-${nextRound}`,
        stage: 'optimizing',
        kind: 'optimized_draft',
        value: {
          mode,
          draft: optimized,
        },
        round: nextRound,
        maxRounds: state.maxRounds,
      });
      return {
        candidates: [optimized],
        candidateReports: [],
        draft: optimized,
        report: undefined,
        qualityReport: undefined,
        round: nextRound,
      };
    })
    .addEdge(START, 'parse')
    .addEdge('parse', 'prepare')
    .addEdge('prepare', 'generate')
    .addEdge('generate', 'validate')
    .addConditionalEdges(
      'validate',
      (state) => {
        if (state.report?.passed === true) return 'evaluate';
        return state.round >= state.maxRounds ? 'done' : 'optimize';
      },
      {
        evaluate: 'evaluate',
        optimize: 'optimize',
        done: END,
      },
    )
    .addConditionalEdges(
      'evaluate',
      (state) => {
        if (state.qualityReport?.passed === true || state.round >= state.maxRounds) return 'done';
        return 'optimize';
      },
      {
        optimize: 'optimize',
        done: END,
      },
    )
    .addEdge('optimize', 'validate')
    .compile();

  return {
    async run(input, signal): Promise<GenerationWorkflowResult> {
      const result = await graph.invoke(
        {
          request: input.request,
          pattern: input.pattern,
          blueprint: undefined,
          brief: undefined,
          plan: undefined,
          candidates: [],
          candidateReports: [],
          draft: undefined,
          report: undefined,
          qualityReport: undefined,
          bestDraft: undefined,
          bestReport: undefined,
          bestQualityReport: undefined,
          round: 0,
          maxRounds: Math.max(1, input.request.maxRounds ?? 8),
        },
        signal === undefined ? undefined : { signal },
      );
      const draft = result.bestDraft ?? result.draft;
      const report = result.bestReport ?? result.report;
      const qualityReport = result.bestQualityReport ?? result.qualityReport;
      if (
        draft === undefined ||
        report === undefined ||
        result.brief === undefined ||
        result.plan === undefined
      ) {
        throw new Error('Generation workflow completed without a validated artifact');
      }
      const status: GenerationResult['status'] =
        report.passed && qualityReport?.passed === true
          ? 'completed'
          : report.passed
            ? 'quality_limit_reached'
            : 'round_limit_reached';
      const workflowResult: GenerationWorkflowResult = {
        status,
        draft,
        report,
        rounds: result.round,
        context: {
          themeBrief: result.brief,
          plan: result.plan,
        },
        ...(qualityReport === undefined ? {} : { qualityReport }),
      };
      progress.emit({
        stepId: 'complete',
        stage: 'completed',
        activity: 'completed',
        message:
          status === 'completed'
            ? `创作完成：格律与文学质量均已通过，共生成 ${result.round} 轮词稿`
            : status === 'quality_limit_reached'
              ? `已达到 ${result.round} 轮上限：格律通过，保留文学质量最佳版本`
              : `已达到 ${result.round} 轮上限：保留格律问题最少的版本`,
        round: result.round,
        maxRounds: input.request.maxRounds ?? 8,
        issueCount: countErrors(report) + countQualityErrors(qualityReport),
      });
      return workflowResult;
    },
  };
}

function emitStageResult(
  dependencies: GenerationWorkflowDependencies,
  result: GenerationWorkflowStageResult,
): void {
  dependencies.onStageResult?.(result);
}

function createProgressReporter(dependencies: GenerationWorkflowDependencies): {
  emit(progress: GenerationWorkflowProgress): void;
  run<Value>(
    options: {
      readonly stepId: string;
      readonly stage: GenerationWorkflowStage;
      readonly start: string;
      readonly complete: (value: Value) => string;
      readonly round?: number;
      readonly maxRounds?: number;
      readonly issueCount?: number;
    },
    operation: () => Promise<Value>,
  ): Promise<Value>;
} {
  const emit = (event: GenerationWorkflowProgress): void => dependencies.onProgress?.(event);
  return {
    emit,
    async run(options, operation) {
      const startedAt = Date.now();
      const common = {
        stepId: options.stepId,
        stage: options.stage,
        ...(options.round === undefined ? {} : { round: options.round }),
        ...(options.maxRounds === undefined ? {} : { maxRounds: options.maxRounds }),
        ...(options.issueCount === undefined ? {} : { issueCount: options.issueCount }),
      };
      emit({
        ...common,
        activity: 'started',
        message: options.start,
      });
      const value = await operation();
      const elapsedMs = Date.now() - startedAt;
      emit({
        ...common,
        activity: 'completed',
        message: `${options.complete(value)}（${formatElapsed(elapsedMs)}）`,
        elapsedMs,
      });
      return value;
    },
  };
}

function chooseBestProsody(
  best: Artifact,
  candidate: { readonly draft: WorkDraft; readonly report: ProsodyReport },
): RequiredArtifact {
  if (best.draft === undefined || best.report === undefined) {
    return { ...candidate, quality: undefined };
  }
  const current = { draft: best.draft, report: best.report, quality: best.quality };
  return compareProsodyArtifacts(candidate, current) < 0
    ? { ...candidate, quality: undefined }
    : current;
}

function chooseBestComplete(best: Artifact, candidate: RequiredArtifact): RequiredArtifact {
  if (best.draft === undefined || best.report === undefined) return candidate;
  const current = { draft: best.draft, report: best.report, quality: best.quality };
  return compareCompleteArtifacts(candidate, current) < 0 ? candidate : current;
}

interface Artifact {
  readonly draft: WorkDraft | undefined;
  readonly report: ProsodyReport | undefined;
  readonly quality: QualityReport | undefined;
}

interface RequiredArtifact {
  readonly draft: WorkDraft;
  readonly report: ProsodyReport;
  readonly quality: QualityReport | undefined;
}

function compareProsodyArtifacts(
  left: { readonly report: ProsodyReport },
  right: { readonly report: ProsodyReport },
): number {
  return (
    countErrors(left.report) - countErrors(right.report) ||
    left.report.issues.length - right.report.issues.length
  );
}

function compareCompleteArtifacts(left: RequiredArtifact, right: RequiredArtifact): number {
  const hardErrorDifference = countErrors(left.report) - countErrors(right.report);
  if (hardErrorDifference !== 0) return hardErrorDifference;
  if (left.quality === undefined) return right.quality === undefined ? 0 : 1;
  if (right.quality === undefined) return -1;
  return (
    countQualityErrors(left.quality) - countQualityErrors(right.quality) ||
    qualityCoreMinimum(right.quality) - qualityCoreMinimum(left.quality) ||
    qualityTotal(right.quality) - qualityTotal(left.quality) ||
    left.report.issues.length - right.report.issues.length
  );
}

function selectOptimizationMode(
  report: ProsodyReport,
  quality: QualityReport | undefined,
): OptimizationMode {
  if (!report.passed) return 'prosody_repair';
  if (quality === undefined) return 'literary_polish';
  if (
    quality.scores.allusionFitness < 3 ||
    quality.issues.some(
      ({ dimension, severity }) => dimension === 'allusionFitness' && severity === 'error',
    )
  ) {
    return 'allusion_repair';
  }
  if (quality.scores.themeFidelity < 4) return 'theme_repair';
  if (quality.scores.coherence < 4 || quality.scores.emotionalArc < 3) {
    return 'structure_repair';
  }
  return 'literary_polish';
}

function optimizationStartMessage(mode: OptimizationMode, round: number): string {
  const descriptions: Record<OptimizationMode, string> = {
    prosody_repair: '修复字数、平仄和押韵错误',
    theme_repair: '修复偏题和主题事实遗漏',
    structure_repair: '调整上下阕承接与情感推进',
    literary_polish: '炼字并统一意象和语言质感',
    allusion_repair: '核正或移除不可靠的典故表达',
  };
  return `正在进行第 ${round} 轮优化：${descriptions[mode]}`;
}

function countErrors(report: ProsodyReport): number {
  return report.issues.filter(({ severity }) => severity === 'error').length;
}

function countQualityErrors(report: QualityReport | undefined): number {
  return report?.issues.filter(({ severity }) => severity === 'error').length ?? 0;
}

function qualityCoreMinimum(report: QualityReport): number {
  return Math.min(report.scores.themeFidelity, report.scores.coherence);
}

function qualityTotal(report: QualityReport): number {
  return Object.values(report.scores).reduce((sum, score) => sum + score, 0);
}

function formatElapsed(elapsedMs: number): string {
  if (elapsedMs < 1_000) return `${elapsedMs} 毫秒`;
  return `${Math.max(1, Math.round(elapsedMs / 1_000))} 秒`;
}
