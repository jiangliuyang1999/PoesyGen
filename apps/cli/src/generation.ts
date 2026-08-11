import type { CiPattern, GenerationRequest, GenerationResult } from '@poesygen/domain';
import { OpenAiCompatibleProvider, type OpenAiCompatibleProviderOptions } from '@poesygen/llm';
import { cilinZhengyunLexicon } from '@poesygen/prosody';
import {
  createGenerationWorkflow,
  LlmCompositionEngine,
  type GenerationWorkflowProgress,
  type GenerationWorkflowStageResult,
} from '@poesygen/workflow';

export interface Environment {
  [key: string]: string | undefined;
}

export type MissingCliLlmField = 'connection' | 'model' | 'apiKey';

export interface CliLlmConfig {
  readonly baseUrl: string;
  readonly endpoint?: string;
  readonly model: string;
  readonly apiKey: string;
  readonly timeoutMs: number;
  readonly maxTokens: number;
  readonly jsonMode: boolean;
  readonly headers: Readonly<Record<string, string>>;
}

export interface LocalGenerationOptions {
  readonly environment?: Environment;
  readonly onProgress?: (progress: GenerationWorkflowProgress) => void;
  readonly onStageResult?: (result: GenerationWorkflowStageResult) => void;
}

export function loadCliLlmConfig(environment: Environment = process.env): CliLlmConfig {
  const baseUrl = environment['LLM_BASE_URL']?.trim() ?? '';
  const endpoint = environment['LLM_ENDPOINT']?.trim() ?? '';
  const model = environment['LLM_MODEL']?.trim() ?? '';
  const apiKey = environment['LLM_API_KEY']?.trim() ?? '';
  const missing = listMissingCliLlmFields(environment).map((field) => {
    if (field === 'connection') return 'LLM_BASE_URL（或 LLM_ENDPOINT）';
    if (field === 'model') return 'LLM_MODEL';
    return 'LLM_API_KEY';
  });
  if (missing.length > 0) {
    throw new Error(`生成前必须配置 ${missing.join('、')}`);
  }

  return {
    baseUrl,
    ...(endpoint === '' ? {} : { endpoint }),
    model,
    apiKey,
    timeoutMs: parsePositiveInteger(environment['LLM_TIMEOUT_MS'], 120_000, 'LLM_TIMEOUT_MS'),
    maxTokens: parsePositiveInteger(environment['LLM_MAX_TOKENS'], 4_096, 'LLM_MAX_TOKENS'),
    jsonMode: parseBoolean(environment['LLM_JSON_MODE'], true),
    headers: parseHeaders(environment['LLM_EXTRA_HEADERS']),
  };
}

export function listMissingCliLlmFields(
  environment: Environment = process.env,
): ReadonlyArray<MissingCliLlmField> {
  const baseUrl = environment['LLM_BASE_URL']?.trim() ?? '';
  const endpoint = environment['LLM_ENDPOINT']?.trim() ?? '';
  const model = environment['LLM_MODEL']?.trim() ?? '';
  const apiKey = environment['LLM_API_KEY']?.trim() ?? '';
  return [
    ...(baseUrl === '' && endpoint === '' ? (['connection'] as const) : []),
    ...(model === '' ? (['model'] as const) : []),
    ...(apiKey === '' ? (['apiKey'] as const) : []),
  ];
}

export async function runLocalGeneration(
  request: GenerationRequest,
  pattern: CiPattern,
  options: LocalGenerationOptions = {},
): Promise<GenerationResult> {
  const environment = options.environment ?? process.env;
  const config = loadCliLlmConfig(environment);
  const providerOptions: OpenAiCompatibleProviderOptions = {
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    ...(config.endpoint === undefined ? {} : { endpoint: config.endpoint }),
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    jsonMode: config.jsonMode,
    headers: config.headers,
  };
  const workflow = createGenerationWorkflow({
    compositionEngine: new LlmCompositionEngine(new OpenAiCompatibleProvider(providerOptions)),
    lexicon: cilinZhengyunLexicon,
    ...(options.onProgress === undefined ? {} : { onProgress: options.onProgress }),
    ...(options.onStageResult === undefined ? {} : { onStageResult: options.onStageResult }),
  });
  return workflow.run({ request, pattern });
}

function parsePositiveInteger(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} 必须是正整数`);
  }
  return value;
}

function parseBoolean(raw: string | undefined, fallback: boolean): boolean {
  if (raw === undefined || raw.trim() === '') return fallback;
  if (/^(?:1|true|yes)$/iu.test(raw)) return true;
  if (/^(?:0|false|no)$/iu.test(raw)) return false;
  throw new Error('LLM_JSON_MODE 必须是 true 或 false');
}

function parseHeaders(raw: string | undefined): Readonly<Record<string, string>> {
  if (raw === undefined || raw.trim() === '') return {};
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    throw new Error('LLM_EXTRA_HEADERS 必须是 JSON 对象');
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error('LLM_EXTRA_HEADERS 必须是 JSON 对象');
  }
  const entries = Object.entries(value);
  if (!entries.every((entry): entry is [string, string] => typeof entry[1] === 'string')) {
    throw new Error('LLM_EXTRA_HEADERS 的值必须都是字符串');
  }
  return Object.fromEntries(entries);
}
