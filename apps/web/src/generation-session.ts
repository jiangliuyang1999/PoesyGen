import type { CiPattern, GenerationRequest, GenerationResult } from '@poesygen/domain';

import type { DirectLlmConfig } from './direct-llm-config.js';
import { runDirectGeneration, type DirectGenerationProgress } from './direct-generation.js';
import { toUserMessage } from './errors.js';
import type { SubmissionProgressEntry, SubmissionStatus } from './GenerationSettings.js';
import { logWebError, logWebEvent } from './web-logger.js';

interface RunGenerationSessionInput {
  readonly config: DirectLlmConfig;
  readonly request: GenerationRequest;
  readonly pattern: CiPattern;
  readonly initialProgress: SubmissionProgressEntry;
  readonly loadingMessage: string;
  readonly retainedResult?: GenerationResult;
  readonly onStatus: (status: SubmissionStatus) => void;
}

export interface GenerationSessionResult {
  readonly result: GenerationResult;
  readonly progress: ReadonlyArray<SubmissionProgressEntry>;
}

export async function runGenerationSession({
  config,
  request,
  pattern,
  initialProgress,
  loadingMessage,
  retainedResult,
  onStatus,
}: RunGenerationSessionInput): Promise<GenerationSessionResult> {
  const startedAt = performance.now();
  let progress: ReadonlyArray<SubmissionProgressEntry> = [initialProgress];
  const retained = retainedResult === undefined ? {} : { result: retainedResult };
  logWebEvent('session', '生成会话开始', {
    patternId: pattern.id,
    patternName: pattern.name,
    request,
    retainedDraftId: retainedResult?.draft.id,
    initialProgress,
  });
  onStatus({
    kind: 'loading',
    message: loadingMessage,
    ...retained,
    progress,
  });

  try {
    const result = await runDirectGeneration(config, request, pattern, {
      onProgress(event) {
        progress = [...progress, directProgressToSubmissionProgress(event)];
        logWebEvent('session', '生成会话状态更新', {
          patternId: pattern.id,
          event,
          progressCount: progress.length,
        });
        onStatus({
          kind: event.phase,
          message: event.message,
          ...retained,
          progress,
        });
      },
    });
    logWebEvent('session', '生成会话完成', {
      durationMs: Math.round(performance.now() - startedAt),
      patternId: pattern.id,
      draftId: result.draft.id,
      resultVersion: result.draft.version,
      rounds: result.rounds,
      passed: result.report.passed,
      issueCount: result.report.issues.length,
      progress,
    });
    return { result, progress };
  } catch (error) {
    const message = toUserMessage(error);
    progress = [...progress, { stage: 'error', message }];
    onStatus({
      kind: 'error',
      message,
      ...retained,
      progress,
    });
    logWebError('session', '生成会话失败', error, {
      durationMs: Math.round(performance.now() - startedAt),
      patternId: pattern.id,
      request,
      progress,
    });
    throw error;
  }
}

function directProgressToSubmissionProgress(
  progress: DirectGenerationProgress,
): SubmissionProgressEntry {
  return {
    stage: progress.stage,
    message: progress.message,
    ...(progress.round === undefined ? {} : { round: progress.round }),
    ...(progress.maxRounds === undefined ? {} : { maxRounds: progress.maxRounds }),
    ...(progress.issueCount === undefined ? {} : { issueCount: progress.issueCount }),
  };
}
