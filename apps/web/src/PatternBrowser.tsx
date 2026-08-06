import type { CiPattern } from '@poesygen/domain';

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
        <span
          className="count-badge"
          aria-label={`${families.length} 个词牌，${patterns.length} 种体式`}
          title={`${families.length} 个词牌，${patterns.length} 种体式`}
        >
          <span>共</span>
          <span>
            <strong>{families.length}</strong>牌
          </span>
          <i aria-hidden="true" />
          <span>
            <strong>{patterns.length}</strong>体
          </span>
        </span>
      </div>

      <label className="search-field">
        <span className="sr-only">搜索词牌名</span>
        <input
          type="search"
          value={query}
          onChange={(event) => onQueryChange(event.target.value)}
          placeholder="搜索词牌名…"
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
                <span className="pattern-card-title">
                  <strong>{family.name}</strong>
                  <small>{family.patterns.length}体</small>
                </span>
                <span className="pattern-card-variant">{activePattern.variant}</span>
                <span className="pattern-card-stats">
                  <span>{stats.characters}字</span>
                  <i aria-hidden="true" />
                  <span>{stats.sections === 1 ? '单调' : '双调'}</span>
                  <i aria-hidden="true" />
                  <span>{stats.lines}句</span>
                  <i aria-hidden="true" />
                  <span>{stats.rhymePositions}韵位</span>
                </span>
                <span className="pattern-card-open" aria-hidden="true">
                  {selected ? '当前词牌' : '查看格律'}
                </span>
              </button>
            </div>
          );
        })}
        {visibleFamilies.length === 0 && <p className="empty-copy">没有匹配的词牌或体式。</p>}
      </div>
    </aside>
  );
}
