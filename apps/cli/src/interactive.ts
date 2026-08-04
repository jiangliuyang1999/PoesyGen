import { confirm, input, number, select } from '@inquirer/prompts';

import type { CiPattern, PoesyGenClient, RhymeGroupSummary } from '@poesygen/client-sdk';

import { formatPatternSummary, patternRhymeLabels } from './format.js';

type GenerationRequest = Parameters<PoesyGenClient['createGenerationSession']>[0];

export type MainAction = 'generate' | 'pattern' | 'rhymes' | 'character' | 'health' | 'exit';

export interface GenerationDefaults {
  readonly patternId?: string;
  readonly theme?: string;
  readonly preferredRhymeGroup?: string;
  readonly maxRounds?: number;
}

export async function promptMainAction(): Promise<MainAction> {
  return select<MainAction>({
    message: '请选择操作',
    pageSize: 8,
    choices: [
      { name: '创作一首词', value: 'generate', description: '选择词牌、韵部和主题' },
      { name: '查看词牌', value: 'pattern', description: '浏览句式、平仄和例词' },
      { name: '浏览词林正韵', value: 'rhymes', description: '查看十九部韵字' },
      { name: '查询单字', value: 'character', description: '查看普通话、反切和古韵' },
      { name: '检查服务', value: 'health', description: '确认 API 是否可用' },
      { name: '退出', value: 'exit' },
    ],
  });
}

export async function promptPattern(
  patterns: ReadonlyArray<CiPattern>,
  message = '选择词牌',
): Promise<CiPattern> {
  const patternId = await select({
    message,
    pageSize: 12,
    loop: false,
    choices: patterns.map((pattern) => ({
      name: formatPatternSummary(pattern),
      value: pattern.id,
      ...(pattern.example === undefined ? {} : { description: `例词：${pattern.example.author}` }),
    })),
  });
  const pattern = patterns.find(({ id }) => id === patternId);
  if (pattern === undefined) throw new Error(`未找到词牌 ${patternId}`);
  return pattern;
}

export async function promptRhymeGroup(
  groups: ReadonlyArray<RhymeGroupSummary>,
): Promise<RhymeGroupSummary> {
  const groupId = await select({
    message: '选择韵部',
    pageSize: 12,
    loop: false,
    choices: groups.map((group) => ({
      name: `${group.name}（${group.id}）`,
      value: group.id,
      description: group.sections
        .map(({ name, tone }) => `${name}${tone === 'level' ? '平' : '仄'}`)
        .join('、'),
    })),
  });
  const group = groups.find(({ id }) => id === groupId);
  if (group === undefined) throw new Error(`未找到韵部 ${groupId}`);
  return group;
}

export async function promptCharacter(): Promise<string> {
  return input({
    message: '输入一个汉字',
    validate: (value) => Array.from(value.trim()).length === 1 || '请输入一个汉字',
    transformer: (value) => value.trim(),
  });
}

export async function promptGenerationRequest(
  patterns: ReadonlyArray<CiPattern>,
  rhymeGroups: ReadonlyArray<RhymeGroupSummary>,
  defaults: GenerationDefaults = {},
): Promise<GenerationRequest | undefined> {
  const pattern =
    patterns.find(({ id }) => id === defaults.patternId) ??
    (await promptPattern(patterns, '选择本次创作的词牌'));
  const theme =
    defaults.theme ??
    (await input({
      message: '描述作品主题',
      validate: (value) => value.trim().length > 0 || '主题不能为空',
      transformer: (value) => value.trim(),
    }));
  const maxRounds =
    defaults.maxRounds ??
    (await number({
      message: '最大优化轮数',
      default: 8,
      min: 1,
      max: 20,
      required: true,
    }));

  const rhymeLabels = patternRhymeLabels(pattern);
  const shouldChooseRhyme =
    defaults.preferredRhymeGroup !== undefined ||
    (await confirm({
      message: '是否指定《词林正韵》韵部？',
      default: false,
    }));
  const assignedRhymes: Record<string, string> = {};

  if (defaults.preferredRhymeGroup !== undefined && rhymeLabels[0] !== undefined) {
    assignedRhymes[rhymeLabels[0].id] = defaults.preferredRhymeGroup;
  } else if (shouldChooseRhyme) {
    for (const [index, label] of rhymeLabels.entries()) {
      const compatibleGroups = rhymeGroups.filter(
        (group) =>
          label.tone === 'either' || group.sections.some((section) => section.tone === label.tone),
      );
      const groupId = await select({
        message:
          rhymeLabels.length === 1
            ? '选择韵部'
            : `选择第 ${index + 1} 组${label.tone === 'level' ? '平' : label.tone === 'oblique' ? '仄' : ''}韵`,
        pageSize: 12,
        loop: false,
        choices: compatibleGroups.map((group) => ({
          name: `${group.name}（${group.id}）`,
          value: group.id,
          description: group.sections.map(({ name }) => name).join('、'),
        })),
      });
      assignedRhymes[label.id] = groupId;
    }
  }

  const requirementsText = await input({
    message: '附加要求（可留空，多条用分号分隔）',
  });
  const additionalRequirements = requirementsText
    .split(/[；;\n]/u)
    .map((requirement) => requirement.trim())
    .filter(Boolean);
  const request: GenerationRequest = {
    patternId: pattern.id,
    theme: theme.trim(),
    maxRounds,
    ...(Object.keys(assignedRhymes).length === 0
      ? {}
      : {
          preferredRhymeGroup:
            rhymeLabels.length === 1 ? assignedRhymes[rhymeLabels[0]!.id] : assignedRhymes,
        }),
    ...(additionalRequirements.length === 0 ? {} : { additionalRequirements }),
  };
  const shouldSubmit = await confirm({
    message: `提交《${pattern.name}》生成任务？`,
    default: true,
  });

  return shouldSubmit ? request : undefined;
}
