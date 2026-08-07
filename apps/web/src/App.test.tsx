// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type { CiPattern, GenerationResult } from '@poesygen/domain';

vi.mock('./direct-generation.js', () => ({
  runDirectGeneration: vi.fn(),
  runDirectIdeaSuggestions: vi.fn(),
}));

import { App, type AppClient } from './App.js';
import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from './catalog-types.js';
import { splitGraphemes } from './DictionaryWorkspace.js';
import { runDirectGeneration, runDirectIdeaSuggestions } from './direct-generation.js';
import { defaultDirectLlmConfig, saveDirectLlmConfig } from './direct-llm-config.js';
import { generationHistoryStorageKey } from './generation-history.js';

const pattern: CiPattern = {
  id: 'ce-shi-ling-standard',
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
  id: 'ce-shi-ling-variant-02',
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

const otherPattern: CiPattern = {
  ...pattern,
  id: 'ling-yi-ling-standard',
  name: '另一令',
};

const doubleStanzaPattern: CiPattern = {
  ...pattern,
  id: 'double-standard',
  name: '双调令',
  example: {
    author: '某氏',
    lines: ['春晚', '江归'],
  },
  sections: [
    {
      id: 'upper',
      name: '上阕',
      lines: [
        {
          id: 'upper-line',
          positions: [{ tone: 'level' }, { tone: 'oblique', rhyme: 'main', rhymeTone: 'oblique' }],
          punctuation: '。',
        },
      ],
    },
    {
      id: 'lower',
      name: '下阕',
      lines: [
        {
          id: 'lower-line',
          positions: [{ tone: 'level' }, { tone: 'oblique', rhyme: 'main', rhymeTone: 'oblique' }],
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

const ideaSuggestions = [
  '暮春江上归舟，远帆入暮云，忽忆故人旧约',
  '雪夜独坐小楼，听梅枝落雪，思念远行未归的人',
  '重回江南旧巷，在新雨与青苔间寻找少年往事',
] as const;

beforeEach(() => {
  delete document.documentElement.dataset['platform'];
  const localStorage = createTestStorage();
  const sessionStorage = createTestStorage();
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: localStorage,
  });
  Object.defineProperty(window, 'sessionStorage', {
    configurable: true,
    value: sessionStorage,
  });
  saveDirectLlmConfig(
    {
      ...defaultDirectLlmConfig,
      model: 'test-model',
      apiKey: 'test-key',
    },
    localStorage,
    sessionStorage,
  );
  vi.mocked(runDirectIdeaSuggestions).mockResolvedValue(ideaSuggestions);
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.sessionStorage.clear();
  vi.mocked(runDirectGeneration).mockReset();
  vi.mocked(runDirectIdeaSuggestions).mockReset();
  delete document.documentElement.dataset['platform'];
});

describe('web creation workspace', () => {
  it('keeps variation sequences in a single dictionary glyph', () => {
    expect(splitGraphemes(`东\uFE00风`)).toEqual([`东\uFE00`, '风']);
  });

  it('loads patterns and rhyme groups from the local catalog', async () => {
    const client = createClient();

    render(<App client={client} />);

    expect(await screen.findByRole('heading', { name: '测试令', level: 2 })).toBeTruthy();
    expect(client.listPatterns).toHaveBeenCalledOnce();
    expect(client.listCilinRhymeGroups).toHaveBeenCalledOnce();
    expect(screen.getByText('LLM 已配置')).toBeTruthy();
  });

  it('uses a left settings column, right pattern preview and shared page width', async () => {
    const client = createClient();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    const workspace = screen.getByLabelText('创作工作区');
    const settings = within(workspace).getByLabelText('创作设置');
    const preview = within(workspace).getByLabelText('当前词牌预览');
    expect(workspace.firstElementChild).toBe(settings);
    expect(workspace.lastElementChild).toBe(preview);

    const tuneSelect = within(settings).getByRole('combobox', { name: '创作词牌' });
    const variantSelect = within(settings).getByRole('combobox', { name: '创作体式' });
    expect(tuneSelect).toBeTruthy();
    expect(
      within(variantSelect).getByRole('option', {
        name: '正体 · 2字 · 单调 · 1句 · 1韵位',
      }),
    ).toBeTruthy();
    const patternSettings = within(settings)
      .getByRole('heading', { name: '词牌设置', level: 2 })
      .closest('section')!;
    const rhymeSettings = within(settings).getByLabelText('韵部设置');
    expect(patternSettings.contains(rhymeSettings)).toBe(true);
    expect(within(settings).getByRole('heading', { name: '创作主题', level: 2 })).toBeTruthy();
    const generationSettings = within(settings)
      .getByRole('heading', { name: '生成设置', level: 2 })
      .closest('aside')!;
    expect(generationSettings.contains(rhymeSettings)).toBe(false);
    expect(
      within(settings).getByRole<HTMLTextAreaElement>('textbox', { name: '作品主题' }).rows,
    ).toBe(3);
    expect(within(settings).getByLabelText('大模型灵感推荐')).toBeTruthy();
    expect(within(settings).getByLabelText('第 1 组仄声韵')).toBeTruthy();
    expect(within(settings).getByRole('slider')).toBeTruthy();
    expect(within(settings).getByLabelText<HTMLTextAreaElement>('附加要求').rows).toBe(2);

    const patternHeading = within(preview).getByRole('heading', {
      name: '测试令',
      level: 2,
    });
    expect(patternHeading.textContent).toBe('测试令');
    expect(within(preview).getByLabelText('词牌信息').textContent).toBe(
      '正体 · 2字 · 单调 · 1句 · 1韵位',
    );
    expect(within(preview).getByTitle('平声位')).toBeTruthy();
    expect(within(preview).queryByRole('button', { name: '用此体创作' })).toBeNull();
    expect(within(preview).queryByRole('combobox', { name: '创作词牌' })).toBeNull();
  });

  it('sorts creation tunes and initializes both pages with the first tune and variant', async () => {
    const user = userEvent.setup();
    const pinyinPatterns = [
      { ...pattern, id: 'zhu-zhi-ci-standard', name: '竹枝词' },
      { ...pattern, id: 'an-xiang-standard', name: '暗香' },
      { ...alternatePattern, id: 'an-xiang-variant-02', name: '暗香' },
      { ...pattern, id: 'chang-xiang-si-standard', name: '长相思' },
      { ...pattern, id: 'huan-xi-sha-standard', name: '浣溪沙' },
    ];
    render(<App client={createClient(pinyinPatterns)} />);

    const tuneSelect = await screen.findByRole('combobox', { name: '创作词牌' });
    expect((tuneSelect as HTMLSelectElement).value).toBe('暗香');
    expect(
      within(tuneSelect)
        .getAllByRole('option')
        .map(({ textContent }) => textContent),
    ).toEqual(['暗香 · 2体', '长相思 · 1体', '浣溪沙 · 1体', '竹枝词 · 1体']);
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '创作体式' }).value).toBe(
      'an-xiang-standard',
    );

    await user.click(screen.getByRole('button', { name: '词谱' }));
    expect(screen.getByRole('region', { name: '暗香' })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '暗香体式' }).value).toBe(
      'an-xiang-standard',
    );
  });

  it('uses four top-level pages with a shared workspace container', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    expect(
      within(navigation)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['创作', '历史记录', '词谱', '字典']);
    expect(screen.queryByRole('group', { name: '创作视图' })).toBeNull();
    expect(
      screen
        .getByRole('heading', { name: '依谱填词', level: 1 })
        .closest('main')
        ?.classList.contains('page-workspace'),
    ).toBe(true);

    await user.click(within(navigation).getByRole('button', { name: '历史记录' }));
    expect(
      screen
        .getByRole('heading', { name: '历史记录', level: 1 })
        .closest('main')
        ?.classList.contains('page-workspace'),
    ).toBe(true);

    await user.click(within(navigation).getByRole('button', { name: '词谱' }));
    expect(
      screen
        .getByRole('heading', { name: '格律词谱', level: 1 })
        .closest('main')
        ?.classList.contains('page-workspace'),
    ).toBe(true);

    await user.click(within(navigation).getByRole('button', { name: '字典' }));
    expect(
      screen
        .getByRole('heading', { name: '音韵字典', level: 1 })
        .closest('main')
        ?.classList.contains('page-workspace'),
    ).toBe(true);
  });

  it('keeps catalog browsing separate from the creation pattern', async () => {
    const client = createClient([pattern, alternatePattern, otherPattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    const navigation = screen.getByRole('navigation', { name: '主导航' });
    await user.click(within(navigation).getByRole('button', { name: '词谱' }));
    await user.click(
      within(screen.getByLabelText('词牌列表')).getByRole('button', { name: /另一令/ }),
    );
    expect(screen.getByRole('region', { name: '另一令' })).toBeTruthy();

    await user.click(within(navigation).getByRole('button', { name: '创作' }));
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '创作词牌' }).value).toBe(
      pattern.name,
    );
    await user.selectOptions(
      screen.getByRole('combobox', { name: '创作体式' }),
      alternatePattern.id,
    );

    await user.click(within(navigation).getByRole('button', { name: '词谱' }));
    const catalogPreview = screen.getByRole('region', { name: '另一令' });
    expect(catalogPreview).toBeTruthy();
    await user.click(within(catalogPreview).getByRole('button', { name: '用此体创作' }));

    expect(screen.getByRole('heading', { name: '依谱填词', level: 1 })).toBeTruthy();
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '创作词牌' }).value).toBe(
      otherPattern.name,
    );
  });

  it('uses a dedicated bottom tab bar on the mobile platform', async () => {
    document.documentElement.dataset['platform'] = 'mobile';
    const client = createClient([pattern, alternatePattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    expect(screen.queryByRole('navigation', { name: '主导航' })).toBeNull();
    const navigation = screen.getByRole('navigation', { name: '手机端导航' });
    expect(
      within(navigation)
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['创作', '历史', '词谱', '字典']);
    expect(
      within(navigation).getByRole('button', { name: '创作' }).getAttribute('aria-current'),
    ).toBe('page');
    expect(screen.getByText('LLM 已配置')).toBeTruthy();

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上春归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('词作已完成');
    await user.click(within(navigation).getByRole('button', { name: '历史' }));

    expect(screen.getByRole('heading', { name: '历史记录', level: 1 })).toBeTruthy();
    expect(
      within(navigation).getByRole('button', { name: '历史' }).getAttribute('aria-current'),
    ).toBe('page');
    const historyPage = screen.getByRole('heading', { name: '历史记录', level: 1 }).closest('main');
    const historyList = screen.getByLabelText('生成历史列表');
    expect(screen.queryByLabelText('历史记录信息')).toBeNull();

    await user.click(
      within(historyList).getByRole('button', {
        name: /测试令·春归/,
      }),
    );

    expect(screen.queryByLabelText('生成历史列表')).toBeNull();
    expect(screen.getByLabelText('历史记录信息')).toBeTruthy();

    await user.click(within(navigation).getByRole('button', { name: '创作' }));

    const createHeading = screen.getByRole('heading', { name: '依谱填词', level: 1 });
    expect(createHeading).toBeTruthy();
    expect(createHeading.closest('main')).not.toBe(historyPage);

    await user.click(within(navigation).getByRole('button', { name: '历史' }));
    expect(screen.getByLabelText('生成历史列表')).toBeTruthy();
    expect(screen.queryByLabelText('历史记录信息')).toBeNull();

    await user.click(within(navigation).getByRole('button', { name: '词谱' }));

    const mobilePatternList = screen.getByLabelText('手机词牌列表');
    expect(screen.queryByRole('region', { name: '测试令' })).toBeNull();
    await user.click(within(mobilePatternList).getByRole('button', { name: /测试令/ }));

    expect(screen.queryByLabelText('手机词牌列表')).toBeNull();
    const mobilePatternPreview = screen.getByRole('region', { name: '测试令' });
    expect(within(mobilePatternPreview).getByRole('button', { name: '用此体创作' })).toBeTruthy();
    await user.selectOptions(
      screen.getByRole('combobox', { name: '测试令手机体式' }),
      alternatePattern.id,
    );
    expect(within(mobilePatternPreview).getByLabelText('词牌信息').textContent).toBe(
      '格二 · 3字 · 单调 · 1句 · 1韵位',
    );

    await user.click(screen.getByRole('button', { name: '全部词牌' }));
    const returnedPatternList = screen.getByLabelText('手机词牌列表');
    await user.click(within(returnedPatternList).getByRole('button', { name: /测试令/ }));
    await user.click(
      within(screen.getByRole('region', { name: '测试令' })).getByRole('button', {
        name: '用此体创作',
      }),
    );
    expect(screen.getByRole<HTMLSelectElement>('combobox', { name: '创作体式' }).value).toBe(
      alternatePattern.id,
    );
  });

  it('does not show the machine review badge for imported patterns', async () => {
    const client = createClient([pattern, alternatePattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    await user.click(screen.getByRole('button', { name: '词谱' }));

    expect(await screen.findByRole('heading', { name: '格律词谱' })).toBeTruthy();
    const fullPreview = screen.getByRole('region', { name: '测试令' });
    const patternDetail = screen.getByLabelText('词牌格律详情');
    expect(within(fullPreview).getByLabelText('词牌信息').textContent).toBe(
      '正体 · 2字 · 单调 · 1句 · 1韵位',
    );
    expect(within(fullPreview).getByRole('button', { name: '用此体创作' })).toBeTruthy();
    expect(fullPreview.closest('details')).toBeNull();
    const patternVariantSelect = within(patternDetail).getByRole('combobox', {
      name: '测试令体式',
    });
    expect(screen.getByLabelText('词牌列表').contains(patternVariantSelect)).toBe(false);
    expect(
      within(patternVariantSelect).getByRole('option', {
        name: '正体 · 2字 · 单调 · 1句 · 1韵位',
      }),
    ).toBeTruthy();
    expect(
      within(patternVariantSelect).getByRole('option', {
        name: '格二 · 3字 · 单调 · 1句 · 1韵位',
      }),
    ).toBeTruthy();
    expect(screen.queryByText('机器回查')).toBeNull();
  });

  it('loads LLM idea suggestions and fills the theme editor', async () => {
    const client = createClient();
    const nextIdeaSuggestions = [
      '秋江送别后，独立长亭看暮云渐合',
      '雪夜归家，推门见故人留下的一盏灯',
      '雨后重游旧园，在落花间想起少年约定',
    ];
    vi.mocked(runDirectIdeaSuggestions)
      .mockResolvedValueOnce(ideaSuggestions)
      .mockResolvedValueOnce(nextIdeaSuggestions);
    const user = userEvent.setup();
    render(<App client={client} />);

    const suggestion = await screen.findByRole('button', { name: ideaSuggestions[0] });
    expect(runDirectIdeaSuggestions).toHaveBeenCalledOnce();
    expect(Array.from(suggestion.textContent ?? '').length).toBeLessThanOrEqual(50);

    await user.click(suggestion);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '作品主题' }).value).toBe(
      ideaSuggestions[0],
    );

    await user.click(screen.getByRole('button', { name: '换一组' }));
    expect(await screen.findByRole('button', { name: nextIdeaSuggestions[0]! })).toBeTruthy();
    expect(runDirectIdeaSuggestions).toHaveBeenCalledTimes(2);
  });

  it('uses three random local ideas when LLM is not configured', async () => {
    window.localStorage.clear();
    window.sessionStorage.clear();
    const client = createClient();
    render(<App client={client} />);

    const ideaGroup = await screen.findByLabelText('大模型灵感推荐');
    expect(within(ideaGroup).getAllByRole('button')).toHaveLength(4);
    expect(runDirectIdeaSuggestions).not.toHaveBeenCalled();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: /开始生成/ }).disabled).toBe(true);
    expect(screen.getByText('LLM 未配置')).toBeTruthy();
  });

  it('switches between forms of the same tune and submits the selected pattern ID', async () => {
    const client = createClient([pattern, alternatePattern, otherPattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    await user.selectOptions(screen.getByRole('combobox', { name: '创作词牌' }), otherPattern.name);
    expect(screen.getByRole('heading', { name: '另一令', level: 2 })).toBeTruthy();

    await user.selectOptions(screen.getByRole('combobox', { name: '创作词牌' }), pattern.name);
    await user.selectOptions(
      screen.getByRole('combobox', { name: '创作体式' }),
      alternatePattern.id,
    );

    expect(screen.getByLabelText('词牌信息').textContent).toBe('格二 · 3字 · 单调 · 1句 · 1韵位');
    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上晚归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('词作已完成');
    const creationPreview = screen.getByLabelText('当前词牌预览');
    const generatedResult = screen
      .getByRole('heading', { name: '测试令·春归' })
      .closest('.generation-result');
    expect(creationPreview.lastElementChild).toBe(generatedResult);
    expect(runDirectGeneration).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({
        patternId: alternatePattern.id,
      }),
      alternatePattern,
      expect.any(Object),
    );
  });

  it('locks all creation inputs while a generation task is in progress', async () => {
    const client = createClient([pattern, alternatePattern]);
    const directGeneration = vi.mocked(runDirectGeneration);
    const completeGeneration = directGeneration.getMockImplementation();
    if (completeGeneration === undefined) throw new Error('Missing generation test implementation');
    let releaseGeneration = (): void => {};
    const generationGate = new Promise<void>((resolve) => {
      releaseGeneration = resolve;
    });
    directGeneration.mockImplementation(async (config, request, selectedPattern, options) => {
      options?.onProgress?.({
        phase: 'loading',
        stage: 'loading',
        message: '正在加载本地格律校验数据。',
      });
      options?.onProgress?.({
        phase: 'running',
        stage: 'drafting',
        message: '正在生成初稿',
        round: 1,
        maxRounds: request.maxRounds ?? 8,
      });
      await generationGate;
      return completeGeneration(config, request, selectedPattern, options);
    });

    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });
    const idea = await screen.findByRole<HTMLButtonElement>('button', {
      name: ideaSuggestions[0],
    });
    const theme = screen.getByRole<HTMLTextAreaElement>('textbox', { name: '作品主题' });
    await user.type(theme, '江上晚归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('正在优化');
    const generationProgress = screen.getByLabelText('生成进度');
    expect(within(generationProgress).getByText('准备')).toBeTruthy();
    expect(within(generationProgress).getByText('加载')).toBeTruthy();
    expect(within(generationProgress).getByText('创作')).toBeTruthy();
    expect(within(generationProgress).getByText('1/8')).toBeTruthy();
    expect(generationProgress.lastElementChild?.getAttribute('data-state')).toBe('active');

    const lockedControls = [
      screen.getByRole<HTMLSelectElement>('combobox', { name: '创作词牌' }),
      screen.getByRole<HTMLSelectElement>('combobox', { name: '创作体式' }),
      theme,
      screen.getByLabelText<HTMLSelectElement>('第 1 组仄声韵'),
      screen.getByRole<HTMLInputElement>('slider'),
      screen.getByLabelText<HTMLTextAreaElement>('附加要求'),
      screen.getByRole<HTMLButtonElement>('button', { name: '换一组' }),
      idea,
      screen.getByRole<HTMLButtonElement>('button', { name: /正在生成/ }),
    ];
    expect(theme.closest('form')?.getAttribute('aria-busy')).toBe('true');
    lockedControls.forEach((control) => {
      expect(control.disabled).toBe(true);
    });
    await user.click(
      screen.getByRole('button', {
        name: '生成配置：LLM 已配置',
      }),
    );
    expect(screen.getByRole('dialog', { name: 'LLM 配置' })).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>('LLM Model').disabled).toBe(true);
    expect(screen.getByText('生成进行中，当前配置暂不可修改。')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '关闭配置' }));

    releaseGeneration();
    await screen.findByText('词作已完成');
    expect(
      [...generationProgress.querySelectorAll('li')].every(
        (item) => item.getAttribute('data-state') === 'completed',
      ),
    ).toBe(true);
    expect(theme.closest('form')?.getAttribute('aria-busy')).toBe('false');
    lockedControls.forEach((control) => {
      expect(control.disabled).toBe(false);
    });
  });

  it('requires the configured LLM and generates directly in the page', async () => {
    const client = createClient();
    const directResult: GenerationResult = {
      status: 'completed',
      rounds: 1,
      draft: {
        id: 'direct-draft-1',
        patternId: pattern.id,
        theme: '江上晚归',
        version: 1,
        title: '江归',
        lines: [{ id: 'line-1', text: '春晚' }],
      },
      report: {
        passed: true,
        issues: [],
      },
    };
    vi.mocked(runDirectGeneration).mockResolvedValue(directResult);

    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    expect(screen.queryByRole('combobox', { name: '生成方式' })).toBeNull();
    await user.click(
      screen.getByRole('button', {
        name: '生成配置：LLM 已配置',
      }),
    );
    const configDialog = screen.getByRole('dialog', { name: 'LLM 配置' });
    const modelInput = within(configDialog).getByLabelText('LLM Model');
    const apiKeyInput = within(configDialog).getByLabelText('LLM API Key');
    await user.clear(modelInput);
    await user.type(modelInput, 'fast-model');
    await user.clear(apiKeyInput);
    await user.type(apiKeyInput, 'local-secret');
    expect(screen.getAllByText('LLM 已配置').length).toBeGreaterThan(0);
    await user.click(within(configDialog).getByRole('button', { name: '完成' }));

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上晚归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));

    expect(await screen.findByRole('heading', { name: '测试令·江归' })).toBeTruthy();
    expect(runDirectGeneration).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'fast-model',
        apiKey: 'local-secret',
      }),
      expect.objectContaining({
        patternId: pattern.id,
        theme: '江上晚归',
        maxRounds: 8,
      }),
      pattern,
      expect.objectContaining({
        onProgress: expect.any(Function),
      }),
    );
    expect(window.localStorage.getItem(generationHistoryStorageKey)).toContain('direct-draft-1');
  });

  it('submits theme, rhyme and optimization settings to the local workflow', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '暮春江上归舟，怀念故友');
    await user.selectOptions(screen.getByLabelText('第 1 组仄声韵'), 'cilin-17');
    await user.type(screen.getByLabelText(/附加要求/), '含蓄抒情\n避免重字');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));

    await screen.findByText('词作已完成');
    expect(runDirectGeneration).toHaveBeenNthCalledWith(
      1,
      expect.any(Object),
      {
        patternId: 'ce-shi-ling-standard',
        theme: '暮春江上归舟，怀念故友',
        maxRounds: 8,
        preferredRhymeGroup: 'cilin-17',
        additionalRequirements: ['含蓄抒情', '避免重字'],
      },
      pattern,
      expect.any(Object),
    );
    expect(screen.getByRole('heading', { name: '测试令·春归' })).toBeTruthy();
    expect(
      within(screen.getByLabelText('词作内容')).getByRole('heading', {
        name: '测试令·春归',
      }),
    ).toBeTruthy();

    const poemView = screen.getByRole('button', { name: '正文' });
    const prosodyView = screen.getByRole('button', { name: '格律标注' });
    const refinementView = screen.getByRole('button', { name: '局部修改' });
    expect(
      within(screen.getByRole('group', { name: '结果视图' }))
        .getAllByRole('button')
        .map((button) => button.textContent),
    ).toEqual(['正文', '格律标注', '局部修改']);
    expect(poemView.getAttribute('aria-pressed')).toBe('true');
    expect(refinementView.getAttribute('aria-pressed')).toBe('false');

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
    const initialVersion = screen.getByRole('group', { name: '作品版本' });
    const initialViewSwitcher = screen.getByRole('group', { name: '结果视图' });
    expect(within(initialVersion).getByText('版本 1/1')).toBeTruthy();
    expect(initialVersion.parentElement?.classList.contains('result-view-actions')).toBe(true);
    expect(initialViewSwitcher.parentElement?.tagName).toBe('HEADER');
    expect(initialVersion.parentElement).not.toBe(initialViewSwitcher.parentElement);

    await user.click(refinementView);
    expect(refinementView.getAttribute('aria-pressed')).toBe('true');
    expect(screen.queryByText('请选择要修改的内容')).toBeNull();
    expect(
      screen.queryByText(
        '选择字、词、片段或整句，填写对应意见后加入清单；可重复添加多项，再统一生成。',
      ),
    ).toBeNull();
    expect(screen.getByRole('button', { name: '整句' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“春”' }));
    expect(screen.getByRole('heading', { name: '已选“春”' })).toBeTruthy();
    const currentInstruction = screen.getByRole('textbox', { name: '当前修改意见' });
    expect(currentInstruction.tagName).toBe('INPUT');
    await user.type(currentInstruction, '改成秋日意象');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));

    await user.click(screen.getByRole('button', { name: '选择第1句第2字“晚”' }));
    expect(screen.getByRole('heading', { name: '已选“晚”' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成清冷暮色');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));

    const refinementList = screen.getByLabelText('修改清单');
    expect(within(refinementList).getByRole('textbox', { name: '第 1 项修改意见' }).tagName).toBe(
      'INPUT',
    );
    expect(within(refinementList).getByRole('textbox', { name: '第 2 项修改意见' }).tagName).toBe(
      'INPUT',
    );
    await user.click(screen.getByRole('button', { name: '根据全部意见重新生成' }));

    await screen.findByText('版本 2/2');
    expect(runDirectGeneration).toHaveBeenNthCalledWith(
      2,
      expect.any(Object),
      expect.objectContaining({
        patternId: pattern.id,
        sourceDraft: expect.objectContaining({ id: 'draft-1', version: 2 }),
        selections: [
          {
            lineId: 'line-1',
            start: 0,
            end: 1,
            instruction: '改成秋日意象',
          },
          {
            lineId: 'line-1',
            start: 1,
            end: 2,
            instruction: '改成清冷暮色',
          },
        ],
      }),
      pattern,
      expect.any(Object),
    );
    expect(poemView.getAttribute('aria-pressed')).toBe('true');
    expect(refinementView.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('textbox', { name: '当前修改意见' })).toBeNull();
    expect(screen.queryByLabelText('修改清单')).toBeNull();
    expect(screen.getByTitle('查询“秋”')).toBeTruthy();
    const currentVersion = screen.getByRole('group', { name: '作品版本' });
    expect(within(currentVersion).getByText('版本 2/2')).toBeTruthy();
    const currentViewSwitcher = screen.getByRole('group', { name: '结果视图' });
    expect(currentVersion.parentElement?.classList.contains('result-view-actions')).toBe(true);
    expect(currentViewSwitcher.parentElement?.tagName).toBe('HEADER');
    expect(currentVersion.parentElement).not.toBe(currentViewSwitcher.parentElement);
    expect(currentVersion.closest('footer')).toBeNull();

    await user.click(screen.getByRole('button', { name: '格律标注' }));
    await user.click(screen.getByRole('button', { name: '上一版本' }));
    expect(screen.getByText('版本 1/2')).toBeTruthy();
    expect(screen.getByRole('button', { name: '格律标注' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByLabelText('平仄韵脚标注')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '下一版本' }));
    expect(screen.getByText('版本 2/2')).toBeTruthy();
    expect(screen.getByLabelText('平仄韵脚标注')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '正文' }));
    expect(screen.getByTitle('查询“秋”')).toBeTruthy();

    expect(window.localStorage.getItem(generationHistoryStorageKey)).toContain('draft-2');
    await user.click(screen.getByRole('button', { name: /历史记录/ }));
    expect(await screen.findByLabelText('生成历史列表')).toBeTruthy();
    expect(screen.getByLabelText('历史记录总数').textContent).toBe('共 1 条记录');
    expect(screen.getByRole('heading', { name: '测试令·春归' })).toBeTruthy();
    const historyOverview = screen.getByLabelText('历史记录信息');
    const patternIdentity = within(historyOverview).getByLabelText('词牌信息');
    expect(within(patternIdentity).getByRole('heading', { name: '测试令' })).toBeTruthy();
    expect(within(patternIdentity).getByText('正体 · 2 字 · 单调 · 1 句 · 1 韵位')).toBeTruthy();
    const rhymeSettings = within(patternIdentity).getByLabelText('韵脚设置');
    expect(within(rhymeSettings).getByText(/第 1 组仄声韵 · 第十七部 · 四质/)).toBeTruthy();
    const themeCard = within(historyOverview).getByLabelText('创作主题');
    expect(within(themeCard).getByText('暮春江上归舟，怀念故友')).toBeTruthy();
    const historySettings = screen.getByLabelText('历史生成设置');
    expect(within(historySettings).getByText('优化轮数')).toBeTruthy();
    expect(within(historySettings).getByText('8 轮')).toBeTruthy();
    expect(within(historySettings).getByText('附加要求')).toBeTruthy();
    expect(within(historySettings).getByText('含蓄抒情；避免重字')).toBeTruthy();
    expect(within(historyOverview).queryByText('生成时间')).toBeNull();
    expect(within(historySettings).queryByText('会话 ID')).toBeNull();
    await user.click(within(patternIdentity).getByRole('button', { name: '预览《测试令》词谱' }));
    expect(within(historyOverview).getByLabelText('格律内容')).toBeTruthy();
    const historyList = screen.getByLabelText('生成历史列表');
    expect(within(historyList).getByText('2 个版本')).toBeTruthy();
    expect(screen.getByText('版本 2/2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '局部修改' }));
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“秋”' }));
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成雪夜独行的意象');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));
    await user.click(screen.getByRole('button', { name: '根据全部意见重新生成' }));

    expect(await screen.findByText('版本 3/3')).toBeTruthy();
    const historyRefinementView = screen.getByRole('button', { name: '局部修改' });
    expect(screen.getByRole('button', { name: '正文' }).getAttribute('aria-pressed')).toBe('true');
    expect(historyRefinementView.getAttribute('aria-pressed')).toBe('false');
    expect(screen.queryByRole('textbox', { name: '当前修改意见' })).toBeNull();
    expect(screen.queryByLabelText('修改清单')).toBeNull();
    expect(screen.getByTitle('查询“雪”')).toBeTruthy();
    expect(runDirectGeneration).toHaveBeenLastCalledWith(
      expect.any(Object),
      expect.objectContaining({
        patternId: pattern.id,
        sourceDraft: expect.objectContaining({ id: 'draft-2', version: 3 }),
        maxRounds: 8,
        preferredRhymeGroup: 'cilin-17',
        additionalRequirements: ['含蓄抒情', '避免重字'],
        selections: [
          {
            lineId: 'line-1',
            start: 0,
            end: 1,
            instruction: '改成雪夜独行的意象',
          },
        ],
      }),
      pattern,
      expect.any(Object),
    );
    expect(within(historyList).getByText('3 个版本')).toBeTruthy();

    await user.click(historyRefinementView);
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“雪”' }));
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '未提交的临时意见');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));
    expect(screen.getByLabelText('修改清单')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '上一版本' }));
    expect(screen.getByText('版本 2/3')).toBeTruthy();
    expect(historyRefinementView.getAttribute('aria-pressed')).toBe('true');
    await waitFor(() => {
      expect(screen.getByRole<HTMLInputElement>('textbox', { name: '当前修改意见' }).value).toBe(
        '',
      );
      expect(screen.queryByLabelText('修改清单')).toBeNull();
    });
    expect(
      screen.getByRole('button', {
        name: '选择第1句第1字“秋”',
      }),
    ).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '上一版本' }));
    expect(screen.getByText('版本 1/3')).toBeTruthy();
    expect(historyRefinementView.getAttribute('aria-pressed')).toBe('true');
    expect(
      screen.getByRole('button', {
        name: '选择第1句第1字“春”',
      }),
    ).toBeTruthy();

    const historySearch = screen.getByRole('searchbox', { name: '搜索历史结果' });
    await user.type(historySearch, '不存在的主题');
    expect(screen.getByText('没有匹配的历史记录。')).toBeTruthy();
    await user.clear(historySearch);
    await user.type(historySearch, '暮春江上');
    expect(
      within(screen.getByLabelText('生成历史列表')).getAllByRole('button', {
        name: /测试令·春归.*暮春江上/,
      }),
    ).toHaveLength(1);
  });

  it('marks stanzas in the annotated result view for double-stanza patterns', async () => {
    document.documentElement.dataset['platform'] = 'mobile';
    const client = createClient([doubleStanzaPattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '双调令', level: 2 });

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上春归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('词作已完成');

    const poemResult = screen.getByLabelText('词作正文');
    expect(within(poemResult).getByRole('region', { name: '上阕' })).toBeTruthy();
    expect(within(poemResult).getByRole('region', { name: '下阕' })).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '格律标注' }));

    const annotatedResult = screen.getByLabelText('平仄韵脚标注');
    const upperStanza = within(annotatedResult).getByRole('region', { name: '上阕' });
    const lowerStanza = within(annotatedResult).getByRole('region', { name: '下阕' });
    expect(within(upperStanza).getByText('上阕')).toBeTruthy();
    expect(within(lowerStanza).getByText('下阕')).toBeTruthy();
    expect(upperStanza.querySelectorAll('.annotated-line')).toHaveLength(1);
    expect(lowerStanza.querySelectorAll('.annotated-line')).toHaveLength(1);
  });

  it('opens the dictionary by selecting a character in the example poem', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    await user.click(screen.getByRole('heading', { name: '测试令', level: 2 }).closest('summary')!);
    await user.click(screen.getByTitle('平声位'));

    await screen.findByLabelText('单字查询');
    await waitFor(() => {
      expect(client.getCharacterPronunciations).toHaveBeenCalledWith('春');
    });
    expect(await screen.findByText('chūn')).toBeTruthy();
  });
});

