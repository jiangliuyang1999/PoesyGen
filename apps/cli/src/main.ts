#!/usr/bin/env node

import { Command, Option } from 'commander';

import {
  PoesyGenApiError,
  PoesyGenClient,
  type CiPattern,
  type RhymeGroupSummary,
} from '@poesygen/client-sdk';

import {
  formatCharacter,
  formatGenerationSession,
  formatPattern,
  formatProgress,
  formatPatternSummary,
  formatRhymeGroup,
  formatRhymeGroupSummary,
} from './format.js';
import {
  getLocalCharacterPronunciations,
  getLocalRhymeGroup,
  listLocalPatterns,
  listLocalRhymeGroups,
} from './local-catalog.js';
import {
  promptCharacter,
  promptGenerationRequest,
  promptMainAction,
  promptPattern,
  promptRhymeGroup,
} from './interactive.js';

interface RootOptions {
  readonly api: string;
  readonly interactive: boolean;
  readonly json: boolean;
}

interface GenerateOptions {
  readonly pattern?: string;
  readonly theme?: string;
  readonly rhyme?: string;
  readonly maxRounds: string;
  readonly requirement: ReadonlyArray<string>;
  readonly wait: boolean;
}

const program = new Command();

program
  .name('poesygen')
  .description('生成、校验和微调词作')
  .version('0.1.0')
  .option(
    '--api <url>',
    'PoesyGen API 地址',
    process.env['POESYGEN_API'] ?? 'http://localhost:3000',
  )
  .option('-i, --interactive', '强制进入交互模式', false)
  .option('--json', '输出机器可读 JSON', false)
  .action(async () => {
    if (!isInteractiveTerminal()) {
      program.outputHelp();
      return;
    }
    await runInteractiveMenu(createClient());
  });

program
  .command('health')
  .description('检查 API 服务状态')
  .action(async () => {
    const client = createClient();
    const [health, generation] = await Promise.all([client.health(), client.getGenerationHealth()]);
    print(
      { api: health, generation },
      [
        `${health.service}: ${health.status}`,
        `Redis: ${generation.redis}`,
        `Worker: ${generation.workers > 0 ? `${generation.workers} 个在线` : '未连接'}`,
      ].join('\n'),
    );
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
    if (Array.from(character.trim()).length !== 1) {
      throw new Error('character 命令需要且只接受一个汉字');
    }
    const result = await getLocalCharacterPronunciations(character.trim());
    if (result === undefined) throw new Error(`未收录汉字：${character.trim()}`);
    print(result, formatCharacter(result));
  });

program
  .command('session <id>')
  .description('查询生成进度或最终词作')
  .option('-w, --wait', '持续等待任务结束', false)
  .action(async (id: string, options: { wait: boolean }) => {
    const client = createClient();
    const session = options.wait
      ? await waitForSession(client, id)
      : await client.getGenerationSession(id);
    print(session, formatGenerationSession(session));
  });

program
  .command('generate')
  .alias('create')
  .description('提交生成任务；不传参数时进入交互引导')
  .option('-p, --pattern <id>', '词牌 ID')
  .option('-t, --theme <text>', '作品主题')
  .option('-r, --rhyme <group>', '指定韵部')
  .option('--no-wait', '提交后立即返回，不等待最终词作')
  .addOption(new Option('--max-rounds <count>', '最大优化轮数').default('8').argParser(parseRounds))
  .option(
    '--requirement <text>',
    '附加要求，可重复传入',
    (value: string, previous: ReadonlyArray<string>) => [...previous, value],
    [],
  )
  .action(async (options: GenerateOptions) => {
    const client = createClient();
    const hasRequiredOptions = options.pattern !== undefined && options.theme !== undefined;
    if (!hasRequiredOptions && !isInteractiveTerminal()) {
      throw new Error('非交互环境必须同时提供 --pattern 和 --theme');
    }

    const request = hasRequiredOptions
      ? {
          patternId: options.pattern!,
          theme: options.theme!,
          maxRounds: Number(options.maxRounds),
          ...(options.rhyme === undefined ? {} : { preferredRhymeGroup: options.rhyme }),
          ...(options.requirement.length === 0
            ? {}
            : { additionalRequirements: [...options.requirement] }),
        }
      : await buildInteractiveRequest({
          ...(options.pattern === undefined ? {} : { patternId: options.pattern }),
          ...(options.theme === undefined ? {} : { theme: options.theme }),
          ...(options.rhyme === undefined ? {} : { preferredRhymeGroup: options.rhyme }),
          maxRounds: Number(options.maxRounds),
        });
    if (request === undefined) {
      process.stdout.write('已取消。\n');
      return;
    }

    const session = await client.createGenerationSession(request);
    if (!options.wait) {
      print(
        session,
        [`任务已进入队列`, `会话：${session.id}`, `任务：${session.jobId}`].join('\n'),
      );
      return;
    }
    if (!program.opts<RootOptions>().json) {
      process.stdout.write(`任务已进入队列\n会话：${session.id}\n`);
    }
    const completed = await waitForSession(client, session.id);
    print(completed, formatGenerationSession(completed));
  });

