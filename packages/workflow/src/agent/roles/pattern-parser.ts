import type { CiPattern, GenerationRequest, PatternBlueprint } from '@poesygen/domain';

import { type SkillRegistry } from '../skills/index.js';
import { createPatternBlueprint } from '../tools/pattern-blueprint.js';
import type { AgentRole } from './types.js';

export interface ParsePatternInput {
  readonly request: GenerationRequest;
  readonly pattern: CiPattern;
}

export class PatternParserRole implements AgentRole<ParsePatternInput, PatternBlueprint> {
  public readonly id = 'pattern-parser';
  public readonly skillIds = ['pattern-parsing'] as const;
  readonly #skills: SkillRegistry;

  public constructor(skills: SkillRegistry) {
    this.#skills = skills;
  }

  public execute(input: ParsePatternInput): PatternBlueprint {
    this.#skills.load(this.skillIds);
    return createPatternBlueprint(input.pattern, input.request);
  }
}
