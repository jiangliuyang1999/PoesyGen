import { Capacitor, CapacitorHttp, type HttpHeaders } from '@capacitor/core';

import type { CiPattern, GenerationRequest, GenerationResult } from '@poesygen/domain';
import { OpenAiCompatibleProvider } from '@poesygen/llm';
import type { GenerationWorkflowProgress, GenerationWorkflowStage } from '@poesygen/workflow';

import type { DirectLlmConfig } from './direct-llm-config.js';
import { logConfigSummary, logWebError, logWebEvent, parseLogBody } from './web-logger.js';

let llmRequestSequence = 0;

export interface DirectGenerationProgress {
  readonly phase: 'loading' | 'running';
  readonly stage: 'loading' | GenerationWorkflowStage;
  readonly stepId?: string;
  readonly activity?: GenerationWorkflowProgress['activity'];
  readonly message: string;
  readonly round?: number;
  readonly maxRounds?: number;
  readonly issueCount?: number;
  readonly elapsedMs?: number;
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
  const startedAt = performance.now();
  logWebEvent('generation', '开始页面直连生成', {
    config: logConfigSummary(config),
    request,
    pattern: summarizePattern(pattern),
  });
  options.onProgress?.({
    phase: 'loading',
    stage: 'loading',
    stepId: 'load-workflow',
    activity: 'started',
    message: '正在加载本地词谱、韵书与创作工作流',
  });

  const [{ createGenerationWorkflow, LlmCompositionEngine }, { cilinZhengyunLexicon }] =
    await Promise.all([import('@poesygen/workflow'), import('@poesygen/prosody')]);
  options.onProgress?.({
    phase: 'loading',
    stage: 'loading',
    stepId: 'load-workflow',
    activity: 'completed',
    message: '本地词谱、韵书与创作工作流加载完成',
  });
  logWebEvent('generation', '格律工作流依赖加载完成', {
    durationMs: Math.round(performance.now() - startedAt),
  });

  const provider = createDirectLlmProvider(config);
  const workflow = createGenerationWorkflow({
    compositionEngine: new LlmCompositionEngine(provider),
    lexicon: cilinZhengyunLexicon,
    onProgress(progress: GenerationWorkflowProgress) {
      logWebEvent('generation', '工作流进度更新', { ...progress });
      options.onProgress?.({
        phase: 'running',
        ...progress,
      });
    },
  });

  try {
    const result = await workflow.run({ request, pattern }, options.signal);
    logWebEvent('generation', '页面直连生成完成', {
      durationMs: Math.round(performance.now() - startedAt),
      result,
    });
    return result;
  } catch (error) {
    logWebError('generation', '页面直连生成失败', error, {
      durationMs: Math.round(performance.now() - startedAt),
      patternId: pattern.id,
    });
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
  const startedAt = performance.now();
  logWebEvent('ideas', '开始请求 LLM 灵感推荐', {
    config: logConfigSummary(config),
  });
  const provider = createDirectLlmProvider(config);
  try {
    const generated = await provider.generateStructured({
      operation: 'recommend',
      temperature: 1,
      maxTokens: 256,
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
    logWebEvent('ideas', 'LLM 灵感推荐完成', {
      durationMs: Math.round(performance.now() - startedAt),
      suggestions: generated.value,
    });
    return generated.value;
  } catch (error) {
    logWebError('ideas', 'LLM 灵感推荐失败', error, {
      durationMs: Math.round(performance.now() - startedAt),
    });
    throw error;
  }
}

export async function runDirectThemePolish(
  config: DirectLlmConfig,
  theme: string,
): Promise<string> {
  const startedAt = performance.now();
  logWebEvent('theme', '开始润色创作主题', {
    config: logConfigSummary(config),
    sourceTheme: theme,
  });
  const provider = createDirectLlmProvider(config);
  try {
    const generated = await provider.generateStructured({
      operation: 'recommend',
      temperature: 0.65,
      maxTokens: 600,
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
    logWebEvent('theme', '创作主题润色完成', {
      durationMs: Math.round(performance.now() - startedAt),
      sourceTheme: theme,
      polishedTheme: generated.value,
    });
    return generated.value;
  } catch (error) {
    logWebError('theme', '创作主题润色失败', error, {
      durationMs: Math.round(performance.now() - startedAt),
      sourceTheme: theme,
    });
    throw error;
  }
}

function createDirectLlmFetch(): typeof globalThis.fetch {
  return async (input, init = {}) => {
    const requestId = `llm-${++llmRequestSequence}`;
    const startedAt = performance.now();
    const nativePlatform = Capacitor.isNativePlatform();
    const inputRequest = input instanceof Request ? input : undefined;
    const requestUrl =
      typeof input === 'string' || input instanceof URL ? String(input) : input.url;
    const requestHeaders = new Headers(inputRequest?.headers);
    new Headers(init.headers).forEach((value, key) => requestHeaders.set(key, value));
    const headers = Object.fromEntries(requestHeaders.entries());
    const method = init.method ?? inputRequest?.method ?? 'GET';
    const requestBody =
      init.body === undefined || init.body === null
        ? await inputRequest?.clone().text()
        : String(init.body);
    logWebEvent('http', '发送 LLM 请求', {
      requestId,
      transport: nativePlatform ? 'CapacitorHttp' : 'fetch',
      method,
      url: requestUrl,
      headers,
      body: parseLogBody(requestBody),
    });

    try {
      let response: Response;
      if (nativePlatform) {
        const request = CapacitorHttp.request({
          url: requestUrl,
          method,
          headers,
          ...(requestBody === undefined ? {} : { data: requestBody }),
          responseType: 'json',
        });
        const nativeResponse = await withAbortSignal(request, init.signal);
        const responseBody =
          typeof nativeResponse.data === 'string'
            ? nativeResponse.data
            : JSON.stringify(nativeResponse.data);
        response = new Response(responseBody, {
          status: nativeResponse.status,
          headers: nativeResponse.headers as HttpHeaders,
        });
      } else {
        response = await globalThis.fetch(input, init);
      }

      const responseBody = await response.clone().text();
      logWebEvent('http', '收到 LLM 响应', {
        requestId,
        durationMs: Math.round(performance.now() - startedAt),
        status: response.status,
        statusText: response.statusText,
        ok: response.ok,
        headers: Object.fromEntries(response.headers.entries()),
        body: parseLogBody(responseBody),
      });
      return response;
    } catch (error) {
      logWebError('http', 'LLM 请求失败', error, {
        requestId,
        durationMs: Math.round(performance.now() - startedAt),
        method,
        url: requestUrl,
      });
      throw error;
    }
  };
}

function createDirectLlmProvider(config: DirectLlmConfig): OpenAiCompatibleProvider {
  logWebEvent('llm', '创建 OpenAI-compatible Provider', {
    config: logConfigSummary(config),
    transport: Capacitor.isNativePlatform() ? 'CapacitorHttp' : 'fetch',
  });
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

function summarizePattern(pattern: CiPattern): Readonly<Record<string, unknown>> {
  return {
    id: pattern.id,
    name: pattern.name,
    variant: pattern.variant,
    sectionCount: pattern.sections.length,
    lineCount: pattern.sections.reduce((sum, section) => sum + section.lines.length, 0),
    characterCount: pattern.sections.reduce(
      (sum, section) =>
        sum + section.lines.reduce((sectionSum, line) => sectionSum + line.positions.length, 0),
      0,
    ),
  };
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
