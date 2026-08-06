import type { CiPattern } from '@poesygen/domain';
import type { CharacterReading, CilinRhymeGroup, Pronunciation } from '@poesygen/prosody';

export interface RhymeGroupSummary {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly tone: 'level' | 'oblique';
    readonly characterCount: number;
  }>;
}

export type RhymeGroupDetail = CilinRhymeGroup;

export interface CharacterPronunciationResponse {
  readonly character: string;
  readonly readings?: CharacterReading;
  readonly prosody: ReadonlyArray<Pronunciation>;
}

export async function listLocalPatterns(): Promise<ReadonlyArray<CiPattern>> {
  const { listPatterns } = await import('@poesygen/patterns');
  return listPatterns();
}

export async function listLocalRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>> {
  const { listCilinRhymeGroups } = await import('@poesygen/prosody');
  return listCilinRhymeGroups().map((group) => ({
    id: group.id,
    number: group.number,
    name: group.name,
    sections: group.sections.map((section) => ({
      name: section.name,
      tone: section.tone,
      characterCount: Array.from(section.characters).length,
    })),
  }));
}

export async function getLocalRhymeGroup(groupId: string): Promise<RhymeGroupDetail | undefined> {
  const { findCilinRhymeGroup } = await import('@poesygen/prosody');
  return findCilinRhymeGroup(groupId);
}

export async function getLocalCharacterPronunciations(
  character: string,
): Promise<CharacterPronunciationResponse | undefined> {
  const { cilinZhengyunLexicon, getCharacterReading } = await import('@poesygen/prosody');
  const readings = getCharacterReading(character);
  const prosody = cilinZhengyunLexicon.resolve({
    character,
    line: character,
    charIndex: 0,
  });
  if (readings === undefined && prosody.length === 0) return undefined;

  return {
    character,
    ...(readings === undefined ? {} : { readings }),
    prosody,
  };
}
