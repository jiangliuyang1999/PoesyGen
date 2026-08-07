// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';

import { AutoResizeTextarea } from './AutoResizeTextarea.js';

afterEach(cleanup);

describe('auto-resize textarea', () => {
  it('grows from the minimum row count and stops at the maximum', () => {
    let scrollHeight = 500;
    const onChange = vi.fn();
    const { rerender } = render(
      <AutoResizeTextarea
        aria-label="自动高度输入框"
        value="较长内容"
        minRows={3}
        maxRows={10}
        onChange={onChange}
      />,
    );
    const textarea = screen.getByRole<HTMLTextAreaElement>('textbox', {
      name: '自动高度输入框',
    });
    Object.defineProperty(textarea, 'scrollHeight', {
      configurable: true,
      get: () => scrollHeight,
    });

    rerender(
      <AutoResizeTextarea
        aria-label="自动高度输入框"
        value="较长内容，继续增加"
        minRows={3}
        maxRows={10}
        onChange={onChange}
      />,
    );
    const maximumHeight = Number.parseFloat(textarea.style.height);
    expect(textarea.rows).toBe(3);
    expect(maximumHeight).toBeGreaterThan(310);
    expect(maximumHeight).toBeLessThan(330);
    expect(textarea.style.overflowY).toBe('auto');

    scrollHeight = 20;
    rerender(
      <AutoResizeTextarea
        aria-label="自动高度输入框"
        value=""
        minRows={3}
        maxRows={10}
        onChange={onChange}
      />,
    );
    expect(Number.parseFloat(textarea.style.height)).toBeLessThan(maximumHeight);
    expect(textarea.style.overflowY).toBe('hidden');
  });
});
