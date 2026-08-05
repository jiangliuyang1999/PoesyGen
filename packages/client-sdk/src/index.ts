import type { GenerationRequestDto, RefinementRequestDto } from '@poesygen/contracts';
import type { CiPattern, GenerationResult } from '@poesygen/domain';

export type { CiPattern, GenerationResult, TextSelection } from '@poesygen/domain';

export interface ClientOptions {
  readonly baseUrl: string;
  readonly fetch?: typeof globalThis.fetch;
  readonly accessToken?: () => string | undefined | Promise<string | undefined>;
}

export interface HealthResponse {
  readonly status: 'ok';
  readonly service: string;
}

export interface GenerationSessionResponse {
  readonly id: string;
  readonly jobId: string;
  readonly status: 'queued';
}

export interface GenerationHealthResponse {
  readonly available: boolean;
  readonly redis: 'ok' | 'unconfigured';
  readonly workers: number;
}

export interface IdeaSuggestionsResponse {
  readonly suggestions: ReadonlyArray<string>;
}

export interface GenerationSessionStatusResponse {
  readonly id: string;
  readonly jobId: string;
  readonly status: 'queued' | 'running' | 'completed' | 'failed';
  readonly progress: unknown;
  readonly result?: GenerationResult & { readonly sessionId: string };
  readonly error?: string;
}

export interface WaitForGenerationOptions {
  readonly intervalMs?: number;
  readonly timeoutMs?: number;
  readonly signal?: AbortSignal;
  readonly onUpdate?: (session: GenerationSessionStatusResponse) => void;
}

export interface RhymeGroupSummary {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly tone: 'level' | 'oblique';
    readonly characterCount: number;
  }>;
}

export interface RhymeGroupDetail {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly tone: 'level' | 'oblique';
    readonly characters: string;
  }>;
}

export interface CharacterPronunciationResponse {
  readonly character: string;
  readonly readings?: {
    readonly mandarin?: ReadonlyArray<string>;
    readonly hanyuPinyin?: ReadonlyArray<string>;
    readonly xhc1983?: ReadonlyArray<string>;
    readonly fanqie?: ReadonlyArray<string>;
    readonly tang?: ReadonlyArray<string>;
  };
  readonly prosody: ReadonlyArray<{
    readonly tone: 'level' | 'oblique';
    readonly rhymeGroups: ReadonlyArray<string>;
    readonly rhymeSections?: ReadonlyArray<string>;
    readonly mandarinReadings?: ReadonlyArray<string>;
    readonly fanqie?: ReadonlyArray<string>;
    readonly tangReadings?: ReadonlyArray<string>;
  }>;
}

export class PoesyGenApiError extends Error {
  public readonly status: number;
  public readonly body: unknown;

  public constructor(status: number, body: unknown) {
    super(`PoesyGen API request failed (${status})`);
    this.name = 'PoesyGenApiError';
    this.status = status;
    this.body = body;
  }
}

export class PoesyGenClient {
  readonly #baseUrl: string;
  readonly #fetch: typeof globalThis.fetch;
  readonly #accessToken: ClientOptions['accessToken'];

  public constructor(options: ClientOptions) {
    this.#baseUrl = options.baseUrl.replace(/\/+$/, '');
    this.#fetch = options.fetch ?? globalThis.fetch.bind(globalThis);
    this.#accessToken = options.accessToken;
  }

  public health(): Promise<HealthResponse> {
    return this.#request('/health');
  }

  public listPatterns(): Promise<ReadonlyArray<CiPattern>> {
    return this.#request('/v1/patterns');
  }

  public getGenerationHealth(): Promise<GenerationHealthResponse> {
    return this.#request('/v1/generation/health');
  }

  public listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>> {
    return this.#request('/v1/rhyme-books/cilin-zhengyun/groups');
  }

  public getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail> {
    return this.#request(`/v1/rhyme-books/cilin-zhengyun/groups/${encodeURIComponent(groupId)}`);
  }

  public getCharacterPronunciations(character: string): Promise<CharacterPronunciationResponse> {
    return this.#request(`/v1/characters/${encodeURIComponent(character)}/pronunciations`);
  }

  public suggestCreationIdeas(): Promise<IdeaSuggestionsResponse> {
    return this.#request('/v1/creation/idea-suggestions', {
      method: 'POST',
      body: JSON.stringify({}),
    });
  }

  public createGenerationSession(
    request: GenerationRequestDto,
  ): Promise<GenerationSessionResponse> {
    return this.#request('/v1/generation-sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  public createRefinementSession(
    request: RefinementRequestDto,
  ): Promise<GenerationSessionResponse> {
    return this.#request('/v1/refinement-sessions', {
      method: 'POST',
      body: JSON.stringify(request),
    });
  }

  public getGenerationSession(sessionId: string): Promise<GenerationSessionStatusResponse> {
    return this.#request(`/v1/generation-sessions/${encodeURIComponent(sessionId)}`);
  }

  public async waitForGenerationSession(
    sessionId: string,
    options: WaitForGenerationOptions = {},
  ): Promise<GenerationSessionStatusResponse> {
    const intervalMs = options.intervalMs ?? 1_000;
    const timeoutMs = options.timeoutMs ?? 10 * 60_000;
    const startedAt = Date.now();

    for (;;) {
      options.signal?.throwIfAborted();
      const session = await this.getGenerationSession(sessionId);
      options.onUpdate?.(session);
      if (session.status === 'completed' || session.status === 'failed') return session;
      if (Date.now() - startedAt >= timeoutMs) {
        throw new Error(`Timed out waiting for generation session ${sessionId}`);
      }
      await sleep(intervalMs, options.signal);
    }
  }

  async #request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const accessToken = await this.#accessToken?.();
    const headers = new Headers(init.headers);
    headers.set('accept', 'application/json');
    if (init.body !== undefined) {
      headers.set('content-type', 'application/json');
    }
    if (accessToken !== undefined) {
      headers.set('authorization', `Bearer ${accessToken}`);
    }

    const response = await this.#fetch(`${this.#baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!response.ok) {
      const contentType = response.headers.get('content-type') ?? '';
      const body = contentType.includes('application/json')
        ? ((await response.json()) as unknown)
        : await response.text();
      throw new PoesyGenApiError(response.status, body);
    }

    return (await response.json()) as T;
  }
}

function sleep(milliseconds: number, signal: AbortSignal | undefined): Promise<void> {
  return new Promise((resolve, reject) => {
    const abort = (): void => {
      clearTimeout(timeout);
      reject(signal?.reason);
    };
    const timeout = setTimeout(() => {
      signal?.removeEventListener('abort', abort);
      resolve();
    }, milliseconds);
    if (signal === undefined) return;
    if (signal.aborted) abort();
    else signal.addEventListener('abort', abort, { once: true });
  });
}
