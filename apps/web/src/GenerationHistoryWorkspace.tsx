import { useState } from 'react';

import { GenerationResultPanel } from './GenerationResultPanel.js';
import { filterGenerationHistory, type GenerationHistoryEntry } from './generation-history.js';
import { formatGenerationTitle } from './model.js';

interface GenerationHistoryWorkspaceProps {
  readonly entries: ReadonlyArray<GenerationHistoryEntry>;
  readonly onInspectCharacter: (character: string) => void;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

export function GenerationHistoryWorkspace({
  entries,
  onInspectCharacter,
}: GenerationHistoryWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id);
  const visibleEntries = filterGenerationHistory(entries, query);
  const selectedEntry =
    visibleEntries.find(({ id }) => id === selectedEntryId) ?? visibleEntries[0];

  return (
    <div className="generation-history-layout">
      <aside className="history-browser" aria-label="生成历史列表">
        <div className="history-heading">
          <div>
            <p className="section-kicker">本地记录</p>
            <h2>生成历史</h2>
          </div>
          <span>{entries.length}</span>
        </div>

        <label className="history-search">
          <span className="sr-only">搜索历史结果</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜索词牌、题目、主题…"
          />
        </label>

        <div className="history-list">
          {visibleEntries.map((entry) => (
            <button
              type="button"
              key={entry.id}
              data-selected={entry.id === selectedEntry?.id}
              aria-pressed={entry.id === selectedEntry?.id}
              onClick={() => setSelectedEntryId(entry.id)}
            >
              <span>
                <strong>
                  {formatGenerationTitle(entry.pattern.name, entry.result.draft.title)}
                </strong>
                <time dateTime={entry.createdAt}>{formatHistoryDate(entry.createdAt)}</time>
              </span>
              <span>
                《{entry.pattern.name}》{entry.pattern.variant}
              </span>
              <small>{entry.theme}</small>
            </button>
          ))}
          {visibleEntries.length === 0 && (
            <p className="empty-copy">
              {entries.length === 0
                ? '还没有生成记录。完成一首词后会自动保存在这里。'
                : '没有匹配的历史记录。'}
            </p>
          )}
        </div>

        <p className="history-storage-note">最多保留 40 条，仅存储在当前浏览器。</p>
      </aside>

      <div className="history-detail">
        {selectedEntry === undefined ? (
          <section className="history-empty" aria-label="历史结果">
            <p className="section-kicker">生成结果</p>
            <h2>{entries.length === 0 ? '尚无历史词作' : '没有匹配结果'}</h2>
            <p>生成完成后，可在这里按词牌、题目、主题或会话号查询。</p>
          </section>
        ) : (
          <>
            <section className="history-context" aria-label="历史记录信息">
              <div>
                <p className="section-kicker">创作主题</p>
                <p>{selectedEntry.theme}</p>
              </div>
              <code>会话 {selectedEntry.id}</code>
            </section>
            <GenerationResultPanel
              result={selectedEntry.result}
              pattern={selectedEntry.pattern}
              onInspectCharacter={onInspectCharacter}
            />
          </>
        )}
      </div>
    </div>
  );
}

function formatHistoryDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : dateFormatter.format(date);
}
