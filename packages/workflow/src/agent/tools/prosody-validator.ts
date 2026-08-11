import type { CiPattern, GenerationRequest, ProsodyReport, WorkDraft } from '@poesygen/domain';
import { checkProsody, type ProsodyLexicon } from '@poesygen/prosody';

export interface ValidateProsodyInput {
  readonly draft: WorkDraft;
  readonly pattern: CiPattern;
  readonly request: GenerationRequest;
}

export function validateProsody(
  input: ValidateProsodyInput,
  lexicon: ProsodyLexicon,
): ProsodyReport {
  return checkProsody(
    input.draft,
    input.pattern,
    lexicon,
    input.request.preferredRhymeGroup === undefined
      ? {}
      : { expectedRhymeGroup: input.request.preferredRhymeGroup },
  );
}
