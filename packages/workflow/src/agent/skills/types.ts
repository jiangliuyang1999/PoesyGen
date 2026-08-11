export type AgentSkillKind = 'prompt' | 'tool';

export interface AgentSkill {
  readonly id: string;
  readonly version: string;
  readonly kind: AgentSkillKind;
  readonly description: string;
  readonly instructions: ReadonlyArray<string>;
}

export class SkillRegistry {
  readonly #skills: ReadonlyMap<string, AgentSkill>;

  public constructor(skills: ReadonlyArray<AgentSkill>) {
    const entries = new Map<string, AgentSkill>();
    for (const skill of skills) {
      if (entries.has(skill.id)) throw new Error(`Duplicate agent skill: ${skill.id}`);
      entries.set(skill.id, skill);
    }
    this.#skills = entries;
  }

  public load(ids: ReadonlyArray<string>): ReadonlyArray<AgentSkill> {
    return ids.map((id) => {
      const skill = this.#skills.get(id);
      if (skill === undefined) throw new Error(`Unknown agent skill: ${id}`);
      return skill;
    });
  }

  public composePrompt(
    ids: ReadonlyArray<string>,
    before: ReadonlyArray<string> = [],
    after: ReadonlyArray<string> = [],
  ): string {
    const skills = this.load(ids);
    const toolSkill = skills.find(({ kind }) => kind === 'tool');
    if (toolSkill !== undefined) {
      throw new Error(`Tool skill ${toolSkill.id} cannot be composed into an LLM prompt`);
    }
    return [...before, ...skills.flatMap(({ instructions }) => instructions), ...after].join('\n');
  }
}
