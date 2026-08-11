import type { AgentSkill } from './types.js';

export const themeAnalysisSkill: AgentSkill = {
  id: 'theme-analysis',
  version: '1.0.0',
  kind: 'prompt',
  description: '提取主题事实、情感方向和创作边界，在首次创作规划前加载。',
  instructions: [
    '用户原始主题是最高优先级，不得被意象或风格替代。',
    'brief 必须忠实保留时间、地点、人物关系和情感方向；keyFacts 拆出不可缺失的语义要素。',
    '转变类主题必须同时保留转变前状态与转变后状态。',
    '缺失信息可形成克制假设，但只能放入 assumptions，不得冒充用户事实。',
  ],
};

export const compositionPlanningSkill: AgentSkill = {
  id: 'composition-planning',
  version: '1.0.0',
  kind: 'prompt',
  description: '规划分阕结构和逐句任务，在生成完整词稿前加载。',
  instructions: [
    '规划必须形成清晰的起承转合，每一分阕和每一句都承担不同且连续的任务。',
    '必须安排足够的逐句任务，让不了解输入的普通读者也能辨认核心事件、处境或人物关系。',
    '含蓄意味着通过动作、身体感受、前后状态和环境反应表达，不等于隐去主题。',
    '每个 sectionId 和 lineId 必须与词谱蓝图完全一致，不得遗漏、重复或新增。',
    '逐句 task 用一句短语合并本句作用、内容和承接关系；image 只填一个主意象；不得提前写出成句。',
    '意象数量要克制并形成贯穿关系，不要逐句无关地堆砌景物。',
  ],
};
