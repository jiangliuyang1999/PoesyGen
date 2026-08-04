import { describe, expect, it } from 'vitest';

import type { CiPattern, Tone, WorkDraft } from '@poesygen/domain';

import {
  checkProsody,
  cilinZhengyunLexicon,
  findCilinRhymeGroup,
  getCharacterReading,
  listCilinRhymeGroups,
  type Pronunciation,
  type ProsodyLexicon,
} from './index.js';

const pattern: CiPattern = {
  id: 'test-pattern',
  name: '测试词牌',
  variant: '测试体',
  source: 'test',
  dataVersion: '1.0.0',
  reviewStatus: 'verified',
  sections: [
    {
      id: 'section-1',
      name: '单调',
      lines: [
        {
          id: 'pattern-line-1',
          positions: [{ tone: 'level' }, { tone: 'oblique', rhyme: 'main' }],
        },
        {
          id: 'pattern-line-2',
          positions: [{ tone: 'level' }, { tone: 'oblique', rhyme: 'main' }],
        },
      ],
    },
  ],
};

const draft: WorkDraft = {
  id: 'work-1',
  patternId: pattern.id,
  theme: '春日',
  lines: [
    { id: 'line-1', text: '春晚' },
    { id: 'line-2', text: '花远' },
  ],
  version: 1,
};

function createLexicon(
  entries: Readonly<Record<string, { tone: Tone; rhymeGroups?: ReadonlyArray<string> }>>,
): ProsodyLexicon {
  return {
    resolve({ character }): ReadonlyArray<Pronunciation> {
      const entry = entries[character];
      return entry === undefined
        ? []
        : [{ tone: entry.tone, rhymeGroups: entry.rhymeGroups ?? [] }];
    },
  };
}

describe('checkProsody', () => {
  it('accepts a draft whose length, tones and rhymes all match', () => {
    const lexicon = createLexicon({
      春: { tone: 'level' },
      晚: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      花: { tone: 'level' },
      远: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
    });

    expect(checkProsody(draft, pattern, lexicon)).toEqual({
      passed: true,
      issues: [],
    });
    expect(
      checkProsody(draft, pattern, lexicon, {
        expectedRhymeGroup: { main: 'rhyme-a' },
      }).passed,
    ).toBe(true);
  });

  it('reports deterministic errors for mismatched tones and rhymes', () => {
    const lexicon = createLexicon({
      春: { tone: 'oblique' },
      晚: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      花: { tone: 'level' },
      远: { tone: 'oblique', rhymeGroups: ['rhyme-b'] },
    });

    const report = checkProsody(draft, pattern, lexicon);

    expect(report.passed).toBe(false);
    expect(report.issues.map(({ rule }) => rule)).toEqual(['tone', 'rhyme']);
  });

  it('treats unresolved pronunciation data as a blocking error by default', () => {
    const report = checkProsody(draft, pattern, createLexicon({}));

    expect(report.passed).toBe(false);
    expect(report.issues).toHaveLength(4);
    expect(report.issues.every(({ severity }) => severity === 'error')).toBe(true);
  });
});

describe('authoritative pronunciation data', () => {
  it('loads all nineteen Cilin Zhengyun groups', () => {
    expect(listCilinRhymeGroups()).toHaveLength(19);
    expect(findCilinRhymeGroup('cilin-19')?.name).toBe('第十九部');
  });

  it('resolves simplified and traditional forms to the same rhyme membership', () => {
    const simplified = cilinZhengyunLexicon.resolve({
      character: '东',
      line: '东',
      charIndex: 0,
    });
    const traditional = cilinZhengyunLexicon.resolve({
      character: '東',
      line: '東',
      charIndex: 0,
    });

    expect(simplified).toEqual(traditional);
    expect(simplified[0]).toEqual(
      expect.objectContaining({
        tone: 'level',
        rhymeGroups: ['cilin-01'],
        mandarinReadings: ['dōng'],
        fanqie: ['德紅'],
      }),
    );
  });

  it('keeps ancient entering tone separate from modern Mandarin tone', () => {
    expect(getCharacterReading('一')?.mandarin).toEqual(['yī']);
    expect(cilinZhengyunLexicon.resolve({ character: '一', line: '一', charIndex: 0 })).toEqual([
      expect.objectContaining({
        tone: 'oblique',
        rhymeGroups: ['cilin-17'],
      }),
    ]);
  });

  it('preserves polyphonic tone memberships instead of guessing from context', () => {
    const pronunciations = cilinZhengyunLexicon.resolve({
      character: '中',
      line: '中',
      charIndex: 0,
    });

    expect(pronunciations.map(({ tone }) => tone)).toEqual(['level', 'oblique']);
    expect(pronunciations.every(({ rhymeGroups }) => rhymeGroups[0] === 'cilin-01')).toBe(true);
  });
});
