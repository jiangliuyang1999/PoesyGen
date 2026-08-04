import { describe, expect, it } from 'vitest';

import {
  getLocalCharacterPronunciations,
  getLocalRhymeGroup,
  listLocalPatterns,
  listLocalRhymeGroups,
} from './local-catalog.js';

describe('local CLI catalog', () => {
  it('reads patterns and rhyme groups without an API server', async () => {
    const [patterns, groups] = await Promise.all([listLocalPatterns(), listLocalRhymeGroups()]);

    expect(patterns).toHaveLength(36);
    expect(groups).toHaveLength(19);
    expect(groups[0]?.sections[0]?.characterCount).toBeGreaterThan(0);
  });

  it('returns rhyme details and historical character readings', async () => {
    const [group, character] = await Promise.all([
      getLocalRhymeGroup('cilin-01'),
      getLocalCharacterPronunciations('一'),
    ]);

    expect(group?.sections.length).toBeGreaterThan(0);
    expect(character?.readings?.mandarin).toContain('yī');
    expect(character?.prosody).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          tone: 'oblique',
          rhymeGroups: expect.arrayContaining(['cilin-17']),
        }),
      ]),
    );
  });
});