function createClient(patterns: ReadonlyArray<CiPattern> = [pattern]) {
  let refinementSequence = 0;
  vi.mocked(runDirectGeneration).mockImplementation(
    async (_config, request, selectedPattern, options) => {
      const refining = request.sourceDraft !== undefined;
      if (refining) refinementSequence += 1;
      options?.onProgress?.({
        phase: 'running',
        stage: 'drafting',
        message: refining ? '正在按修改意见调整' : '正在生成初稿',
        round: 1,
        maxRounds: request.maxRounds ?? 8,
      });
      const draftLines = selectedPattern.sections
        .flatMap((section) => section.lines)
        .map((_, index) => ({
          id: `line-${index + 1}`,
          text:
            index === 0
              ? refinementSequence === 1
                ? '秋晚'
                : refinementSequence === 2
                  ? '雪晚'
                  : '春晚'
              : '江归',
        }));
      return {
        status: 'completed',
        rounds: 2,
        draft: {
          id: refining ? `draft-${refinementSequence + 1}` : 'draft-1',
          patternId: request.patternId,
          theme: request.theme,
          version: request.sourceDraft === undefined ? 2 : request.sourceDraft.version + 1,
          title: '春归',
          lines: draftLines,
        },
        report: {
          passed: refining,
          issues: [],
        },
      };
    },
  );
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
    getCilinRhymeGroup: vi.fn(async () => groupDetail),
    getCharacterPronunciations,
  };
  return client;
}

function createTestStorage(): Storage {
  const values = new Map<string, string>();
  return {
    get length() {
      return values.size;
    },
    clear(): void {
      values.clear();
    },
    getItem(key: string): string | null {
      return values.get(key) ?? null;
    },
    key(index: number): string | null {
      return [...values.keys()][index] ?? null;
    },
    removeItem(key: string): void {
      values.delete(key);
    },
    setItem(key: string, value: string): void {
      values.set(key, value);
    },
  };
}
