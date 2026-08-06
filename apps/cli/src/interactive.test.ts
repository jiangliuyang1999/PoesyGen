import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { CiPattern } from '@poesygen/domain';

const prompts = vi.hoisted(() => ({
  confirm: vi.fn(),
  input: vi.fn(),
  number: vi.fn(),
  password: vi.fn(),
  select: vi.fn(),
}));

vi.mock('@inquirer/prompts', () => prompts);

import { promptMissingLlmEnvironment, promptPattern } from './interactive.js';

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('interactive CLI LLM configuration', () => {
  it('prompts for missing required environment variables', async () => {
    const environment: Record<string, string | undefined> = {};
    prompts.input
      .mockResolvedValueOnce('https://example.com/v1')
      .mockResolvedValueOnce('example-model');
    prompts.password.mockResolvedValueOnce('secret');

    await promptMissingLlmEnvironment(environment);

    expect(environment).toMatchObject({
      LLM_BASE_URL: 'https://example.com/v1',
      LLM_MODEL: 'example-model',
      LLM_API_KEY: 'secret',
    });
  });

  it('does not prompt when the environment is complete', async () => {
    await promptMissingLlmEnvironment({
      LLM_BASE_URL: 'https://example.com/v1',
      LLM_MODEL: 'example-model',
      LLM_API_KEY: 'secret',
    });

    expect(prompts.input).not.toHaveBeenCalled();
    expect(prompts.password).not.toHaveBeenCalled();
  });
});

describe('interactive CLI pattern selection', () => {
  it('selects the tune name before selecting one of its variants', async () => {
    const standard = createPattern('test-standard', '测试令', '正体', 2);
    const alternate = createPattern('test-alternate', '测试令', '变体', 3);
    const single = createPattern('single-standard', '单体令', '正体', 4);
    prompts.select.mockResolvedValueOnce('测试令').mockResolvedValueOnce(alternate.id);

    const selected = await promptPattern([standard, alternate, single]);

    expect(selected).toBe(alternate);
    expect(prompts.select).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: '选择词牌',
        choices: [
          expect.objectContaining({ name: '测试令', value: '测试令' }),
          expect.objectContaining({ name: '单体令', value: '单体令' }),
        ],
      }),
    );
    expect(prompts.select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: '选择《测试令》的体式',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: '正体  2字/1句  test-standard' }),
          expect.objectContaining({ name: '变体  3字/1句  test-alternate' }),
        ]),
      }),
    );
  });

  it('returns a single-variant tune without a second prompt', async () => {
    const pattern = createPattern('single-standard', '单体令', '正体', 4);
    prompts.select.mockResolvedValueOnce(pattern.name);

    await expect(promptPattern([pattern])).resolves.toBe(pattern);
    expect(prompts.select).toHaveBeenCalledOnce();
  });
});

function createPattern(
  id: string,
  name: string,
  variant: string,
  characterCount: number,
): CiPattern {
  return {
    id,
    name,
    variant,
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
            positions: Array.from({ length: characterCount }, () => ({ tone: 'either' as const })),
          },
        ],
      },
    ],
  };
}
