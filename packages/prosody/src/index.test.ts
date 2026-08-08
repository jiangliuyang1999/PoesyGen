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

const mixedRhymePattern: CiPattern = {
  ...pattern,
  sections: [
    {
      ...pattern.sections[0]!,
      lines: [
        ...pattern.sections[0]!.lines,
        {
          id: 'pattern-line-3',
          positions: [{ tone: 'level' }, { tone: 'oblique' }],
        },
      ],
    },
  ],
};

const changingRhymePattern: CiPattern = {
  ...pattern,
  sections: [
    {
      ...pattern.sections[0]!,
      lines: ['rhyme-1', 'rhyme-2', 'rhyme-3', 'rhyme-4'].map((rhyme, index) => ({
        id: `changing-line-${index + 1}`,
        positions: [{ tone: 'either' as const, rhyme }],
      })),
    },
  ],
};

function changingRhymeDraft(characters: ReadonlyArray<string>): WorkDraft {
  return {
    ...draft,
    lines: characters.map((text, index) => ({
      id: `changing-work-line-${index + 1}`,
      text,
    })),
  };
}

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

  it('rejects a non-rhyme line ending that uses the active rhyme group', () => {
    const lexicon = createLexicon({
      春: { tone: 'level' },
      晚: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      花: { tone: 'level' },
      远: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      山: { tone: 'level', rhymeGroups: ['rhyme-b'] },
    });
    const report = checkProsody(
      {
        ...draft,
        lines: [...draft.lines, { id: 'line-3', text: '山晚' }],
      },
      mixedRhymePattern,
      lexicon,
    );

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        lineId: 'line-3',
        charIndex: 1,
        rule: 'rhyme',
        severity: 'error',
        message: '非韵句句尾“晚”使用了本词押韵韵部',
        expected: '避开 rhyme-a',
      }),
    );
  });

  it('accepts a non-rhyme line ending outside the active rhyme group', () => {
    const lexicon = createLexicon({
      春: { tone: 'level' },
      晚: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      花: { tone: 'level' },
      远: { tone: 'oblique', rhymeGroups: ['rhyme-a'] },
      山: { tone: 'level', rhymeGroups: ['rhyme-b'] },
      月: { tone: 'oblique', rhymeGroups: ['rhyme-b'] },
    });

    expect(
      checkProsody(
        {
          ...draft,
          lines: [...draft.lines, { id: 'line-3', text: '山月' }],
        },
        mixedRhymePattern,
        lexicon,
      ),
    ).toEqual({
      passed: true,
      issues: [],
    });
  });

  it('warns when only some readings of a non-rhyme ending use the active rhyme group', () => {
    const lexicon: ProsodyLexicon = {
      resolve({ character }) {
        if (character === '春' || character === '花' || character === '山') {
          return [{ tone: 'level', rhymeGroups: ['rhyme-b'] }];
        }
        if (character === '晚' || character === '远') {
          return [{ tone: 'oblique', rhymeGroups: ['rhyme-a'] }];
        }
        if (character === '中') {
          return [
            { tone: 'oblique', rhymeGroups: ['rhyme-a'], reading: 'zhòng' },
            { tone: 'oblique', rhymeGroups: ['rhyme-b'], reading: 'zhōng' },
          ];
        }
        return [];
      },
    };
    const report = checkProsody(
      {
        ...draft,
        lines: [...draft.lines, { id: 'line-3', text: '山中' }],
      },
      mixedRhymePattern,
      lexicon,
    );

    expect(report.passed).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        rule: 'rhyme',
        severity: 'warning',
        message: '非韵句句尾“中”存在多音，可能误用本词押韵韵部',
      }),
    );
  });

  it('rejects adjacent rhyme groups that use the same rhyme section', () => {
    const lexicon = createLexicon({
      春: { tone: 'level', rhymeGroups: ['rhyme-a'] },
      山: { tone: 'level', rhymeGroups: ['rhyme-a'] },
      江: { tone: 'level', rhymeGroups: ['rhyme-b'] },
      花: { tone: 'level', rhymeGroups: ['rhyme-c'] },
    });
    const report = checkProsody(
      changingRhymeDraft(['春', '山', '江', '花']),
      changingRhymePattern,
      lexicon,
    );

    expect(report.passed).toBe(false);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        lineId: 'changing-work-line-2',
        rule: 'rhyme',
        severity: 'error',
        message: '相邻韵组“rhyme-1”与“rhyme-2”使用了同一韵部',
        expected: '与前一韵组使用不同韵部',
        actual: 'rhyme-a',
      }),
    );
  });

  it('allows a non-adjacent rhyme group to reuse an earlier rhyme section', () => {
    const lexicon = createLexicon({
      春: { tone: 'level', rhymeGroups: ['rhyme-a'] },
      山: { tone: 'level', rhymeGroups: ['rhyme-b'] },
      江: { tone: 'level', rhymeGroups: ['rhyme-c'] },
      花: { tone: 'level', rhymeGroups: ['rhyme-a'] },
    });

    expect(
      checkProsody(changingRhymeDraft(['春', '山', '江', '花']), changingRhymePattern, lexicon),
    ).toEqual({
      passed: true,
      issues: [],
    });
  });

  it('warns when adjacent polyphonic rhyme groups have overlapping candidates', () => {
    const lexicon: ProsodyLexicon = {
      resolve({ character }) {
        const groups =
          character === '春'
            ? ['rhyme-a', 'rhyme-b']
            : character === '山'
              ? ['rhyme-a', 'rhyme-c']
              : character === '江'
                ? ['rhyme-d']
                : ['rhyme-e'];
        return [{ tone: 'level', rhymeGroups: groups }];
      },
    };
    const report = checkProsody(
      changingRhymeDraft(['春', '山', '江', '花']),
      changingRhymePattern,
      lexicon,
    );

    expect(report.passed).toBe(true);
    expect(report.issues).toContainEqual(
      expect.objectContaining({
        rule: 'rhyme',
        severity: 'warning',
        message: '相邻韵组“rhyme-1”与“rhyme-2”存在相同候选韵部，需确认已经换韵',
        actual: 'rhyme-a',
      }),
    );
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
