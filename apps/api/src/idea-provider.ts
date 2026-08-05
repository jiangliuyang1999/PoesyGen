import { OpenAiCompatibleProvider, type LlmProvider } from '@poesygen/llm';

export function createIdeaProvider(
  environment: Readonly<Record<string, string | undefined>> = process.env,
): LlmProvider | undefined {
  const providerName = environment['LLM_PROVIDER'] ?? 'openai-compatible';
  if (providerName === 'mock') return undefined;
  if (providerName !== 'openai-compatible') {
    throw new Error(`Unsupported LLM_PROVIDER: ${providerName}`);
  }

  const apiKey =
    environment['LLM_API_KEY'] ?? environment['OPENAI_API_KEY'] ?? environment['ARK_API_KEY'];
  const model = environment['LLM_MODEL'] ?? environment['OPENAI_MODEL'];
  if (apiKey === undefined || apiKey.trim() === '' || model === undefined || model.trim() === '') {
    return undefined;
  }

  return new OpenAiCompatibleProvider({
    apiKey,
    model,
    baseUrl: environment['LLM_BASE_URL'] ?? 'https://api.openai.com/v1',
    ...(environment['LLM_ENDPOINT'] === undefined ? {} : { endpoint: environment['LLM_ENDPOINT'] }),
    timeoutMs: parsePositiveInteger(environment['LLM_TIMEOUT_MS'] ?? '120000'),
    maxTokens: Math.min(parsePositiveInteger(environment['LLM_MAX_TOKENS'] ?? '512'), 1_024),
    jsonMode: environment['LLM_JSON_MODE'] !== 'false',
    headers: parseHeaders(environment['LLM_EXTRA_HEADERS']),
  });
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
