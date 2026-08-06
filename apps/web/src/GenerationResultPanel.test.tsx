// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern, GenerationResult, TextSelection } from '@poesygen/domain';

import { GenerationResultPanel } from './GenerationResultPanel.js';
import type { SubmissionStatus } from './GenerationSettings.js';

const pattern: CiPattern = {
  id: 'test-standard',
  name: '测试令',
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
          positions: [{ tone: 'level' }],
        },
      ],
    },
  ],
};

const result: GenerationResult = {
  status: 'completed',
  rounds: 1,
  draft: {
    id: 'draft-1',
    patternId: pattern.id,
    theme: '春日',
    version: 1,
    title: '春归',
    lines: [{ id: 'line-1', text: '春' }],
  },
  report: {
    passed: true,
    issues: [],
  },
};

afterEach(cleanup);

describe('generation result refinement progress', () => {
  it('shows refinement progress directly below the regenerate button', async () => {
    let finishRefinement = (): void => {};
    const gate = new Promise<void>((resolve) => {
      finishRefinement = resolve;
    });
    const onRefine = vi.fn(
      async (
        _selections: ReadonlyArray<TextSelection>,
        onProgress?: (status: SubmissionStatus) => void,
      ) => {
        onProgress?.({
          kind: 'running',
          message: '正在根据修改意见生成新版本',
          progressTarget: 'refinement',
          progress: [
            {
              stage: 'drafting',
              message: '正在根据修改意见生成新版本',
              round: 1,
              maxRounds: 8,
            },
          ],
        });
        await gate;
      },
    );
    const user = userEvent.setup();

    render(
      <GenerationResultPanel
        result={result}
        pattern={pattern}
        onInspectCharacter={vi.fn()}
        onRefine={onRefine}
      />,
    );

    await user.click(screen.getByRole('button', { name: '局部修改' }));
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“春”' }));
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成秋日意象');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));
    const submit = screen.getByRole('button', { name: '根据全部意见重新生成' });
    await user.click(submit);

    const progress = screen.getByLabelText('局部修改进度');
    expect(submit.nextElementSibling).toBe(progress.parentElement);
    expect(within(progress).getByText('正在根据修改意见生成新版本')).toBeTruthy();

    finishRefinement();
    await waitFor(() => {
      expect(screen.getByRole('button', { name: '正文' }).getAttribute('aria-pressed')).toBe(
        'true',
      );
    });
  });
});
