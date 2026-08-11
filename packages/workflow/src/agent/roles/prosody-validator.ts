import type { ProsodyReport } from '@poesygen/domain';
import type { ProsodyLexicon } from '@poesygen/prosody';

import { type SkillRegistry } from '../skills/index.js';
import { type ValidateProsodyInput, validateProsody } from '../tools/prosody-validator.js';
import type { AgentRole } from './types.js';

export class ProsodyValidatorRole implements AgentRole<ValidateProsodyInput, ProsodyReport> {
  public readonly id = 'prosody-validator';
  public readonly skillIds = ['prosody-validation'] as const;
  readonly #lexicon: ProsodyLexicon;
  readonly #skills: SkillRegistry;

  public constructor(lexicon: ProsodyLexicon, skills: SkillRegistry) {
    this.#lexicon = lexicon;
    this.#skills = skills;
  }

  public execute(input: ValidateProsodyInput): ProsodyReport {
    this.#skills.load(this.skillIds);
    return validateProsody(input, this.#lexicon);
  }
}
