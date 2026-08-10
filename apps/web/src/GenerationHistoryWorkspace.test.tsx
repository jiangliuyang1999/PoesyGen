// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern, GenerationResult } from '@poesygen/domain';

import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import type { GenerationHistoryEntry } from './generation-history.js';

const pattern: CiPattern = {
  id: 'ru-meng-ling-standard',
  name: '如梦令',
  variant: '正体',
  source: '测试',
  dataVersion: '1',
  reviewStatus: 'imported',
  example: {
    author: '李清照',
    lines: ['夢'],
    simplifiedLines: ['梦'],
  },
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
  vi.restoreAllMocks();
});

describe('generation history pagination', () => {
  it('shows eight records per page and resets pagination when searching', async () => {
    const user = userEvent.setup();
    renderHistory();

    const firstPageList = getHistoryCardList();
    expect(firstPageList.querySelectorAll('.history-list-entry')).toHaveLength(8);
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
    expect(secondPageList.querySelectorAll('.history-list-entry')).toHaveLength(1);
    expect(within(secondPageList).getByText('如梦令·题目 8')).toBeTruthy();
    expect(screen.getByRole('heading', { name: '如梦令·题目 8' })).toBeTruthy();

    await user.type(screen.getByRole('searchbox', { name: '搜索历史结果' }), '主题 1');

    expect(screen.queryByRole('navigation', { name: '历史记录分页' })).toBeNull();
    expect(within(getHistoryCardList()).getByText('如梦令·题目 1')).toBeTruthy();
    expect(screen.getByLabelText('历史记录总数').textContent).toBe('筛选 1 条 / 共 9 条');
  });

  it('shows all records without pagination in the compact layout and preserves the list after detail', async () => {
    const user = userEvent.setup();
    renderHistory(vi.fn(), true);

    expect(getHistoryCardList().querySelectorAll('.history-list-entry')).toHaveLength(9);
    expect(screen.queryByRole('navigation', { name: '历史记录分页' })).toBeNull();
    await user.click(
      within(getHistoryCardList()).getByRole('button', {
        name: /^如梦令·题目 8/,
      }),
    );

    expect(screen.queryByLabelText('生成历史列表')).toBeNull();
    expect(screen.getByLabelText('历史记录信息')).toBeTruthy();
    const patternIdentity = screen.getByLabelText('词牌信息');
    await user.click(
      within(patternIdentity).getByRole('button', {
        name: '预览《如梦令》词谱',
      }),
    );
    const patternPreview = screen.getByLabelText('格律内容');
    const scriptSwitcher = within(patternPreview).getByRole('group', {
      name: '例词文字',
    });
    expect(scriptSwitcher.nextElementSibling?.classList.contains('stanza-list')).toBe(true);

    await user.click(screen.getByRole('button', { name: '全部生成记录' }));

    expect(within(getHistoryCardList()).getByText('如梦令·题目 8')).toBeTruthy();
    expect(getHistoryCardList().querySelectorAll('.history-list-entry')).toHaveLength(9);
    expect(screen.queryByRole('navigation', { name: '历史记录分页' })).toBeNull();
  });

  it('confirms before deleting a history entry', async () => {
    const user = userEvent.setup();
    const onDelete = vi.fn();
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    renderHistory(onDelete);

    const deleteButton = screen.getByRole('button', {
      name: '删除生成记录《如梦令·题目 0》',
    });
    await user.click(deleteButton);
    expect(onDelete).not.toHaveBeenCalled();

    await user.click(deleteButton);
    expect(confirm).toHaveBeenCalledWith('确定删除《如梦令·题目 0》的生成记录吗？此操作无法撤销。');
    expect(onDelete).toHaveBeenCalledWith('record-0');
  });

  it('shows the key generation settings and toggles the pattern preview', async () => {
    const user = userEvent.setup();
    renderHistory();

    const overview = screen.getByLabelText('历史记录信息');
    const patternIdentity = within(overview).getByLabelText('词牌信息');
    expect(within(patternIdentity).getByRole('heading', { name: '如梦令' })).toBeTruthy();
    expect(within(patternIdentity).getByText('正体 · 1 字 · 单调 · 1 句 · 1 韵位')).toBeTruthy();
    expect(within(patternIdentity).getByText(/第一组仄声韵 · 第十七部 · 四质/)).toBeTruthy();
    expect(within(overview).getByLabelText('创作主题').textContent).toContain('主题 0');

    const settings = within(overview).getByLabelText('历史生成设置');
    expect(within(settings).getByText('8 轮')).toBeTruthy();
    expect(within(settings).getByText('保持含蓄')).toBeTruthy();
    expect(within(overview).queryByText('生成时间')).toBeNull();

    await user.click(
      within(patternIdentity).getByRole('button', {
        name: '预览《如梦令》词谱',
      }),
    );
    expect(within(overview).getByLabelText('格律内容')).toBeTruthy();

    await user.click(
      within(patternIdentity).getByRole('button', {
        name: '收起《如梦令》词谱',
      }),
    );
    expect(within(overview).queryByLabelText('格律内容')).toBeNull();
  });
});

function renderHistory(onDelete = vi.fn(), compactLayout = false): void {
  render(
    <GenerationHistoryWorkspace
      compactLayout={compactLayout}
      entries={entries}
      onInspectCharacter={vi.fn()}
      onRefine={async (_entry, result) => result}
      onDelete={onDelete}
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
    id: `record-${index}`,
    createdAt: new Date(Date.UTC(2026, 7, 4, 8, index)).toISOString(),
    theme: result.draft.theme,
    settings: {
      maxRounds: 8,
      additionalRequirements: ['保持含蓄'],
      rhymeSettings: [
        {
          label: '第一组仄声韵',
          tone: 'oblique',
          groupId: 'cilin-17',
          groupName: '第十七部',
          sections: ['四质'],
        },
      ],
    },
    pattern,
    result,
  };
}
