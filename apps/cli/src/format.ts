import type {
  CharacterPronunciationResponse,
  CiPattern,
  GenerationSessionStatusResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from '@poesygen/client-sdk';
import { findPattern } from '@poesygen/patterns';

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function formatPatternSummary(pattern: CiPattern): string {
  const lines = pattern.sections.flatMap((section) => section.lines);
  const characters = lines.reduce((sum, line) => sum + line.positions.length, 0);
  return `${pattern.name}·${pattern.variant}  ${characters}字/${lines.length}句  ${pattern.id}`;
}

export function formatPattern(pattern: CiPattern): string {
  const output = [
    `${pattern.name}·${pattern.variant}`,
    `${pattern.source} | ${pattern.reviewStatus}`,
    '',
  ];
  let exampleIndex = 0;

  for (const section of pattern.sections) {
    output.push(`[${section.name}]`);
    for (const line of section.lines) {
      const tones = line.positions
        .map((position) => {
          const marker = toneLabels[position.tone];
          return position.rhyme === undefined ? marker : `${marker}韵`;
        })
        .join(' ');
      const example = pattern.example?.lines[exampleIndex] ?? '';
      output.push(`${String(exampleIndex + 1).padStart(2, ' ')}  ${tones}`);
      if (example !== '') output.push(`    ${example}${line.punctuation ?? ''}`);
      exampleIndex += 1;
    }
    output.push('');
  }

  return output.join('\n').trimEnd();
}

export function formatRhymeGroupSummary(group: RhymeGroupSummary): string {
  const tones = [...new Set(group.sections.map(({ tone }) => toneLabels[tone]))].join('/');
  const characterCount = group.sections.reduce((sum, section) => sum + section.characterCount, 0);
  return `${group.id}  ${group.name}  ${tones}声  ${characterCount}字`;
}

export function formatRhymeGroup(group: RhymeGroupDetail): string {
  return [
    `${group.name}（${group.id}）`,
    ...group.sections.flatMap((section) => [
      '',
      `${section.name} · ${toneLabels[section.tone]}声 · ${Array.from(section.characters).length}字`,
      wrapCharacters(section.characters, 30),
    ]),
  ].join('\n');
}

export function formatCharacter(response: CharacterPronunciationResponse): string {
  const output = [`${response.character}  字音与韵部`];
  const readings = response.readings;
  if (readings !== undefined) {
    output.push(
      `普通话：${readings.mandarin?.join(' / ') ?? '未收录'}`,
      `反切：${readings.fanqie?.join(' / ') ?? '未收录'}`,
      `唐音：${readings.tang?.join(' / ') ?? '未收录'}`,
    );
  }

  if (response.prosody.length === 0) {
    output.push('', '《词林正韵》未收录');
  } else {
    output.push('', '《词林正韵》：');
    response.prosody.forEach((pronunciation, index) => {
      output.push(
        `${index + 1}. ${toneLabels[pronunciation.tone]}声 · ${pronunciation.rhymeGroups.join(
          '/',
        )} · ${pronunciation.rhymeSections?.join('/') ?? '未知小韵'}`,
      );
    });
  }
  return output.join('\n');
}

export function patternRhymeLabels(pattern: CiPattern): ReadonlyArray<{
  readonly id: string;
  readonly tone: 'level' | 'oblique' | 'either';
}> {
  const labels = new Map<string, 'level' | 'oblique' | 'either'>();
  for (const position of pattern.sections.flatMap((section) =>
    section.lines.flatMap((line) => line.positions),
  )) {
    if (position.rhyme !== undefined && !labels.has(position.rhyme)) {
      labels.set(position.rhyme, position.rhymeTone ?? position.tone);
    }
  }
  return [...labels].map(([id, tone]) => ({ id, tone }));
}

export function formatGenerationSession(session: GenerationSessionStatusResponse): string {
  if (session.status === 'failed') {
    return `生成失败\n会话：${session.id}\n原因：${session.error ?? '未知错误'}`;
  }
  if (session.result === undefined) {
    const progress = formatProgress(session.progress);
    return [
      session.status === 'running' ? '正在生成' : '任务排队中',
      `会话：${session.id}`,
      ...(progress === undefined ? [] : [progress]),
    ].join('\n');
  }

  const { draft, report, rounds, status } = session.result;
  const pattern = findPattern(draft.patternId);
  return [
    formatGenerationTitle(pattern?.name, draft.title),
    '',
    ...formatGenerationLines(draft.lines, pattern),
    '',
    status === 'completed'
      ? `格律校验通过 · ${rounds} 轮`
      : `已达到 ${rounds} 轮优化上限 · ${report.issues.length} 项待处理`,
    ...(report.issues.length === 0
      ? []
      : report.issues.map(
          (issue) =>
            `- ${issue.lineId}${issue.charIndex === undefined ? '' : ` 第${issue.charIndex + 1}字`}：${issue.message}`,
        )),
    `会话：${session.id}`,
  ].join('\n');
}

function formatGenerationLines(
  lines: ReadonlyArray<{ readonly text: string }>,
  pattern: CiPattern | undefined,
): ReadonlyArray<string> {
  if (pattern === undefined || pattern.sections.length <= 1) {
    return lines.map(({ text }) => text);
  }

  const output: string[] = [];
  let lineIndex = 0;
  for (const section of pattern.sections) {
    const sectionLines = lines.slice(lineIndex, lineIndex + section.lines.length);
    lineIndex += section.lines.length;
    if (sectionLines.length === 0) continue;
    if (output.length > 0) output.push('');
    output.push(...sectionLines.map(({ text }) => text));
  }
  if (lineIndex < lines.length) {
    if (output.length > 0) output.push('');
    output.push(...lines.slice(lineIndex).map(({ text }) => text));
  }
  return output;
}

function formatGenerationTitle(patternName: string | undefined, title: string | undefined): string {
  const normalizedTitle = title?.trim();
  if (patternName === undefined)
    return normalizedTitle === undefined || normalizedTitle === '' ? '无题' : normalizedTitle;
  if (normalizedTitle === undefined || normalizedTitle === '') return `${patternName}·无题`;
  if (!normalizedTitle.includes(patternName)) return `${patternName}·${normalizedTitle}`;
  if (!normalizedTitle.startsWith(patternName)) return normalizedTitle;

  let titleBody = normalizedTitle;
  while (titleBody.startsWith(patternName)) {
    titleBody = titleBody.slice(patternName.length).replace(/^[\s·・.。:：—-]+/u, '');
  }
  return titleBody === '' ? patternName : `${patternName}·${titleBody}`;
}

export function formatProgress(progress: unknown): string | undefined {
  if (typeof progress === 'number') return `进度：${progress}%`;
  if (typeof progress !== 'object' || progress === null) return undefined;
  const candidate = progress as { message?: unknown; rounds?: unknown };
  if (typeof candidate.message !== 'string') return undefined;
  return typeof candidate.rounds === 'number'
    ? `${candidate.message}（${candidate.rounds} 轮）`
    : candidate.message;
}

function wrapCharacters(value: string, width: number): string {
  const characters = Array.from(value);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += width) {
    lines.push(characters.slice(index, index + width).join(' '));
  }
  return lines.join('\n');
}
