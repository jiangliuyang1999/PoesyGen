import type {
  CiPattern,
  CompositionLinePlan,
  CompositionPlan,
  CompositionSectionPlan,
  GenerationRequest,
  PatternBlueprint,
  PlannedAllusion,
  ProsodyReport,
  QualityDimension,
  QualityIssue,
  QualityReport,
  QualityScores,
  ThemeEvidence,
  ThemeBrief,
  WorkDraft,
} from '@poesygen/domain';
import { findCilinRhymeGroup } from '@poesygen/prosody';

export type OptimizationMode =
  'prosody_repair' | 'theme_repair' | 'structure_repair' | 'literary_polish' | 'allusion_repair';

export interface PrepareCompositionInput {
  readonly request: GenerationRequest;
  readonly pattern: CiPattern;
  readonly blueprint: PatternBlueprint;
}

export interface PreparedComposition {
  readonly brief: ThemeBrief;
  readonly plan: CompositionPlan;
}

interface PlannedCompositionInput extends PrepareCompositionInput {
  readonly brief: ThemeBrief;
  readonly plan: CompositionPlan;
}

export interface GenerateCandidatesInput extends PlannedCompositionInput {
  readonly candidateCount: number;
}

export interface EvaluateDraftsInput extends PlannedCompositionInput {
  readonly drafts: ReadonlyArray<WorkDraft>;
}

export interface OptimizeDraftInput extends PlannedCompositionInput {
  readonly draft: WorkDraft;
  readonly prosodyReport: ProsodyReport;
  readonly qualityReport?: QualityReport;
  readonly mode: OptimizationMode;
}

