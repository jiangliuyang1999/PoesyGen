import cilinData from './data/cilin-zhengyun.json' with { type: 'json' };
import unihanData from './data/unihan-readings.json' with { type: 'json' };

import type { CiPattern, ProsodyIssue, ProsodyReport, Tone, WorkDraft } from '@poesygen/domain';

export interface Pronunciation {
  readonly tone: Tone;
  readonly rhymeGroups: ReadonlyArray<string>;
  readonly reading?: string;
  readonly rhymeSections?: ReadonlyArray<string>;
  readonly mandarinReadings?: ReadonlyArray<string>;
  readonly fanqie?: ReadonlyArray<string>;
  readonly tangReadings?: ReadonlyArray<string>;
}

export interface PronunciationQuery {
  readonly character: string;
  readonly line: string;
  readonly charIndex: number;
}

export interface ProsodyLexicon {
  resolve(query: PronunciationQuery): ReadonlyArray<Pronunciation>;
}

export interface CharacterReading {
  readonly mandarin?: ReadonlyArray<string>;
  readonly hanyuPinyin?: ReadonlyArray<string>;
  readonly xhc1983?: ReadonlyArray<string>;
  readonly fanqie?: ReadonlyArray<string>;
  readonly tang?: ReadonlyArray<string>;
  readonly simplifiedVariants?: ReadonlyArray<string>;
  readonly traditionalVariants?: ReadonlyArray<string>;
}

export interface CilinRhymeSection {
  readonly name: string;
  readonly tone: Tone;
  readonly characters: string;
}

export interface CilinRhymeGroup {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly sections: ReadonlyArray<CilinRhymeSection>;
}

interface CilinCharacterMembership {
  readonly tone: Tone;
  readonly rhymeGroup: string;
  readonly rhymeGroupName: string;
  readonly section: string;
  readonly mandarin?: ReadonlyArray<string>;
  readonly fanqie?: ReadonlyArray<string>;
  readonly tang?: ReadonlyArray<string>;
}

const cilinCharacters = cilinData.characters as unknown as Readonly<
  Record<string, ReadonlyArray<CilinCharacterMembership>>
>;
const unihanCharacters = unihanData.characters as unknown as Readonly<
  Record<string, CharacterReading>
>;
const cilinGroups = cilinData.groups as unknown as ReadonlyArray<CilinRhymeGroup>;
const cilinGroupsById = new Map(cilinGroups.map((group) => [group.id, group]));

export const prosodyDataMetadata = {
  rhymeBook: {
    schemaVersion: cilinData.schemaVersion,
    dataVersion: cilinData.dataVersion,
    provenance: cilinData.provenance,
  },
  readings: {
    schemaVersion: unihanData.schemaVersion,
    dataVersion: unihanData.dataVersion,
    provenance: unihanData.provenance,
  },
} as const;

export class CilinZhengyunLexicon implements ProsodyLexicon {
  public resolve({ character }: PronunciationQuery): ReadonlyArray<Pronunciation> {
    return (cilinCharacters[character] ?? []).map((membership) => ({
      tone: membership.tone,
      rhymeGroups: [membership.rhymeGroup],
      rhymeSections: [membership.section],
      ...(membership.mandarin === undefined
        ? {}
        : {
            reading: membership.mandarin.join('/'),
            mandarinReadings: membership.mandarin,
          }),
      ...(membership.fanqie === undefined ? {} : { fanqie: membership.fanqie }),
      ...(membership.tang === undefined ? {} : { tangReadings: membership.tang }),
    }));
  }
}

export const cilinZhengyunLexicon = new CilinZhengyunLexicon();

export function getCharacterReading(character: string): CharacterReading | undefined {
  return unihanCharacters[character];
}

export function listCilinRhymeGroups(): ReadonlyArray<CilinRhymeGroup> {
  return cilinGroups;
}

export function findCilinRhymeGroup(groupId: string): CilinRhymeGroup | undefined {
  return cilinGroupsById.get(groupId);
}

