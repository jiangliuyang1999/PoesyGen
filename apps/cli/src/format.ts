import { patternStats, type CiPattern, type GenerationResult } from '@poesygen/domain';
import { findPattern } from '@poesygen/patterns';
import type { GenerationWorkflowStageResult } from '@poesygen/workflow';

import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from './local-catalog.js';

export { patternRhymeLabels } from '@poesygen/domain';

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function formatPatternSummary(pattern: CiPattern): string {
  return `${pattern.name}·${formatPatternVariantSummary(pattern)}`;
}

export function formatPatternVariantSummary(pattern: CiPattern): string {
  const stats = patternStats(pattern);
  return `${pattern.variant}  ${stats.characters}字/${stats.lines}句  ${pattern.id}`;
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

export function formatGenerationResult(
  result: GenerationResult,
  selectedPattern?: CiPattern,
): string {
  const { draft, report, rounds, status } = result;
  const pattern = selectedPattern ?? findPattern(draft.patternId);
  return [
    formatGenerationTitle(pattern?.name, draft.title),
    '',
    ...formatGenerationLines(draft.lines, pattern),
    '',
    status === 'completed'
      ? `格律与文学质量校验通过 · ${rounds} 轮`
      : status === 'quality_limit_reached'
        ? `格律校验通过，已达到 ${rounds} 轮文学优化上限`
        : `已达到 ${rounds} 轮优化上限 · ${report.issues.length} 项格律问题待处理`,
    ...(report.issues.length === 0
      ? []
      : report.issues.map(
          (issue) =>
            `- ${issue.lineId}${issue.charIndex === undefined ? '' : ` 第${issue.charIndex + 1}字`}：${issue.message}`,
        )),
  ].join('\n');
}

export function formatGenerationStageResult(result: GenerationWorkflowStageResult): string {
  const labels = {
    pattern_blueprint: '词谱蓝图',
    theme_brief: '主题简报',
    composition_plan: '篇章规划',
    draft_candidates: '创作初稿',
    prosody_reports: '格律报告',
    quality_reports: '文学评价',
    optimized_draft: '优化词稿',
  } as const;
  const round =
    result.round === undefined || result.maxRounds === undefined
      ? ''
      : ` · ${result.round}/${result.maxRounds}`;
  return [
    `[阶段结果 · ${labels[result.kind]}${round}]`,
    JSON.stringify(result.value, null, 2),
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

function wrapCharacters(value: string, width: number): string {
  const characters = Array.from(value);
  const lines: string[] = [];
  for (let index = 0; index < characters.length; index += width) {
    lines.push(characters.slice(index, index + width).join(' '));
  }
  return lines.join('\n');
}
