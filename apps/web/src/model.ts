import {
  patternStats,
  type CiPattern,
  type PatternFamily,
  type PatternRhymeLabel,
} from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';

export {
  groupPatternsByName,
  listPatternFamilies,
  patternRhymeLabels,
  patternStats,
  sortPatternFamiliesByPinyin,
  type PatternFamily,
  type PatternRhymeLabel,
} from '@poesygen/domain';

export function filterPatternFamilies(
  families: ReadonlyArray<PatternFamily>,
  query: string,
): ReadonlyArray<PatternFamily> {
  if (query.trim() === '') return families;
  const matchingPatternIds = new Set(
    filterPatterns(
      families.flatMap(({ patterns }) => patterns),
      query,
    ).map(({ id }) => id),
  );
  return families.filter(({ patterns }) => patterns.some(({ id }) => matchingPatternIds.has(id)));
}

export function selectPatternFamilyVariant(
  family: PatternFamily,
  selectedPatternId?: string,
): CiPattern | undefined {
  return (
    family.patterns.find(({ id }) => id === selectedPatternId) ??
    family.patterns.find(({ variant }) => variant === '正体') ??
    family.patterns[0]
  );
}

export function formatPatternVariantSummary(pattern: CiPattern): string {
  const stats = patternStats(pattern);
  return [
    pattern.variant,
    `${stats.characters}字`,
    stats.sections === 1 ? '单调' : '双调',
    `${stats.lines}句`,
    `${stats.rhymePositions}韵位`,
  ].join(' · ');
}

export function compatibleRhymeGroups(
  groups: ReadonlyArray<RhymeGroupSummary>,
  tone: PatternRhymeLabel['tone'],
): ReadonlyArray<RhymeGroupSummary> {
  return groups.filter(
    (group) => tone === 'either' || group.sections.some((section) => section.tone === tone),
  );
}

export function filterPatterns(
  patterns: ReadonlyArray<CiPattern>,
  query: string,
): ReadonlyArray<CiPattern> {
  const normalizedQuery = query.trim().toLocaleLowerCase('zh-CN');
  if (normalizedQuery === '') return patterns;
  return patterns.filter((pattern) =>
    `${pattern.name} ${pattern.variant} ${pattern.id}`
      .toLocaleLowerCase('zh-CN')
      .includes(normalizedQuery),
  );
}

export function splitRequirements(value: string): ReadonlyArray<string> {
  return value
    .split(/[；;\n]/u)
    .map((requirement) => requirement.trim())
    .filter(Boolean);
}

export function formatGenerationTitle(patternName: string, title: string | undefined): string {
  const normalizedTitle = title?.trim();
  if (normalizedTitle === undefined || normalizedTitle === '') {
    return `${patternName}·无题`;
  }
  if (!normalizedTitle.includes(patternName)) {
    return `${patternName}·${normalizedTitle}`;
  }
  if (!normalizedTitle.startsWith(patternName)) return normalizedTitle;

  let titleBody = normalizedTitle;
  while (titleBody.startsWith(patternName)) {
    titleBody = titleBody.slice(patternName.length).replace(/^[\s·・.。:：—-]+/u, '');
  }
  return titleBody === '' ? patternName : `${patternName}·${titleBody}`;
}

export function displayRhymeLabel(label: PatternRhymeLabel, index: number): string {
  const tone = label.tone === 'level' ? '平声' : label.tone === 'oblique' ? '仄声' : '平仄';
  return `第 ${index + 1} 组${tone}韵`;
}
