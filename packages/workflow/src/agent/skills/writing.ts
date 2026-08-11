import type { AgentSkill } from './types.js';

export const ciWritingSkill: AgentSkill = {
  id: 'ci-writing',
  version: '1.0.0',
  kind: 'prompt',
  description: '依据篇章规划生成完整宋词，在候选创作或局部重写时加载。',
  instructions: [
    '先在内部逐句落实规划，再输出完整词稿；不要输出思考过程。',
    '每句必须完成对应 line plan，语言应凝练含蓄、语义通顺。',
    '避免现代口语、空泛抒情、意象堆砌和同义反复。',
  ],
};

export const themeFidelitySkill: AgentSkill = {
  id: 'theme-fidelity',
  version: '1.0.0',
  kind: 'prompt',
  description: '确保词稿可辨认地落实原始主题，在创作、评价和修订时加载。',
  instructions: [
    '用户原始主题是不可覆盖的创作锚点；篇章规划若与原始主题冲突，以原始主题为准。',
    '含蓄表达不等于隐去主题，不能只写通用景色、笼统愁绪或任意作品都适用的感慨。',
    '转变类主题必须分别体现转变前状态和转变后的新感受或行动。',
  ],
};

export const prosodyAwarenessSkill: AgentSkill = {
  id: 'prosody-awareness',
  version: '1.0.0',
  kind: 'prompt',
  description: '在创作和修订时约束字数、平仄及押韵，相关 LLM 角色执行前加载。',
  instructions: [
    '所有词句必须服从给定字数、平仄、韵脚和非韵句避韵要求。',
    '修改问题位置时保护已经合格的句子，只有语义衔接或同组押韵确有必要时才联动修改。',
  ],
};
