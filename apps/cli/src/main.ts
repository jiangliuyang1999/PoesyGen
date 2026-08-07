#!/usr/bin/env node

import { Command, Option } from 'commander';

import type { CiPattern, GenerationRequest } from '@poesygen/domain';
import type { GenerationWorkflowProgress } from '@poesygen/workflow';

import { isSingleHanCharacter } from './character.js';
import { loadLocalEnvironment } from './environment.js';
import {
  formatCharacter,
  formatGenerationResult,
  formatPattern,
  formatPatternSummary,
  formatRhymeGroup,
  formatRhymeGroupSummary,
} from './format.js';
import { loadCliLlmConfig, runLocalGeneration } from './generation.js';
import {
  promptCharacter,
  promptGenerationRequest,
  promptMainAction,
  promptMissingLlmEnvironment,
  promptPattern,
  promptRhymeGroup,
} from './interactive.js';
import {
  getLocalCharacterPronunciations,
  getLocalRhymeGroup,
  listLocalPatterns,
  listLocalRhymeGroups,
  type RhymeGroupSummary,
} from './local-catalog.js';

loadLocalEnvironment();

interface RootOptions {
  readonly interactive: boolean;
  readonly json: boolean;
}

interface GenerateOptions {
  readonly pattern?: string;
  readonly theme?: string;
  readonly rhyme?: string;
  readonly maxRounds: number;
  readonly requirement: ReadonlyArray<string>;
}

const program = new Command();

program
  .name('poesygen')
  .description('在本地生成、校验和微调词作')
  .version('0.1.0')
  .option('-i, --interactive', '强制进入交互模式', false)
  .option('--json', '输出机器可读 JSON', false)
  .action(async () => {
    if (!isInteractiveTerminal()) {
      program.outputHelp();
      return;
    }
    await runInteractiveMenu();
  });

program
  .command('patterns')
  .description('列出可用词牌')
  .action(async () => {
    const patterns = await listLocalPatterns();
    print(patterns, patterns.map(formatPatternSummary).join('\n'));
  });

program
  .command('pattern [id]')
  .description('查看词牌格律和例词')
  .action(async (id?: string) => {
    const patterns = await listLocalPatterns();
    const pattern = await resolvePattern(patterns, id);
    print(pattern, formatPattern(pattern));
  });

program
  .command('rhymes')
  .description('列出《词林正韵》十九部')
  .action(async () => {
    const groups = await listLocalRhymeGroups();
    print(groups, groups.map(formatRhymeGroupSummary).join('\n'));
  });

program
  .command('rhyme [id]')
  .description('查看一个韵部的全部韵字')
  .action(async (id?: string) => {
    const groups = await listLocalRhymeGroups();
    const groupId = id ?? (await resolveRhymeGroup(groups)).id;
    const group = await getLocalRhymeGroup(groupId);
    if (group === undefined) throw new Error(`未找到韵部：${groupId}`);
    print(group, formatRhymeGroup(group));
  });

program
  .command('character [value]')
  .alias('char')
  .description('查询单字的普通话、反切、唐音和平仄韵部')
  .action(async (value?: string) => {
    const character = value ?? (await requireInteractive(promptCharacter));
    if (!isSingleHanCharacter(character)) {
      throw new Error('character 命令需要且只接受一个汉字');
    }
    const result = await getLocalCharacterPronunciations(character.trim());
    if (result === undefined) throw new Error(`未收录汉字：${character.trim()}`);
    print(result, formatCharacter(result));
  });

program
  .command('generate')
  .alias('create')
  .description('直接调用已配置的 LLM；不传参数时进入交互引导')
  .option('-p, --pattern <id>', '词牌 ID 或名称')
  .option('-t, --theme <text>', '作品主题')
  .option('-r, --rhyme <group>', '指定韵部')
  .addOption(new Option('--max-rounds <count>', '最大优化轮数').default(8).argParser(parseRounds))
  .option(
    '--requirement <text>',
    '附加要求，可重复传入',
    (value: string, previous: ReadonlyArray<string>) => [...previous, value],
    [],
  )
  .action(async (options: GenerateOptions) => {
    const interactive = isInteractiveTerminal();
    if (interactive) {
      await promptMissingLlmEnvironment();
    }

    const patterns = await listLocalPatterns();
    const hasRequiredOptions = options.pattern !== undefined && options.theme !== undefined;
    if (!hasRequiredOptions && !interactive) {
      throw new Error('非交互环境必须同时提供 --pattern 和 --theme');
    }

    const request = hasRequiredOptions
      ? createRequest(await resolvePattern(patterns, options.pattern), options.theme!, options)
      : await buildInteractiveRequest({
          ...(options.pattern === undefined
            ? {}
            : { patternId: (await resolvePattern(patterns, options.pattern)).id }),
          ...(options.theme === undefined ? {} : { theme: options.theme }),
          ...(options.rhyme === undefined ? {} : { preferredRhymeGroup: options.rhyme }),
          maxRounds: options.maxRounds,
        });
    if (request === undefined) {
      process.stdout.write('已取消。\n');
      return;
    }

    const pattern = patterns.find(({ id }) => id === request.patternId);
    if (pattern === undefined) throw new Error(`未找到词牌：${request.patternId}`);
    await generateAndPrint(request, pattern);
  });

