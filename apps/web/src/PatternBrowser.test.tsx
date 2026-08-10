// @vitest-environment jsdom

import { useState } from 'react';

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern } from '@poesygen/domain';

import { MobilePatternWorkspace } from './MobilePatternWorkspace.js';
import { PatternBrowser } from './PatternBrowser.js';

const patterns = [
  createPattern('竹枝词', 'zhu-zhi-ci-standard'),
  createPattern('满江红', 'man-jiang-hong-standard'),
  createPattern('暗香', 'an-xiang-standard'),
  createPattern('浣溪沙', 'huan-xi-sha-standard'),
  createPattern('八声甘州', 'ba-sheng-gan-zhou-standard'),
  createPattern('临江仙', 'lin-jiang-xian-standard'),
  createPattern('蝶恋花', 'die-lian-hua-standard'),
  createPattern('长相思', 'chang-xiang-si-standard'),
  createPattern('卜算子', 'bu-suan-zi-standard'),
] as const;

const firstPageNames = [
  '暗香',
  '八声甘州',
  '卜算子',
  '长相思',
  '蝶恋花',
  '浣溪沙',
  '临江仙',
  '满江红',
];

afterEach(() => {
  cleanup();
});

describe('pattern catalog pagination', () => {
  it('sorts desktop tune cards by pinyin, paginates them and resets on search', async () => {
    const user = userEvent.setup();

    function Harness() {
      const [query, setQuery] = useState('');
      return (
        <PatternBrowser
          patterns={patterns}
          query={query}
          selectedPatternId={patterns[2].id}
          onQueryChange={setQuery}
          onSelect={vi.fn()}
        />
      );
    }

    render(<Harness />);

    expect(patternNames(screen.getByLabelText('词牌列表'), '.pattern-list')).toEqual(
      firstPageNames,
    );
    const pagination = screen.getByRole('navigation', { name: '词牌分页' });
    expect(
      within(pagination).getByRole('button', { name: '第 1 页词牌' }).getAttribute('aria-current'),
    ).toBe('page');

    await user.click(within(pagination).getByRole('button', { name: '第 2 页词牌' }));
    expect(patternNames(screen.getByLabelText('词牌列表'), '.pattern-list')).toEqual(['竹枝词']);

    await user.type(screen.getByRole('searchbox', { name: '搜索词牌名' }), '暗香');
    expect(patternNames(screen.getByLabelText('词牌列表'), '.pattern-list')).toEqual(['暗香']);
    expect(screen.queryByRole('navigation', { name: '词牌分页' })).toBeNull();
  });

  it('shows every pinyin-sorted tune without pagination in the compact workspace', () => {
    render(
      <MobilePatternWorkspace
        patterns={patterns}
        query=""
        selectedPattern={patterns[2]}
        onQueryChange={vi.fn()}
        onSelect={vi.fn()}
        onInspectCharacter={vi.fn()}
        onCreate={vi.fn()}
      />,
    );

    expect(patternNames(screen.getByLabelText('手机词牌列表'), ':scope')).toEqual([
      ...firstPageNames,
      '竹枝词',
    ]);
    expect(screen.queryByRole('navigation', { name: '词牌分页' })).toBeNull();
  });
});

function patternNames(container: HTMLElement, scope: string): ReadonlyArray<string> {
  const root = scope === ':scope' ? container : container.querySelector<HTMLElement>(scope)!;
  return [...root.querySelectorAll<HTMLElement>('button strong')].map(
    ({ textContent }) => textContent ?? '',
  );
}

function createPattern(name: string, id: string): CiPattern {
  return {
    id,
    name,
    variant: '正体',
    source: '测试',
    dataVersion: '1',
    reviewStatus: 'imported',
    sections: [
      {
        id: 'single',
        name: '单调',
        lines: [{ id: 'line-1', positions: [{ tone: 'either' }] }],
      },
    ],
  };
}
