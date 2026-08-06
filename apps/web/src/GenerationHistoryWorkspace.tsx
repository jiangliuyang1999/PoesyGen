import { useState } from 'react';

import type { GenerationResult, TextSelection } from '@poesygen/domain';

import { GenerationResultPanel } from './GenerationResultPanel.js';
import {
  filterGenerationHistory,
  generationHistoryVersions,
  type GenerationHistoryEntry,
} from './generation-history.js';
import { formatGenerationTitle, patternStats } from './model.js';

interface GenerationHistoryWorkspaceProps {
  readonly entries: ReadonlyArray<GenerationHistoryEntry>;
  readonly onInspectCharacter: (character: string) => void;
  readonly onRefine: (
    entry: GenerationHistoryEntry,
    result: GenerationResult,
    selections: ReadonlyArray<TextSelection>,
  ) => Promise<GenerationResult>;
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

const historyPageSize = 8;

export function GenerationHistoryWorkspace({
  entries,
  onInspectCharacter,
  onRefine,
}: GenerationHistoryWorkspaceProps) {
  const mobilePlatform = document.documentElement.dataset['platform'] === 'mobile';
  const [query, setQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const visibleEntries = filterGenerationHistory(entries, query);
  const pageCount = Math.max(1, Math.ceil(visibleEntries.length / historyPageSize));
  const activePageIndex = Math.min(pageIndex, pageCount - 1);
  const pageEntries = visibleEntries.slice(
    activePageIndex * historyPageSize,
    (activePageIndex + 1) * historyPageSize,
  );
  const selectedEntry = pageEntries.find(({ id }) => id === selectedEntryId) ?? pageEntries[0];
  const versions = selectedEntry === undefined ? [] : generationHistoryVersions(selectedEntry);
  const selectedResult =
    versions.find(({ draft }) => draft.id === selectedVersionId) ?? versions.at(-1);
  const selectedPatternStats =
    selectedEntry === undefined ? undefined : patternStats(selectedEntry.pattern);

  const openEntry = (entryId: string): void => {
    setSelectedEntryId(entryId);
    setSelectedVersionId(undefined);
    if (mobilePlatform) {
      setMobileDetailOpen(true);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;
    }
  };

  const closeMobileDetail = (): void => {
    setMobileDetailOpen(false);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const changePage = (nextPageIndex: number): void => {
    const normalizedPageIndex = Math.max(0, Math.min(nextPageIndex, pageCount - 1));
    setPageIndex(normalizedPageIndex);
    setSelectedEntryId(visibleEntries[normalizedPageIndex * historyPageSize]?.id);
    setSelectedVersionId(undefined);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  return (
    <div
      className="generation-history-layout"
      {...(mobilePlatform ? { 'data-mobile-view': mobileDetailOpen ? 'detail' : 'list' } : {})}
    >
      {(!mobilePlatform || !mobileDetailOpen) && (
        <aside className="history-browser" aria-label="生成历史列表">
          <label className="history-search">
            <span className="sr-only">搜索历史结果</span>
            <input
              type="search"
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setPageIndex(0);
                setSelectedEntryId(undefined);
                setSelectedVersionId(undefined);
              }}
              placeholder="搜索词牌名、题目、主题…"
            />
          </label>

          <div className="history-list">
            {pageEntries.map((entry) => {
              const selected = !mobilePlatform && entry.id === selectedEntry?.id;
              return (
                <button
                  type="button"
                  key={entry.id}
                  data-selected={selected}
                  {...(mobilePlatform ? {} : { 'aria-pressed': selected })}
                  onClick={() => openEntry(entry.id)}
                >
                  <span className="history-list-title">
                    <strong>
                      {formatGenerationTitle(entry.pattern.name, entry.result.draft.title)}
                    </strong>
                    <time dateTime={entry.createdAt}>{formatHistoryDate(entry.createdAt)}</time>
                  </span>
                  <span className="history-list-meta">
                    <span>{entry.pattern.variant}</span>
                    <span>{generationHistoryVersions(entry).length} 个版本</span>
                  </span>
                  <small className="history-list-theme">{entry.theme}</small>
                  {mobilePlatform && (
                    <span className="history-list-open" aria-hidden="true">
                      查看作品
                      <i>→</i>
                    </span>
                  )}
                </button>
              );
            })}
            {visibleEntries.length === 0 && (
              <p className="empty-copy">
                {entries.length === 0
                  ? '还没有生成记录。完成一首词后会自动保存在这里。'
                  : '没有匹配的历史记录。'}
              </p>
            )}
          </div>

          {pageCount > 1 && (
            <nav className="history-pagination" aria-label="历史记录分页">
              <button
                type="button"
                aria-label="上一页历史记录"
                disabled={activePageIndex === 0}
                onClick={() => changePage(activePageIndex - 1)}
              >
                ←
              </button>
              <span className="history-page-numbers">
                {Array.from({ length: pageCount }, (_, index) => (
                  <button
                    type="button"
                    key={index}
                    aria-label={`第 ${index + 1} 页`}
                    {...(index === activePageIndex ? { 'aria-current': 'page' as const } : {})}
                    onClick={() => changePage(index)}
                  >
                    {index + 1}
                  </button>
                ))}
              </span>
              <button
                type="button"
                aria-label="下一页历史记录"
                disabled={activePageIndex === pageCount - 1}
                onClick={() => changePage(activePageIndex + 1)}
              >
                →
              </button>
            </nav>
          )}

          <p className="history-total-count" aria-label="历史记录总数">
            {query.trim() === ''
              ? `共 ${entries.length} 条记录`
              : `筛选 ${visibleEntries.length} 条 / 共 ${entries.length} 条`}
          </p>
        </aside>
      )}

      {(!mobilePlatform || mobileDetailOpen) && (
        <div className="history-detail">
          {mobilePlatform && (
            <button className="history-mobile-back" type="button" onClick={closeMobileDetail}>
              <span aria-hidden="true">←</span>
              全部生成记录
            </button>
          )}
          {selectedEntry === undefined || selectedResult === undefined ? (
            <section className="history-empty" aria-label="历史结果">
              <p className="section-kicker">生成结果</p>
              <h2>{entries.length === 0 ? '尚无历史词作' : '没有匹配结果'}</h2>
              <p>生成完成后，可在这里按词牌、题目、主题或会话号查询。</p>
            </section>
          ) : (
            <>
              <section className="history-overview" aria-label="历史记录信息">
                <div className="history-archive-focus">
                  <article className="history-pattern-identity" aria-label="词牌信息">
                    <p>词牌</p>
                    <h3>{selectedEntry.pattern.name}</h3>
                    <span>
                      {selectedEntry.pattern.variant} · {selectedPatternStats?.characters ?? 0} 字 ·{' '}
                      {selectedPatternStats?.lines ?? 0} 句 ·{' '}
                      {selectedPatternStats?.sections === 1 ? '单调' : '双调'}
                    </span>
                  </article>

                  <div className="history-creative-brief" aria-label="创作重点">
                    <article className="history-brief-section" data-primary="true">
                      <span>创作主题</span>
                      <p>{selectedEntry.theme}</p>
                    </article>
                    <article className="history-brief-section">
                      <span>附加要求</span>
                      <p>
                        {selectedEntry.settings === undefined ||
                        selectedEntry.settings.additionalRequirements.length === 0
                          ? '无附加要求'
                          : selectedEntry.settings.additionalRequirements.join('；')}
                      </p>
                    </article>
                  </div>
                </div>

                <dl className="history-archive-meta" aria-label="历史生成设置">
                  <div>
                    <dt>最大优化轮数</dt>
                    <dd>
                      {selectedEntry.settings === undefined ? (
                        <span className="history-setting-empty">未记录</span>
                      ) : (
                        <>
                          <strong>{selectedEntry.settings.maxRounds}</strong>
                          <span>轮</span>
                        </>
                      )}
                    </dd>
                  </div>
                  <div className="history-archive-rhyme">
                    <dt>韵部设置</dt>
                    <dd>
                      {selectedEntry.settings === undefined ||
                      selectedEntry.settings.rhymeSettings.length === 0 ? (
                        <span className="history-setting-empty">未记录</span>
                      ) : (
                        <ul>
                          {selectedEntry.settings.rhymeSettings.map((setting) => (
                            <li key={setting.label}>
                              <span>{setting.label}</span>：
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
                  <div>
                    <dt>生成时间</dt>
                    <dd>
                      <time dateTime={selectedEntry.createdAt}>
                        {formatDetailDate(selectedEntry.createdAt)}
                      </time>
                    </dd>
                  </div>
                  <div className="history-archive-session">
                    <dt>会话 ID</dt>
                    <dd>
                      <code title={selectedEntry.id}>{selectedEntry.id}</code>
                    </dd>
                  </div>
                </dl>
              </section>
              <GenerationResultPanel
                result={selectedResult}
                pattern={selectedEntry.pattern}
                onInspectCharacter={onInspectCharacter}
                onRefine={async (selections) => {
                  const result = await onRefine(selectedEntry, selectedResult, selections);
                  setSelectedVersionId(result.draft.id);
                }}
                versions={versions}
                onSelectVersion={(result) => setSelectedVersionId(result.draft.id)}
              />
            </>
          )}
        </div>
      )}
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
