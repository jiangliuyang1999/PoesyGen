import type { CiPattern, GenerationResult } from '@poesygen/client-sdk';

export const generationHistoryStorageKey = 'poesygen:generation-history:v1';

const historyVersion = 1;
const maxHistoryEntries = 40;

interface HistoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

interface StoredHistory {
  readonly version: typeof historyVersion;
  readonly entries: ReadonlyArray<GenerationHistoryEntry>;
}

export interface GenerationHistoryEntry {
  readonly id: string;
  readonly createdAt: string;
  readonly theme: string;
  readonly pattern: CiPattern;
  readonly result: GenerationResult;
}

export function loadGenerationHistory(
  storage: HistoryStorage | undefined = browserStorage(),
): ReadonlyArray<GenerationHistoryEntry> {
  if (storage === undefined) return [];
  try {
    const raw = storage.getItem(generationHistoryStorageKey);
    if (raw === null) return [];
    const stored = JSON.parse(raw) as unknown;
    if (
      !isRecord(stored) ||
      stored['version'] !== historyVersion ||
      !Array.isArray(stored['entries'])
    ) {
      return [];
    }
    return stored['entries'].filter(isGenerationHistoryEntry).slice(0, maxHistoryEntries);
  } catch {
    return [];
  }
}

export function addGenerationHistoryEntry(
  entries: ReadonlyArray<GenerationHistoryEntry>,
  entry: GenerationHistoryEntry,
): ReadonlyArray<GenerationHistoryEntry> {
  return [entry, ...entries.filter(({ id }) => id !== entry.id)].slice(0, maxHistoryEntries);
}

export function saveGenerationHistory(
  entries: ReadonlyArray<GenerationHistoryEntry>,
  storage: HistoryStorage | undefined = browserStorage(),
): boolean {
  if (storage === undefined) return false;
  const stored: StoredHistory = {
    version: historyVersion,
    entries: entries.slice(0, maxHistoryEntries),
  };
  try {
    storage.setItem(generationHistoryStorageKey, JSON.stringify(stored));
    return true;
  } catch {
    return false;
  }
}

export function filterGenerationHistory(
  entries: ReadonlyArray<GenerationHistoryEntry>,
  query: string,
): ReadonlyArray<GenerationHistoryEntry> {
  const normalized = query.trim().toLocaleLowerCase('zh-CN');
  if (normalized === '') return entries;
  return entries.filter(({ id, pattern, result, theme }) =>
    [
      id,
      pattern.name,
      pattern.variant,
      result.draft.title ?? '',
      theme,
      ...result.draft.lines.map(({ text }) => text),
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized),
  );
}

function browserStorage(): HistoryStorage | undefined {
  if (typeof window === 'undefined') return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function isGenerationHistoryEntry(value: unknown): value is GenerationHistoryEntry {
  if (!isRecord(value)) return false;
  const pattern = value['pattern'];
  const result = value['result'];
  if (
    typeof value['id'] !== 'string' ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['theme'] !== 'string' ||
    !isRecord(pattern) ||
    typeof pattern['id'] !== 'string' ||
    typeof pattern['name'] !== 'string' ||
    typeof pattern['variant'] !== 'string' ||
    !Array.isArray(pattern['sections']) ||
    !isRecord(result) ||
    !isRecord(result['draft']) ||
    result['draft']['patternId'] !== pattern['id'] ||
    !Array.isArray(result['draft']['lines']) ||
    !isRecord(result['report']) ||
    !Array.isArray(result['report']['issues']) ||
    typeof result['rounds'] !== 'number'
  ) {
    return false;
  }
  return true;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
