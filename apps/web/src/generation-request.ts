import type {
  CiPattern,
  GenerationRequest,
  GenerationResult,
  TextSelection,
} from '@poesygen/domain';

import type { RhymeGroupSummary } from './catalog-types.js';
import type { GenerationHistoryEntry, GenerationHistorySettings } from './generation-history.js';
import { displayRhymeLabel, patternRhymeLabels, splitRequirements } from './model.js';

export interface GenerationPreferences {
  readonly preferredRhymeGroup: GenerationRequest['preferredRhymeGroup'];
  readonly additionalRequirements: ReadonlyArray<string>;
  readonly historySettings: GenerationHistorySettings;
}

interface CreateGenerationPreferencesInput {
  readonly pattern: CiPattern;
  readonly rhymeAssignments: Readonly<Record<string, string>>;
  readonly rhymeGroups: ReadonlyArray<RhymeGroupSummary>;
  readonly maxRounds: number;
  readonly requirements: string;
}

interface CreateInitialGenerationRequestInput {
  readonly pattern: CiPattern;
  readonly theme: string;
  readonly maxRounds: number;
  readonly preferences: GenerationPreferences;
}

interface CreateRefinementRequestInput {
  readonly sourceResult: GenerationResult;
  readonly pattern: CiPattern;
  readonly selections: ReadonlyArray<TextSelection>;
  readonly maxRounds: number;
  readonly preferredRhymeGroup: GenerationRequest['preferredRhymeGroup'];
  readonly additionalRequirements: ReadonlyArray<string>;
}

export function createGenerationPreferences({
  pattern,
  rhymeAssignments,
  rhymeGroups,
  maxRounds,
  requirements,
}: CreateGenerationPreferencesInput): GenerationPreferences {
  const labels = patternRhymeLabels(pattern);
  const additionalRequirements = splitRequirements(requirements);
  return {
    preferredRhymeGroup: resolvePreferredRhymeGroup(pattern, rhymeAssignments),
    additionalRequirements,
    historySettings: {
      maxRounds,
      additionalRequirements,
      rhymeSettings: labels.map((label, index) => {
        const groupId = rhymeAssignments[label.id];
        const group = rhymeGroups.find(({ id }) => id === groupId);
        return {
          label: displayRhymeLabel(label, index),
          tone: label.tone,
          ...(groupId === undefined ? {} : { groupId }),
          ...(group === undefined
            ? {}
            : {
                groupName: group.name,
                sections: group.sections.map(({ name }) => name),
              }),
        };
      }),
    },
  };
}

export function createInitialGenerationRequest({
  pattern,
  theme,
  maxRounds,
  preferences,
}: CreateInitialGenerationRequestInput): GenerationRequest {
  return {
    patternId: pattern.id,
    theme: theme.trim(),
    maxRounds,
    ...(preferences.preferredRhymeGroup === undefined
      ? {}
      : { preferredRhymeGroup: preferences.preferredRhymeGroup }),
    ...(preferences.additionalRequirements.length === 0
      ? {}
      : { additionalRequirements: [...preferences.additionalRequirements] }),
  };
}

export function historyRefinementPreferences(
  entry: GenerationHistoryEntry,
  sourceResult: GenerationResult,
): Pick<GenerationPreferences, 'preferredRhymeGroup' | 'additionalRequirements'> & {
  readonly maxRounds: number;
} {
  const labels = patternRhymeLabels(entry.pattern);
  const rhymeAssignments = Object.fromEntries(
    labels
      .map((label, index) => [label.id, entry.settings?.rhymeSettings[index]?.groupId] as const)
      .filter((item): item is readonly [string, string] => item[1] !== undefined),
  );
  return {
    maxRounds: entry.settings?.maxRounds ?? 8,
    additionalRequirements: entry.settings?.additionalRequirements ?? [],
    preferredRhymeGroup: resolvePreferredRhymeGroup(
      entry.pattern,
      rhymeAssignments,
      sourceResult.draft.requestedRhymeGroup,
    ),
  };
}

export function createRefinementRequest({
  sourceResult,
  pattern,
  selections,
  maxRounds,
  preferredRhymeGroup,
  additionalRequirements,
}: CreateRefinementRequestInput): GenerationRequest {
  return {
    patternId: pattern.id,
    theme: sourceResult.draft.theme,
    sourceDraft: {
      id: sourceResult.draft.id,
      patternId: sourceResult.draft.patternId,
      theme: sourceResult.draft.theme,
      lines: sourceResult.draft.lines.map((line) => ({ ...line })),
      version: sourceResult.draft.version,
      ...(sourceResult.draft.title === undefined ? {} : { title: sourceResult.draft.title }),
      ...(sourceResult.draft.requestedRhymeGroup === undefined
        ? {}
        : { requestedRhymeGroup: sourceResult.draft.requestedRhymeGroup }),
    },
    selections: selections.map((selection) => ({
      ...selection,
      instruction: selection.instruction.trim(),
    })),
    maxRounds,
    ...(preferredRhymeGroup === undefined ? {} : { preferredRhymeGroup }),
    ...(additionalRequirements.length === 0
      ? {}
      : { additionalRequirements: [...additionalRequirements] }),
  };
}

function resolvePreferredRhymeGroup(
  pattern: CiPattern,
  rhymeAssignments: Readonly<Record<string, string>>,
  fallback?: GenerationRequest['preferredRhymeGroup'],
): GenerationRequest['preferredRhymeGroup'] {
  const labels = patternRhymeLabels(pattern);
  const selectedRhymes = Object.fromEntries(
    labels
      .map(({ id }) => [id, rhymeAssignments[id]] as const)
      .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
  );
  if (Object.keys(selectedRhymes).length === 0) return fallback;
  return labels.length === 1 ? selectedRhymes[labels[0]!.id] : selectedRhymes;
}