try {
  const argumentsToParse =
    process.argv[2] === '--'
      ? [...process.argv.slice(0, 2), ...process.argv.slice(3)]
      : process.argv;
  await program.parseAsync(argumentsToParse);
} catch (error) {
  if (isExitPromptError(error)) {
    process.stdout.write('\n已退出。\n');
  } else {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}

async function runInteractiveMenu(): Promise<void> {
  process.stdout.write('PoesyGen 格律诗词作\n\n');
  let patterns: ReadonlyArray<CiPattern> | undefined;
  let groups: ReadonlyArray<RhymeGroupSummary> | undefined;

  for (;;) {
    const action = await promptMainAction();
    process.stdout.write('\n');
    if (action === 'exit') return;

    if (action === 'pattern') {
      patterns ??= await listLocalPatterns();
      process.stdout.write(`${formatPattern(await promptPattern(patterns))}\n\n`);
      continue;
    }
    if (action === 'rhymes') {
      groups ??= await listLocalRhymeGroups();
      const group = await promptRhymeGroup(groups);
      const detail = await getLocalRhymeGroup(group.id);
      if (detail === undefined) throw new Error(`未找到韵部：${group.id}`);
      process.stdout.write(`${formatRhymeGroup(detail)}\n\n`);
      continue;
    }
    if (action === 'character') {
      const character = await promptCharacter();
      const result = await getLocalCharacterPronunciations(character.trim());
      if (result === undefined) throw new Error(`未收录汉字：${character.trim()}`);
      process.stdout.write(`${formatCharacter(result)}\n\n`);
      continue;
    }

    await promptMissingLlmEnvironment();
    patterns ??= await listLocalPatterns();
    groups ??= await listLocalRhymeGroups();
    const request = await promptGenerationRequest(patterns, groups);
    if (request === undefined) {
      process.stdout.write('已取消。\n\n');
      continue;
    }
    const pattern = patterns.find(({ id }) => id === request.patternId);
    if (pattern === undefined) throw new Error(`未找到词牌：${request.patternId}`);
    await generateAndPrint(request, pattern);
    process.stdout.write('\n');
  }
}

async function generateAndPrint(request: GenerationRequest, pattern: CiPattern): Promise<void> {
  loadCliLlmConfig();
  const jsonOutput = program.opts<RootOptions>().json;
  if (!jsonOutput) process.stdout.write('[准备] 已加载词谱与格律数据\n');
  const result = await runLocalGeneration(request, pattern, {
    onProgress(progress) {
      if (!jsonOutput) process.stdout.write(`${formatGenerationProgress(progress)}\n`);
    },
  });
  print(result, formatGenerationResult(result, pattern));
}

function createRequest(
  pattern: CiPattern,
  theme: string,
  options: GenerateOptions,
): GenerationRequest {
  const normalizedTheme = theme.trim();
  if (normalizedTheme === '') throw new Error('作品主题不能为空');
  return {
    patternId: pattern.id,
    theme: normalizedTheme,
    maxRounds: options.maxRounds,
    ...(options.rhyme === undefined ? {} : { preferredRhymeGroup: options.rhyme }),
    ...(options.requirement.length === 0
      ? {}
      : { additionalRequirements: [...options.requirement] }),
  };
}

async function resolvePattern(
  patterns: ReadonlyArray<CiPattern>,
  id: string | undefined,
): Promise<CiPattern> {
  if (id === undefined) return requireInteractive(() => promptPattern(patterns));
  const pattern = patterns.find(({ id: patternId, name }) => patternId === id || name === id);
  if (pattern === undefined) throw new Error(`未找到词牌：${id}`);
  return pattern;
}

async function resolveRhymeGroup(
  groups: ReadonlyArray<RhymeGroupSummary>,
): Promise<RhymeGroupSummary> {
  return requireInteractive(() => promptRhymeGroup(groups));
}

async function buildInteractiveRequest(defaults: Parameters<typeof promptGenerationRequest>[2]) {
  const [patterns, groups] = await Promise.all([listLocalPatterns(), listLocalRhymeGroups()]);
  return promptGenerationRequest(patterns, groups, defaults);
}

function print(value: unknown, text: string): void {
  process.stdout.write(
    `${program.opts<RootOptions>().json ? JSON.stringify(value, null, 2) : text}\n`,
  );
}

function parseRounds(value: string): number {
  const rounds = Number(value);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    throw new Error('--max-rounds 必须是 1 到 20 之间的整数');
  }
  return rounds;
}

function isInteractiveTerminal(): boolean {
  return (
    program.opts<RootOptions>().interactive ||
    (process.stdin.isTTY === true && process.stdout.isTTY === true)
  );
}

function requireInteractive<T>(operation: () => Promise<T>): Promise<T> {
  if (!isInteractiveTerminal()) {
    return Promise.reject(new Error('缺少参数；请在终端交互运行或显式提供参数'));
  }
  return operation();
}

function isExitPromptError(error: unknown): boolean {
  return error instanceof Error && error.name === 'ExitPromptError';
}

function formatError(error: unknown): string {
  if (error instanceof TypeError && error.message === 'fetch failed') {
    return '无法连接 LLM API，请检查 LLM_BASE_URL、网络和供应商状态。';
  }
  return error instanceof Error ? error.message : String(error);
}

function formatGenerationProgress(progress: GenerationWorkflowProgress): string {
  const labels = {
    drafting: '创作',
    validating: '校验',
    repairing: '修订',
    completed: '完成',
  } as const;
  const round = progress.stage === 'completed' ? '' : ` ${progress.round}/${progress.maxRounds}`;
  return `[${labels[progress.stage]}${round}] ${progress.message}`;
}