export interface CompositionEngine {
  prepareComposition(
    input: PrepareCompositionInput,
    signal?: AbortSignal,
  ): Promise<PreparedComposition>;
  generateCandidates(
    input: GenerateCandidatesInput,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<WorkDraft>>;
  evaluateDrafts(
    input: EvaluateDraftsInput,
    signal?: AbortSignal,
  ): Promise<ReadonlyArray<QualityReport>>;
  optimizeDraft(input: OptimizeDraftInput, signal?: AbortSignal): Promise<WorkDraft>;
}

export interface DraftPayload {
  readonly title?: string;
  readonly lines: ReadonlyArray<string>;
}

const qualityDimensions: ReadonlyArray<QualityDimension> = [
  'themeFidelity',
  'coherence',
  'emotionalArc',
  'imagery',
  'diction',
  'originality',
  'allusionFitness',
];

export function parsePreparedComposition(
  value: unknown,
  input: PrepareCompositionInput,
): PreparedComposition {
  const record = requireRecord(value, '创作准备结果');
  const brief =
    input.request.sourceContext === undefined
      ? anchorThemeBrief(parseThemeBrief(record['brief']), input.request.theme)
      : anchorThemeBrief(input.request.sourceContext.themeBrief, input.request.theme);
  return {
    brief,
    plan: parseCompositionPlan(record['plan'], input.blueprint),
  };
}

function parseThemeBrief(value: unknown): ThemeBrief {
  const record = requireRecord(value, '主题解析结果');
  return {
    coreTheme: requireText(record['coreTheme'], 'coreTheme'),
    subject: requireText(record['subject'], 'subject'),
    setting: requireText(record['setting'], 'setting'),
    perspective: requireText(record['perspective'], 'perspective'),
    emotionalArc: parseTextArray(record['emotionalArc'], 'emotionalArc', true),
    keyFacts: parseTextArray(record['keyFacts'], 'keyFacts'),
    imagery: parseTextArray(record['imagery'], 'imagery'),
    avoid: parseTextArray(record['avoid'], 'avoid'),
    assumptions: parseTextArray(record['assumptions'], 'assumptions'),
  };
}

function anchorThemeBrief(brief: ThemeBrief, originalTheme: string): ThemeBrief {
  const theme = originalTheme.trim();
  return {
    ...brief,
    keyFacts: [
      theme,
      ...brief.keyFacts.filter(
        (fact) => normalizeThemeRequirement(fact) !== normalizeThemeRequirement(theme),
      ),
    ],
  };
}

export function parseCompositionPlan(value: unknown, blueprint: PatternBlueprint): CompositionPlan {
  const record = requireRecord(value, '篇章规划');
  const sections = parsePlanSections(record['sections']);
  const lines = parsePlanLines(record['lines']);
  assertExactIds(
    sections.map(({ sectionId }) => sectionId),
    blueprint.sections.map(({ sectionId }) => sectionId),
    'sectionId',
  );
  assertExactIds(
    lines.map(({ lineId }) => lineId),
    blueprint.lines.map(({ lineId }) => lineId),
    'lineId',
  );
  return {
    thesis: requireText(record['thesis'], 'thesis'),
    style: requireText(record['style'], 'style'),
    voice: requireText(record['voice'], 'voice'),
    imagery: parseTextArray(record['imagery'] ?? record['imageryPalette'], 'imagery'),
    allusions: parseAllusions(record['allusions']),
    sections: sortByExpectedIds(
      sections,
      blueprint.sections.map(({ sectionId }) => sectionId),
      ({ sectionId }) => sectionId,
    ),
    lines: sortByExpectedIds(
      lines,
      blueprint.lines.map(({ lineId }) => lineId),
      ({ lineId }) => lineId,
    ),
  };
}

function parsePlanSections(value: unknown): ReadonlyArray<CompositionSectionPlan> {
  if (!Array.isArray(value)) throw new Error('篇章规划缺少 sections 数组');
  return value.map((item) => {
    const record = requireRecord(item, 'section plan');
    return {
      sectionId: requireText(record['sectionId'], 'sectionId'),
      task: requireCompactText(record, 'task', ['purpose', 'content']),
      arc: requireCompactText(record, 'arc', ['emotionalMovement', 'transition']),
    };
  });
}

function parsePlanLines(value: unknown): ReadonlyArray<CompositionLinePlan> {
  if (!Array.isArray(value)) throw new Error('篇章规划缺少 lines 数组');
  return value.map((item) => {
    const record = requireRecord(item, 'line plan');
    return {
      lineId: requireText(record['lineId'], 'lineId'),
      task: requireCompactText(record, 'task', ['purpose', 'content', 'connection']),
      emotion: requireText(record['emotion'], 'emotion'),
      image:
        optionalText(record['image']) ??
        parseTextArray(record['imagery'], 'imagery')[0] ??
        '无固定意象',
      ending: requireCompactText(record, 'ending', ['endingIntent']),
    };
  });
}

function parseAllusions(value: unknown): ReadonlyArray<PlannedAllusion> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('allusions 必须是数组');
  return value.map((item) => {
    const record = requireRecord(item, 'allusion');
    const source =
      typeof record['source'] === 'string' && record['source'].trim() !== ''
        ? record['source'].trim()
        : undefined;
    return {
      phrase: requireText(record['phrase'], 'phrase'),
      meaning: requireText(record['meaning'], 'meaning'),
      purpose: requireText(record['purpose'], 'purpose'),
      verified: false,
      ...(source === undefined ? {} : { source }),
    };
  });
}

export function parseCandidatePayloads(
  value: unknown,
  blueprint: PatternBlueprint,
  expectedCount: number,
): ReadonlyArray<DraftPayload> {
  const record = requireRecord(value, '候选词稿');
  const candidates = record['candidates'];
  if (!Array.isArray(candidates) || candidates.length === 0) {
    throw new Error('候选词稿缺少 candidates 数组');
  }
  const parsed = candidates
    .slice(0, expectedCount)
    .map((candidate) => parseSingleDraftPayload(candidate, blueprint));
  return parsed;
}

