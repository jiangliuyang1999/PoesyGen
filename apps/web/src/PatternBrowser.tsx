import type { CiPattern } from '@poesygen/client-sdk';

import { filterPatterns, groupPatternsByName, patternStats } from './model.js';

interface PatternBrowserProps {
  readonly patterns: ReadonlyArray<CiPattern>;
  readonly query: string;
  readonly selectedPatternId: string;
  readonly onQueryChange: (query: string) => void;
  readonly onSelect: (patternId: string) => void;
}

export function PatternBrowser({
  patterns,
  query,
  selectedPatternId,
  onQueryChange,
  onSelect,
}: PatternBrowserProps) {
  const matchingPatternIds = new Set(filterPatterns(patterns, query).map(({ id }) => id));
  const families = groupPatternsByName(patterns);
  const visibleFamilies = families.filter(({ patterns: variants }) =>
    variants.some(({ id }) => matchingPatternIds.has(id)),
  );

  return (
    <aside className="pattern-browser" aria-label="词牌列表">
      <div className="browser-heading">
        <div>
          <p className="section-kicker">词牌谱</p>
          <h2>选择词牌</h2>
        </div>
        <span
          className="count-badge"
          title={`${families.length} 个词牌，${patterns.length} 种体式`}
        >
          {families.length}牌 · {patterns.length}体
        </span>
      </div>

      <label className="search-field">
        <span className="sr-only">搜索词牌</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索词牌…"
        />
      </label>

      <div className="pattern-list">
        {visibleFamilies.map((family) => {
          const selectedPattern = family.patterns.find(({ id }) => id === selectedPatternId);
          const activePattern = selectedPattern ?? family.patterns[0]!;
          const stats = patternStats(activePattern);
          const selected = selectedPattern !== undefined;
          return (
            <div className="pattern-family" data-selected={selected} key={family.name}>
              <button
                className="pattern-option"
                data-selected={selected}
                type="button"
                onClick={() => onSelect(activePattern.id)}
                aria-pressed={selected}
              >
                <span>
                  <strong>{family.name}</strong>
                  <small>
                    {family.patterns.length > 1
                      ? `${family.patterns.length}体 · ${activePattern.variant}`
                      : activePattern.variant}
                  </small>
                </span>
                <span className="pattern-measure">
                  {stats.characters}字 · {stats.lines}句
                </span>
              </button>

              {selected && family.patterns.length > 1 && (
                <label className="pattern-variant-picker">
                  <span>体式</span>
                  <select
                    aria-label={`${family.name}体式`}
                    value={activePattern.id}
                    onChange={(event) => onSelect(event.target.value)}
                  >
                    {family.patterns.map((pattern) => {
                      const variantStats = patternStats(pattern);
                      return (
                        <option key={pattern.id} value={pattern.id}>
                          {pattern.variant} · {variantStats.characters}字/{variantStats.lines}句
                        </option>
                      );
                    })}
                  </select>
                </label>
              )}
            </div>
          );
        })}
        {visibleFamilies.length === 0 && <p className="empty-copy">没有匹配的词牌或体式。</p>}
      </div>
    </aside>
  );
}
