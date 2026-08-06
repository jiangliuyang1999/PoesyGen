import { describe, expect, it } from 'vitest';

import { isSingleHanCharacter } from './character.js';

describe('CLI character input', () => {
  it('accepts one Han character, including extensions and variation selectors', () => {
    expect(isSingleHanCharacter('一')).toBe(true);
    expect(isSingleHanCharacter('𠀀')).toBe(true);
    expect(isSingleHanCharacter(`东\uFE00`)).toBe(true);
  });

  it('rejects numbers, letters, empty input and multiple characters', () => {
    expect(isSingleHanCharacter('1')).toBe(false);
    expect(isSingleHanCharacter('A')).toBe(false);
    expect(isSingleHanCharacter('')).toBe(false);
    expect(isSingleHanCharacter('中文')).toBe(false);
  });
});