export interface CheckProsodyOptions {
  readonly expectedRhymeGroup?: string | Readonly<Record<string, string>>;
  readonly unresolvedSeverity?: 'error' | 'warning';
}

interface RhymeOccurrence {
  readonly label: string;
  readonly lineId: string;
  readonly charIndex: number;
  readonly character: string;
  readonly groups: ReadonlySet<string>;
}

interface NonRhymeEnding {
  readonly lineId: string;
  readonly charIndex: number;
  readonly character: string;
  readonly pronunciations: ReadonlyArray<Pronunciation>;
}

interface RhymeCheckResult {
  readonly issues: ReadonlyArray<ProsodyIssue>;
  readonly activeGroups: ReadonlySet<string>;
}

interface ResolvedRhymeGroup {
  readonly label: string;
  readonly groups: ReadonlySet<string>;
  readonly firstOccurrence?: RhymeOccurrence;
}

const ignoredCharacter = /[\p{P}\p{Z}\s]/u;

export function extractContentCharacters(text: string): ReadonlyArray<string> {
  return Array.from(text).filter((character) => !ignoredCharacter.test(character));
}

export function checkProsody(
  draft: WorkDraft,
  pattern: CiPattern,
  lexicon: ProsodyLexicon,
  options: CheckProsodyOptions = {},
): ProsodyReport {
  const issues: ProsodyIssue[] = [];
  const rhymeOccurrences: RhymeOccurrence[] = [];
  const nonRhymeEndings: NonRhymeEnding[] = [];
  const expectedLines = pattern.sections.flatMap((section) => section.lines);
  const rhymeLabelOrder = [
    ...new Set(
      expectedLines.flatMap((line) =>
        line.positions.flatMap((position) =>
          position.rhyme === undefined ? [] : [position.rhyme],
        ),
      ),
    ),
  ];
  const unresolvedSeverity = options.unresolvedSeverity ?? 'error';

  if (draft.patternId !== pattern.id) {
    issues.push({
      lineId: 'work',
      rule: 'structure',
      severity: 'error',
      message: `作品使用词牌 ${draft.patternId}，校验词牌为 ${pattern.id}`,
      expected: pattern.id,
      actual: draft.patternId,
    });
  }

  if (draft.lines.length !== expectedLines.length) {
    issues.push({
      lineId: 'work',
      rule: 'structure',
      severity: 'error',
      message: `应有 ${expectedLines.length} 句，实际为 ${draft.lines.length} 句`,
      expected: String(expectedLines.length),
      actual: String(draft.lines.length),
    });
  }

  expectedLines.forEach((expectedLine, lineIndex) => {
    const actualLine = draft.lines[lineIndex];
    if (actualLine === undefined) {
      return;
    }

    const characters = extractContentCharacters(actualLine.text);
    if (characters.length !== expectedLine.positions.length) {
      issues.push({
        lineId: actualLine.id,
        rule: 'length',
        severity: 'error',
        message: `应为 ${expectedLine.positions.length} 字，实际为 ${characters.length} 字`,
        expected: String(expectedLine.positions.length),
        actual: String(characters.length),
      });
    }

    expectedLine.positions.forEach((position, charIndex) => {
      const character = characters[charIndex];
      if (character === undefined) {
        return;
      }

      const pronunciations = lexicon.resolve({
        character,
        line: actualLine.text,
        charIndex,
      });

      if (pronunciations.length === 0) {
        issues.push({
          lineId: actualLine.id,
          charIndex,
          rule: position.rhyme === undefined ? 'tone' : 'rhyme',
          severity: unresolvedSeverity,
          message: `无法确定“${character}”的读音、平仄或韵部`,
          actual: character,
        });
        return;
      }

      if (position.tone !== 'either') {
        const accepted = pronunciations.filter(
          (pronunciation) => pronunciation.tone === position.tone,
        );
        if (accepted.length === 0) {
          issues.push({
            lineId: actualLine.id,
            charIndex,
            rule: 'tone',
            severity: 'error',
            message: `“${character}”不符合此处平仄要求`,
            expected: position.tone,
            actual: [...new Set(pronunciations.map(({ tone }) => tone))].join('/'),
          });
        } else if (accepted.length !== pronunciations.length) {
          issues.push({
            lineId: actualLine.id,
            charIndex,
            rule: 'tone',
            severity: 'warning',
            message: `“${character}”存在多音，需确认上下文读音`,
            expected: position.tone,
            candidates: pronunciations.map(
              ({ reading, tone }) => `${reading ?? character}:${tone}`,
            ),
          });
        }
      }

      if (position.rhyme !== undefined) {
        rhymeOccurrences.push({
          label: position.rhyme,
          lineId: actualLine.id,
          charIndex,
          character,
          groups: new Set(pronunciations.flatMap(({ rhymeGroups }) => rhymeGroups)),
        });
      } else if (
        charIndex === expectedLine.positions.length - 1 &&
        characters.length === expectedLine.positions.length
      ) {
        nonRhymeEndings.push({
          lineId: actualLine.id,
          charIndex,
          character,
          pronunciations,
        });
      }
    });
  });

  const rhymeCheck = checkRhymes(
    rhymeOccurrences,
    rhymeLabelOrder,
    options.expectedRhymeGroup,
    unresolvedSeverity,
  );
  issues.push(
    ...rhymeCheck.issues,
    ...checkNonRhymeEndings(nonRhymeEndings, rhymeCheck.activeGroups),
  );

  return {
    passed: issues.every(({ severity }) => severity !== 'error'),
    issues,
  };
}

