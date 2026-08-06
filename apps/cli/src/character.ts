const hanGrapheme = /^\p{Script=Han}\p{Variation_Selector}?$/u;

export function isSingleHanCharacter(value: string): boolean {
  return hanGrapheme.test(value.trim());
}
