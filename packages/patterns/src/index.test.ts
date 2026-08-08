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

    expect(patterns).toHaveLength(244);
    expect(new Set(patterns.map(({ id }) => id)).size).toBe(patterns.length);
    expect(new Set(patterns.map(({ name }) => name)).size).toBe(36);
    expect(patterns.filter(({ reviewStatus }) => reviewStatus === 'imported')).toHaveLength(244);
    expect(patterns.filter(({ reviewStatus }) => reviewStatus === 'draft')).toHaveLength(0);
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

    expect(validated).toHaveLength(244);
    expect(validated.every(({ sourceValidation }) => sourceValidation.editDistance >= 0)).toBe(
      true,
    );
    expect(unverified).toHaveLength(0);
  });

  it('normalizes confirmed historical variants during source validation', () => {
    const linJiangXian = patternData.patterns.find(({ id }) => id === 'lin-jiang-xian-variant-03');
    const qinYuanChun = patternData.patterns.find(({ id }) => id === 'qin-yuan-chun-variant-05');

    expect(linJiangXian?.reviewStatus).toBe('imported');
    expect(linJiangXian?.sourceValidation).toEqual({
      status: 'validated',
      editDistance: 0,
      matchedMarkers: 10,
    });
    expect(linJiangXian?.example.lines[0]).toBe('桞帶搖風漢水濵');
    expect(linJiangXian?.example.simplifiedLines?.[0]).toBe('柳带摇风汉水滨');
    expect(qinYuanChun?.reviewStatus).toBe('imported');
    expect(qinYuanChun?.sourceValidation).toEqual({
      status: 'validated',
      editDistance: 0,
      matchedMarkers: 26,
    });
    expect(qinYuanChun?.example.lines[0]).toBe('玊露迎寒');
    expect(qinYuanChun?.example.simplifiedLines?.[0]).toBe('玉露迎寒');
  });

  it('generates readable simplified examples from authoritative source text', () => {
    const switchable = patternData.patterns.filter(({ example }) => 'simplifiedLines' in example);
    const simplifiedLines = switchable.flatMap(({ example }) => example.simplifiedLines ?? []);

    expect(switchable).toHaveLength(225);
    expect(
      simplifiedLines
        .flatMap((line) => Array.from(line))
        .every((character) => character.codePointAt(0)! <= 0xffff),
    ).toBe(true);
    expect(
      patternData.patterns.find(({ id }) => id === 'huan-xi-sha-variant-04')?.example
        .simplifiedLines?.[5],
    ).toBe('宝帐玉炉残麝冷');
    expect(
      patternData.patterns.find(({ id }) => id === 'pu-sa-man-variant-02')?.example
        .simplifiedLines?.[2],
    ).toBe('敧枕背灯眠');
    expect(
      patternData.patterns.find(({ id }) => id === 'nian-nu-jiao-variant-02')?.example
        .simplifiedLines?.[16],
    ).toBe('樯橹灰飞烟灭');
    expect(
      patternData.patterns.find(({ id }) => id === 'qin-yuan-chun-variant-05')?.example
        .simplifiedLines?.[8],
    ).toBe('申生谷旦');
    expect(
      patternData.patterns.find(({ id }) => id === 'zhe-gu-tian-standard')?.example
        .simplifiedLines?.[7],
    ).toBe('今宵剩把银釭照');
  });

  it('resolves all retained draft candidates against the locked source', () => {
    const nianNuJiao = patternData.patterns.find(({ id }) => id === 'nian-nu-jiao-variant-09');
    const xiJiangYue = patternData.patterns.find(({ id }) => id === 'xi-jiang-yue-variant-03');
    const shuiLongYin = patternData.patterns.find(({ id }) => id === 'shui-long-yin-variant-11');
    const yiQinE = patternData.patterns.find(({ id }) => id === 'yi-qin-e-variant-07');
    const yiJianMei = patternData.patterns.find(({ id }) => id === 'yi-jian-mei-variant-04');

    expect(nianNuJiao?.example.lines[0]).toBe('江漢露冷');
    expect(nianNuJiao?.example.simplifiedLines?.[0]).toBe('江汉露冷');
    expect(
      xiJiangYue?.sections.map(({ lines }) =>
        lines
          .map(({ positions }, index) =>
            positions.at(-1)?.rhyme === undefined ? undefined : index,
          )
          .filter((index) => index !== undefined),
      ),
    ).toEqual([
      [1, 2, 3],
      [1, 2, 3],
    ]);
    expect(shuiLongYin?.example.lines[0]).toBe('清江滾滾東流');
    expect(yiQinE?.specification).toBe('双调四十一字，前后段各四句、四仄韵');
    expect(yiJianMei?.example.simplifiedLines?.[0]).toBe('剩蕊惊寒减艳痕');
    expect(findPattern('jian-zi-mu-lan-hua-variant-02')).toBeUndefined();
    expect(listPatternsByName('减字木兰花').map(({ variant }) => variant)).toEqual(['正体']);
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
