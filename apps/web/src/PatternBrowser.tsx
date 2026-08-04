import type { CiPattern } from '@poesygen/client-sdk';

import { filterPatterns, patternStats } from './model.js';

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
  const visiblePatterns = filterPatterns(patterns, query);

  return (
    <aside className="pattern-browser" aria-label="词牌列表">
      <div className="browser-heading">
        <div>
          <p className="section-kicker">词牌谱</p>
          <h2>选择词牌</h2>
        </div>
        <span className="count-badge">{patterns.length}</span>
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
        {visiblePatterns.map((pattern) => {
          const stats = patternStats(pattern);
          const selected = pattern.id === selectedPatternId;
          return (
            <button
              className="pattern-option"
              data-selected={selected}
              key={pattern.id}
              type="button"
              onClick={() => onSelect(pattern.id)}
              aria-pressed={selected}
            >
              <span>
                <strong>{pattern.name}</strong>
                <small>{pattern.variant}</small>
              </span>
              <span className="pattern-measure">
                {stats.characters}字 · {stats.lines}句
              </span>
            </button>
          );
        })}
        {visiblePatterns.length === 0 && <p className="empty-copy">没有匹配的词牌。</p>}
      </div>
    </aside>
  );
}
