import { describe, expect, it } from 'vitest';

import type { LlmProvider } from '@poesygen/llm';

import { defaultAgentSkillRegistry } from '../skills/index.js';
import { CompositionArchitectRole } from './composition-architect.js';
import { DraftWriterRole } from './draft-writer.js';
import { LiteraryCriticRole } from './literary-critic.js';
import { PatternParserRole } from './pattern-parser.js';
import { RevisionEditorRole } from './revision-editor.js';

const provider: LlmProvider = {
  name: 'test',
  generateStructured: () => Promise.reject(new Error('not used')),
};

describe('agent role manifests', () => {
  it('assigns reusable skills to each composition role', () => {
    expect(new CompositionArchitectRole(provider, defaultAgentSkillRegistry).skillIds).toEqual([
      'theme-analysis',
      'composition-planning',
      'allusion-safety',
    ]);
    expect(new DraftWriterRole(provider, defaultAgentSkillRegistry).skillIds).toContain(
      'prosody-awareness',
    );
    expect(new LiteraryCriticRole(provider, defaultAgentSkillRegistry).skillIds).toContain(
      'theme-evidence',
    );
    expect(new PatternParserRole(defaultAgentSkillRegistry).skillIds).toEqual(['pattern-parsing']);
  });

  it('loads the repair skill selected by the optimization mode', () => {
    const role = new RevisionEditorRole(provider, defaultAgentSkillRegistry);

    expect(role.skillsFor('prosody_repair')).toContain('prosody-repair');
    expect(role.skillsFor('theme_repair')).toContain('theme-repair');
    expect(role.skillsFor('structure_repair')).toContain('structure-repair');
    expect(role.skillsFor('literary_polish')).toContain('literary-polish');
    expect(role.skillsFor('allusion_repair')).toContain('allusion-repair');
  });
});
