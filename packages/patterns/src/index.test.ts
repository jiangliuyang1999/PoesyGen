import { describe, expect, it } from 'vitest';

import patternData from './data/qinding-cipu.json' with { type: 'json' };

import { findPattern, listPatterns, patternCatalogMetadata, ruMengLing } from './index.js';

describe('authoritative Ci pattern catalog', () => {
  it('loads all imported common standard patterns with stable IDs', () => {
    const patterns = listPatterns();

    expect(patterns).toHaveLength(36);
    expect(new Set(patterns.map(({ id }) => id)).size).toBe(36);
    expect(patterns.every(({ reviewStatus }) => reviewStatus === 'imported')).toBe(true);
    expect(findPattern('huan-xi-sha-standard')?.name).toBe('浣溪沙');
  });

  it('preserves source provenance and data versions', () => {
    expect(patternCatalogMetadata.dataVersion).toBe('2026-08-03.qinding-cipu');
    expect(patternCatalogMetadata.provenance.map(({ sourceId }) => sourceId)).toEqual([
      'wikisource-qinding-cipu',
      'cciv',
    ]);
    expect(
      patternData.patterns.every(({ sourceValidation }) => sourceValidation.editDistance >= 0),
    ).toBe(true);
  });

  it('imports the standard Ru Meng Ling structure and rhyme positions', () => {
    const lines = ruMengLing.sections.flatMap(({ lines: sectionLines }) => sectionLines);

    expect(lines.map(({ positions }) => positions.length)).toEqual([6, 6, 5, 6, 2, 2, 6]);
    expect(
      lines
        .map(({ positions }, index) => (positions.at(-1)?.rhyme === undefined ? undefined : index))
        .filter((index) => index !== undefined),
    ).toEqual([0, 1, 3, 4, 5, 6]);
  });
});
