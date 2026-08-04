export interface LlmMessage {
  readonly role: 'system' | 'user' | 'assistant';
  readonly content: string;
}

export interface StructuredGenerationRequest<T> {
  readonly operation: 'plan' | 'draft' | 'repair' | 'evaluate' | 'refine';
  readonly messages: ReadonlyArray<LlmMessage>;
  readonly parse: (value: unknown) => T;
  readonly temperature?: number;
  readonly metadata?: Readonly<Record<string, string>>;
}

export interface LlmUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
}

export interface StructuredGenerationResult<T> {
  readonly value: T;
  readonly model: string;
  readonly usage: LlmUsage;
  readonly requestId?: string;
}

export interface LlmProvider {
  readonly name: string;
  generateStructured<T>(
    request: StructuredGenerationRequest<T>,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>>;
}

export interface OpenAiCompatibleProviderOptions {
  readonly apiKey: string;
  readonly model: string;
  readonly baseUrl?: string;
  readonly endpoint?: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly timeoutMs?: number;
  readonly maxTokens?: number;
  readonly jsonMode?: boolean;
  readonly headers?: Readonly<Record<string, string>>;
}

interface ChatCompletionResponse {
  readonly id?: string;
  readonly model?: string;
  readonly choices?: ReadonlyArray<{
    readonly message?: {
      readonly content?:
        | string
        | ReadonlyArray<{
            readonly type?: string;
            readonly text?: string;
          }>
        | null;
    };
  }>;
  readonly usage?: {
    readonly prompt_tokens?: number;
    readonly completion_tokens?: number;
  };
  readonly error?: {
    readonly message?: string;
  };
}

export class OpenAiCompatibleProvider implements LlmProvider {
  public readonly name = 'openai-compatible';
  readonly #apiKey: string;
  readonly #model: string;
  readonly #endpoint: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #timeoutMs: number;
  readonly #maxTokens: number;
  readonly #jsonMode: boolean;
  readonly #headers: Readonly<Record<string, string>>;

  public constructor(options: OpenAiCompatibleProviderOptions) {
    if (options.apiKey.trim() === '') throw new Error('LLM API key must not be empty');
    if (options.model.trim() === '') throw new Error('LLM model must not be empty');

    this.#apiKey = options.apiKey;
    this.#model = options.model;
    this.#endpoint =
      options.endpoint ??
      `${(options.baseUrl ?? 'https://api.openai.com/v1').replace(/\/+$/u, '')}/chat/completions`;
    this.#fetch = options.fetch ?? globalThis.fetch;
    this.#timeoutMs = options.timeoutMs ?? 120_000;
    this.#maxTokens = options.maxTokens ?? 4_096;
    this.#jsonMode = options.jsonMode ?? true;
    this.#headers = options.headers ?? {};
  }

  public async generateStructured<T>(
    request: StructuredGenerationRequest<T>,
    signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    const response = await this.#fetch(this.#endpoint, {
      method: 'POST',
      headers: {
        accept: 'application/json',
        authorization: `Bearer ${this.#apiKey}`,
        'content-type': 'application/json',
        ...this.#headers,
      },
      body: JSON.stringify({
        model: this.#model,
        messages: request.messages,
        temperature: request.temperature ?? 0.6,
        max_tokens: this.#maxTokens,
        ...(this.#jsonMode ? { response_format: { type: 'json_object' } } : {}),
      }),
      signal: combineSignals(signal, AbortSignal.timeout(this.#timeoutMs)),
    });
    const payload = (await response.json().catch(() => undefined)) as
      ChatCompletionResponse | undefined;
    if (!response.ok) {
      throw new Error(
        `LLM request failed (${response.status}): ${payload?.error?.message ?? response.statusText}`,
      );
    }

    const content = extractMessageContent(payload);
    const value = request.parse(parseJsonContent(content));
    return {
      value,
      model: payload?.model ?? this.#model,
      usage: {
        inputTokens: payload?.usage?.prompt_tokens ?? 0,
        outputTokens: payload?.usage?.completion_tokens ?? 0,
      },
      ...(payload?.id === undefined ? {} : { requestId: payload.id }),
    };
  }
}

export class UnsupportedLlmProvider implements LlmProvider {
  public readonly name = 'unsupported';

  public generateStructured<T>(
    _request: StructuredGenerationRequest<T>,
    _signal?: AbortSignal,
  ): Promise<StructuredGenerationResult<T>> {
    return Promise.reject(
      new Error('No LLM provider is configured. Register a provider adapter before generation.'),
    );
  }
}

function combineSignals(signal: AbortSignal | undefined, timeoutSignal: AbortSignal): AbortSignal {
  return signal === undefined ? timeoutSignal : AbortSignal.any([signal, timeoutSignal]);
}

function extractMessageContent(payload: ChatCompletionResponse | undefined): string {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .filter(({ type, text }) => (type === undefined || type === 'text') && text !== undefined)
      .map(({ text }) => text)
      .join('');
  }
  throw new Error('LLM response did not contain message content');
}

function parseJsonContent(content: string): unknown {
  const trimmed = content
    .trim()
    .replace(/^```(?:json)?\s*/iu, '')
    .replace(/\s*```$/u, '');
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    const objectStart = trimmed.indexOf('{');
    const arrayStart = trimmed.indexOf('[');
    const start =
      objectStart < 0
        ? arrayStart
        : arrayStart < 0
          ? objectStart
          : Math.min(objectStart, arrayStart);
    const end = Math.max(trimmed.lastIndexOf('}'), trimmed.lastIndexOf(']'));
    if (start >= 0 && end > start) {
      return JSON.parse(trimmed.slice(start, end + 1)) as unknown;
    }
    throw new Error('LLM response was not valid JSON');
  }
}
