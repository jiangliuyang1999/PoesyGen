// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { DictionaryWorkspace } from './DictionaryWorkspace.js';

afterEach(cleanup);

describe('dictionary character lookup', () => {
  it('preserves IME composition text and validates only when submitted', async () => {
    const getCharacterPronunciations = vi.fn(async (character: string) => ({
      character,
      readings: { mandarin: ['chūn'] },
      prosody: [],
    }));
    const user = userEvent.setup();

    render(
      <DictionaryWorkspace
        client={{
          getCharacterPronunciations,
          getCilinRhymeGroup: vi.fn(),
        }}
        rhymeGroups={[]}
        onInitialCharacterHandled={vi.fn()}
      />,
    );

    const input = screen.getByRole('textbox', { name: '输入一个汉字' });
    await user.type(input, 'chun');

    expect((input as HTMLInputElement).value).toBe('chun');
    await user.click(screen.getByRole('button', { name: '查询' }));
    expect(screen.getByRole('status').textContent).toBe('请输入一个汉字。');
    expect(getCharacterPronunciations).not.toHaveBeenCalled();

    await user.clear(input);
    await user.type(input, '春{Enter}');

    await waitFor(() => {
      expect(getCharacterPronunciations).toHaveBeenCalledWith('春');
    });
    expect((input as HTMLInputElement).value).toBe('春');
  });
});