export function parseSingleDraftPayload(value: unknown, blueprint: PatternBlueprint): DraftPayload {
  const record = requireRecord(value, '词稿');
  const rawLines = record['lines'];
  if (!Array.isArray(rawLines) || rawLines.length === 0) {
    throw new Error('词稿缺少 lines 数组');
  }
  const expectedIds = blueprint.lines.map(({ lineId }) => lineId);
  const lineEntries = rawLines.map((item, index) => {
    if (typeof item === 'string') {
      return {
        lineId: expectedIds[index] ?? `extra-line-${index + 1}`,
        text: normalizeLine(item),
      };
    }
    const line = requireRecord(item, '词稿行');
    return {
      lineId: requireText(line['lineId'], 'lineId'),
      text: normalizeLine(requireText(line['text'], 'text')),
    };
  });
  assertExactIds(
    lineEntries.map(({ lineId }) => lineId),
    expectedIds,
    '词稿 lineId',
  );
  const ordered = sortByExpectedIds(lineEntries, expectedIds, ({ lineId }) => lineId);
  if (ordered.some(({ text }) => text === '')) throw new Error('词稿正文不得为空');
  return {
    lines: ordered.map(({ text }) => text),
    ...(typeof record['title'] === 'string' && record['title'].trim() !== ''
      ? { title: record['title'].trim() }
      : {}),
  };
}

export function parseQualityReports(
  value: unknown,
  drafts: ReadonlyArray<WorkDraft>,
  originalTheme: string,
  keyFacts: ReadonlyArray<string>,
): ReadonlyArray<QualityReport> {
  const record = requireRecord(value, '文学评价');
  const evaluations = record['evaluations'];
  if (!Array.isArray(evaluations)) throw new Error('文学评价缺少 evaluations 数组');
  const byCandidate = new Map<number, QualityReport>();
  for (const item of evaluations) {
    const evaluation = requireRecord(item, 'candidate evaluation');
    const candidate = evaluation['candidate'];
    if (typeof candidate !== 'number' || !Number.isInteger(candidate)) {
      throw new Error('文学评价 candidate 必须是整数');
    }
    const draft = drafts[candidate - 1];
    if (draft === undefined) continue;
    const themeEvidence = parseThemeEvidence(evaluation['themeEvidence'], draft);
    const requiredFacts = uniqueThemeRequirements([originalTheme, ...keyFacts]);
    const uncoveredFacts = requiredFacts.filter(
      (fact) =>
        !themeEvidence.some(
          ({ requirement, status }) =>
            status === 'clear' &&
            normalizeThemeRequirement(requirement) === normalizeThemeRequirement(fact),
        ),
    );
    const themeRecognizable =
      evaluation['themeRecognizable'] === true && uncoveredFacts.length === 0;
    const rawScores = parseQualityScores(evaluation['scores']);
    const scores: QualityScores = themeRecognizable
      ? rawScores
      : {
          ...rawScores,
          themeFidelity: Math.min(rawScores.themeFidelity, 2),
        };
    const parsedIssues = parseQualityIssues(evaluation['issues']);
    const issues: ReadonlyArray<QualityIssue> =
      themeRecognizable ||
      parsedIssues.some(
        ({ dimension, severity }) => dimension === 'themeFidelity' && severity === 'error',
      )
        ? parsedIssues
        : [
            ...parsedIssues,
            {
              dimension: 'themeFidelity',
              severity: 'error',
              message: `词稿缺少可核验的主题证据：${uncoveredFacts.join('、')}`,
              suggestion: '用具体动作、身体感受或前后状态变化补足主题，使盲读者能够辨认核心事件。',
            },
          ];
    byCandidate.set(candidate, {
      passed: qualityPassed(scores, issues, themeRecognizable),
      summary: requireText(evaluation['summary'], 'summary'),
      themeRecognizable,
      themeEvidence,
      scores,
      issues,
    });
  }
  return Array.from({ length: drafts.length }, (_, index) => {
    const report = byCandidate.get(index + 1);
    return report ?? missingQualityReport(index + 1);
  });
}

function missingQualityReport(candidate: number): QualityReport {
  return {
    passed: false,
    summary: `模型未返回词稿 ${candidate} 的完整文学评价。`,
    themeRecognizable: false,
    themeEvidence: [],
    scores: {
      themeFidelity: 0,
      coherence: 0,
      emotionalArc: 0,
      imagery: 0,
      diction: 0,
      originality: 0,
      allusionFitness: 0,
    },
    issues: [
      {
        dimension: 'coherence',
        severity: 'error',
        message: '缺少完整文学评价',
        suggestion: '重新评价当前词稿',
      },
    ],
  };
}