function checkRhymes(
  occurrences: ReadonlyArray<RhymeOccurrence>,
  labelOrder: ReadonlyArray<string>,
  expectedRhymeGroup: string | Readonly<Record<string, string>> | undefined,
  unresolvedSeverity: 'error' | 'warning',
): RhymeCheckResult {
  const issues: ProsodyIssue[] = [];
  const activeGroups = new Set<string>();
  const resolvedGroups: ResolvedRhymeGroup[] = [];
  const byLabel = new Map<string, RhymeOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = byLabel.get(occurrence.label) ?? [];
    group.push(occurrence);
    byLabel.set(occurrence.label, group);
  }

  for (const label of labelOrder) {
    const groupOccurrences = byLabel.get(label) ?? [];
    const expectedGroup =
      typeof expectedRhymeGroup === 'string' ? expectedRhymeGroup : expectedRhymeGroup?.[label];
    const knownOccurrences = groupOccurrences.filter(({ groups }) => groups.size > 0);
    let resolvedGroupCandidates = new Set<string>();
    if (expectedGroup !== undefined) {
      activeGroups.add(expectedGroup);
      resolvedGroupCandidates.add(expectedGroup);
    }
    for (const occurrence of groupOccurrences) {
      if (occurrence.groups.size === 0) {
        issues.push({
          lineId: occurrence.lineId,
          charIndex: occurrence.charIndex,
          rule: 'rhyme',
          severity: unresolvedSeverity,
          message: `无法确定韵脚“${occurrence.character}”所属韵部`,
          actual: occurrence.character,
        });
      } else if (expectedGroup !== undefined && !occurrence.groups.has(expectedGroup)) {
        issues.push({
          lineId: occurrence.lineId,
          charIndex: occurrence.charIndex,
          rule: 'rhyme',
          severity: 'error',
          message: `韵脚“${occurrence.character}”不属于指定韵部`,
          expected: expectedGroup,
          actual: [...occurrence.groups].join('/'),
        });
      }
    }

    if (expectedGroup === undefined && knownOccurrences.length > 0) {
      resolvedGroupCandidates = new Set(knownOccurrences[0]?.groups ?? []);
      for (const occurrence of knownOccurrences.slice(1)) {
        resolvedGroupCandidates = new Set(
          [...resolvedGroupCandidates].filter((group) => occurrence.groups.has(group)),
        );
      }
      for (const group of resolvedGroupCandidates) {
        activeGroups.add(group);
      }

      if (knownOccurrences.length >= 2 && resolvedGroupCandidates.size === 0) {
        const lastOccurrence = knownOccurrences.at(-1);
        if (lastOccurrence !== undefined) {
          issues.push({
            lineId: lastOccurrence.lineId,
            charIndex: lastOccurrence.charIndex,
            rule: 'rhyme',
            severity: 'error',
            message: `标记为“${label}”的韵脚没有共同韵部`,
            expected: '同一韵部',
            actual: knownOccurrences
              .map(({ character, groups }) => `${character}:${[...groups].join('/')}`)
              .join(', '),
          });
        }
      }
    }

    resolvedGroups.push({
      label,
      groups: resolvedGroupCandidates,
      ...(groupOccurrences[0] === undefined ? {} : { firstOccurrence: groupOccurrences[0] }),
    });
  }

  issues.push(...checkAdjacentRhymeGroups(resolvedGroups));
  return { issues, activeGroups };
}

