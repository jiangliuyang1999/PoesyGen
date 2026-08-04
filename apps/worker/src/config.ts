import { OpenAiCompatibleProvider } from '@poesygen/llm';
import { ExampleDraftEngine, LlmDraftEngine, type DraftEngine } from '@poesygen/workflow';

export interface WorkerConfig {
  readonly redisUrl: string;
  readonly concurrency: number;
  readonly draftEngine: DraftEngine;
  readonly providerName: string;
  readonly model?: string;
}

export function loadWorkerConfig(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): WorkerConfig {
  const redisUrl = environment['REDIS_URL'];
  if (redisUrl === undefined || redisUrl.trim() === '') {
    throw new Error('REDIS_URL is required to start the generation worker');
  }

  const concurrency = parsePositiveInteger(environment['WORKER_CONCURRENCY'] ?? '1');
  const providerName = environment['LLM_PROVIDER'] ?? 'openai-compatible';
  if (providerName === 'mock') {
    return {
      redisUrl,
      concurrency,
      providerName,
      draftEngine: new ExampleDraftEngine(),
    };
  }
  if (providerName !== 'openai-compatible') {
    throw new Error(`Unsupported LLM_PROVIDER: ${providerName}`);
  }

  const apiKey =
    environment['LLM_API_KEY'] ?? environment['OPENAI_API_KEY'] ?? environment['ARK_API_KEY'];
  if (apiKey === undefined || apiKey.trim() === '') {
    throw new Error(
      'LLM_API_KEY is required (OPENAI_API_KEY and ARK_API_KEY are accepted aliases)',
    );
  }
  const model = environment['LLM_MODEL'] ?? environment['OPENAI_MODEL'];
  if (model === undefined || model.trim() === '') {
    throw new Error('LLM_MODEL is required');
  }

  const provider = new OpenAiCompatibleProvider({
    apiKey,
    model,
    baseUrl: environment['LLM_BASE_URL'] ?? 'https://api.openai.com/v1',
    ...(environment['LLM_ENDPOINT'] === undefined ? {} : { endpoint: environment['LLM_ENDPOINT'] }),
    timeoutMs: parsePositiveInteger(environment['LLM_TIMEOUT_MS'] ?? '120000'),
    maxTokens: parsePositiveInteger(environment['LLM_MAX_TOKENS'] ?? '4096'),
    jsonMode: environment['LLM_JSON_MODE'] !== 'false',
    headers: parseHeaders(environment['LLM_EXTRA_HEADERS']),
  });
  return {
    redisUrl,
    concurrency,
    providerName,
    model,
    draftEngine: new LlmDraftEngine(provider),
  };
}

function parsePositiveInteger(value: string): number {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`Expected a positive integer, received: ${value}`);
  }
  return parsed;
}

function parseHeaders(value: string | undefined): Readonly<Record<string, string>> {
  if (value === undefined || value.trim() === '') return {};
  const parsed = JSON.parse(value) as unknown;
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    throw new Error('LLM_EXTRA_HEADERS must be a JSON object');
  }
  const headers: Record<string, string> = {};
  for (const [key, headerValue] of Object.entries(parsed)) {
    if (typeof headerValue !== 'string') {
      throw new Error('Every LLM_EXTRA_HEADERS value must be a string');
    }
    headers[key] = headerValue;
  }
  return headers;
}
