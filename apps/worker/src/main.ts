import { cilinZhengyunLexicon } from '@poesygen/prosody';
import { createGenerationWorkflow } from '@poesygen/workflow';

import { loadWorkerConfig } from './config.js';
import { startWorker } from './index.js';

const config = loadWorkerConfig();
const workflow = createGenerationWorkflow({
  draftEngine: config.draftEngine,
  lexicon: cilinZhengyunLexicon,
});
const worker = startWorker(config.redisUrl, {
  workflow,
  concurrency: config.concurrency,
});

worker.on('ready', () => {
  process.stdout.write(
    `PoesyGen worker ready: provider=${config.providerName}` +
      `${config.model === undefined ? '' : ` model=${config.model}`}` +
      ` concurrency=${config.concurrency}\n`,
  );
});
worker.on('completed', (job, result) => {
  process.stdout.write(
    `Generation completed: session=${job.data.sessionId} status=${result.status} rounds=${result.rounds}\n`,
  );
});
worker.on('failed', (job, error) => {
  process.stderr.write(
    `Generation failed: session=${job?.data.sessionId ?? 'unknown'} error=${error.message}\n`,
  );
});
worker.on('error', (error) => {
  process.stderr.write(`Worker error: ${error.message}\n`);
});

const shutdown = async (): Promise<void> => {
  await worker.close();
};

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

await worker.waitUntilReady();
