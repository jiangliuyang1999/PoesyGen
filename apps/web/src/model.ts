import type { CiPattern, RhymeGroupSummary } from '@poesygen/client-sdk';

export interface PatternRhymeLabel {
  readonly id: string;
  readonly tone: 'level' | 'oblique' | 'either';
}

export interface PatternFamily {
  readonly name: string;
  readonly patterns: ReadonlyArray<CiPattern>;
}

export function groupPatternsByName(
  patterns: ReadonlyArray<CiPattern>,
): ReadonlyArray<PatternFamily> {
  const grouped = new Map<string, CiPattern[]>();
  for (const pattern of patterns) {
    const variants = grouped.get(pattern.name) ?? [];
    variants.push(pattern);
    grouped.set(pattern.name, variants);
  }
  return [...grouped].map(([name, variants]) => ({ name, patterns: variants }));
}

export function patternStats(pattern: CiPattern): {
  readonly characters: number;
  readonly lines: number;
  readonly sections: number;
  readonly rhymePositions: number;
} {
  const lines = pattern.sections.flatMap((section) => section.lines);
  return {
    characters: lines.reduce((sum, line) => sum + line.positions.length, 0),
    lines: lines.length,
    sections: pattern.sections.length,
    rhymePositions: lines.filter((line) => line.positions.at(-1)?.rhyme !== undefined).length,
  };
}

export function patternRhymeLabels(pattern: CiPattern): ReadonlyArray<PatternRhymeLabel> {
  const labels = new Map<string, PatternRhymeLabel['tone']>();
  for (const position of pattern.sections.flatMap((section) =>
    section.lines.flatMap((line) => line.positions),
  )) {
    if (position.rhyme !== undefined && !labels.has(position.rhyme)) {
      labels.set(position.rhyme, position.rhymeTone ?? position.tone);
    }
  }
  return [...labels].map(([id, tone]) => ({ id, tone }));
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

export function displayRhymeLabel(label: PatternRhymeLabel, index: number): string {
  const tone = label.tone === 'level' ? '平声' : label.tone === 'oblique' ? '仄声' : '平仄';
  return `第 ${index + 1} 组${tone}韵`;
}
