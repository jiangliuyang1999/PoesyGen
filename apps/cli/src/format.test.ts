import { describe, expect, it } from 'vitest';

import type {
  CharacterPronunciationResponse,
  CiPattern,
  GenerationSessionStatusResponse,
} from '@poesygen/client-sdk';
import { findPattern } from '@poesygen/patterns';

import {
  formatCharacter,
  formatGenerationSession,
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

  it('adds the tune name to generated titles without duplicating it', () => {
    expect(formatGenerationSession(createCompletedSession('春归'))).toMatch(/^如梦令·春归\n/u);
    expect(formatGenerationSession(createCompletedSession('如梦令·春归'))).toMatch(
      /^如梦令·春归\n/u,
    );
    expect(formatGenerationSession(createCompletedSession('如梦令·如梦令·春归'))).toMatch(
      /^如梦令·春归\n/u,
    );
  });

  it('separates upper and lower stanzas in generated work and example patterns', () => {
    const doublePattern = findPattern('lin-jiang-xian-standard');
    expect(doublePattern).toBeDefined();
    if (doublePattern === undefined) return;

    const lineTexts = doublePattern.sections
      .flatMap((section) => section.lines)
      .map((_, index) => `第${index + 1}句`);
    const upperLineCount = doublePattern.sections[0]?.lines.length ?? 0;
    const output = formatGenerationSession(
      createCompletedSession('春归', {
        patternId: doublePattern.id,
        lineTexts,
      }),
    );

    expect(output).toContain(`第${upperLineCount}句\n\n第${upperLineCount + 1}句`);
    expect(formatPattern(doublePattern)).toContain('\n\n[下阕]');
  });
});

function createCompletedSession(
  title: string,
  options: {
    readonly patternId?: string;
    readonly lineTexts?: ReadonlyArray<string>;
  } = {},
): GenerationSessionStatusResponse {
  return {
    id: 'session-1',
    jobId: 'job-1',
    status: 'completed',
    progress: 100,
    result: {
      sessionId: 'session-1',
      status: 'completed',
      rounds: 2,
      draft: {
        id: 'draft-1',
        patternId: options.patternId ?? 'ru-meng-ling-standard',
        theme: '暮春',
        version: 2,
        title,
        lines: (options.lineTexts ?? ['春归']).map((text, index) => ({
          id: `line-${index + 1}`,
          text,
        })),
      },
      report: {
        passed: true,
        issues: [],
      },
    },
  };
}
