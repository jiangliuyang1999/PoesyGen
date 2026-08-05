import { useState } from 'react';

import { GenerationResultPanel } from './GenerationResultPanel.js';
import { filterGenerationHistory, type GenerationHistoryEntry } from './generation-history.js';
import { formatGenerationTitle, patternStats } from './model.js';

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

const detailDateFormatter = new Intl.DateTimeFormat('zh-CN', {
  year: 'numeric',
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
  const selectedPatternStats =
    selectedEntry === undefined ? undefined : patternStats(selectedEntry.pattern);

  return (
    <div className="generation-history-layout">
      <aside className="history-browser" aria-label="生成历史列表">
        <div className="history-heading">
          <div>
            <p className="section-kicker">本地记录</p>
            <h2>生成历史</h2>
          </div>
          <span aria-label="记录数量">
            {query.trim() === '' ? entries.length : `${visibleEntries.length}/${entries.length}`}
          </span>
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
              <span className="history-list-title">
                <strong>
                  {formatGenerationTitle(entry.pattern.name, entry.result.draft.title)}
                </strong>
                <time dateTime={entry.createdAt}>{formatHistoryDate(entry.createdAt)}</time>
              </span>
              <span className="history-list-meta">
                <span>{entry.pattern.variant}</span>
                <span>优化 {entry.result.rounds} 轮</span>
                <span data-passed={entry.result.report.passed}>
                  {entry.result.report.passed ? '格律通过' : '未完全通过'}
                </span>
              </span>
              <small className="history-list-theme">{entry.theme}</small>
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
            <section className="history-overview" aria-label="历史记录信息">
              <header className="history-overview-header">
                <div>
                  <p className="section-kicker">当前记录</p>
                  <h2>创作档案</h2>
                </div>
                <span data-passed={selectedEntry.result.report.passed}>
                  {selectedEntry.result.report.passed ? '格律通过' : '达到轮次上限'}
                </span>
              </header>

              <div className="history-archive-summary">
                <article className="history-pattern-card">
                  <span>词牌体式</span>
                  <strong>{selectedEntry.pattern.name}</strong>
                  <small>
                    {selectedEntry.pattern.variant} · {selectedPatternStats?.characters ?? 0} 字 ·{' '}
                    {selectedPatternStats?.lines ?? 0} 句 ·{' '}
                    {selectedPatternStats?.sections === 1 ? '单调' : '双调'}
                  </small>
                </article>
                <article className="history-record-card">
                  <span>生成时间</span>
                  <time dateTime={selectedEntry.createdAt}>
                    {formatDetailDate(selectedEntry.createdAt)}
                  </time>
                  <code>会话 {selectedEntry.id}</code>
                </article>
              </div>

              <dl className="history-settings" aria-label="历史生成设置">
                <div className="history-rounds-card">
                  <dt>优化轮数</dt>
                  <dd>
                    {selectedEntry.settings === undefined ? (
                      <span className="history-setting-empty">未记录</span>
                    ) : (
                      <>
                        <strong>{selectedEntry.settings.maxRounds}</strong>
                        <span>轮上限</span>
                      </>
                    )}
                  </dd>
                </div>
                <div className="history-rhyme-card">
                  <dt>韵部设置</dt>
                  <dd>
                    {selectedEntry.settings === undefined ||
                    selectedEntry.settings.rhymeSettings.length === 0 ? (
                      <span className="history-setting-empty">未记录</span>
                    ) : (
                      <ul>
                        {selectedEntry.settings.rhymeSettings.map((setting) => (
                          <li key={setting.label}>
                            <span>{setting.label}</span>
                            <strong>
                              {setting.groupName === undefined
                                ? '自动择韵'
                                : `${setting.groupName} · ${setting.sections?.join('、') ?? formatTone(setting.tone)}`}
                            </strong>
                          </li>
                        ))}
                      </ul>
                    )}
                  </dd>
                </div>
              </dl>

              <div className="history-theme-block">
                <span>创作主题</span>
                <p>{selectedEntry.theme}</p>
              </div>

              <div className="history-theme-block">
                <span>附加要求</span>
                <p>
                  {selectedEntry.settings === undefined ||
                  selectedEntry.settings.additionalRequirements.length === 0
                    ? '无附加要求'
                    : selectedEntry.settings.additionalRequirements.join('；')}
                </p>
              </div>
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

function formatDetailDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : detailDateFormatter.format(date);
}

function formatTone(tone: 'level' | 'oblique' | 'either'): string {
  if (tone === 'level') return '平声';
  if (tone === 'oblique') return '仄声';
  return '平仄';
}
