import type { LlmProvider } from '@poesygen/llm';

import {
  compositionPlanSchema,
  formatPlanningBlueprint,
  parseCompositionPlan,
  parsePreparedComposition,
  preparationMaxTokens,
  type PreparedComposition,
  type PrepareCompositionInput,
  refinementRequirements,
} from '../../composition.js';
import { type SkillRegistry } from '../skills/index.js';
import type { AgentRole } from './types.js';

export class CompositionArchitectRole implements AgentRole<
  PrepareCompositionInput,
  PreparedComposition
> {
  public readonly id = 'composition-architect';
  public readonly skillIds = ['theme-analysis', 'composition-planning', 'allusion-safety'] as const;
  readonly #provider: LlmProvider;
  readonly #skills: SkillRegistry;

  public constructor(provider: LlmProvider, skills: SkillRegistry) {
    this.#provider = provider;
    this.#skills = skills;
  }

  public async execute(
    input: PrepareCompositionInput,
    signal?: AbortSignal,
  ): Promise<PreparedComposition> {
    const refining = input.request.sourceContext !== undefined;
    const sourcePlan =
      input.request.sourceContext === undefined
        ? undefined
        : parseCompositionPlan(input.request.sourceContext.plan, input.blueprint);
    const result = await this.#provider.generateStructured(
      {
        operation: 'plan',
        messages: [
          {
            role: 'system',
            content: this.#skills.composePrompt(
              this.skillIds,
              ['你是宋词创作前的主题编辑与篇章策划者，一次完成主题解析和篇章规划，不写完整词句。'],
              [
                refining
                  ? '这是局部修改：brief 沿用输入，不要返回 brief；只返回调整后的 plan，未受影响的任务保持不变。'
                  : '这是首次创作：同时返回 brief 和 plan。',
                '当前没有可信典故库，allusions 必须为空。',
                '只输出 JSON 对象，不输出解释。',
              ],
            ),
          },
          {
            role: 'user',
            content: [
              `用户原始主题（最高优先级）：${input.request.theme}`,
              input.request.sourceContext === undefined
                ? ''
                : `原主题简报：\n${JSON.stringify(input.request.sourceContext.themeBrief)}`,
              sourcePlan === undefined ? '' : `原篇章规划：\n${JSON.stringify(sourcePlan)}`,
              `规划蓝图：\n${formatPlanningBlueprint(input.blueprint)}`,
              refinementRequirements(input.request),
              '返回格式：',
              refining
                ? `{"plan":${compositionPlanSchema(input.blueprint)}}`
                : `{"brief":{"coreTheme":"核心题旨","subject":"描写对象","setting":"时空场景","perspective":"叙述视角","emotionalArc":["起","承","转","合"],"keyFacts":["必须保留的信息"],"imagery":["核心意象"],"avoid":["避免事项"],"assumptions":["补充假设"]},"plan":${compositionPlanSchema(input.blueprint)}}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        parse: (value) => parsePreparedComposition(value, input),
        temperature: refining ? 0.3 : 0.35,
        maxTokens: preparationMaxTokens(input.blueprint, refining),
        metadata: {
          roleId: this.id,
          skillIds: this.skillIds.join(','),
          patternId: input.pattern.id,
          promptVersion: refining ? 'prepare-refine-v3' : 'prepare-v3',
        },
      },
      signal,
    );
    return result.value;
  }
}