function parseThemeEvidence(value: unknown, draft: WorkDraft): ReadonlyArray<ThemeEvidence> {
  if (!Array.isArray(value)) return [];
  const lines = new Map(draft.lines.map(({ id, text }) => [id, text]));
  return value.map((item) => {
    const record = requireRecord(item, 'theme evidence');
    const requestedStatus =
      record['status'] === 'clear'
        ? 'clear'
        : record['status'] === 'implicit'
          ? 'implicit'
          : 'missing';
    const lineIds = parseTextArray(record['lineIds'], 'themeEvidence.lineIds').filter((lineId) =>
      lines.has(lineId),
    );
    const quotes = parseTextArray(record['quotes'], 'themeEvidence.quotes').filter((quote) =>
      lineIds.some((lineId) => lines.get(lineId)?.includes(quote) === true),
    );
    const status =
      requestedStatus === 'clear' && lineIds.length > 0 && quotes.length > 0
        ? 'clear'
        : requestedStatus === 'missing'
          ? 'missing'
          : 'implicit';
    return {
      requirement: requireText(record['requirement'], 'themeEvidence.requirement'),
      status,
      lineIds,
      quotes,
      explanation: requireText(record['explanation'], 'themeEvidence.explanation'),
    };
  });
}

function parseQualityScores(value: unknown): QualityScores {
  const record = requireRecord(value, 'quality scores');
  return Object.fromEntries(
    qualityDimensions.map((dimension) => [dimension, clampScore(record[dimension], dimension)]),
  ) as unknown as QualityScores;
}

function parseQualityIssues(value: unknown): ReadonlyArray<QualityIssue> {
  if (value === undefined) return [];
  if (!Array.isArray(value)) throw new Error('文学评价 issues 必须是数组');
  return value.map((item) => {
    const record = requireRecord(item, 'quality issue');
    const dimension = record['dimension'];
    if (!qualityDimensions.includes(dimension as QualityDimension)) {
      throw new Error(`未知文学评价维度：${String(dimension)}`);
    }
    const severity = record['severity'] === 'error' ? 'error' : 'warning';
    const lineId =
      typeof record['lineId'] === 'string' && record['lineId'].trim() !== ''
        ? record['lineId'].trim()
        : undefined;
    return {
      dimension: dimension as QualityDimension,
      severity,
      message: requireText(record['message'], 'message'),
      suggestion: requireText(record['suggestion'], 'suggestion'),
      ...(lineId === undefined ? {} : { lineId }),
    };
  });
}

function qualityPassed(
  scores: QualityScores,
  issues: ReadonlyArray<QualityIssue>,
  themeRecognizable: boolean,
): boolean {
  return (
    themeRecognizable &&
    scores.themeFidelity >= 4 &&
    scores.coherence >= 4 &&
    scores.emotionalArc >= 3 &&
    scores.imagery >= 3 &&
    scores.diction >= 3 &&
    scores.originality >= 3 &&
    scores.allusionFitness >= 3 &&
    !issues.some(({ severity }) => severity === 'error')
  );
}

function uniqueThemeRequirements(requirements: ReadonlyArray<string>): ReadonlyArray<string> {
  const unique = new Map<string, string>();
  for (const requirement of requirements) {
    const trimmed = requirement.trim();
    if (trimmed === '') continue;
    unique.set(normalizeThemeRequirement(trimmed), trimmed);
  }
  return [...unique.values()];
}

function normalizeThemeRequirement(value: string): string {
  return value.replace(/[\p{P}\p{Z}\s]/gu, '').toLocaleLowerCase('zh-CN');
}

export function payloadToDraft(
  payload: DraftPayload,
  request: GenerationRequest,
  blueprint: PatternBlueprint,
  version: number,
): WorkDraft {
  return {
    id: globalThis.crypto.randomUUID(),
    patternId: blueprint.patternId,
    theme: request.theme,
    lines: payload.lines.map((text, index) => ({
      id: blueprint.lines[index]?.lineId ?? `extra-line-${index + 1}`,
      text,
    })),
    version,
    ...(payload.title === undefined ? {} : { title: payload.title }),
    ...(typeof request.preferredRhymeGroup === 'string'
      ? { requestedRhymeGroup: request.preferredRhymeGroup }
      : {}),
  };
}

