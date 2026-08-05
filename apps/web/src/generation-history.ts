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
  readonly settings?: GenerationHistorySettings;
  readonly pattern: CiPattern;
  readonly result: GenerationResult;
  readonly versions?: ReadonlyArray<GenerationResult>;
}

export interface GenerationHistorySettings {
  readonly maxRounds: number;
  readonly additionalRequirements: ReadonlyArray<string>;
  readonly rhymeSettings: ReadonlyArray<GenerationHistoryRhymeSetting>;
}

export interface GenerationHistoryRhymeSetting {
  readonly label: string;
  readonly tone: 'level' | 'oblique' | 'either';
  readonly groupId?: string;
  readonly groupName?: string;
  readonly sections?: ReadonlyArray<string>;
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

export function generationHistoryVersions(
  entry: GenerationHistoryEntry,
): ReadonlyArray<GenerationResult> {
  return entry.versions === undefined || entry.versions.length === 0
    ? [entry.result]
    : entry.versions;
}

export function addGenerationHistoryVersion(
  entries: ReadonlyArray<GenerationHistoryEntry>,
  entryId: string,
  result: GenerationResult,
): ReadonlyArray<GenerationHistoryEntry> {
  const entry = entries.find(({ id }) => id === entryId);
  if (entry === undefined) return entries;
  const versions = [
    ...generationHistoryVersions(entry).filter(({ draft }) => draft.id !== result.draft.id),
    result,
  ];
  const updated: GenerationHistoryEntry = {
    ...entry,
    result,
    versions,
  };
  return [updated, ...entries.filter(({ id }) => id !== entryId)].slice(0, maxHistoryEntries);
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
  return entries.filter((entry) => {
    const { id, pattern, settings, theme } = entry;
    return [
      id,
      pattern.name,
      pattern.variant,
      theme,
      ...(settings?.additionalRequirements ?? []),
      ...(settings?.rhymeSettings.flatMap((setting) => [
        setting.label,
        setting.groupName ?? '',
        ...(setting.sections ?? []),
      ]) ?? []),
      ...generationHistoryVersions(entry).flatMap((result) => [
        result.draft.title ?? '',
        ...result.draft.lines.map(({ text }) => text),
      ]),
    ]
      .join(' ')
      .toLocaleLowerCase('zh-CN')
      .includes(normalized);
  });
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
  const settings = value['settings'];
  const versions = value['versions'];
  if (
    typeof value['id'] !== 'string' ||
    typeof value['createdAt'] !== 'string' ||
    typeof value['theme'] !== 'string' ||
    !isRecord(pattern) ||
    typeof pattern['id'] !== 'string' ||
    typeof pattern['name'] !== 'string' ||
    typeof pattern['variant'] !== 'string' ||
    !Array.isArray(pattern['sections'])
  ) {
    return false;
  }
  const patternId = pattern['id'];
  if (!isGenerationResult(result, patternId)) return false;
  if (settings !== undefined && !isGenerationHistorySettings(settings)) {
    return false;
  }
  if (
    versions !== undefined &&
    (!Array.isArray(versions) ||
      versions.length === 0 ||
      !versions.every((version) => isGenerationResult(version, patternId)))
  ) {
    return false;
  }
  return true;
}

function isGenerationResult(value: unknown, patternId: string): value is GenerationResult {
  return (
    isRecord(value) &&
    isRecord(value['draft']) &&
    value['draft']['patternId'] === patternId &&
    Array.isArray(value['draft']['lines']) &&
    isRecord(value['report']) &&
    Array.isArray(value['report']['issues']) &&
    typeof value['rounds'] === 'number'
  );
}

function isGenerationHistorySettings(value: unknown): value is GenerationHistorySettings {
  if (!isRecord(value)) return false;
  return (
    typeof value['maxRounds'] === 'number' &&
    Array.isArray(value['additionalRequirements']) &&
    value['additionalRequirements'].every((requirement) => typeof requirement === 'string') &&
    Array.isArray(value['rhymeSettings']) &&
    value['rhymeSettings'].every(isGenerationHistoryRhymeSetting)
  );
}

function isGenerationHistoryRhymeSetting(value: unknown): value is GenerationHistoryRhymeSetting {
  if (!isRecord(value)) return false;
  const tone = value['tone'];
  return (
    typeof value['label'] === 'string' &&
    (tone === 'level' || tone === 'oblique' || tone === 'either') &&
    (value['groupId'] === undefined || typeof value['groupId'] === 'string') &&
    (value['groupName'] === undefined || typeof value['groupName'] === 'string') &&
    (value['sections'] === undefined ||
      (Array.isArray(value['sections']) &&
        value['sections'].every((section) => typeof section === 'string')))
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