function checkAdjacentRhymeGroups(
  groups: ReadonlyArray<ResolvedRhymeGroup>,
): ReadonlyArray<ProsodyIssue> {
  const issues: ProsodyIssue[] = [];
  for (let index = 1; index < groups.length; index += 1) {
    const previous = groups[index - 1]!;
    const current = groups[index]!;
    if (
      previous.groups.size === 0 ||
      current.groups.size === 0 ||
      current.firstOccurrence === undefined
    ) {
      continue;
    }
    const overlapping = [...current.groups].filter((group) => previous.groups.has(group));
    if (overlapping.length === 0) continue;

    const definitelySame = previous.groups.size === 1 && current.groups.size === 1;
    issues.push({
      lineId: current.firstOccurrence.lineId,
      charIndex: current.firstOccurrence.charIndex,
      rule: 'rhyme',
      severity: definitelySame ? 'error' : 'warning',
      message: definitelySame
        ? `相邻韵组“${previous.label}”与“${current.label}”使用了同一韵部`
        : `相邻韵组“${previous.label}”与“${current.label}”存在相同候选韵部，需确认已经换韵`,
      expected: '与前一韵组使用不同韵部',
      actual: overlapping.join('/'),
      ...(definitelySame
        ? {}
        : {
            candidates: [
              `${previous.label}:${[...previous.groups].join('/')}`,
              `${current.label}:${[...current.groups].join('/')}`,
            ],
          }),
    });
  }
  return issues;
}

function checkNonRhymeEndings(
  endings: ReadonlyArray<NonRhymeEnding>,
  activeGroups: ReadonlySet<string>,
): ReadonlyArray<ProsodyIssue> {
  if (activeGroups.size === 0) return [];

  return endings.flatMap((ending): ReadonlyArray<ProsodyIssue> => {
    const matching = ending.pronunciations.filter((pronunciation) =>
      pronunciation.rhymeGroups.some((group) => activeGroups.has(group)),
    );
    if (matching.length === 0) return [];

    const matchingGroups = [
      ...new Set(
        matching
          .flatMap(({ rhymeGroups }) => rhymeGroups)
          .filter((group) => activeGroups.has(group)),
      ),
    ];
    if (matching.length === ending.pronunciations.length) {
      return [
        {
          lineId: ending.lineId,
          charIndex: ending.charIndex,
          rule: 'rhyme',
          severity: 'error',
          message: `非韵句句尾“${ending.character}”使用了本词押韵韵部`,
          expected: `避开 ${matchingGroups.join('/')}`,
          actual: [
            ...new Set(ending.pronunciations.flatMap(({ rhymeGroups }) => rhymeGroups)),
          ].join('/'),
        },
      ];
    }

    return [
      {
        lineId: ending.lineId,
        charIndex: ending.charIndex,
        rule: 'rhyme',
        severity: 'warning',
        message: `非韵句句尾“${ending.character}”存在多音，可能误用本词押韵韵部`,
        expected: `避开 ${matchingGroups.join('/')}`,
        candidates: ending.pronunciations.map(
          ({ reading, rhymeGroups }) =>
            `${reading ?? ending.character}:${rhymeGroups.join('/') || '韵部未知'}`,
        ),
      },
    ];
  });
}
