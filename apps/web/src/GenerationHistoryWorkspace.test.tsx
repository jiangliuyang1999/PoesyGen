// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern, GenerationResult } from '@poesygen/client-sdk';

import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import type { GenerationHistoryEntry } from './generation-history.js';

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
      lines: [{ id: 'line-1', positions: [{ tone: 'oblique', rhyme: 'main' }] }],
    },
  ],
};

const entries = Array.from({ length: 9 }, (_, index) => createEntry(index));

afterEach(() => {
  cleanup();
  delete document.documentElement.dataset['platform'];
});

describe('generation history pagination', () => {
  it('shows eight records per page and resets pagination when searching', async () => {
    const user = userEvent.setup();
    renderHistory();

    const firstPageList = getHistoryCardList();
    expect(within(firstPageList).getAllByRole('button')).toHaveLength(8);
    expect(screen.getByLabelText('历史记录总数').textContent).toBe('共 9 条记录');
    expect(
      within(screen.getByRole('navigation', { name: '历史记录分页' }))
        .getByRole('button', {
          name: '第 1 页',
        })
        .getAttribute('aria-current'),
    ).toBe('page');

    await user.click(screen.getByRole('button', { name: '第 2 页' }));

    const secondPageList = getHistoryCardList();
    expect(within(secondPageList).getAllByRole('button')).toHaveLength(1);
    expect(within(secondPageList).getByText('如梦令·题目 8')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '如梦令·题目 8' })).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索历史结果' }), '主题 1');

    expect(screen.queryByRole('navigation', { name: '历史记录分页' })).toBeNull();
    expect(within(getHistoryCardList()).getByText('如梦令·题目 1')).toBeTruthy();
    expect(screen.getByLabelText('历史记录总数').textContent).toBe('筛选 1 条 / 共 9 条');
  });

  it('keeps the current page after opening and closing a mobile detail', async () => {
    document.documentElement.dataset['platform'] = 'mobile';
    const user = userEvent.setup();
    renderHistory();

    await user.click(screen.getByRole('button', { name: '第 2 页' }));
    await user.click(
      within(getHistoryCardList()).getByRole('button', {
        name: /如梦令·题目 8/,
      }),
    );

    expect(screen.queryByLabelText('生成历史列表')).toBeNull();
    expect(screen.getByLabelText('历史记录信息')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '全部生成记录' }));

    expect(within(getHistoryCardList()).getByText('如梦令·题目 8')).toBeTruthy();
    expect(screen.getByRole('button', { name: '第 2 页' }).getAttribute('aria-current')).toBe(
      'page',
    );
  });
});

function renderHistory(): void {
  render(
    <GenerationHistoryWorkspace
      entries={entries}
      onInspectCharacter={vi.fn()}
      onRefine={async (_entry, result) => result}
    />,
  );
}

function getHistoryCardList(): HTMLElement {
  return screen.getByLabelText('生成历史列表').querySelector<HTMLElement>('.history-list')!;
}

function createEntry(index: number): GenerationHistoryEntry {
  const result: GenerationResult = {
    status: 'completed',
    rounds: 1,
    draft: {
      id: `draft-${index}`,
      patternId: pattern.id,
      theme: `主题 ${index}`,
      version: 1,
      title: `题目 ${index}`,
      lines: [{ id: 'line-1', text: '梦' }],
    },
    report: {
      passed: true,
      issues: [],
    },
  };
  return {
    id: `session-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 4, 8, index)).toISOString(),
    theme: result.draft.theme,
    pattern,
    result,
  };
}
