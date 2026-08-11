import type { WorkDraft } from '@poesygen/domain';
import type { LlmProvider } from '@poesygen/llm';

import {
  formatBlueprint,
  formatDraft,
  formatProsodyReport,
  formatRhymeGuide,
  optimizationMaxTokens,
  optimizationTemperature,
  type OptimizationMode,
  type OptimizeDraftInput,
  parseSingleDraftPayload,
  payloadToDraft,
  refinementRequirements,
} from '../../composition.js';
import { repairSkillIds, type SkillRegistry } from '../skills/index.js';
import type { AgentRole } from './types.js';

export class RevisionEditorRole implements AgentRole<OptimizeDraftInput, WorkDraft> {
  public readonly id = 'revision-editor';
  public readonly skillIds = ['theme-fidelity', 'prosody-awareness', 'allusion-safety'] as const;
  readonly #provider: LlmProvider;
  readonly #skills: SkillRegistry;

  public constructor(provider: LlmProvider, skills: SkillRegistry) {
    this.#provider = provider;
    this.#skills = skills;
  }

  public skillsFor(mode: OptimizationMode): ReadonlyArray<string> {
    return [...this.skillIds, repairSkillIds[mode]];
  }

  public async execute(input: OptimizeDraftInput, signal?: AbortSignal): Promise<WorkDraft> {
    const skillIds = this.skillsFor(input.mode);
    const result = await this.#provider.generateStructured(
      {
        operation: input.mode === 'prosody_repair' ? 'repair' : 'optimize',
        messages: [
          {
            role: 'system',
            content: this.#skills.composePrompt(
              skillIds,
              ['你是宋词定稿编辑，只修复报告指出的问题，并返回完整词稿。'],
              [
                '未涉及的优秀句子保持不变；只有语义衔接或同组押韵确有必要时才联动修改。',
                '不要输出思考过程，只输出指定 JSON。',
              ],
            ),
          },
          {
            role: 'user',
            content: [
              `优化模式：${input.mode}`,
              `用户原始主题（不可偏移）：${input.request.theme}`,
              `主题简报：\n${JSON.stringify(input.brief)}`,
              `篇章规划：\n${JSON.stringify(input.plan)}`,
              `格律约束：\n${formatBlueprint(input.blueprint)}`,
              formatRhymeGuide(input.blueprint),
              `当前词稿：\n${formatDraft(input.draft)}`,
              `程序格律报告：\n${formatProsodyReport(input.prosodyReport)}`,
              input.qualityReport === undefined
                ? ''
                : `文学评价：\n${JSON.stringify(input.qualityReport)}`,
              refinementRequirements(input.request),
              `返回格式：{"title":"可选题目","lines":[${input.blueprint.lines
                .map(({ lineId }) => `{"lineId":"${lineId}","text":"优化后正文"}`)
                .join(',')}]}`,
            ]
              .filter(Boolean)
              .join('\n\n'),
          },
        ],
        parse: (value) => {
          const payload = parseSingleDraftPayload(value, input.blueprint);
          return payloadToDraft(payload, input.request, input.blueprint, input.draft.version + 1);
        },
        temperature: optimizationTemperature(input.mode),
        maxTokens: optimizationMaxTokens(input.blueprint),
        metadata: {
          roleId: this.id,
          skillIds: skillIds.join(','),
          patternId: input.pattern.id,
          promptVersion: 'optimize-v2',
          mode: input.mode,
          version: String(input.draft.version),
        },
      },
      signal,
    );
    return result.value;
  }
}
