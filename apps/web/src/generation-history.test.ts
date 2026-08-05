import { describe, expect, it } from 'vitest';

import type { CiPattern, GenerationResult } from '@poesygen/client-sdk';

import {
  addGenerationHistoryEntry,
  addGenerationHistoryVersion,
  filterGenerationHistory,
  generationHistoryVersions,
  generationHistoryStorageKey,
  loadGenerationHistory,
  saveGenerationHistory,
  type GenerationHistoryEntry,
} from './generation-history.js';

const pattern: CiPattern = {
  id: 'ru-meng-ling-standard',
  name: '如梦令',
  variant: '正体',
  source: '测试',
  dataVersion: '1',
  reviewStatus: 'imported',
  sections: [
    {
      id: 'single',
      name: '单调',
      lines: [{ id: 'line-1', positions: [{ tone: 'oblique', rhyme: 'main' }] }],
    },
  ],
};

describe('local generation history', () => {
  it('persists a versioned, bounded history document', () => {
    const storage = createStorage();
    const entries = Array.from({ length: 45 }, (_, index) => createEntry(index));

    expect(saveGenerationHistory(entries, storage)).toBe(true);
    const loaded = loadGenerationHistory(storage);

    expect(loaded).toHaveLength(40);
    expect(loaded[0]?.id).toBe('session-0');
  });

  it('deduplicates sessions and searches titles, themes and tune names', () => {
    const original = createEntry(1);
    const updated = { ...original, theme: '雪夜怀人' };
    const entries = addGenerationHistoryEntry([original, createEntry(2)], updated);

    expect(entries).toHaveLength(2);
    expect(entries[0]?.theme).toBe('雪夜怀人');
    expect(filterGenerationHistory(entries, '雪夜')).toEqual([updated]);
    expect(filterGenerationHistory(entries, '如梦令')).toHaveLength(2);
    expect(filterGenerationHistory(entries, 'session-2')).toEqual([entries[1]]);
  });

  it('keeps refinements as versions of one history entry', () => {
    const original = createEntry(1);
    const refined: GenerationResult = {
      ...original.result,
      draft: {
        ...original.result.draft,
        id: 'draft-refined',
        version: 2,
        lines: [{ id: 'line-1', text: '新雨' }],
      },
    };

    const entries = addGenerationHistoryVersion([original], original.id, refined);

    expect(entries).toHaveLength(1);
    expect(entries[0]?.result.draft.id).toBe('draft-refined');
    expect(generationHistoryVersions(entries[0]!)).toEqual([original.result, refined]);
    expect(filterGenerationHistory(entries, '梦')).toEqual(entries);
  });

  it('ignores malformed or incompatible local data', () => {
    const storage = createStorage();
    storage.setItem(generationHistoryStorageKey, '{"version":2,"entries":[]}');

    expect(loadGenerationHistory(storage)).toEqual([]);

    storage.setItem(generationHistoryStorageKey, '{"version":1,"entries":[{"id":"broken"}]}');
    expect(loadGenerationHistory(storage)).toEqual([]);
  });
});

function createEntry(index: number): GenerationHistoryEntry {
  const result: GenerationResult = {
    status: 'completed',
    rounds: 1,
    draft: {
      id: `draft-${index}`,
      patternId: pattern.id,
      theme: `主题 ${index}`,
      version: 1,
      title: `题目 ${index}`,
      lines: [{ id: 'line-1', text: '梦' }],
    },
    report: {
      passed: true,
      issues: [],
    },
  };
  return {
    id: `session-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 4, 8, index)).toISOString(),
    theme: result.draft.theme,
    pattern,
    result,
  };
}

function createStorage() {
  const values = new Map<string, string>();
  return {
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}
