export type Tone = 'level' | 'oblique';

export type ToneRequirement = Tone | 'either';

export interface PatternPosition {
  readonly tone: ToneRequirement;
  readonly rhyme?: string;
  readonly rhymeTone?: ToneRequirement;
}

export interface PatternLine {
  readonly id: string;
  readonly positions: ReadonlyArray<PatternPosition>;
  readonly punctuation?: string;
}

export interface PatternSection {
  readonly id: string;
  readonly name: string;
  readonly lines: ReadonlyArray<PatternLine>;
}

export interface CiPattern {
  readonly id: string;
  readonly name: string;
  readonly variant: string;
  readonly source: string;
  readonly dataVersion: string;
  readonly reviewStatus: 'draft' | 'imported' | 'verified';
  readonly provenance?: ReadonlyArray<DataProvenance>;
  readonly example?: {
    readonly author: string;
    readonly lines: ReadonlyArray<string>;
    readonly simplifiedLines?: ReadonlyArray<string>;
  };
  readonly sections: ReadonlyArray<PatternSection>;
}

export interface PatternFamily {
  readonly name: string;
  readonly patterns: ReadonlyArray<CiPattern>;
}

export interface PatternRhymeLabel {
  readonly id: string;
  readonly tone: ToneRequirement;
}

export interface PatternStats {
  readonly characters: number;
  readonly lines: number;
  readonly sections: number;
  readonly rhymePositions: number;
}

export function groupPatternsByName(
  patterns: ReadonlyArray<CiPattern>,
): ReadonlyArray<PatternFamily> {
  const grouped = new Map<string, CiPattern[]>();
  for (const pattern of patterns) {
    const variants = grouped.get(pattern.name) ?? [];
    variants.push(pattern);
    grouped.set(pattern.name, variants);
  }
  return [...grouped].map(([name, variants]) => ({ name, patterns: variants }));
}

const pinyinCollator = new Intl.Collator('zh-CN-u-co-pinyin', {
  sensitivity: 'base',
  numeric: true,
});

export function sortPatternFamiliesByPinyin(
  families: ReadonlyArray<PatternFamily>,
): ReadonlyArray<PatternFamily> {
  return [...families].sort((left, right) => {
    const pinyinOrder = patternFamilyPinyinKey(left).localeCompare(
      patternFamilyPinyinKey(right),
      'en',
    );
    return pinyinOrder === 0 ? pinyinCollator.compare(left.name, right.name) : pinyinOrder;
  });
}

export function listPatternFamilies(
  patterns: ReadonlyArray<CiPattern>,
): ReadonlyArray<PatternFamily> {
  return sortPatternFamiliesByPinyin(groupPatternsByName(patterns));
}

function patternFamilyPinyinKey(family: PatternFamily): string {
  return (family.patterns[0]?.id ?? family.name).replace(/-(?:standard|variant-\d+)$/u, '');
}

export function patternRhymeLabels(pattern: CiPattern): ReadonlyArray<PatternRhymeLabel> {
  const labels = new Map<string, ToneRequirement>();
  for (const position of pattern.sections.flatMap((section) =>
    section.lines.flatMap((line) => line.positions),
  )) {
    if (position.rhyme !== undefined && !labels.has(position.rhyme)) {
      labels.set(position.rhyme, position.rhymeTone ?? position.tone);
    }
  }
  return [...labels].map(([id, tone]) => ({ id, tone }));
}

export function patternStats(pattern: CiPattern): PatternStats {
  const lines = pattern.sections.flatMap((section) => section.lines);
  return {
    characters: lines.reduce((sum, line) => sum + line.positions.length, 0),
    lines: lines.length,
    sections: pattern.sections.length,
    rhymePositions: lines.filter((line) => line.positions.at(-1)?.rhyme !== undefined).length,
  };
}

export interface DataProvenance {
  readonly sourceId: string;
  readonly title: string;
  readonly url: string;
  readonly revision: string;
  readonly license: string;
  readonly retrievedAt: string;
}

export interface WorkLine {
  readonly id: string;
  readonly text: string;
}

export interface WorkDraft {
  readonly id: string;
  readonly patternId: string;
  readonly theme: string;
  readonly lines: ReadonlyArray<WorkLine>;
  readonly version: number;
  readonly title?: string;
  readonly requestedRhymeGroup?: string;
}

export interface ThemeBrief {
  readonly coreTheme: string;
  readonly subject: string;
  readonly setting: string;
  readonly perspective: string;
  readonly emotionalArc: ReadonlyArray<string>;
  readonly keyFacts: ReadonlyArray<string>;
  readonly imagery: ReadonlyArray<string>;
  readonly avoid: ReadonlyArray<string>;
  readonly assumptions: ReadonlyArray<string>;
}

