import type { AgentSkill } from './types.js';

export const patternParsingSkill: AgentSkill = {
  id: 'pattern-parsing',
  version: '1.0.0',
  kind: 'tool',
  description: '将词谱转换为确定性蓝图，在 Workflow 解析阶段加载。',
  instructions: ['按词谱原始顺序提取分阕、行号、字数、平仄、韵组和非韵句约束，不进行模型推断。'],
};

export const prosodyValidationSkill: AgentSkill = {
  id: 'prosody-validation',
  version: '1.0.0',
  kind: 'tool',
  description: '执行确定性格律检查，在初稿生成和每轮修订后加载。',
  instructions: ['检查结构、字数、平仄、押韵和非韵句避韵，程序报告作为硬性规则。'],
};
