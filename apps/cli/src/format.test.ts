import { describe, expect, it } from 'vitest';

import type { CharacterPronunciationResponse, CiPattern } from '@poesygen/client-sdk';

import {
  formatCharacter,
  formatPattern,
  formatPatternSummary,
  patternRhymeLabels,
} from './format.js';

const pattern: CiPattern = {
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

describe('CLI formatters', () => {
  it('summarizes and renders a pattern', () => {
    expect(formatPatternSummary(pattern)).toBe('测试令·正体  2字/1句  test-standard');
    expect(formatPattern(pattern)).toContain('平 仄韵');
    expect(formatPattern(pattern)).toContain('春晚。');
  });

  it('extracts stable rhyme labels only once', () => {
    expect(patternRhymeLabels(pattern)).toEqual([{ id: 'main', tone: 'oblique' }]);
  });

  it('renders modern and historical character readings separately', () => {
    const response: CharacterPronunciationResponse = {
      character: '一',
      readings: {
        mandarin: ['yī'],
        fanqie: ['於悉'],
        tang: ['*qit'],
      },
      prosody: [
        {
          tone: 'oblique',
          rhymeGroups: ['cilin-17'],
          rhymeSections: ['四质'],
        },
      ],
    };

    const output = formatCharacter(response);

    expect(output).toContain('普通话：yī');
    expect(output).toContain('反切：於悉');
    expect(output).toContain('仄声 · cilin-17 · 四质');
  });
});
