import { useState } from 'react';

import type { CiPattern } from '@poesygen/domain';

import { PatternPreview } from './PatternPreview.js';
import {
  filterPatterns,
  formatPatternVariantSummary,
  groupPatternsByName,
  patternStats,
} from './model.js';

interface MobilePatternWorkspaceProps {
  readonly patterns: ReadonlyArray<CiPattern>;
  readonly query: string;
  readonly selectedPattern: CiPattern;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (patternId: string) => void;
  readonly onInspectCharacter: (character: string) => void;
  readonly onCreate: () => void;
}

export function MobilePatternWorkspace({
  patterns,
  query,
  selectedPattern,
  onQueryChange,
  onSelect,
  onInspectCharacter,
  onCreate,
}: MobilePatternWorkspaceProps) {
  const [detailOpen, setDetailOpen] = useState(false);
  const families = groupPatternsByName(patterns);
  const matchingPatternIds = new Set(filterPatterns(patterns, query).map(({ id }) => id));
  const visibleFamilies = families.filter(({ patterns: variants }) =>
    variants.some(({ id }) => matchingPatternIds.has(id)),
  );
  const selectedFamily = families.find(({ name }) => name === selectedPattern.name);

  const openFamily = (family: (typeof families)[number]): void => {
    const activePattern =
      family.patterns.find(({ id }) => id === selectedPattern.id) ??
      family.patterns.find(({ variant }) => variant === '正体') ??
      family.patterns[0];
    if (activePattern === undefined) return;
    onSelect(activePattern.id);
    setDetailOpen(true);
    scrollToPageTop();
  };

  const closeDetail = (): void => {
    setDetailOpen(false);
    scrollToPageTop();
  };

  return (
    <section
      className="mobile-pattern-catalog"
      data-mobile-view={detailOpen ? 'detail' : 'list'}
      aria-label="手机词谱"
    >
      {detailOpen ? (
        <>
          <button className="mobile-pattern-back" type="button" onClick={closeDetail}>
            <span aria-hidden="true">←</span>
            全部词牌
          </button>

          {selectedFamily !== undefined && selectedFamily.patterns.length > 1 && (
            <label className="mobile-pattern-variant">
              <span>选择体式</span>
              <select
                aria-label={`${selectedFamily.name}手机体式`}
                value={selectedPattern.id}
                onChange={(event) => onSelect(event.target.value)}
              >
                {selectedFamily.patterns.map((pattern) => (
                  <option key={pattern.id} value={pattern.id}>
                    {formatPatternVariantSummary(pattern)}
                  </option>
                ))}
              </select>
            </label>
          )}

          <PatternPreview
            pattern={selectedPattern}
            onInspectCharacter={onInspectCharacter}
            onCreate={onCreate}
          />
        </>
      ) : (
        <>
          <div className="mobile-pattern-toolbar">
            <p aria-label={`${families.length} 个词牌，${patterns.length} 种体式`}>
              共 <strong>{families.length}</strong> 牌
              <i aria-hidden="true" />
              <strong>{patterns.length}</strong> 体
            </p>
            <label>
              <span className="sr-only">搜索手机词牌名</span>
              <input
                type="search"
                value={query}
                onChange={(event) => onQueryChange(event.target.value)}
                placeholder="搜索词牌名或体式…"
              />
            </label>
          </div>

          <div className="mobile-pattern-grid" aria-label="手机词牌列表">
            {visibleFamilies.map((family) => {
              const activePattern =
                family.patterns.find(({ id }) => id === selectedPattern.id) ??
                family.patterns.find(({ variant }) => variant === '正体') ??
                family.patterns[0]!;
              const stats = patternStats(activePattern);
              return (
                <button
                  type="button"
                  key={family.name}
                  data-selected={family.name === selectedPattern.name}
                  onClick={() => openFamily(family)}
                >
                  <span className="mobile-pattern-card-title">
                    <strong>{family.name}</strong>
                    <small>{family.patterns.length}体</small>
                  </span>
                  <span className="mobile-pattern-card-variant">{activePattern.variant}</span>
                  <span className="mobile-pattern-card-stats">
                    {stats.characters}字 · {stats.sections === 1 ? '单调' : '双调'}
                    <br />
                    {stats.lines}句 · {stats.rhymePositions}韵位
                  </span>
                  <span className="mobile-pattern-card-open" aria-hidden="true">
                    查看格律
                    <i>→</i>
                  </span>
                </button>
              );
            })}
            {visibleFamilies.length === 0 && <p className="empty-copy">没有匹配的词牌或体式。</p>}
          </div>
        </>
      )}
    </section>
  );
}

function scrollToPageTop(): void {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
