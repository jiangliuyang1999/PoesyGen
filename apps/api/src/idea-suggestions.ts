import type { LlmProvider } from '@poesygen/llm';

export type IdeaSuggestions = ReadonlyArray<string>;

export interface IdeaSuggestionService {
  get(): Promise<IdeaSuggestions>;
  warm(): void;
}

export function createIdeaSuggestionService(provider: LlmProvider): IdeaSuggestionService {
  let cached: IdeaSuggestions | undefined;
  let refillPromise: Promise<IdeaSuggestions> | undefined;

  const refill = (): Promise<IdeaSuggestions> => {
    if (refillPromise !== undefined) return refillPromise;

    const pending = generateIdeaSuggestions(provider).then((suggestions) => {
      cached = suggestions;
      return suggestions;
    });
    refillPromise = pending;
    void pending
      .finally(() => {
        if (refillPromise === pending) refillPromise = undefined;
      })
      .catch(() => undefined);
    return pending;
  };

  const replenishInBackground = (): void => {
    void refill().catch(() => undefined);
  };

  return {
    async get(): Promise<IdeaSuggestions> {
      const available = cached;
      if (available !== undefined) {
        cached = undefined;
        replenishInBackground();
        return available;
      }

      const generated = await refill();
      if (cached === generated) cached = undefined;
      replenishInBackground();
      return generated;
    },
    warm(): void {
      replenishInBackground();
    },
  };
}

async function generateIdeaSuggestions(provider: LlmProvider): Promise<IdeaSuggestions> {
  const generated = await provider.generateStructured({
    operation: 'recommend',
    temperature: 1,
    metadata: {
      feature: 'creation-idea-suggestions',
      promptVersion: 'idea-suggestions-v2',
    },
    messages: [
      {
        role: 'system',
        content: [
          '你是宋词创作的主题策划编辑。',
          '仅返回 JSON 对象，格式为 {"suggestions":["主题1","主题2","主题3"]}。',
          '必须恰好提供 3 条互不重复的中文创作主题。',
          '每条主题必须意象明确、情境清楚，尽量包含时令、场景、人物行动或情感转折。',
          '每条不超过 50 个汉字；允许约 10 个字的简短主题，不要为了凑长度添加空话。',
          '不要写词作正文，不要添加序号、标题、引号或格律说明。',
        ].join('\n'),
      },
      {
        role: 'user',
        content: [
          '请直接推荐三条适合宋词创作的主题，不绑定任何特定词牌或体式。',
          '三条主题在季节、场景和情绪上应有明显差异。',
          '每次尽量探索不同的人物关系、叙事视角和意象组合，避免重复常见主题模板。',
        ].join('\n'),
      },
    ],
    parse: parseIdeaSuggestions,
  });
  return generated.value;
}

function parseIdeaSuggestions(value: unknown): IdeaSuggestions {
  const rawSuggestions =
    isRecord(value) && Array.isArray(value['suggestions']) ? value['suggestions'] : [];
  const suggestions: string[] = [];
  for (const rawSuggestion of rawSuggestions) {
    if (typeof rawSuggestion !== 'string') continue;
    const normalized = rawSuggestion
      .trim()
      .replace(/^(?:\d+|[一二三])[.、:：]\s*/u, '')
      .replace(/\s+/gu, ' ');
    if (normalized === '') continue;
    const bounded = Array.from(normalized).slice(0, 50).join('');
    if (!suggestions.includes(bounded)) suggestions.push(bounded);
    if (suggestions.length === 3) break;
  }
  if (suggestions.length !== 3) {
    throw new Error('LLM must return three unique idea suggestions');
  }
  return suggestions;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
