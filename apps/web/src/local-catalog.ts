import type { CiPattern } from '@poesygen/domain';

import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from './catalog-types.js';
export class LocalCatalogClient {
  public async listPatterns(): Promise<ReadonlyArray<CiPattern>> {
    const { listPatterns } = await import('@poesygen/patterns');
    return listPatterns();
  }

  public async listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>> {
    const { listCilinRhymeGroups } = await import('@poesygen/prosody');
    return listCilinRhymeGroups().map((group) => ({
      id: group.id,
      number: group.number,
      name: group.name,
      sections: group.sections.map((section) => ({
        name: section.name,
        tone: section.tone,
        characterCount: countGraphemes(section.characters),
      })),
    }));
  }

  public async getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail> {
    const { findCilinRhymeGroup } = await import('@poesygen/prosody');
    const group = findCilinRhymeGroup(groupId);
    if (group === undefined) throw new Error(`未找到韵部：${groupId}`);
    return group;
  }

  public async getCharacterPronunciations(
    character: string,
  ): Promise<CharacterPronunciationResponse> {
    const { cilinZhengyunLexicon, getCharacterReading } = await import('@poesygen/prosody');
    const readings = getCharacterReading(character);
    const prosody = cilinZhengyunLexicon.resolve({
      character,
      line: character,
      charIndex: 0,
    });
    if (readings === undefined && prosody.length === 0) {
      throw new Error(`未收录汉字：${character}`);
    }
    return {
      character,
      ...(readings === undefined ? {} : { readings }),
      prosody,
    };
  }
}

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme',
});

function countGraphemes(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}