export function formatPlanningBlueprint(blueprint: PatternBlueprint): string {
  return blueprint.sections
    .map((section) => {
      const lines = section.lineIds.map((lineId) => {
        const line = blueprint.lines.find((candidate) => candidate.lineId === lineId)!;
        return `${line.lineId}:${line.characterCount}字`;
      });
      return `${section.name}(${section.sectionId})：${lines.join('，')}`;
    })
    .join('\n');
}

export function compositionPlanSchema(blueprint: PatternBlueprint): string {
  return JSON.stringify({
    thesis: '全篇立意',
    style: '语言风格',
    voice: '叙述声音',
    imagery: ['贯穿意象'],
    allusions: [],
    sections: blueprint.sections.map(({ sectionId }) => ({
      sectionId,
      task: '本阕写什么及其作用',
      arc: '本阕情绪推进与转折',
    })),
    lines: blueprint.lines.map(({ lineId }) => ({
      lineId,
      task: '本句内容、作用及承接',
      emotion: '本句情绪',
      image: '一个主意象',
      ending: '句尾语义方向',
    })),
  });
}

export function preparationMaxTokens(blueprint: PatternBlueprint, refining: boolean): number {
  const estimate =
    (refining ? 600 : 820) + blueprint.lines.length * 80 + blueprint.sections.length * 60;
  return clampTokenLimit(estimate, refining ? 900 : 1_200, 3_200);
}

export function draftMaxTokens(blueprint: PatternBlueprint, candidateCount: number): number {
  const characters = blueprint.lines.reduce((sum, line) => sum + line.characterCount, 0);
  return clampTokenLimit(600 + characters * candidateCount * 5, 800, 1_600);
}

export function evaluationMaxTokens(input: EvaluateDraftsInput): number {
  const estimate =
    550 +
    input.drafts.length * input.brief.keyFacts.length * 70 +
    input.drafts.length * input.blueprint.lines.length * 18;
  return clampTokenLimit(estimate, 800, 1_800);
}

export function optimizationMaxTokens(blueprint: PatternBlueprint): number {
  const characters = blueprint.lines.reduce((sum, line) => sum + line.characterCount, 0);
  return clampTokenLimit(550 + characters * 5, 700, 1_000);
}

function clampTokenLimit(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, Math.ceil(value)));
}

export function formatBlueprint(blueprint: PatternBlueprint): string {
  return blueprint.sections
    .flatMap((section) => [
      `[${section.name}]`,
      ...section.lineIds.map((lineId) => {
        const line = blueprint.lines.find((candidate) => candidate.lineId === lineId)!;
        const ending = line.nonRhymeEnding
          ? '；句尾不押本词正在使用的韵部'
          : line.rhymeLabel === undefined
            ? ''
            : `；押韵组 ${line.rhymeLabel}${line.requestedRhymeGroup === undefined ? '' : `，指定 ${line.requestedRhymeGroup}`}`;
        return `${line.sequence}. ${line.lineId}：${line.characterCount}字；${line.tonePattern}${ending}`;
      }),
    ])
    .join('\n');
}

export function formatRhymeGuide(blueprint: PatternBlueprint): string {
  const requested = new Map<string, PatternBlueprint['lines'][number]>();
  for (const line of blueprint.lines) {
    if (line.rhymeLabel !== undefined && line.requestedRhymeGroup !== undefined) {
      requested.set(line.rhymeLabel, line);
    }
  }
  if (requested.size === 0) {
    return '韵脚指南：未指定韵部；请为每个韵组自行选择一个《词林正韵》韵部，同组保持一致，相邻韵组不得相同。';
  }
  const guides = [...requested].map(([label, line]) => {
    const groupId = line.requestedRhymeGroup!;
    const group = findCilinRhymeGroup(groupId);
    if (group === undefined) return `- ${label}：指定 ${groupId}`;
    const compatibleSections =
      line.rhymeTone === undefined || line.rhymeTone === 'either'
        ? group.sections
        : group.sections.filter(({ tone }) => tone === line.rhymeTone);
    return `- ${label}：${group.name}（${group.id}）；可选字例：${compatibleSections
      .map(({ name, characters }) => `${name}[${Array.from(characters).slice(0, 48).join('')}]`)
      .join('；')}`;
  });
  return `韵脚指南：\n${guides.join('\n')}`;
}

