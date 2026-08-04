import { Queue, Worker, type JobProgress, type Processor } from 'bullmq';
import Redis from 'ioredis';

import type { GenerationRequest, GenerationResult } from '@poesygen/domain';

export const generationQueueName = 'poesygen-generation';

export interface GenerationJobData {
  readonly sessionId: string;
  readonly request: GenerationRequest;
}

export interface GenerationJobResult extends GenerationResult {
  readonly sessionId: string;
}

export interface GenerationSessionSnapshot {
  readonly id: string;
  readonly jobId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly progress: JobProgress;
  readonly result?: GenerationJobResult;
  readonly error?: string;
}

export interface GenerationQueueHealth {
  readonly redis: 'ok';
  readonly workers: number;
}

export interface GenerationQueue {
  enqueue(data: GenerationJobData): Promise<string>;
  getSession(sessionId: string): Promise<GenerationSessionSnapshot | undefined>;
  getHealth(): Promise<GenerationQueueHealth>;
  close(): Promise<void>;
}

export type GenerationWorker = Worker<GenerationJobData, GenerationJobResult>;

export function createGenerationQueue(redisUrl: string): GenerationQueue {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  const queue = new Queue<GenerationJobData>(generationQueueName, { connection });

  return {
    async enqueue(data): Promise<string> {
      const job = await queue.add('generate', data, {
        jobId: data.sessionId,
        attempts: 2,
        backoff: { type: 'exponential', delay: 1_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      });
      return String(job.id);
    },
    async getSession(sessionId): Promise<GenerationSessionSnapshot | undefined> {
      const job = await queue.getJob(sessionId);
      if (job === undefined) return undefined;

      const state = await job.getState();
      const status =
        state === 'active'
          ? 'running'
          : state === 'completed'
            ? 'completed'
            : state === 'failed'
              ? 'failed'
              : 'queued';
      return {
        id: job.data.sessionId,
        jobId: String(job.id),
        status,
        progress: job.progress,
        ...(job.returnvalue === null || job.returnvalue === undefined
          ? {}
          : { result: job.returnvalue }),
        ...(job.failedReason === undefined || job.failedReason === ''
          ? {}
          : { error: job.failedReason }),
      };
    },
    async getHealth(): Promise<GenerationQueueHealth> {
      await queue.waitUntilReady();
      return {
        redis: 'ok',
        workers: await queue.getWorkersCount(),
      };
    },
    async close(): Promise<void> {
      await queue.close();
      await connection.quit();
    },
  };
}

export function createGenerationWorker(
  redisUrl: string,
  processor: Processor<GenerationJobData, GenerationJobResult>,
  options: { readonly concurrency?: number } = {},
): GenerationWorker {
  const connection = new Redis(redisUrl, { maxRetriesPerRequest: null });
  return new Worker<GenerationJobData>(generationQueueName, processor, {
    connection,
    concurrency: options.concurrency ?? 1,
  });
}
