import { describe, expect, it } from 'vitest';

import patternData from './data/qinding-cipu.json' with { type: 'json' };

import {
  findPattern,
  listPatterns,
  listPatternsByName,
  patternCatalogMetadata,
  ruMengLing,
} from './index.js';

describe('authoritative Ci pattern catalog', () => {
  it('loads authoritative variants with stable IDs', () => {
    const patterns = listPatterns();

    expect(patterns).toHaveLength(245);
    expect(new Set(patterns.map(({ id }) => id)).size).toBe(patterns.length);
    expect(new Set(patterns.map(({ name }) => name)).size).toBe(36);
    expect(patterns.filter(({ reviewStatus }) => reviewStatus === 'imported')).toHaveLength(231);
    expect(patterns.filter(({ reviewStatus }) => reviewStatus === 'draft')).toHaveLength(14);
    expect(findPattern('huan-xi-sha-standard')?.name).toBe('浣溪沙');
  });

  it('indexes multiple forms of the same tune without conflating their structures', () => {
    const variants = listPatternsByName('浣溪沙');

    expect(variants.map(({ variant }) => variant)).toEqual([
      '正体',
      '格二',
      '格三',
      '格四',
      '格五',
    ]);
    expect(
      variants.map((pattern) =>
        pattern.sections
          .flatMap(({ lines }) => lines)
          .reduce((sum, line) => sum + line.positions.length, 0),
      ),
    ).toEqual([42, 42, 44, 46, 42]);
    expect(
      findPattern('huan-xi-sha-variant-04')?.sections.flatMap(({ lines }) => lines),
    ).toHaveLength(10);
  });

  it('preserves source provenance and data versions', () => {
    expect(patternCatalogMetadata.dataVersion).toBe('2026-08-03.qinding-cipu');
    expect(patternCatalogMetadata.provenance.map(({ sourceId }) => sourceId)).toEqual([
      'wikisource-qinding-cipu',
      'cciv',
    ]);
    const validated = patternData.patterns.filter(
      ({ sourceValidation }) => sourceValidation.status === 'validated',
    );
    const unverified = patternData.patterns.filter(
      ({ sourceValidation }) => sourceValidation.status === 'unverified',
    );

    expect(validated).toHaveLength(231);
    expect(validated.every(({ sourceValidation }) => sourceValidation.editDistance >= 0)).toBe(
      true,
    );
    expect(unverified).toHaveLength(14);
    expect(
      unverified.every(({ sourceValidation }) => (sourceValidation.issues?.length ?? 0) > 0),
    ).toBe(true);
  });

  it('keeps the third and fourth Jiang Cheng Zi forms single-stanza', () => {
    const [, , variant3, variant4, variant5] = listPatternsByName('江城子');
    const characterCount = (pattern: NonNullable<typeof variant3>) =>
      pattern.sections
        .flatMap(({ lines }) => lines)
        .reduce((sum, line) => sum + line.positions.length, 0);

    expect(variant3?.variant).toBe('格三');
    expect(variant3?.sections.map(({ name }) => name)).toEqual(['单调']);
    expect(characterCount(variant3!)).toBe(37);

    expect(variant4?.variant).toBe('格四');
    expect(variant4?.sections.map(({ name }) => name)).toEqual(['单调']);
    expect(characterCount(variant4!)).toBe(36);

    expect(variant5?.sections.map(({ name }) => name)).toEqual(['上阕', '下阕']);
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
