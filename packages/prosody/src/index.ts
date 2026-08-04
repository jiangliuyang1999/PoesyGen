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
  const expectedLines = pattern.sections.flatMap((section) => section.lines);
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
      }
    });
  });

  issues.push(...checkRhymes(rhymeOccurrences, options.expectedRhymeGroup, unresolvedSeverity));

  return {
    passed: issues.every(({ severity }) => severity !== 'error'),
    issues,
  };
}

function checkRhymes(
  occurrences: ReadonlyArray<RhymeOccurrence>,
  expectedRhymeGroup: string | Readonly<Record<string, string>> | undefined,
  unresolvedSeverity: 'error' | 'warning',
): ReadonlyArray<ProsodyIssue> {
  const issues: ProsodyIssue[] = [];
  const byLabel = new Map<string, RhymeOccurrence[]>();
  for (const occurrence of occurrences) {
    const group = byLabel.get(occurrence.label) ?? [];
    group.push(occurrence);
    byLabel.set(occurrence.label, group);
  }

  for (const [label, groupOccurrences] of byLabel) {
    const expectedGroup =
      typeof expectedRhymeGroup === 'string' ? expectedRhymeGroup : expectedRhymeGroup?.[label];
    const knownOccurrences = groupOccurrences.filter(({ groups }) => groups.size > 0);
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

    if (expectedGroup !== undefined || knownOccurrences.length < 2) {
      continue;
    }

    let commonGroups = new Set(knownOccurrences[0]?.groups ?? []);
    for (const occurrence of knownOccurrences.slice(1)) {
      commonGroups = new Set([...commonGroups].filter((group) => occurrence.groups.has(group)));
    }

    if (commonGroups.size === 0) {
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

  return issues;
}
