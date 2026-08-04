// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  CharacterPronunciationResponse,
  CiPattern,
  RhymeGroupDetail,
  RhymeGroupSummary,
  GenerationSessionStatusResponse,
} from '@poesygen/client-sdk';

import { App, type AppClient } from './App.js';

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

const alternatePattern: CiPattern = {
  ...pattern,
  id: 'test-variant-02',
  variant: '格二',
  example: {
    author: '某氏',
    lines: ['春江晚'],
  },
  sections: [
    {
      id: 'single',
      name: '单调',
      lines: [
        {
          id: 'line-1',
          positions: [
            { tone: 'oblique' },
            { tone: 'level' },
            { tone: 'oblique', rhyme: 'main', rhymeTone: 'oblique' },
          ],
          punctuation: '。',
        },
      ],
    },
  ],
};

const rhymeGroups: ReadonlyArray<RhymeGroupSummary> = [
  {
    id: 'cilin-01',
    number: 1,
    name: '第一部',
    sections: [{ name: '一东', tone: 'level', characterCount: 2 }],
  },
  {
    id: 'cilin-17',
    number: 17,
    name: '第十七部',
    sections: [{ name: '四质', tone: 'oblique', characterCount: 2 }],
  },
];

const groupDetail: RhymeGroupDetail = {
  id: 'cilin-01',
  number: 1,
  name: '第一部',
  sections: [{ name: '一东', tone: 'level', characters: '东风' }],
};

afterEach(cleanup);

describe('web creation workspace', () => {
  it('switches between forms of the same tune and submits the selected pattern ID', async () => {
    const client = createClient([pattern, alternatePattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令' });

    await user.selectOptions(
      screen.getByRole('combobox', { name: '测试令体式' }),
      alternatePattern.id,
    );

    expect(screen.getByText('格二 · 3 字 · 单调')).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上晚归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('词作已完成');
    expect(client.createGenerationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: alternatePattern.id,
      }),
    );
  });

  it('submits theme, rhyme and optimization settings through the shared client', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令' });

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '暮春江上归舟，怀念故友');
    await user.selectOptions(screen.getByLabelText('第 1 组仄声韵'), 'cilin-17');
    await user.type(screen.getByLabelText(/附加要求/), '含蓄抒情\n避免重字');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));

    await screen.findByText('词作已完成');
    expect(client.createGenerationSession).toHaveBeenCalledWith({
      patternId: 'test-standard',
      theme: '暮春江上归舟，怀念故友',
      maxRounds: 8,
      preferredRhymeGroup: 'cilin-17',
      additionalRequirements: ['含蓄抒情', '避免重字'],
    });
    expect(screen.getByText('会话 session-1')).toBeTruthy();
    expect(screen.getByText('任务 job-1')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '春归' })).toBeTruthy();

    const poemView = screen.getByRole('button', { name: '正文' });
    const prosodyView = screen.getByRole('button', { name: '格律标注' });
    expect(poemView.getAttribute('aria-pressed')).toBe('true');

    await user.click(prosodyView);

    expect(prosodyView.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', {
        name: '第1句第1字“春”：平声位',
      }),
    ).toBeTruthy();
    expect(
      screen.getByRole('button', {
        name: '第1句第2字“晚”：仄声韵脚',
      }),
    ).toBeTruthy();

    await user.click(poemView);
    expect(poemView.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByLabelText('平仄韵脚标注')).toBeNull();
  });

  it('opens the dictionary by selecting a character in the example poem', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令' });

    await user.click(screen.getByTitle('平声位'));

    await screen.findByRole('heading', { name: '一字，见古今声韵' });
    await waitFor(() => {
      expect(client.getCharacterPronunciations).toHaveBeenCalledWith('春');
    });
    expect(await screen.findByText('chūn')).toBeTruthy();
  });
});

function createClient(patterns: ReadonlyArray<CiPattern> = [pattern]) {
  const getCharacterPronunciations = vi.fn(
    async (character: string): Promise<CharacterPronunciationResponse> => ({
      character,
      readings: {
        mandarin: [character === '春' ? 'chūn' : 'wǎn'],
        fanqie: ['昌脣'],
      },
      prosody: [
        {
          tone: character === '春' ? 'level' : 'oblique',
          rhymeGroups: [character === '春' ? 'cilin-06' : 'cilin-07'],
          rhymeSections: [character === '春' ? '十一真' : '十四旱'],
        },
      ],
    }),
  );
  const client: AppClient = {
    listPatterns: vi.fn(async () => patterns),
    listCilinRhymeGroups: vi.fn(async () => rhymeGroups),
    getGenerationHealth: vi.fn(async () => ({
      available: true,
      redis: 'ok' as const,
      workers: 1,
    })),
    getCilinRhymeGroup: vi.fn(async () => groupDetail),
    getCharacterPronunciations,
    createGenerationSession: vi.fn(async () => ({
      id: 'session-1',
      jobId: 'job-1',
      status: 'queued' as const,
    })),
    waitForGenerationSession: vi.fn(
      async (_sessionId, options): Promise<GenerationSessionStatusResponse> => {
        options?.onUpdate?.({
          id: 'session-1',
          jobId: 'job-1',
          status: 'running',
          progress: {
            phase: 'generating',
            message: '正在生成初稿',
          },
        });
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
              patternId: pattern.id,
              theme: '暮春江上归舟，怀念故友',
              version: 2,
              title: '春归',
              lines: [{ id: 'line-1', text: '春晚' }],
            },
            report: {
              passed: true,
              issues: [],
            },
          },
        };
      },
    ),
  };
  return client;
}
