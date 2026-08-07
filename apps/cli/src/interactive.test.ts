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
  it('sorts tune names by pinyin before selecting one of their variants', async () => {
    const standard = createPattern('zhu-zhi-ci-standard', '竹枝词', '正体', 2);
    const alternate = createPattern('zhu-zhi-ci-variant-01', '竹枝词', '变体', 3);
    const single = createPattern('an-xiang-standard', '暗香', '正体', 4);
    prompts.select.mockResolvedValueOnce('竹枝词').mockResolvedValueOnce(alternate.id);

    const selected = await promptPattern([standard, alternate, single]);

    expect(selected).toBe(alternate);
    expect(prompts.select).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        message: '选择词牌',
        choices: [
          expect.objectContaining({ name: '暗香', value: '暗香' }),
          expect.objectContaining({ name: '竹枝词', value: '竹枝词' }),
        ],
      }),
    );
    expect(prompts.select).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        message: '选择《竹枝词》的体式',
        choices: expect.arrayContaining([
          expect.objectContaining({ name: '正体  2字/1句  zhu-zhi-ci-standard' }),
          expect.objectContaining({ name: '变体  3字/1句  zhu-zhi-ci-variant-01' }),
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
