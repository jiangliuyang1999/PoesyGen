import { describe, expect, it } from 'vitest';

import type { CiPattern } from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';
import {
  compatibleRhymeGroups,
  filterPatterns,
  formatGenerationTitle,
  formatPatternVariantSummary,
  groupPatternsByName,
  patternRhymeLabels,
  patternStats,
  sortPatternFamiliesByPinyin,
  splitRequirements,
} from './model.js';

export const testPattern: CiPattern = {
  id: 'test-standard',
  name: '测试令',
  variant: '正体',
  source: '测试词谱',
  dataVersion: '1',
  reviewStatus: 'imported',
  example: {
    author: '某氏',
    lines: ['春晚'],
  },
  sections: [
    {
      id: 'single',
      name: '单调',
      lines: [
        {
          id: 'line-1',
          positions: [{ tone: 'level' }, { tone: 'oblique', rhyme: 'main', rhymeTone: 'oblique' }],
          punctuation: '。',
        },
      ],
    },
  ],
};

const groups: ReadonlyArray<RhymeGroupSummary> = [
  {
    id: 'cilin-01',
    number: 1,
    name: '第一部',
    sections: [{ name: '一东', tone: 'level', characterCount: 10 }],
  },
  {
    id: 'cilin-17',
    number: 17,
    name: '第十七部',
    sections: [{ name: '四质', tone: 'oblique', characterCount: 10 }],
  },
];

describe('web interaction model', () => {
  it('groups different forms under the same tune name', () => {
    const alternate: CiPattern = {
      ...testPattern,
      id: 'test-variant-02',
      variant: '格二',
      sections: [
        {
          id: 'single',
          name: '单调',
          lines: [
            {
              id: 'line-1',
              positions: [{ tone: 'oblique' }, { tone: 'level' }, { tone: 'oblique' }],
            },
          ],
        },
      ],
    };

    expect(groupPatternsByName([testPattern, alternate])).toEqual([
      {
        name: '测试令',
        patterns: [testPattern, alternate],
      },
    ]);
    expect(patternStats(alternate).characters).toBe(3);
  });

  it('derives pattern metrics and rhyme controls', () => {
    expect(patternStats(testPattern)).toEqual({
      characters: 2,
      lines: 1,
      sections: 1,
      rhymePositions: 1,
    });
    expect(formatPatternVariantSummary(testPattern)).toBe('正体 · 2字 · 单调 · 1句 · 1韵位');
    expect(patternRhymeLabels(testPattern)).toEqual([{ id: 'main', tone: 'oblique' }]);
    expect(compatibleRhymeGroups(groups, 'oblique').map(({ id }) => id)).toEqual(['cilin-17']);
  });

  it('sorts tune names by Chinese pinyin', () => {
    const families = [
      ['竹枝词', 'zhu-zhi-ci-standard'],
      ['长相思', 'chang-xiang-si-standard'],
      ['浣溪沙', 'huan-xi-sha-standard'],
      ['八声甘州', 'ba-sheng-gan-zhou-standard'],
      ['暗香', 'an-xiang-standard'],
    ].map(([name, id]) => ({
      name: name!,
      patterns: [{ ...testPattern, id: id!, name: name! }],
    }));

    expect(sortPatternFamiliesByPinyin(families).map(({ name }) => name)).toEqual([
      '暗香',
      '八声甘州',
      '长相思',
      '浣溪沙',
      '竹枝词',
    ]);
  });

  it('filters patterns and normalizes requirement lines', () => {
    expect(filterPatterns([testPattern], '测试')).toEqual([testPattern]);
    expect(filterPatterns([testPattern], '浣溪沙')).toEqual([]);
    expect(splitRequirements('含蓄抒情\n江南意象；避免重字')).toEqual([
      '含蓄抒情',
      '江南意象',
      '避免重字',
    ]);
    expect(formatGenerationTitle('临江仙', '故园新雨')).toBe('临江仙·故园新雨');
    expect(formatGenerationTitle('临江仙', '临江仙·暮春闲坐忆旧')).toBe('临江仙·暮春闲坐忆旧');
    expect(formatGenerationTitle('临江仙', '临江仙·临江仙·暮春闲坐忆旧')).toBe(
      '临江仙·暮春闲坐忆旧',
    );
    expect(formatGenerationTitle('临江仙', '重读临江仙旧作')).toBe('重读临江仙旧作');
    expect(formatGenerationTitle('临江仙', undefined)).toBe('临江仙·无题');
  });
});
