import type { CiPattern } from '@poesygen/domain';

import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from './catalog-types.js';
import { logWebError, logWebEvent } from './web-logger.js';

export class LocalCatalogClient {
  public async listPatterns(): Promise<ReadonlyArray<CiPattern>> {
    const startedAt = performance.now();
    logWebEvent('catalog', '开始加载本地词谱');
    const { listPatterns } = await import('@poesygen/patterns');
    const patterns = listPatterns();
    logWebEvent('catalog', '本地词谱加载完成', {
      durationMs: Math.round(performance.now() - startedAt),
      patternCount: patterns.length,
      tuneCount: new Set(patterns.map(({ name }) => name)).size,
    });
    return patterns;
  }

  public async listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>> {
    const startedAt = performance.now();
    logWebEvent('catalog', '开始加载《词林正韵》');
    const { listCilinRhymeGroups } = await import('@poesygen/prosody');
    const groups = listCilinRhymeGroups().map((group) => ({
      id: group.id,
      number: group.number,
      name: group.name,
      sections: group.sections.map((section) => ({
        name: section.name,
        tone: section.tone,
        characterCount: countGraphemes(section.characters),
      })),
    }));
    logWebEvent('catalog', '《词林正韵》加载完成', {
      durationMs: Math.round(performance.now() - startedAt),
      groupCount: groups.length,
      sectionCount: groups.reduce((sum, group) => sum + group.sections.length, 0),
    });
    return groups;
  }

  public async getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail> {
    const startedAt = performance.now();
    logWebEvent('dictionary', '查询韵部详情', { groupId });
    const { findCilinRhymeGroup } = await import('@poesygen/prosody');
    const group = findCilinRhymeGroup(groupId);
    if (group === undefined) {
      const error = new Error(`未找到韵部：${groupId}`);
      logWebError('dictionary', '韵部查询失败', error, { groupId });
      throw error;
    }
    logWebEvent('dictionary', '韵部查询完成', {
      groupId,
      groupName: group.name,
      sectionCount: group.sections.length,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return group;
  }

  public async getCharacterPronunciations(
    character: string,
  ): Promise<CharacterPronunciationResponse> {
    const startedAt = performance.now();
    logWebEvent('dictionary', '查询单字音韵', { character });
    const { cilinZhengyunLexicon, getCharacterReading } = await import('@poesygen/prosody');
    const readings = getCharacterReading(character);
    const prosody = cilinZhengyunLexicon.resolve({
      character,
      line: character,
      charIndex: 0,
    });
    if (readings === undefined && prosody.length === 0) {
      const error = new Error(`未收录汉字：${character}`);
      logWebError('dictionary', '单字音韵查询失败', error, { character });
      throw error;
    }
    const response = {
      character,
      ...(readings === undefined ? {} : { readings }),
      prosody,
    };
    logWebEvent('dictionary', '单字音韵查询完成', {
      character,
      readings,
      prosody,
      durationMs: Math.round(performance.now() - startedAt),
    });
    return response;
  }
}

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme',
});

function countGraphemes(value: string): number {
  return [...graphemeSegmenter.segment(value)].length;
}
