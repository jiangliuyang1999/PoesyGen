import { useState } from 'react';

import type { GenerationResult, TextSelection } from '@poesygen/domain';

import { GenerationResultPanel } from './GenerationResultPanel.js';
import type { SubmissionStatus } from './GenerationSettings.js';
import {
  filterGenerationHistory,
  generationHistoryVersions,
  type GenerationHistoryEntry,
} from './generation-history.js';
import { formatGenerationTitle, patternStats } from './model.js';
import { paginateItems, Pagination } from './Pagination.js';
import { PatternPreview } from './PatternPreview.js';

interface GenerationHistoryWorkspaceProps {
  readonly entries: ReadonlyArray<GenerationHistoryEntry>;
  readonly onInspectCharacter: (character: string) => void;
  readonly onDelete: (entryId: string) => void;
  readonly onRefine: (
    entry: GenerationHistoryEntry,
    result: GenerationResult,
    selections: ReadonlyArray<TextSelection>,
    onProgress?: (status: SubmissionStatus) => void,
  ) => Promise<GenerationResult>;
}

const dateFormatter = new Intl.DateTimeFormat('zh-CN', {
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
});

const historyPageSize = 8;
const historyPaginationLabels = {
  navigation: '历史记录分页',
  previous: '上一页历史记录',
  next: '下一页历史记录',
  page: (pageNumber: number) => `第 ${pageNumber} 页`,
};

