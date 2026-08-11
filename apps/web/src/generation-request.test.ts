import { describe, expect, it } from 'vitest';

import type { CiPattern, GenerationResult } from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';
import type { GenerationHistoryEntry } from './generation-history.js';
import {
  createGenerationPreferences,
  createInitialGenerationRequest,
  createRefinementRequest,
  historyRefinementPreferences,
} from './generation-request.js';

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
      lines: [
        {
          id: 'line-1',
          positions: [{ tone: 'oblique', rhyme: 'main', rhymeTone: 'oblique' }],
        },
      ],
    },
  ],
};

const rhymeGroups: ReadonlyArray<RhymeGroupSummary> = [
  {
    id: 'cilin-17',
    number: 17,
    name: '第十七部',
    sections: [{ name: '四质', tone: 'oblique', characterCount: 10 }],
  },
];

const sourceResult: GenerationResult = {
  status: 'completed',
  rounds: 2,
  draft: {
    id: 'draft-1',
    patternId: pattern.id,
    theme: '暮春怀人',
    version: 1,
    title: '春归',
    requestedRhymeGroup: 'cilin-01',
    lines: [{ id: 'line-1', text: '春' }],
  },
  report: {
    passed: true,
    issues: [],
  },
  context: {
    themeBrief: {
      coreTheme: '暮春怀人',
      subject: '怀人者',
      setting: '暮春',
      perspective: '第一人称',
      emotionalArc: ['见景', '怀人'],
      keyFacts: ['暮春'],
      imagery: ['春'],
      avoid: [],
      assumptions: [],
    },
    plan: {
      thesis: '借春景怀人',
      style: '含蓄',
      voice: '第一人称',
      imagery: ['春'],
      allusions: [],
      sections: [
        {
          sectionId: 'single',
          task: '写春景并由景入情',
          arc: '由景入情后收束',
        },
      ],
      lines: [
        {
          lineId: 'line-1',
          task: '点明春景并借景怀人',
          emotion: '惆怅',
          image: '春',
          ending: '落在春字',
        },
      ],
    },
  },
};

describe('web generation request model', () => {
  it('builds request and history settings from one generation preference source', () => {
    const preferences = createGenerationPreferences({
      pattern,
      rhymeAssignments: { main: 'cilin-17' },
      rhymeGroups,
      maxRounds: 8,
      requirements: '含蓄抒情\n避免重字',
    });

    expect(preferences).toEqual({
      preferredRhymeGroup: 'cilin-17',
      additionalRequirements: ['含蓄抒情', '避免重字'],
      historySettings: {
        maxRounds: 8,
        additionalRequirements: ['含蓄抒情', '避免重字'],
        rhymeSettings: [
          {
            label: '第 1 组仄声韵',
            tone: 'oblique',
            groupId: 'cilin-17',
            groupName: '第十七部',
            sections: ['四质'],
          },
        ],
      },
    });
    expect(
      createInitialGenerationRequest({
        pattern,
        theme: '  暮春怀人  ',
        maxRounds: 8,
        preferences,
      }),
    ).toEqual({
      patternId: pattern.id,
      theme: '暮春怀人',
      maxRounds: 8,
      preferredRhymeGroup: 'cilin-17',
      additionalRequirements: ['含蓄抒情', '避免重字'],
    });
  });

  it('reuses history settings and normalizes refinement selections', () => {
    const entry: GenerationHistoryEntry = {
      id: 'record-1',
      createdAt: '2026-08-07T00:00:00.000Z',
      theme: sourceResult.draft.theme,
      pattern,
      result: sourceResult,
      settings: {
        maxRounds: 6,
        additionalRequirements: ['保持含蓄'],
        rhymeSettings: [
          {
            label: '第 1 组仄声韵',
            tone: 'oblique',
            groupId: 'cilin-17',
          },
        ],
      },
    };
    const preferences = historyRefinementPreferences(entry, sourceResult);

    expect(preferences).toEqual({
      maxRounds: 6,
      preferredRhymeGroup: 'cilin-17',
      additionalRequirements: ['保持含蓄'],
    });
    expect(
      createRefinementRequest({
        sourceResult,
        pattern,
        selections: [{ lineId: 'line-1', start: 0, end: 1, instruction: '  改为秋  ' }],
        ...preferences,
      }),
    ).toEqual(
      expect.objectContaining({
        patternId: pattern.id,
        theme: sourceResult.draft.theme,
        sourceDraft: sourceResult.draft,
        sourceContext: sourceResult.context,
        selections: [{ lineId: 'line-1', start: 0, end: 1, instruction: '改为秋' }],
        maxRounds: 6,
        preferredRhymeGroup: 'cilin-17',
        additionalRequirements: ['保持含蓄'],
      }),
    );
  });

  it('falls back to the source draft rhyme for legacy history records', () => {
    const entry: GenerationHistoryEntry = {
      id: 'record-legacy',
      createdAt: '2026-08-07T00:00:00.000Z',
      theme: sourceResult.draft.theme,
      pattern,
      result: sourceResult,
    };

    expect(historyRefinementPreferences(entry, sourceResult)).toEqual({
      maxRounds: 8,
      preferredRhymeGroup: 'cilin-01',
      additionalRequirements: [],
    });
  });
});
