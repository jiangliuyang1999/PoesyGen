import { describe, expect, it } from 'vitest';

import {
  localCreationIdeaCount,
  localCreationIdeas,
  randomLocalCreationIdeas,
} from './local-ideas.js';

describe('local creation ideas', () => {
  it('keeps a fixed pool of 100 ideas', () => {
    expect(localCreationIdeaCount).toBe(100);
    expect(new Set(localCreationIdeas).size).toBe(100);
  });

  it('returns three distinct ideas', () => {
    const ideas = randomLocalCreationIdeas(() => 0);

    expect(ideas).toHaveLength(3);
    expect(new Set(ideas).size).toBe(3);
  });
});
