import { describe, expect, it } from 'vitest';

import { defaultAgentSkillRegistry, defaultAgentSkills, SkillRegistry } from './index.js';

describe('runtime agent skills', () => {
  it('loads and composes prompt skills in the requested order', () => {
    const prompt = defaultAgentSkillRegistry.composePrompt([
      'theme-analysis',
      'composition-planning',
    ]);

    expect(prompt).toContain('keyFacts');
    expect(prompt).toContain('sectionId');
    expect(prompt.indexOf('keyFacts')).toBeLessThan(prompt.indexOf('sectionId'));
  });

  it('keeps deterministic tool skills out of LLM prompts', () => {
    expect(() => defaultAgentSkillRegistry.composePrompt(['pattern-parsing'])).toThrow(
      'cannot be composed into an LLM prompt',
    );
  });

  it('rejects duplicate and unknown skills', () => {
    expect(() => new SkillRegistry([defaultAgentSkills[0], defaultAgentSkills[0]])).toThrow(
      'Duplicate agent skill',
    );
    expect(() => defaultAgentSkillRegistry.load(['missing-skill'])).toThrow('Unknown agent skill');
  });
});