export function formatDraft(draft: WorkDraft): string {
  return [
    `标题：${draft.title ?? '无题'}`,
    ...draft.lines.map((line, index) => `${index + 1}. ${line.id}：${line.text}`),
  ].join('\n');
}

export function formatProsodyReport(report: ProsodyReport): string {
  if (report.issues.length === 0) return '格律校验通过，无错误或警告。';
  return report.issues
    .map(
      (issue) =>
        `- [${issue.severity}] ${issue.lineId}${issue.charIndex === undefined ? '' : ` 第${issue.charIndex + 1}字`}：${issue.message}` +
        `${issue.expected === undefined ? '' : `；期望 ${issue.expected}`}` +
        `${issue.actual === undefined ? '' : `；实际 ${issue.actual}`}`,
    )
    .join('\n');
}

export function refinementRequirements(request: GenerationRequest): string {
  if (request.sourceDraft === undefined || request.selections === undefined) return '';
  const lineNumbers = new Map(request.sourceDraft.lines.map((line, index) => [line.id, index + 1]));
  const lines = new Map(request.sourceDraft.lines.map((line) => [line.id, line.text]));
  return `用户局部修改要求：\n${request.selections
    .map((selection) => {
      const line = lines.get(selection.lineId) ?? '';
      const selected = Array.from(line).slice(selection.start, selection.end).join('');
      return `- 第${lineNumbers.get(selection.lineId) ?? '?'}句 ${selection.lineId}“${selected}”：${selection.instruction}`;
    })
    .join('\n')}`;
}

export function optimizationTemperature(mode: OptimizationMode): number {
  if (mode === 'prosody_repair') return 0.25;
  if (mode === 'literary_polish') return 0.5;
  return 0.38;
}

function normalizeLine(value: string): string {
  return value
    .trim()
    .replace(/^\s*(?:第?[一二三四五六七八九十\d]+[.、:：)]\s*)/u, '')
    .replace(/[，。！？；：、,.!?;:]+$/u, '')
    .replace(/\s+/gu, '');
}

function parseTextArray(value: unknown, name: string, nonEmpty = false): ReadonlyArray<string> {
  if (value === undefined && !nonEmpty) return [];
  if (!Array.isArray(value)) throw new Error(`${name} 必须是字符串数组`);
  const result = value
    .filter((item): item is string => typeof item === 'string')
    .map((item) => item.trim())
    .filter(Boolean);
  if (nonEmpty && result.length === 0) throw new Error(`${name} 不得为空`);
  return result;
}

function requireRecord(value: unknown, name: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new Error(`${name}必须是 JSON 对象`);
  }
  return value as Record<string, unknown>;
}

function requireText(value: unknown, name: string): string {
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`${name} 必须是非空字符串`);
  }
  return value.trim();
}

function optionalText(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function requireCompactText(
  record: Readonly<Record<string, unknown>>,
  compactName: string,
  legacyNames: ReadonlyArray<string>,
): string {
  const compact = optionalText(record[compactName]);
  if (compact !== undefined) return compact;
  const legacy = legacyNames
    .map((name) => optionalText(record[name]))
    .filter((value): value is string => value !== undefined);
  if (legacy.length === 0) throw new Error(`${compactName} 必须是非空字符串`);
  return legacy.join('；');
}

function assertExactIds(
  actual: ReadonlyArray<string>,
  expected: ReadonlyArray<string>,
  name: string,
): void {
  if (
    actual.length !== expected.length ||
    new Set(actual).size !== actual.length ||
    expected.some((id) => !actual.includes(id))
  ) {
    throw new Error(`${name} 必须与词谱蓝图完全一致`);
  }
}

function sortByExpectedIds<Value>(
  values: ReadonlyArray<Value>,
  expectedIds: ReadonlyArray<string>,
  identify: (value: Value) => string,
): ReadonlyArray<Value> {
  const byId = new Map(values.map((value) => [identify(value), value]));
  return expectedIds.map((id) => byId.get(id)!);
}

function clampScore(value: unknown, name: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${name} 评分必须是数字`);
  }
  return Math.max(0, Math.min(5, Math.round(value * 10) / 10));
}
