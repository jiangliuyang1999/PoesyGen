import { allusionSafetySkill, literaryEvaluationSkill, themeEvidenceSkill } from './evaluation.js';
import { compositionPlanningSkill, themeAnalysisSkill } from './planning.js';
import {
  allusionRepairSkill,
  literaryPolishSkill,
  prosodyRepairSkill,
  structureRepairSkill,
  themeRepairSkill,
} from './repairs.js';
import { patternParsingSkill, prosodyValidationSkill } from './tools.js';
import { SkillRegistry } from './types.js';
import { ciWritingSkill, prosodyAwarenessSkill, themeFidelitySkill } from './writing.js';

export { repairSkillIds } from './repairs.js';
export { type AgentSkill, type AgentSkillKind, SkillRegistry } from './types.js';

export const defaultAgentSkills = [
  themeAnalysisSkill,
  compositionPlanningSkill,
  ciWritingSkill,
  themeFidelitySkill,
  prosodyAwarenessSkill,
  literaryEvaluationSkill,
  themeEvidenceSkill,
  allusionSafetySkill,
  prosodyRepairSkill,
  themeRepairSkill,
  structureRepairSkill,
  literaryPolishSkill,
  allusionRepairSkill,
  patternParsingSkill,
  prosodyValidationSkill,
] as const;

export const defaultAgentSkillRegistry = new SkillRegistry(defaultAgentSkills);
