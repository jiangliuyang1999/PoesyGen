import type { OptimizationMode } from '../../composition.js';

import type { AgentSkill } from './types.js';

export const prosodyRepairSkill: AgentSkill = {
  id: 'prosody-repair',
  version: '1.0.0',
  kind: 'prompt',
  description: '修复字数、平仄、押韵和结构错误，在程序格律校验失败时加载。',
  instructions: [
    '优先修复程序报告中的字数、平仄、押韵和结构错误；押韵冲突可联动同组韵脚，但不得牺牲句意。',
  ],
};

export const themeRepairSkill: AgentSkill = {
  id: 'theme-repair',
  version: '1.0.0',
  kind: 'prompt',
  description: '修复偏题和主题事实遗漏，在主题评价不达标时加载。',
  instructions: [
    '优先修复偏题、主题事实遗漏和情感方向错误，使每句重新落实规划，同时保持已通过的格律。',
  ],
};

export const structureRepairSkill: AgentSkill = {
  id: 'structure-repair',
  version: '1.0.0',
  kind: 'prompt',
  description: '修复分阕割裂和情感跳跃，在结构评价不达标时加载。',
  instructions: [
    '优先修复上下阕割裂、语义跳跃和情感推进不完整，建立清晰承接，同时保持已通过的格律。',
  ],
};

export const literaryPolishSkill: AgentSkill = {
  id: 'literary-polish',
  version: '1.0.0',
  kind: 'prompt',
  description: '改善炼字、意象和语言质感，在核心质量达标前加载。',
  instructions: [
    '优先炼字、统一意象、减少直白和陈词滥调；不堆砌形容词，不改变核心叙事，并保持已通过的格律。',
  ],
};

export const allusionRepairSkill: AgentSkill = {
  id: 'allusion-repair',
  version: '1.0.0',
  kind: 'prompt',
  description: '删除或改正不可靠典故，在典故评价失败时加载。',
  instructions: [
    '优先删除、改正或淡化牵强和不可靠的典故；没有可靠出处时改用自然意象表达，并保持已通过的格律。',
  ],
};

export const repairSkillIds: Readonly<Record<OptimizationMode, string>> = {
  prosody_repair: prosodyRepairSkill.id,
  theme_repair: themeRepairSkill.id,
  structure_repair: structureRepairSkill.id,
  literary_polish: literaryPolishSkill.id,
  allusion_repair: allusionRepairSkill.id,
};
