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
  };
  readonly sections: ReadonlyArray<PatternSection>;
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
  readonly status: 'completed' | 'round_limit_reached';
  readonly draft: WorkDraft;
  readonly report: ProsodyReport;
  readonly rounds: number;
}

export interface GenerationRequest {
  readonly patternId: string;
  readonly theme: string;
  readonly preferredRhymeGroup?: string | Readonly<Record<string, string>>;
  readonly additionalRequirements?: ReadonlyArray<string>;
  readonly maxRounds?: number;
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
