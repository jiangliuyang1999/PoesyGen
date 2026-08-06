// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import type {
  CharacterPronunciationResponse,
  CiPattern,
  RhymeGroupDetail,
  RhymeGroupSummary,
  GenerationSessionStatusResponse,
} from '@poesygen/client-sdk';

import { App, type AppClient } from './App.js';
import { splitGraphemes } from './DictionaryWorkspace.js';
import { generationHistoryStorageKey } from './generation-history.js';

const pattern: CiPattern = {
  id: 'test-standard',
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
  id: 'test-variant-02',
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
  id: 'other-standard',
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
  Object.defineProperty(window, 'localStorage', {
    configurable: true,
    value: createTestStorage(),
  });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  delete document.documentElement.dataset['platform'];
});

describe('web creation workspace', () => {
  it('keeps variation sequences in a single dictionary glyph', () => {
    expect(splitGraphemes(`东\uFE00风`)).toEqual([`东\uFE00`, '风']);
  });

  it('retries initial data loading while the API is starting', async () => {
    const client = createClient();
    vi.mocked(client.listPatterns).mockRejectedValueOnce(new TypeError('fetch failed'));

    render(<App client={client} />);

    expect(await screen.findByRole('heading', { name: '测试令', level: 2 })).toBeTruthy();
    expect(client.listPatterns).toHaveBeenCalledTimes(2);
    expect(screen.getByText('生成服务就绪')).toBeTruthy();
  });

  it('groups creation inputs and toggles the embedded prosody preview', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    const patternPanel = screen.getByLabelText('词谱选择与格律预览');
    const tuneSelect = within(patternPanel).getByRole('combobox', { name: '创作词牌' });
    const variantSelect = within(patternPanel).getByRole('combobox', { name: '创作体式' });
    expect(tuneSelect).toBeTruthy();
    expect(
      within(variantSelect).getByRole('option', {
        name: '正体 · 2字 · 单调 · 1句 · 1韵位',
      }),
    ).toBeTruthy();
    const patternControls = tuneSelect.closest('.selected-pattern-controls');
    const patternHeading = within(patternPanel).getByRole('heading', {
      name: '测试令',
      level: 2,
    });
    expect(patternHeading.textContent).toBe('测试令');
    expect(within(patternPanel).getByLabelText('词牌信息').textContent).toBe(
      '正体 · 2字 · 单调 · 1句 · 1韵位',
    );
    expect(within(patternPanel).queryByText('格律预览')).toBeNull();

    const previewSummary = patternHeading.closest('summary');
    const previewDetails = previewSummary?.closest('details');
    const currentPatternLabel = within(patternPanel).getByText('当前词牌');
    expect(patternControls?.parentElement?.nextElementSibling).toBe(previewDetails?.parentElement);
    expect(currentPatternLabel.nextElementSibling).toBe(previewDetails);
    expect(previewDetails?.open).toBe(false);
    await user.click(previewSummary!);
    expect(previewDetails?.open).toBe(true);
    expect(within(previewDetails!).getByLabelText('格律内容')).toBeTruthy();
    expect(within(previewDetails!).getByTitle('平声位')).toBeTruthy();
    expect(within(previewDetails!).queryByRole('button', { name: '用此体创作' })).toBeNull();
    await user.click(previewSummary!);
    expect(previewDetails?.open).toBe(false);

    const inputPanel = screen.getByLabelText('创作主题与生成设置');
    expect(within(inputPanel).getByRole('textbox', { name: '作品主题' })).toBeTruthy();
    expect(within(inputPanel).getByRole('heading', { name: '创作主题' })).toBeTruthy();
    expect(within(inputPanel).getByRole('heading', { name: '生成设置' })).toBeTruthy();
    expect(within(inputPanel).queryByText('写下想表达的内容')).toBeNull();
    expect(within(inputPanel).queryByText('约束与优化')).toBeNull();
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
    expect(screen.getByText('服务就绪')).toBeTruthy();

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
    expect(screen.getByLabelText('手机词牌列表')).toBeTruthy();
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
    const user = userEvent.setup();
    render(<App client={client} />);

    const suggestion = await screen.findByRole('button', { name: ideaSuggestions[0] });
    expect(client.suggestCreationIdeas).toHaveBeenCalledWith();
    expect(Array.from(suggestion.textContent ?? '').length).toBeLessThanOrEqual(50);

    await user.click(suggestion);
    expect(screen.getByRole<HTMLTextAreaElement>('textbox', { name: '作品主题' }).value).toBe(
      ideaSuggestions[0],
    );

    await user.click(screen.getByRole('button', { name: '换一组' }));
    await waitFor(() => {
      expect(client.suggestCreationIdeas).toHaveBeenCalledTimes(2);
    });
  });

  it('switches between forms of the same tune and submits the selected pattern ID', async () => {
    const client = createClient([pattern, alternatePattern, otherPattern]);
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });
    await waitFor(() => {
      expect(client.suggestCreationIdeas).toHaveBeenCalledTimes(1);
    });

    await user.selectOptions(screen.getByRole('combobox', { name: '创作词牌' }), otherPattern.name);
    expect(screen.getByRole('heading', { name: '另一令', level: 2 })).toBeTruthy();

    await user.selectOptions(screen.getByRole('combobox', { name: '创作词牌' }), pattern.name);
    await user.selectOptions(
      screen.getByRole('combobox', { name: '创作体式' }),
      alternatePattern.id,
    );

    expect(screen.getByLabelText('词牌信息').textContent).toBe('格二 · 3字 · 单调 · 1句 · 1韵位');
    expect(client.suggestCreationIdeas).toHaveBeenCalledTimes(1);
    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '江上晚归');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));
    await screen.findByText('词作已完成');
    expect(client.createGenerationSession).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: alternatePattern.id,
      }),
    );
  });

  it('submits theme, rhyme and optimization settings through the shared client', async () => {
    const client = createClient();
    const user = userEvent.setup();
    render(<App client={client} />);
    await screen.findByRole('heading', { name: '测试令', level: 2 });

    await user.type(screen.getByRole('textbox', { name: '作品主题' }), '暮春江上归舟，怀念故友');
    await user.selectOptions(screen.getByLabelText('第 1 组仄声韵'), 'cilin-17');
    await user.type(screen.getByLabelText(/附加要求/), '含蓄抒情\n避免重字');
    await user.click(screen.getByRole('button', { name: /开始生成/ }));

    await screen.findByText('词作已完成');
    expect(client.createGenerationSession).toHaveBeenCalledWith({
      patternId: 'test-standard',
      theme: '暮春江上归舟，怀念故友',
      maxRounds: 8,
      preferredRhymeGroup: 'cilin-17',
      additionalRequirements: ['含蓄抒情', '避免重字'],
    });
    expect(screen.getByText('会话 session-1')).toBeTruthy();
    expect(screen.getByText('任务 job-1')).toBeTruthy();
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
    expect(screen.getByRole('button', { name: '整句' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“春”' }));
    expect(screen.getByRole('heading', { name: '已选“春”' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成秋日意象');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));

    await user.click(screen.getByRole('button', { name: '选择第1句第2字“晚”' }));
    expect(screen.getByRole('heading', { name: '已选“晚”' })).toBeTruthy();
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成清冷暮色');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));

    const refinementList = screen.getByLabelText('修改清单');
    expect(within(refinementList).getByRole('textbox', { name: '第 1 项修改意见' })).toBeTruthy();
    expect(within(refinementList).getByRole('textbox', { name: '第 2 项修改意见' })).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '根据全部意见重新生成' }));

    await screen.findByText('新版本已按意见修改并通过格律校验。');
    expect(client.createRefinementSession).toHaveBeenCalledWith(
      expect.objectContaining({
        patternId: pattern.id,
        draft: expect.objectContaining({ id: 'draft-1', version: 2 }),
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
    );
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

    expect(window.localStorage.getItem(generationHistoryStorageKey)).toContain('session-1');
    await user.click(screen.getByRole('button', { name: /历史记录/ }));
    expect(await screen.findByLabelText('生成历史列表')).toBeTruthy();
    expect(screen.getByLabelText('历史记录总数').textContent).toBe('共 1 条记录');
    expect(screen.getByRole('heading', { name: '测试令·春归' })).toBeTruthy();
    const historyOverview = screen.getByLabelText('历史记录信息');
    const patternIdentity = within(historyOverview).getByLabelText('词牌信息');
    expect(within(patternIdentity).getByRole('heading', { name: '测试令' })).toBeTruthy();
    expect(within(patternIdentity).getByText('正体 · 2 字 · 1 句 · 单调')).toBeTruthy();
    const creativeBrief = within(historyOverview).getByLabelText('创作重点');
    expect(within(creativeBrief).getByText('暮春江上归舟，怀念故友')).toBeTruthy();
    expect(within(creativeBrief).getByText('含蓄抒情；避免重字')).toBeTruthy();
    const historySettings = screen.getByLabelText('历史生成设置');
    expect(within(historySettings).getByText('最大优化轮数')).toBeTruthy();
    expect(within(historySettings).getByText('8')).toBeTruthy();
    expect(within(historySettings).getByText('轮')).toBeTruthy();
    expect(within(historySettings).getByText('第 1 组仄声韵')).toBeTruthy();
    expect(within(historySettings).getByText('第十七部 · 四质')).toBeTruthy();
    expect(within(historySettings).getByText('生成时间')).toBeTruthy();
    expect(within(historySettings).getByText('会话 ID')).toBeTruthy();
    expect(within(historySettings).getByText('session-1')).toBeTruthy();
    const historyList = screen.getByLabelText('生成历史列表');
    expect(within(historyList).getByText('2 个版本')).toBeTruthy();
    expect(screen.getByText('版本 2/2')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '局部修改' }));
    await user.click(screen.getByRole('button', { name: '选择第1句第1字“秋”' }));
    await user.type(screen.getByRole('textbox', { name: '当前修改意见' }), '改成雪夜独行的意象');
    await user.click(screen.getByRole('button', { name: '加入修改清单' }));
    await user.click(screen.getByRole('button', { name: '根据全部意见重新生成' }));

    expect(await screen.findByText('版本 3/3')).toBeTruthy();
    expect(screen.getByTitle('查询“雪”')).toBeTruthy();
    expect(client.createRefinementSession).toHaveBeenLastCalledWith(
      expect.objectContaining({
        patternId: pattern.id,
        draft: expect.objectContaining({ id: 'draft-2', version: 3 }),
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
    );
    expect(within(historyList).getByText('3 个版本')).toBeTruthy();

    await user.click(screen.getByRole('button', { name: '上一版本' }));
    expect(screen.getByText('版本 2/3')).toBeTruthy();
    expect(screen.getByTitle('查询“秋”')).toBeTruthy();
    await user.click(screen.getByRole('button', { name: '上一版本' }));
    expect(screen.getByText('版本 1/3')).toBeTruthy();
    expect(screen.getByTitle('查询“春”')).toBeTruthy();

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
  let requestedPatternId = patterns[0]?.id ?? pattern.id;
  let refinementSequence = 0;
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
    getGenerationHealth: vi.fn(async () => ({
      available: true,
      redis: 'ok' as const,
      workers: 1,
    })),
    suggestCreationIdeas: vi.fn(async () => ({ suggestions: ideaSuggestions })),
    getCilinRhymeGroup: vi.fn(async () => groupDetail),
    getCharacterPronunciations,
    createGenerationSession: vi.fn(
      async (request: Parameters<AppClient['createGenerationSession']>[0]) => {
        requestedPatternId = request.patternId;
        return {
          id: 'session-1',
          jobId: 'job-1',
          status: 'queued' as const,
        };
      },
    ),
    createRefinementSession: vi.fn(
      async (request: Parameters<AppClient['createRefinementSession']>[0]) => {
        requestedPatternId = request.patternId;
        refinementSequence += 1;
        return {
          id: `refinement-${refinementSequence}`,
          jobId: `refinement-job-${refinementSequence}`,
          status: 'queued' as const,
        };
      },
    ),
    waitForGenerationSession: vi.fn(
      async (sessionId, options): Promise<GenerationSessionStatusResponse> => {
        const refinementNumber = sessionId.startsWith('refinement-')
          ? Number(sessionId.slice('refinement-'.length))
          : undefined;
        const refining = refinementNumber !== undefined;
        const jobId = refining ? `refinement-job-${refinementNumber}` : 'job-1';
        options?.onUpdate?.({
          id: sessionId,
          jobId,
          status: 'running',
          progress: {
            phase: refining ? 'refining' : 'generating',
            message: refining ? '正在按修改意见调整' : '正在生成初稿',
          },
        });
        const selectedPattern = patterns.find(({ id }) => id === requestedPatternId) ?? pattern;
        const draftLines = selectedPattern.sections
          .flatMap((section) => section.lines)
          .map((_, index) => ({
            id: `line-${index + 1}`,
            text:
              index === 0
                ? refinementNumber === 1
                  ? '秋晚'
                  : refinementNumber === 2
                    ? '雪晚'
                    : '春晚'
                : '江归',
          }));
        return {
          id: sessionId,
          jobId,
          status: 'completed',
          progress: 100,
          result: {
            sessionId: 'session-1',
            status: 'completed',
            rounds: 2,
            draft: {
              id: refining ? `draft-${refinementNumber + 1}` : 'draft-1',
              patternId: requestedPatternId,
              theme: '暮春江上归舟，怀念故友',
              version: refining ? refinementNumber + 2 : 2,
              title: '春归',
              lines: draftLines,
            },
            report: {
              passed: refining,
              issues: [],
            },
          },
        };
      },
    ),
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
