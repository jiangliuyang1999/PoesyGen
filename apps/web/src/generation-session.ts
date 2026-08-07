import type { CiPattern, GenerationRequest, GenerationResult } from '@poesygen/domain';

import type { DirectLlmConfig } from './direct-llm-config.js';
import { runDirectGeneration, type DirectGenerationProgress } from './direct-generation.js';
import { toUserMessage } from './errors.js';
import type { SubmissionProgressEntry, SubmissionStatus } from './GenerationSettings.js';

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
  let progress: ReadonlyArray<SubmissionProgressEntry> = [initialProgress];
  const retained = retainedResult === undefined ? {} : { result: retainedResult };
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
        onStatus({
          kind: event.phase,
          message: event.message,
          ...retained,
          progress,
        });
      },
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
