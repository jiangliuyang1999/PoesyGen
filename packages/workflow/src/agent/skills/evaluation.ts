import type { AgentSkill } from './types.js';

export const literaryEvaluationSkill: AgentSkill = {
  id: 'literary-evaluation',
  version: '1.0.0',
  kind: 'prompt',
  description: '评价词稿的结构、情感、意象和语言质量，在格律通过后加载。',
  instructions: [
    '判断词稿是否忠于篇章规划，并检查上下阕推进、意象统一、炼字、含蓄程度和原创性。',
    '评分采用 0 至 5 分：5 优秀，4 达标，3 有明显改进空间，2 及以下不合格。',
    '每个问题必须指出具体 lineId（全篇问题可省略），并给出简短证据和可执行建议。',
    '不要因为格律已由程序检查就假定文学质量合格。',
  ],
};

export const themeEvidenceSkill: AgentSkill = {
  id: 'theme-evidence',
  version: '1.0.0',
  kind: 'prompt',
  description: '执行主题盲读和原文证据核验，在文学评价时加载。',
  instructions: [
    '先直接对照用户原始主题，再检查主题简报中的每一项 keyFacts。',
    'themeEvidence 的 requirement 字段必须原样填写对应的原始主题或 keyFacts 文本。',
    '必须进行盲读测试：假定读者不知道输入主题，仅看词稿能否辨认核心事件、处境或人物关系。',
    '只能看出普通写景、泛泛感怀或模糊情绪变化时，themeRecognizable 必须为 false，themeFidelity 不得高于 2。',
    'themeEvidence 必须引用词稿中真实存在的原文片段并指向对应 lineId，不得用规划文字充当证据。',
    '转变类主题必须同时有转变前后状态的具体证据；只有一侧不得判为 clear。',
  ],
};

export const allusionSafetySkill: AgentSkill = {
  id: 'allusion-safety',
  version: '1.0.0',
  kind: 'prompt',
  description: '防止虚构或误用典故，在规划、创作、评价和修订时加载。',
  instructions: [
    '典故仅可使用 verified=true 的可靠项；没有可信出处时不得自行添加或暗示生僻出处。',
    '没有规划典故时，不得因未使用典故而降低文学评分。',
  ],
};
