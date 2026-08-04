import patternData from './data/qinding-cipu.json' with { type: 'json' };

import type { CiPattern, DataProvenance } from '@poesygen/domain';

export interface PatternCatalogMetadata {
  readonly schemaVersion: number;
  readonly dataVersion: string;
  readonly provenance: ReadonlyArray<DataProvenance>;
}

const patterns = patternData.patterns as unknown as ReadonlyArray<CiPattern>;
const patternsById = new Map(patterns.map((pattern) => [pattern.id, pattern]));
const patternsByName = new Map<string, CiPattern[]>();
for (const pattern of patterns) {
  const namedPatterns = patternsByName.get(pattern.name) ?? [];
  namedPatterns.push(pattern);
  patternsByName.set(pattern.name, namedPatterns);
}

export const patternCatalogMetadata: PatternCatalogMetadata = {
  schemaVersion: patternData.schemaVersion,
  dataVersion: patternData.dataVersion,
  provenance: patternData.provenance,
};

export const ruMengLing = requirePattern('ru-meng-ling-standard');

export function listPatterns(): ReadonlyArray<CiPattern> {
  return patterns;
}

export function listPatternsByName(name: string): ReadonlyArray<CiPattern> {
  return patternsByName.get(name) ?? [];
}

export function findPattern(patternId: string): CiPattern | undefined {
  return patternsById.get(patternId);
}

export function requirePattern(patternId: string): CiPattern {
  const pattern = findPattern(patternId);
  if (pattern === undefined) {
    throw new Error(`Unknown Ci pattern: ${patternId}`);
  }
  return pattern;
}
