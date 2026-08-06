import type { CharacterReading, CilinRhymeGroup, Pronunciation } from '@poesygen/prosody';

export interface RhymeGroupSummary {
  readonly id: string;
  readonly number: number;
  readonly name: string;
  readonly sections: ReadonlyArray<{
    readonly name: string;
    readonly tone: 'level' | 'oblique';
    readonly characterCount: number;
  }>;
}

export type RhymeGroupDetail = CilinRhymeGroup;

export interface CharacterPronunciationResponse {
  readonly character: string;
  readonly readings?: CharacterReading;
  readonly prosody: ReadonlyArray<Pronunciation>;
}
