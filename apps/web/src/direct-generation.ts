import { Capacitor, CapacitorHttp, type HttpHeaders } from '@capacitor/core';

import type { CiPattern, GenerationRequest, GenerationResult } from '@poesygen/domain';
import { OpenAiCompatibleProvider } from '@poesygen/llm';
import type { GenerationWorkflowProgress, GenerationWorkflowStage } from '@poesygen/workflow';

import type { DirectLlmConfig } from './direct-llm-config.js';

export interface DirectGenerationProgress {
  readonly phase: 'loading' | 'running';
  readonly stage: 'loading' | GenerationWorkflowStage;
  readonly message: string;
  readonly round?: number;
  readonly maxRounds?: number;
  readonly issueCount?: number;
}

export async function runDirectGeneration(
  config: DirectLlmConfig,
  request: GenerationRequest,
  pattern: CiPattern,
  options: {
    readonly signal?: AbortSignal;
    readonly onProgress?: (progress: DirectGenerationProgress) => void;
  } = {},
): Promise<GenerationResult> {
  options.onProgress?.({
    phase: 'loading',
    stage: 'loading',
    message: '正在加载本地格律校验数据。',
  });

  const [{ createGenerationWorkflow, LlmDraftEngine }, { cilinZhengyunLexicon }] =
    await Promise.all([import('@poesygen/workflow'), import('@poesygen/prosody')]);

  const provider = createDirectLlmProvider(config);
  const workflow = createGenerationWorkflow({
    draftEngine: new LlmDraftEngine(provider),
    lexicon: cilinZhengyunLexicon,
    onProgress(progress: GenerationWorkflowProgress) {
      options.onProgress?.({
        phase: 'running',
        ...progress,
      });
    },
  });

  try {
    return await workflow.run({ request, pattern }, options.signal);
  } catch (error) {
    if (error instanceof TypeError && !Capacitor.isNativePlatform()) {
      throw new Error('浏览器无法直连 LLM API，请检查接口地址、网络和 CORS 配置。', {
        cause: error,
      });
    }
    throw error;
  }
}

export async function runDirectIdeaSuggestions(
  config: DirectLlmConfig,
): Promise<ReadonlyArray<string>> {
  const provider = createDirectLlmProvider(config);
  const generated = await provider.generateStructured({
    operation: 'recommend',
    temperature: 1,
    messages: [
      {
        role: 'system',
        content: [
          '你是宋词创作的主题策划编辑。',
          '仅返回 JSON 对象，格式为 {"suggestions":["主题1","主题2","主题3"]}。',
          '必须恰好提供 3 条互不重复的中文创作主题，每条不超过 50 个汉字。',
          '不要写词作正文，不要添加序号、标题、引号或格律说明。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: '推荐三条在季节、场景和情绪上明显不同的宋词主题，不绑定特定词牌或体式。',
      },
    ],
    parse: parseIdeaSuggestions,
  });
  return generated.value;
}

export async function runDirectThemePolish(
  config: DirectLlmConfig,
  theme: string,
): Promise<string> {
  const provider = createDirectLlmProvider(config);
  const generated = await provider.generateStructured({
    operation: 'recommend',
    temperature: 0.65,
    messages: [
      {
        role: 'system',
        content: [
          '你是宋词创作主题的文字编辑。',
          '在保持原始主题、人物关系和情感方向不变的前提下，使描述更清晰、具体、有画面感。',
          '可以补足必要的季节、场景、意象或情绪层次，但不要写词作正文，不要指定词牌或格律。',
          '避免空泛套话，长度不得超过原文的两倍，且最多 2000 个字符。',
          '仅返回 JSON 对象，格式为 {"theme":"润色后的主题描述"}。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: `原始主题：\n${theme.trim()}`,
      },
    ],
    parse: parsePolishedTheme,
  });
  return generated.value;
}

function createDirectLlmFetch(): typeof globalThis.fetch {
  if (!Capacitor.isNativePlatform()) return globalThis.fetch.bind(globalThis);

  return async (input, init = {}) => {
    const requestUrl =
      typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const headers = Object.fromEntries(new Headers(init.headers).entries());
    const request = CapacitorHttp.request({
      url: requestUrl,
      method: init.method ?? 'GET',
      headers,
      ...(init.body === undefined || init.body === null ? {} : { data: String(init.body) }),
      responseType: 'json',
    });
    const response = await withAbortSignal(request, init.signal);
    const responseBody =
      typeof response.data === 'string' ? response.data : JSON.stringify(response.data);
    return new Response(responseBody, {
      status: response.status,
      headers: response.headers as HttpHeaders,
    });
  };
}

function createDirectLlmProvider(config: DirectLlmConfig): OpenAiCompatibleProvider {
  return new OpenAiCompatibleProvider({
    apiKey: config.apiKey,
    model: config.model,
    baseUrl: config.baseUrl,
    ...(config.endpoint.trim() === '' ? {} : { endpoint: config.endpoint.trim() }),
    timeoutMs: config.timeoutMs,
    maxTokens: config.maxTokens,
    jsonMode: config.jsonMode,
    fetch: createDirectLlmFetch(),
  });
}

function parseIdeaSuggestions(value: unknown): ReadonlyArray<string> {
  if (typeof value !== 'object' || value === null) {
    throw new Error('灵感推荐结果不是 JSON 对象');
  }
  const raw = (value as { suggestions?: unknown }).suggestions;
  if (!Array.isArray(raw)) throw new Error('灵感推荐结果缺少 suggestions');
  const suggestions = raw
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim().replace(/^(?:\d+|[一二三])[.、:：]\s*/u, ''))
    .filter((item) => item !== '')
    .map((item) => Array.from(item).slice(0, 50).join(''))
    .filter((item, index, items) => items.indexOf(item) === index)
    .slice(0, 3);
  if (suggestions.length !== 3) throw new Error('灵感推荐必须包含三条不同主题');
  return suggestions;
}

function parsePolishedTheme(value: unknown): string {
  if (typeof value !== 'object' || value === null) {
    throw new Error('主题润色结果不是 JSON 对象');
  }
  const theme = (value as { theme?: unknown }).theme;
  if (typeof theme !== 'string' || theme.trim() === '') {
    throw new Error('主题润色结果缺少有效主题');
  }
  return Array.from(theme.trim()).slice(0, 2_000).join('');
}

function withAbortSignal<Value>(
  promise: Promise<Value>,
  signal: AbortSignal | null | undefined,
): Promise<Value> {
  if (signal === undefined || signal === null) return promise;
  if (signal.aborted) return Promise.reject(signal.reason);

  return new Promise((resolve, reject) => {
    const abort = (): void => {
      reject(signal.reason ?? new DOMException('Request aborted', 'AbortError'));
    };
    signal.addEventListener('abort', abort, { once: true });
    void promise.then(
      (value) => {
        signal.removeEventListener('abort', abort);
        resolve(value);
      },
      (error: unknown) => {
        signal.removeEventListener('abort', abort);
        reject(error);
      },
    );
  });
}
