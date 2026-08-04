import { findPattern } from '@poesygen/patterns';
import { createGenerationWorker, type GenerationWorker } from '@poesygen/queue';
import type { GenerationWorkflow } from '@poesygen/workflow';

export interface WorkerDependencies {
  readonly workflow: GenerationWorkflow;
  readonly concurrency?: number;
}

export function startWorker(redisUrl: string, dependencies: WorkerDependencies): GenerationWorker {
  return createGenerationWorker(
    redisUrl,
    async (job, _token, signal) => {
      const pattern = findPattern(job.data.request.patternId);
      if (pattern === undefined) {
        throw new Error(`Unknown pattern: ${job.data.request.patternId}`);
      }

      await job.updateProgress({
        phase: 'generating',
        message: `正在按《${pattern.name}》生成初稿`,
      });
      const result = await dependencies.workflow.run(
        {
          request: job.data.request,
          pattern,
        },
        signal,
      );
      await job.updateProgress({
        phase: 'completed',
        message:
          result.status === 'completed'
            ? `已在 ${result.rounds} 轮内通过格律校验`
            : `已达到 ${result.rounds} 轮优化上限`,
        rounds: result.rounds,
      });

      return {
        sessionId: job.data.sessionId,
        ...result,
      };
    },
    dependencies.concurrency === undefined ? {} : { concurrency: dependencies.concurrency },
  );
}
