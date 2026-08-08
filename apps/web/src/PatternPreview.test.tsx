// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern } from '@poesygen/domain';

import { PatternPreview } from './PatternPreview.js';

afterEach(cleanup);

describe('pattern example script switcher', () => {
  it('shows the authoritative traditional example by default and switches to simplified text', async () => {
    const pattern: CiPattern = {
      id: 'test-standard',
      name: '测试令',
      variant: '正体',
      source: '《御定词谱》',
      dataVersion: '1',
      reviewStatus: 'imported',
      example: {
        author: '某氏',
        lines: ['煙雨'],
        simplifiedLines: ['烟雨'],
      },
      sections: [
        {
          id: 'single',
          name: '单调',
          lines: [
            {
              id: 'line-1',
              positions: [{ tone: 'level' }, { tone: 'oblique' }],
              punctuation: '。',
            },
          ],
        },
      ],
    };
    const inspectCharacter = vi.fn();
    const user = userEvent.setup();

    render(<PatternPreview pattern={pattern} onInspectCharacter={inspectCharacter} />);

    const switcher = screen.getByRole('group', { name: '例词文字' });
    expect(
      within(switcher).getByRole('button', { name: '繁体' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.getByText('煙')).toBeTruthy();

    await user.click(within(switcher).getByRole('button', { name: '简体' }));

    expect(
      within(switcher).getByRole('button', { name: '简体' }).getAttribute('aria-pressed'),
    ).toBe('true');
    expect(screen.queryByText('煙')).toBeNull();
    await user.click(screen.getByText('烟').closest('button')!);
    expect(inspectCharacter).toHaveBeenCalledWith('烟');
  });
});
