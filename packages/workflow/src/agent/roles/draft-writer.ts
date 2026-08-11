import type { WorkDraft } from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';

import {
  draftMaxTokens,
  formatBlueprint,
  formatDraft,
  formatRhymeGuide,
  type GenerateCandidatesInput,
  parseCandidatePayloads,
  payloadToDraft,
  refinementRequirements,
} from '../../composition.js';
import { type SkillRegistry } from '../skills/index.js';
import type { AgentRole } from './types.js';

export class DraftWriterRole implements AgentRole<
  GenerateCandidatesInput,
  ReadonlyArray<WorkDraft>
> {
  public readonly id = 'draft-writer';
  public readonly skillIds = [
    'ci-writing',
    'theme-fidelity',
    'prosody-awareness',
    'allusion-safety',
  ] as const;
  readonly #provider: LlmProvider;
  readonly #skills: SkillRegistry;

  public constructor(provider: LlmProvider, skills: SkillRegistry) {
    this.#provider = provider;
    this.#skills = skills;
  }

  public async execute(
    input: GenerateCandidatesInput,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<WorkDraft>> {
    const sourceVersion = input.request.sourceDraft?.version ?? 0;
    const result = await this.#provider.generateStructured(
      {
        operation: input.request.sourceDraft === undefined ? 'draft' : 'refine',
        messages: [
          {
            role: 'system',
            content: this.#skills.composePrompt(
              this.skillIds,
              ['你是严谨而有审美判断的宋词创作者。'],
              [
                input.request.sourceDraft === undefined
                  ? '生成一个完整初稿，逐句落实主题与篇章规划，后续将依据校验和评价结果逐轮优化。'
                  : '根据用户意见生成一个完整新版本；未涉及的句子尽量保持，只做必要的格律和衔接联动。',
                '只输出 JSON，不含序号、标点说明或额外文字。',
              ],
            ),
          },
          {
            role: 'user',
            content: [
              `用户原始主题（不可偏移）：${input.request.theme}`,
              `主题简报：\n${JSON.stringify(input.brief)}`,
              `篇章规划：\n${JSON.stringify(input.plan)}`,
              `格律约束：\n${formatBlueprint(input.blueprint)}`,
              formatRhymeGuide(input.blueprint),
              input.request.sourceDraft === undefined
                ? ''
                : `当前词稿：\n${formatDraft(input.request.sourceDraft)}`,
              refinementRequirements(input.request),
              `返回格式：{"candidates":[{"title":"可选题目","lines":[${input.blueprint.lines
                .map(({ lineId }) => `{"lineId":"${lineId}","text":"该句正文"}`)
                .join(',')}]}]}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        parse: (value) =>
          parseCandidatePayloads(value, input.blueprint, input.candidateCount).map((payload) =>
            payloadToDraft(payload, input.request, input.blueprint, sourceVersion + 1),
          ),
        temperature: input.request.sourceDraft === undefined ? 0.72 : 0.45,
        maxTokens: draftMaxTokens(input.blueprint, input.candidateCount),
        metadata: {
          roleId: this.id,
          skillIds: this.skillIds.join(','),
          patternId: input.pattern.id,
          promptVersion: input.request.sourceDraft === undefined ? 'draft-v3' : 'refine-v3',
          candidateCount: String(input.candidateCount),
        },
      },
      signal,
    );
    return result.value;
  }
}