export interface PatternBlueprintLine {
  readonly lineId: string;
  readonly sectionId: string;
  readonly sectionName: string;
  readonly sequence: number;
  readonly characterCount: number;
  readonly tonePattern: string;
  readonly rhymeLabel?: string;
  readonly rhymeTone?: ToneRequirement;
  readonly requestedRhymeGroup?: string;
  readonly nonRhymeEnding: boolean;
}

export interface PatternBlueprintSection {
  readonly sectionId: string;
  readonly name: string;
  readonly lineIds: ReadonlyArray<string>;
}

export interface PatternBlueprint {
  readonly patternId: string;
  readonly patternName: string;
  readonly variant: string;
  readonly sections: ReadonlyArray<PatternBlueprintSection>;
  readonly lines: ReadonlyArray<PatternBlueprintLine>;
}

export interface PlannedAllusion {
  readonly phrase: string;
  readonly source?: string;
  readonly meaning: string;
  readonly purpose: string;
  readonly verified: boolean;
}

export interface CompositionSectionPlan {
  readonly sectionId: string;
  readonly task: string;
  readonly arc: string;
}

export interface CompositionLinePlan {
  readonly lineId: string;
  readonly task: string;
  readonly emotion: string;
  readonly image: string;
  readonly ending: string;
}

export interface CompositionPlan {
  readonly thesis: string;
  readonly style: string;
  readonly voice: string;
  readonly imagery: ReadonlyArray<string>;
  readonly allusions: ReadonlyArray<PlannedAllusion>;
  readonly sections: ReadonlyArray<CompositionSectionPlan>;
  readonly lines: ReadonlyArray<CompositionLinePlan>;
}

export type QualityDimension =
  | 'themeFidelity'
  | 'coherence'
  | 'emotionalArc'
  | 'imagery'
  | 'diction'
  | 'originality'
  | 'allusionFitness';

export interface QualityScores {
  readonly themeFidelity: number;
  readonly coherence: number;
  readonly emotionalArc: number;
  readonly imagery: number;
  readonly diction: number;
  readonly originality: number;
  readonly allusionFitness: number;
}

export interface QualityIssue {
  readonly dimension: QualityDimension;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly suggestion: string;
  readonly lineId?: string;
}

export interface ThemeEvidence {
  readonly requirement: string;
  readonly status: 'clear' | 'implicit' | 'missing';
  readonly lineIds: ReadonlyArray<string>;
  readonly quotes: ReadonlyArray<string>;
  readonly explanation: string;
}

export interface QualityReport {
  readonly passed: boolean;
  readonly summary: string;
  readonly themeRecognizable: boolean;
  readonly themeEvidence: ReadonlyArray<ThemeEvidence>;
  readonly scores: QualityScores;
  readonly issues: ReadonlyArray<QualityIssue>;
}

export interface GenerationContext {
  readonly themeBrief: ThemeBrief;
  readonly plan: CompositionPlan;
}

export type ProsodyRule = 'length' | 'tone' | 'rhyme' | 'structure';

export interface ProsodyIssue {
  readonly lineId: string;
  readonly rule: ProsodyRule;
  readonly severity: 'error' | 'warning';
  readonly message: string;
  readonly charIndex?: number;
  readonly expected?: string;
  readonly actual?: string;
  readonly candidates?: ReadonlyArray<string>;
}

export interface ProsodyReport {
  readonly passed: boolean;
  readonly issues: ReadonlyArray<ProsodyIssue>;
}

export interface GenerationResult {
  readonly status: 'completed' | 'round_limit_reached' | 'quality_limit_reached';
  readonly draft: WorkDraft;
  readonly report: ProsodyReport;
  readonly rounds: number;
  readonly context?: GenerationContext;
  readonly qualityReport?: QualityReport;
}

export interface GenerationRequest {
  readonly patternId: string;
  readonly theme: string;
  readonly preferredRhymeGroup?: string | Readonly<Record<string, string>>;
  readonly additionalRequirements?: ReadonlyArray<string>;
  readonly maxRounds?: number;
  readonly sourceDraft?: WorkDraft;
  readonly selections?: ReadonlyArray<TextSelection>;
  readonly sourceContext?: GenerationContext;
}

export interface TextSelection {
  readonly lineId: string;
  readonly start: number;
  readonly end: number;
  readonly instruction: string;
}

export interface TextPatch {
  readonly lineId: string;
  readonly start: number;
  readonly end: number;
  readonly replacement: string;
}
