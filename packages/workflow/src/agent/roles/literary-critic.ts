import type { QualityReport } from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';

import {
  evaluationMaxTokens,
  type EvaluateDraftsInput,
  formatDraft,
  parseQualityReports,
} from '../../composition.js';
import { type SkillRegistry } from '../skills/index.js';
import type { AgentRole } from './types.js';

export class LiteraryCriticRole implements AgentRole<
  EvaluateDraftsInput,
  ReadonlyArray<QualityReport>
> {
  public readonly id = 'literary-critic';
  public readonly skillIds = ['literary-evaluation', 'theme-evidence', 'allusion-safety'] as const;
  readonly #provider: LlmProvider;
  readonly #skills: SkillRegistry;

  public constructor(provider: LlmProvider, skills: SkillRegistry) {
    this.#provider = provider;
    this.#skills = skills;
  }

  public async execute(
    input: EvaluateDraftsInput,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<QualityReport>> {
    const result = await this.#provider.generateStructured(
      {
        operation: 'evaluate',
        messages: [
          {
            role: 'system',
            content: this.#skills.composePrompt(
              this.skillIds,
              ['你是独立的宋词文学编辑，只评价，不改写。'],
              ['只输出 JSON，不输出分析过程。'],
            ),
          },
          {
            role: 'user',
            content: [
              `用户原始主题（评价基准）：${input.request.theme}`,
              `主题简报：\n${JSON.stringify(input.brief)}`,
              `篇章规划：\n${JSON.stringify(input.plan)}`,
              `待评价词稿：\n${input.drafts
                .map((draft, index) => `词稿 ${index + 1}：\n${formatDraft(draft)}`)
                .join('\n\n')}`,
              '返回格式：',
              '{"evaluations":[{"candidate":1,"summary":"总体评价","themeRecognizable":true,"themeEvidence":[{"requirement":"必须原样填写用户原始主题","status":"clear或implicit或missing","lineIds":["词稿中的lineId"],"quotes":["词稿中的原文片段"],"explanation":"为何这些原文足以或不足以表现主题"}],"scores":{"themeFidelity":0,"coherence":0,"emotionalArc":0,"imagery":0,"diction":0,"originality":0,"allusionFitness":0},"issues":[{"dimension":"themeFidelity","severity":"error或warning","lineId":"可选","message":"问题","suggestion":"建议"}]}]}',
            ].join('\n\n'),
          },
        ],
        parse: (value) =>
          parseQualityReports(value, input.drafts, input.request.theme, input.brief.keyFacts),
        temperature: 0.15,
        maxTokens: evaluationMaxTokens(input),
        metadata: {
          roleId: this.id,
          skillIds: this.skillIds.join(','),
          patternId: input.pattern.id,
          promptVersion: 'evaluate-v2',
          candidateCount: String(input.drafts.length),
        },
      },
      signal,
    );
    return result.value;
  }
}