export function GenerationHistoryWorkspace({
  entries,
  onInspectCharacter,
  onDelete,
  onRefine,
}: GenerationHistoryWorkspaceProps) {
  const mobilePlatform = document.documentElement.dataset['platform'] === 'mobile';
  const [query, setQuery] = useState('');
  const [selectedEntryId, setSelectedEntryId] = useState(entries[0]?.id);
  const [selectedVersionId, setSelectedVersionId] = useState<string>();
  const [previewEntryId, setPreviewEntryId] = useState<string>();
  const [mobileDetailOpen, setMobileDetailOpen] = useState(false);
  const [pageIndex, setPageIndex] = useState(0);
  const visibleEntries = filterGenerationHistory(entries, query);
  const pagination = paginateItems(
    visibleEntries,
    pageIndex,
    mobilePlatform ? undefined : historyPageSize,
  );
  const selectedEntry =
    pagination.items.find(({ id }) => id === selectedEntryId) ?? pagination.items[0];
  const versions = selectedEntry === undefined ? [] : generationHistoryVersions(selectedEntry);
  const selectedResult =
    versions.find(({ draft }) => draft.id === selectedVersionId) ?? versions.at(-1);
  const selectedPatternStats =
    selectedEntry === undefined ? undefined : patternStats(selectedEntry.pattern);
  const patternPreviewOpen = selectedEntry !== undefined && previewEntryId === selectedEntry.id;

  const openEntry = (entryId: string): void => {
    setSelectedEntryId(entryId);
    setSelectedVersionId(undefined);
    setPreviewEntryId(undefined);
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
    const normalizedPageIndex = paginateItems(
      visibleEntries,
      nextPageIndex,
      historyPageSize,
    ).pageIndex;
    setPageIndex(normalizedPageIndex);
    setSelectedEntryId(visibleEntries[normalizedPageIndex * historyPageSize]?.id);
    setSelectedVersionId(undefined);
    setPreviewEntryId(undefined);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };

  const deleteEntry = (entry: GenerationHistoryEntry): void => {
    const title = formatGenerationTitle(entry.pattern.name, entry.result.draft.title);
    if (!window.confirm(`确定删除《${title}》的生成记录吗？此操作无法撤销。`)) return;
    if (selectedEntryId === entry.id) {
      setSelectedEntryId(undefined);
      setSelectedVersionId(undefined);
      setPreviewEntryId(undefined);
    }
    onDelete(entry.id);
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
                setPreviewEntryId(undefined);
              }}
              placeholder="搜索词牌名、题目、主题…"
            />
          </label>

          <div className="history-list">
            {pagination.items.map((entry) => {
              const selected = !mobilePlatform && entry.id === selectedEntry?.id;
              const title = formatGenerationTitle(entry.pattern.name, entry.result.draft.title);
              return (
                <article key={entry.id} data-selected={selected} className="history-list-card">
                  <button
                    className="history-list-entry"
                    type="button"
                    {...(mobilePlatform ? {} : { 'aria-pressed': selected })}
                    onClick={() => openEntry(entry.id)}
                  >
                    <span className="history-list-title">
                      <strong>{title}</strong>
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
                  <button
                    className="history-list-delete"
                    type="button"
                    title={`删除《${title}》`}
                    aria-label={`删除生成记录《${title}》`}
                    onClick={() => deleteEntry(entry)}
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16" />
                      <path d="M9 7V4h6v3" />
                      <path d="m6.5 7 1 13h9l1-13" />
                      <path d="M10 11v5M14 11v5" />
                    </svg>
                  </button>
                </article>
              );
            })}
            {visibleEntries.length === 0 && (
              <p className="empty-copy">
                {entries.length === 0 ? '您还没有生成记录，快去创作吧！' : '没有匹配的历史记录。'}
              </p>
            )}
          </div>

          {!mobilePlatform && (
            <Pagination
              className="history-pagination"
              pageIndex={pagination.pageIndex}
              pageCount={pagination.pageCount}
              labels={historyPaginationLabels}
              onChange={changePage}
            />
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
              <p>这里可查看生成记录，包括词牌名、主题和生成结果。</p>
            </section>
          ) : (
            <>
              <section className="history-overview" aria-label="历史记录信息">
                <div className="history-overview-primary">
                  <article className="history-pattern-identity" aria-label="词牌信息">
                    <span className="history-card-label">词牌</span>
                    <h3 aria-label={selectedEntry.pattern.name}>
                      <button
                        type="button"
                        aria-label={`${patternPreviewOpen ? '收起' : '预览'}《${selectedEntry.pattern.name}》词谱`}
                        aria-expanded={patternPreviewOpen}
                        aria-controls={`history-pattern-preview-${selectedEntry.id}`}
                        onClick={() =>
                          setPreviewEntryId((current) =>
                            current === selectedEntry.id ? undefined : selectedEntry.id,
                          )
                        }
                      >
                        <span>{selectedEntry.pattern.name}</span>
                        <small aria-hidden="true">
                          {patternPreviewOpen ? '收起词谱' : '预览词谱'}
                          <i>{patternPreviewOpen ? '↑' : '↗'}</i>
                        </small>
                      </button>
                    </h3>
                    <p className="history-pattern-stats">
                      {selectedEntry.pattern.variant} · {selectedPatternStats?.characters ?? 0} 字 ·{' '}
                      {selectedPatternStats?.sections === 1 ? '单调' : '双调'} ·{' '}
                      {selectedPatternStats?.lines ?? 0} 句 ·{' '}
                      {selectedPatternStats?.rhymePositions ?? 0} 韵位
                    </p>
                    <div className="history-pattern-rhymes" aria-label="韵脚设置">
                      <span className="history-card-label">韵脚</span>
                      <div>
                        {selectedEntry.settings === undefined ||
                        selectedEntry.settings.rhymeSettings.length === 0 ? (
                          <span className="history-setting-empty">未记录</span>
                        ) : (
                          selectedEntry.settings.rhymeSettings.map((setting) => (
                            <span key={setting.label}>
                              {setting.label} ·{' '}
                              {setting.groupName === undefined
                                ? '自动择韵'
                                : `${setting.groupName} · ${setting.sections?.join('、') ?? formatTone(setting.tone)}`}
                            </span>
                          ))
                        )}
                      </div>
                    </div>
                  </article>

                  <article className="history-theme-card" aria-label="创作主题">
                    <span className="history-card-label">创作主题</span>
                    <p>{selectedEntry.theme}</p>
                  </article>
                </div>

                {patternPreviewOpen && (
                  <div
                    className="history-pattern-preview"
                    id={`history-pattern-preview-${selectedEntry.id}`}
                  >
                    <PatternPreview
                      pattern={selectedEntry.pattern}
                      onInspectCharacter={onInspectCharacter}
                      showHeader={false}
                    />
                  </div>
                )}

                <dl className="history-generation-notes" aria-label="历史生成设置">
                  <div>
                    <dt>优化轮数</dt>
                    <dd>
                      {selectedEntry.settings === undefined
                        ? '未记录'
                        : `${selectedEntry.settings.maxRounds} 轮`}
                    </dd>
                  </div>
                  <div>
                    <dt>附加要求</dt>
                    <dd>
                      {selectedEntry.settings === undefined ||
                      selectedEntry.settings.additionalRequirements.length === 0
                        ? '无附加要求'
                        : selectedEntry.settings.additionalRequirements.join('；')}
                    </dd>
                  </div>
                </dl>
              </section>
              <GenerationResultPanel
                result={selectedResult}
                pattern={selectedEntry.pattern}
                onInspectCharacter={onInspectCharacter}
                onRefine={async (selections, onProgress) => {
                  const result = await onRefine(
                    selectedEntry,
                    selectedResult,
                    selections,
                    onProgress,
                  );
                  setSelectedVersionId(result.draft.id);
                }}
                versions={versions}
                onSelectVersion={(result) => setSelectedVersionId(result.draft.id)}
                titleId="history-result-title"
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

function formatTone(tone: 'level' | 'oblique' | 'either'): string {
  if (tone === 'level') return '平声';
  if (tone === 'oblique') return '仄声';
  return '平仄';
}