try {
  await program.parseAsync();
} catch (error) {
  if (isExitPromptError(error)) {
    process.stdout.write('\n已退出。\n');
  } else {
    process.stderr.write(`${formatError(error)}\n`);
    process.exitCode = 1;
  }
}

async function runInteractiveMenu(client: PoesyGenClient): Promise<void> {
  process.stdout.write('PoesyGen 词作工作台\n\n');
  let patterns: ReadonlyArray<CiPattern> | undefined;
  let groups: ReadonlyArray<RhymeGroupSummary> | undefined;

  for (;;) {
    const action = await promptMainAction();
    process.stdout.write('\n');
    if (action === 'exit') return;

    if (action === 'health') {
      const [health, generation] = await Promise.all([
        client.health(),
        client.getGenerationHealth(),
      ]);
      process.stdout.write(
        `${health.service}: ${health.status}\nRedis: ${generation.redis}\nWorker: ${generation.workers} 个在线\n\n`,
      );
      continue;
    }
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
    if (action === 'generate') {
      patterns ??= await listLocalPatterns();
      groups ??= await listLocalRhymeGroups();
      const request = await promptGenerationRequest(patterns, groups);
      if (request === undefined) {
        process.stdout.write('已取消。\n\n');
        continue;
      }
      const session = await client.createGenerationSession(request);
      process.stdout.write(`任务已进入队列\n会话：${session.id}\n`);
      const completed = await waitForSession(client, session.id);
      process.stdout.write(`${formatGenerationSession(completed)}\n\n`);
    }
  }
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

function createClient(): PoesyGenClient {
  const { api } = program.opts<RootOptions>();
  return new PoesyGenClient({ baseUrl: api });
}

function print(value: unknown, text: string): void {
  process.stdout.write(
    `${program.opts<RootOptions>().json ? JSON.stringify(value, null, 2) : text}\n`,
  );
}

function parseRounds(value: string): string {
  const rounds = Number(value);
  if (!Number.isInteger(rounds) || rounds < 1 || rounds > 20) {
    throw new Error('--max-rounds 必须是 1 到 20 之间的整数');
  }
  return value;
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
  if (error instanceof PoesyGenApiError) {
    const body =
      typeof error.body === 'object' && error.body !== null
        ? (error.body as { message?: unknown; error?: unknown })
        : undefined;
    const detail =
      typeof body?.message === 'string'
        ? body.message
        : typeof body?.error === 'string'
          ? body.error
          : typeof error.body === 'string'
            ? error.body
            : '请求失败';
    return `API ${error.status}: ${detail}`;
  }
  if (error instanceof TypeError && error.message === 'fetch failed') {
    const { api } = program.opts<RootOptions>();
    return [
      `无法连接 PoesyGen API：${api}`,
      '生成和会话操作需要 API；请先在另一个终端运行 `pnpm dev`，或用 --api 指定地址。',
    ].join('\n');
  }
  return error instanceof Error ? error.message : String(error);
}

async function waitForSession(client: PoesyGenClient, sessionId: string) {
  let lastProgress: string | undefined;
  return client.waitForGenerationSession(sessionId, {
    onUpdate(session) {
      if (program.opts<RootOptions>().json) return;
      const progress = formatProgress(session.progress);
      if (progress !== undefined && progress !== lastProgress) {
        process.stdout.write(`${progress}\n`);
        lastProgress = progress;
      }
    },
  });
}
