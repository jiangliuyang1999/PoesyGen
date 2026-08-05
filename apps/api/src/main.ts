import { buildApp } from './app.js';
import { createIdeaProvider } from './idea-provider.js';

import { createGenerationQueue } from '@poesygen/queue';

const port = Number(process.env['PORT'] ?? 3_000);
const host = process.env['HOST'] ?? '0.0.0.0';
const redisUrl = process.env['REDIS_URL'];
const generationQueue = redisUrl === undefined ? undefined : createGenerationQueue(redisUrl);
const ideaProvider = createIdeaProvider();

if (redisUrl === undefined) {
  process.stderr.write('REDIS_URL 未配置，生成接口将返回 503。\n');
}
if (ideaProvider === undefined) {
  process.stderr.write('LLM 未配置，灵感推荐接口将返回 503。\n');
}

const app = await buildApp({
  logger: true,
  ...(generationQueue === undefined ? {} : { generationQueue }),
  ...(ideaProvider === undefined ? {} : { ideaProvider }),
});

const shutdown = async (): Promise<void> => {
  await app.close();
  await generationQueue?.close();
};

process.once('SIGINT', () => {
  void shutdown();
});
process.once('SIGTERM', () => {
  void shutdown();
});

await app.listen({ host, port });
