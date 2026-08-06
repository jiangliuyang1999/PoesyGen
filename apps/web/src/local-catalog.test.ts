import { describe, expect, it } from 'vitest';

import { LocalCatalogClient } from './local-catalog.js';

describe('local web catalog', () => {
  it('loads every pattern and rhyme group without an API server', async () => {
    const client = new LocalCatalogClient();
    const [patterns, groups] = await Promise.all([
      client.listPatterns(),
      client.listCilinRhymeGroups(),
    ]);

    expect(patterns).toHaveLength(231);
    expect(new Set(patterns.map(({ name }) => name)).size).toBe(36);
    expect(groups).toHaveLength(19);
  });

  it('loads local character readings and rhyme details', async () => {
    const client = new LocalCatalogClient();
    const [character, group] = await Promise.all([
      client.getCharacterPronunciations('一'),
      client.getCilinRhymeGroup('cilin-01'),
    ]);

    expect(character.readings?.mandarin).toContain('yī');
    expect(character.prosody.length).toBeGreaterThan(0);
    expect(group.sections.length).toBeGreaterThan(0);
  });
});
