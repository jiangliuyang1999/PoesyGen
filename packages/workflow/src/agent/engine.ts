import type { LlmProvider } from '@poesygen/llm';

import type {
  CompositionEngine,
  EvaluateDraftsInput,
  GenerateCandidatesInput,
  OptimizeDraftInput,
  PreparedComposition,
  PrepareCompositionInput,
} from '../composition.js';
import { CompositionArchitectRole } from './roles/composition-architect.js';
import { DraftWriterRole } from './roles/draft-writer.js';
import { LiteraryCriticRole } from './roles/literary-critic.js';
import { RevisionEditorRole } from './roles/revision-editor.js';
import { defaultAgentSkillRegistry, type SkillRegistry } from './skills/index.js';

export interface LlmCompositionEngineOptions {
  readonly skills?: SkillRegistry;
}

export class LlmCompositionEngine implements CompositionEngine {
  readonly #architect: CompositionArchitectRole;
  readonly #critic: LiteraryCriticRole;
  readonly #editor: RevisionEditorRole;
  readonly #writer: DraftWriterRole;

  public constructor(provider: LlmProvider, options: LlmCompositionEngineOptions = {}) {
    const skills = options.skills ?? defaultAgentSkillRegistry;
    this.#architect = new CompositionArchitectRole(provider, skills);
    this.#writer = new DraftWriterRole(provider, skills);
    this.#critic = new LiteraryCriticRole(provider, skills);
    this.#editor = new RevisionEditorRole(provider, skills);
  }

  public prepareComposition(
    input: PrepareCompositionInput,
    signal?: AbortSignal,
  ): Promise<PreparedComposition> {
    return this.#architect.execute(input, signal);
  }

  public generateCandidates(
    input: GenerateCandidatesInput,
    signal?: AbortSignal,
  ): ReturnType<CompositionEngine['generateCandidates']> {
    return this.#writer.execute(input, signal);
  }

  public evaluateDrafts(
    input: EvaluateDraftsInput,
    signal?: AbortSignal,
  ): ReturnType<CompositionEngine['evaluateDrafts']> {
    return this.#critic.execute(input, signal);
  }

  public optimizeDraft(
    input: OptimizeDraftInput,
    signal?: AbortSignal,
  ): ReturnType<CompositionEngine['optimizeDraft']> {
    return this.#editor.execute(input, signal);
  }
}
