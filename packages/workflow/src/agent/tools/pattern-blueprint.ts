import type { CiPattern, GenerationRequest, PatternBlueprint } from '@poesygen/domain';

export function createPatternBlueprint(
  pattern: CiPattern,
  request: GenerationRequest,
): PatternBlueprint {
  let sequence = 0;
  const sections = pattern.sections.map((section) => ({
    sectionId: section.id,
    name: section.name,
    lineIds: section.lines.map(({ id }) => id),
  }));
  const lines = pattern.sections.flatMap((section) =>
    section.lines.map((line) => {
      sequence += 1;
      const rhymePosition = [...line.positions].reverse().find(({ rhyme }) => rhyme !== undefined);
      const rhymeLabel = rhymePosition?.rhyme;
      const requestedRhymeGroup =
        rhymeLabel === undefined
          ? undefined
          : typeof request.preferredRhymeGroup === 'string'
            ? request.preferredRhymeGroup
            : request.preferredRhymeGroup?.[rhymeLabel];
      return {
        lineId: line.id,
        sectionId: section.id,
        sectionName: section.name,
        sequence,
        characterCount: line.positions.length,
        tonePattern: line.positions
          .map(({ tone, rhyme }) => {
            const marker = tone === 'level' ? '平' : tone === 'oblique' ? '仄' : '中';
            return rhyme === undefined ? marker : `${marker}韵`;
          })
          .join(''),
        ...(rhymeLabel === undefined ? {} : { rhymeLabel }),
        ...(rhymePosition === undefined
          ? {}
          : { rhymeTone: rhymePosition.rhymeTone ?? rhymePosition.tone }),
        ...(requestedRhymeGroup === undefined ? {} : { requestedRhymeGroup }),
        nonRhymeEnding: line.positions.at(-1)?.rhyme === undefined,
      };
    }),
  );
  return {
    patternId: pattern.id,
    patternName: pattern.name,
    variant: pattern.variant,
    sections,
    lines,
  };
}
