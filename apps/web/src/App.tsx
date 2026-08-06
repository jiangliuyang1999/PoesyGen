import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PoesyGenClient,
  type CharacterPronunciationResponse,
  type CiPattern,
  type GenerationHealthResponse,
  type GenerationResult,
  type IdeaSuggestionsResponse,
  type GenerationSessionResponse,
  type GenerationSessionStatusResponse,
  type RhymeGroupDetail,
  type RhymeGroupSummary,
  type TextSelection,
} from '@poesygen/client-sdk';

import { DictionaryWorkspace } from './DictionaryWorkspace.js';
import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import { GenerationResultPanel } from './GenerationResultPanel.js';
import { GenerationSettings, type SubmissionStatus } from './GenerationSettings.js';
import { MobileAppChrome, type ApplicationView } from './MobileAppChrome.js';
import { MobilePatternWorkspace } from './MobilePatternWorkspace.js';
import { PatternBrowser } from './PatternBrowser.js';
import { PatternPreview, PatternPreviewTitle } from './PatternPreview.js';
import { toUserMessage } from './errors.js';
import {
  addGenerationHistoryEntry,
  addGenerationHistoryVersion,
  loadGenerationHistory,
  saveGenerationHistory,
  type GenerationHistoryEntry,
} from './generation-history.js';
import {
  displayRhymeLabel,
  formatPatternVariantSummary,
  groupPatternsByName,
  patternRhymeLabels,
  splitRequirements,
} from './model.js';

export interface AppClient {
  listPatterns(): Promise<ReadonlyArray<CiPattern>>;
  listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>>;
  getGenerationHealth(): Promise<GenerationHealthResponse>;
  suggestCreationIdeas(): Promise<IdeaSuggestionsResponse>;
  getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail>;
  getCharacterPronunciations(character: string): Promise<CharacterPronunciationResponse>;
  createGenerationSession(
    request: Parameters<PoesyGenClient['createGenerationSession']>[0],
  ): Promise<GenerationSessionResponse>;
  createRefinementSession(
    request: Parameters<PoesyGenClient['createRefinementSession']>[0],
  ): Promise<GenerationSessionResponse>;
  waitForGenerationSession(
    sessionId: string,
    options?: Parameters<PoesyGenClient['waitForGenerationSession']>[1],
  ): Promise<GenerationSessionStatusResponse>;
}

interface AppProps {
  readonly client?: AppClient;
}

type IdeaSuggestionsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface IdeaSuggestionsState {
  readonly status: IdeaSuggestionsStatus;
  readonly suggestions: ReadonlyArray<string>;
}

const idleStatus: SubmissionStatus = {
  kind: 'idle',
  message: '',
};

const initialLoadRetryDelays = [0, 250, 500, 1_000, 1_500] as const;

export function App({ client: providedClient }: AppProps = {}) {
  const defaultClient = useMemo(
    () =>
      new PoesyGenClient({
        baseUrl: import.meta.env['VITE_API_URL'] ?? '/api',
      }),
    [],
  );
  const client = providedClient ?? defaultClient;
  const [view, setView] = useState<ApplicationView>('create');
  const [patterns, setPatterns] = useState<ReadonlyArray<CiPattern>>([]);
  const [rhymeGroups, setRhymeGroups] = useState<ReadonlyArray<RhymeGroupSummary>>([]);
  const [selectedPatternId, setSelectedPatternId] = useState('');
  const [patternQuery, setPatternQuery] = useState('');
  const [theme, setTheme] = useState('');
  const [requirements, setRequirements] = useState('');
  const [rounds, setRounds] = useState(8);
  const [rhymeAssignments, setRhymeAssignments] = useState<Record<string, string>>({});
  const [ideaSuggestions, setIdeaSuggestions] = useState<IdeaSuggestionsState>({
    status: 'idle',
    suggestions: [],
  });
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(idleStatus);
  const [resultVersions, setResultVersions] = useState<ReadonlyArray<GenerationResult>>([]);
  const [activeHistoryEntryId, setActiveHistoryEntryId] = useState<string>();
  const [connectionStatus, setConnectionStatus] = useState('正在载入词谱…');
  const [generationAvailable, setGenerationAvailable] = useState(false);
  const [dictionaryCharacter, setDictionaryCharacter] = useState<string>();
  const [generationHistory, setGenerationHistory] =
    useState<ReadonlyArray<GenerationHistoryEntry>>(loadGenerationHistory);
  const ideaRequestSequence = useRef(0);

  useEffect(() => {
    let active = true;

    const loadInitialData = async (): Promise<void> => {
      let lastError: unknown = new Error('无法连接生成服务');

      for (const retryDelay of initialLoadRetryDelays) {
        if (!active) return;
        if (retryDelay > 0) {
          setConnectionStatus('API 正在启动，正在重新连接…');
          await new Promise((resolve) => setTimeout(resolve, retryDelay));
          if (!active) return;
        }

        try {
          const [loadedPatterns, loadedGroups, generation] = await Promise.all([
            client.listPatterns(),
            client.listCilinRhymeGroups(),
            client.getGenerationHealth(),
          ]);
          if (!active) return;
          const tuneCount = new Set(loadedPatterns.map(({ name }) => name)).size;
          setPatterns(loadedPatterns);
          setRhymeGroups(loadedGroups);
          setGenerationAvailable(generation.available);
          setSelectedPatternId(loadedPatterns[0]?.id ?? '');
          setConnectionStatus(
            generation.available
              ? `已载入 ${tuneCount} 个词牌、${loadedPatterns.length} 种体式，生成 Worker 已就绪`
              : `已载入 ${tuneCount} 个词牌、${loadedPatterns.length} 种体式，但生成 Worker 未连接`,
          );
          return;
        } catch (error) {
          lastError = error;
        }
      }

      if (active) {
        setConnectionStatus(toUserMessage(lastError));
      }
    };

    void loadInitialData();
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (view !== 'create' || ideaSuggestions.status !== 'idle') return;
    requestIdeaSuggestions();
  }, [client, ideaSuggestions.status, view]);

  const selectedPattern = patterns.find(({ id }) => id === selectedPatternId);
  const patternFamilies = useMemo(() => groupPatternsByName(patterns), [patterns]);
  const selectedPatternFamily = patternFamilies.find(({ name }) => name === selectedPattern?.name);

  const selectPattern = (patternId: string): void => {
    setSelectedPatternId(patternId);
    setRhymeAssignments({});
    setSubmissionStatus(idleStatus);
    setResultVersions([]);
    setActiveHistoryEntryId(undefined);
  };

  const inspectCharacter = (character: string): void => {
    setDictionaryCharacter(character);
    setView('dictionary');
  };

  function requestIdeaSuggestions(preserveCurrent = false): void {
    const requestSequence = ++ideaRequestSequence.current;
    setIdeaSuggestions((current) => ({
      status: 'loading',
      suggestions: preserveCurrent ? current.suggestions : [],
    }));
    void client
      .suggestCreationIdeas()
      .then((response) => {
        if (requestSequence !== ideaRequestSequence.current) return;
        const suggestions = response.suggestions
          .map((suggestion) => suggestion.trim())
          .filter((suggestion) => suggestion !== '' && Array.from(suggestion).length <= 50)
          .slice(0, 3);
        if (suggestions.length !== 3) {
          throw new Error('灵感推荐结果格式不正确');
        }
        setIdeaSuggestions({ status: 'ready', suggestions });
      })
      .catch(() => {
        if (requestSequence !== ideaRequestSequence.current) return;
        setIdeaSuggestions((current) => ({
          status: 'error',
          suggestions: preserveCurrent ? current.suggestions : [],
        }));
      });
  }

  const submit = async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    if (selectedPattern === undefined || theme.trim() === '') return;

    setSubmissionStatus({
      kind: 'loading',
      message: '正在创建会话并投递生成任务。',
    });
    const labels = patternRhymeLabels(selectedPattern);
    const selectedRhymes = Object.fromEntries(
      labels
        .map(({ id }) => [id, rhymeAssignments[id]] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
    );
    const preferredRhymeGroup =
      Object.keys(selectedRhymes).length === 0
        ? undefined
        : labels.length === 1
          ? selectedRhymes[labels[0]!.id]
          : selectedRhymes;
    const additionalRequirements = splitRequirements(requirements);
    const historySettings = {
      maxRounds: rounds,
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
    };

    try {
      const session = await client.createGenerationSession({
        patternId: selectedPattern.id,
        theme: theme.trim(),
        maxRounds: rounds,
        ...(preferredRhymeGroup === undefined ? {} : { preferredRhymeGroup }),
        ...(additionalRequirements.length === 0
          ? {}
          : { additionalRequirements: [...additionalRequirements] }),
      });
      setSubmissionStatus({
        kind: 'queued',
        message: `《${selectedPattern.name}》生成任务已进入队列。`,
        sessionId: session.id,
        jobId: session.jobId,
      });
      const completed = await client.waitForGenerationSession(session.id, {
        onUpdate(update) {
          if (update.status !== 'queued' && update.status !== 'running') return;
          setSubmissionStatus({
            kind: update.status,
            message:
              progressMessage(update.progress) ??
              (update.status === 'running' ? '模型正在生成并校验词稿。' : '等待 Worker 接收任务。'),
            sessionId: update.id,
            jobId: update.jobId,
          });
        },
      });
      if (completed.status === 'failed') {
        setSubmissionStatus({
          kind: 'error',
          message: completed.error ?? '生成任务失败。',
          sessionId: completed.id,
          jobId: completed.jobId,
        });
      } else if (completed.result === undefined) {
        setSubmissionStatus({
          kind: 'error',
          message: '任务已结束，但没有返回词稿。',
          sessionId: completed.id,
          jobId: completed.jobId,
        });
      } else {
        setSubmissionStatus({
          kind: 'completed',
          message: completed.result.report.passed
            ? `《${selectedPattern.name}》已通过格律校验。`
            : `《${selectedPattern.name}》已达到优化轮次上限。`,
          sessionId: completed.id,
          jobId: completed.jobId,
          result: completed.result,
        });
        setResultVersions([completed.result]);
        setActiveHistoryEntryId(completed.id);
        const historyEntry: GenerationHistoryEntry = {
          id: completed.id,
          createdAt: new Date().toISOString(),
          theme: theme.trim(),
          settings: historySettings,
          pattern: selectedPattern,
          result: completed.result,
          versions: [completed.result],
        };
        setGenerationHistory((current) => {
          const next = addGenerationHistoryEntry(current, historyEntry);
          saveGenerationHistory(next);
          return next;
        });
      }
    } catch (error) {
      setSubmissionStatus({
        kind: 'error',
        message: toUserMessage(error),
      });
    }
  };

  const runRefinementSession = async (
    request: Parameters<AppClient['createRefinementSession']>[0],
    sourceResult: GenerationResult,
    onStatus?: (status: SubmissionStatus) => void,
  ): Promise<{
    readonly result: GenerationResult;
    readonly sessionId: string;
    readonly jobId: string;
  }> => {
    const session = await client.createRefinementSession(request);
    onStatus?.({
      kind: 'queued',
      message: '局部修改任务已进入队列。',
      sessionId: session.id,
      jobId: session.jobId,
      result: sourceResult,
    });
    const completed = await client.waitForGenerationSession(session.id, {
      onUpdate(update) {
        if (update.status !== 'queued' && update.status !== 'running') return;
        onStatus?.({
          kind: update.status,
          message:
            progressMessage(update.progress) ??
            (update.status === 'running' ? '模型正在按意见修改并校验。' : '等待 Worker 接收任务。'),
          sessionId: update.id,
          jobId: update.jobId,
          result: sourceResult,
        });
      },
    });
    if (completed.status === 'failed' || completed.result === undefined) {
      throw new Error(completed.error ?? '局部修改任务没有返回新词稿');
    }
    onStatus?.({
      kind: 'completed',
      message: completed.result.report.passed
        ? '新版本已按意见修改并通过格律校验。'
        : '新版本已生成，但仍有格律问题。',
      sessionId: completed.id,
      jobId: completed.jobId,
      result: completed.result,
    });
    return {
      result: completed.result,
      sessionId: completed.id,
      jobId: completed.jobId,
    };
  };

  const refineCurrentResult = async (selections: ReadonlyArray<TextSelection>): Promise<void> => {
    const sourceResult = submissionStatus.result;
    if (selectedPattern === undefined || sourceResult === undefined) {
      throw new Error('当前没有可修改的词稿');
    }

    const labels = patternRhymeLabels(selectedPattern);
    const selectedRhymes = Object.fromEntries(
      labels
        .map(({ id }) => [id, rhymeAssignments[id]] as const)
        .filter((entry): entry is readonly [string, string] => entry[1] !== undefined),
    );
    const preferredRhymeGroup =
      Object.keys(selectedRhymes).length === 0
        ? undefined
        : labels.length === 1
          ? selectedRhymes[labels[0]!.id]
          : selectedRhymes;
    const additionalRequirements = splitRequirements(requirements);
    const historySettings = {
      maxRounds: rounds,
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
    };

    try {
      const { result, sessionId } = await runRefinementSession(
        createRefinementRequest({
          sourceResult,
          pattern: selectedPattern,
          selections,
          maxRounds: rounds,
          preferredRhymeGroup,
          additionalRequirements,
        }),
        sourceResult,
        setSubmissionStatus,
      );
      setResultVersions((current) => [
        ...current.filter(({ draft }) => draft.id !== result.draft.id),
        result,
      ]);
      const historyEntryId = activeHistoryEntryId ?? sessionId;
      if (activeHistoryEntryId === undefined) setActiveHistoryEntryId(historyEntryId);
      setGenerationHistory((current) => {
        const next =
          activeHistoryEntryId === undefined
            ? addGenerationHistoryEntry(current, {
                id: historyEntryId,
                createdAt: new Date().toISOString(),
                theme: sourceResult.draft.theme,
                settings: historySettings,
                pattern: selectedPattern,
                result,
                versions: [sourceResult, result],
              })
            : addGenerationHistoryVersion(current, historyEntryId, result);
        saveGenerationHistory(next);
        return next;
      });
    } catch (error) {
      setSubmissionStatus({
        kind: 'error',
        message: toUserMessage(error),
        result: sourceResult,
      });
      throw error;
    }
  };

  const refineHistoryResult = async (
    entry: GenerationHistoryEntry,
    sourceResult: GenerationResult,
    selections: ReadonlyArray<TextSelection>,
  ): Promise<GenerationResult> => {
    const labels = patternRhymeLabels(entry.pattern);
    const selectedRhymes = Object.fromEntries(
      labels
        .map((label, index) => [label.id, entry.settings?.rhymeSettings[index]?.groupId] as const)
        .filter((item): item is readonly [string, string] => item[1] !== undefined),
    );
    const preferredRhymeGroup =
      Object.keys(selectedRhymes).length === 0
        ? sourceResult.draft.requestedRhymeGroup
        : labels.length === 1
          ? selectedRhymes[labels[0]!.id]
          : selectedRhymes;
    const additionalRequirements = entry.settings?.additionalRequirements ?? [];
    const { result } = await runRefinementSession(
      createRefinementRequest({
        sourceResult,
        pattern: entry.pattern,
        selections,
        maxRounds: entry.settings?.maxRounds ?? 8,
        preferredRhymeGroup,
        additionalRequirements,
      }),
      sourceResult,
    );
    setGenerationHistory((current) => {
      const next = addGenerationHistoryVersion(current, entry.id, result);
      saveGenerationHistory(next);
      return next;
    });
    return result;
  };

  const selectResultVersion = (result: GenerationResult): void => {
    setSubmissionStatus((current) => ({
      ...current,
      kind: 'completed',
      message: `正在查看作品版本 ${result.draft.version}。`,
      result,
    }));
  };

  const selectMobileView = (nextView: ApplicationView): void => {
    setView(nextView);
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;
  };
  const mobilePlatform = document.documentElement.dataset['platform'] === 'mobile';

  return (
    <div className="app-shell">
      {mobilePlatform ? (
        <MobileAppChrome
          activeView={view}
          generationAvailable={generationAvailable}
          hasLoadedPatterns={patterns.length > 0}
          onSelectView={selectMobileView}
        />
      ) : (
        <header className="topbar">
          <button className="brand" type="button" onClick={() => setView('create')}>
            <span className="brand-seal">词</span>
            <span>
              <strong>PoesyGen</strong>
              <small>格律诗词</small>
            </span>
          </button>

          <nav aria-label="主导航">
            <button type="button" data-active={view === 'create'} onClick={() => setView('create')}>
              创作
            </button>
            <button
              type="button"
              data-active={view === 'history'}
              onClick={() => setView('history')}
            >
              历史记录
            </button>
            <button
              type="button"
              data-active={view === 'patterns'}
              onClick={() => setView('patterns')}
            >
              词谱
            </button>
            <button
              type="button"
              data-active={view === 'dictionary'}
              onClick={() => setView('dictionary')}
            >
              字典
            </button>
          </nav>

          <div className="connection-status" title={connectionStatus}>
            <span data-ready={generationAvailable} />
            {generationAvailable
              ? '生成服务就绪'
              : patterns.length > 0
                ? 'Worker 未连接'
                : '正在连接'}
          </div>
        </header>
      )}

      {view === 'dictionary' ? (
        <DictionaryWorkspace
          client={client}
          rhymeGroups={rhymeGroups}
          {...(dictionaryCharacter === undefined ? {} : { initialCharacter: dictionaryCharacter })}
          onInitialCharacterHandled={() => setDictionaryCharacter(undefined)}
        />
      ) : patterns.length === 0 || selectedPattern === undefined ? (
        <LoadingState message={connectionStatus} />
      ) : view === 'patterns' ? (
        <main className="page-workspace" key="patterns">
          <header className="workspace-header">
            <div>
              <p className="section-kicker">词谱</p>
              <h1>格律词谱</h1>
              <p>浏览词牌与体式，查看逐句字数、平仄和韵位。</p>
            </div>
          </header>
          {mobilePlatform ? (
            <MobilePatternWorkspace
              patterns={patterns}
              query={patternQuery}
              selectedPattern={selectedPattern}
              onQueryChange={setPatternQuery}
              onSelect={selectPattern}
              onInspectCharacter={inspectCharacter}
              onCreate={() => {
                setView('create');
              }}
            />
          ) : (
            <div className="workspace-grid pattern-catalog-layout">
              <PatternBrowser
                patterns={patterns}
                query={patternQuery}
                selectedPatternId={selectedPattern.id}
                onQueryChange={setPatternQuery}
                onSelect={selectPattern}
              />
              <section className="pattern-detail-panel" aria-label="词牌格律详情">
                {selectedPatternFamily !== undefined &&
                  selectedPatternFamily.patterns.length > 1 && (
                    <label className="pattern-detail-variant">
                      <span>选择体式</span>
                      <select
                        aria-label={`${selectedPatternFamily.name}体式`}
                        value={selectedPattern.id}
                        onChange={(event) => selectPattern(event.target.value)}
                      >
                        {selectedPatternFamily.patterns.map((pattern) => (
                          <option key={pattern.id} value={pattern.id}>
                            {formatPatternVariantSummary(pattern)}
                          </option>
                        ))}
                      </select>
                    </label>
                  )}
                <PatternPreview
                  pattern={selectedPattern}
                  onInspectCharacter={inspectCharacter}
                  onCreate={() => {
                    setView('create');
                  }}
                />
              </section>
            </div>
          )}
        </main>
      ) : view === 'history' ? (
        <main className="page-workspace" key="history">
          <header className="workspace-header">
            <div>
              <p className="section-kicker">历史</p>
              <h1>历史记录</h1>
              <p>查询本地保存的生成记录、创作设置和作品版本。</p>
            </div>
          </header>
          <GenerationHistoryWorkspace
            entries={generationHistory}
            onInspectCharacter={inspectCharacter}
            onRefine={refineHistoryResult}
          />
        </main>
      ) : (
        <main className="page-workspace" key="create">
          <header className="workspace-header">
            <div>
              <p className="section-kicker">创作</p>
              <h1>依谱填词</h1>
              <p>选择主题与韵部，生成后由程序逐字校验。</p>
            </div>
          </header>

          <form className="creation-form" onSubmit={(event) => void submit(event)}>
            <section className="creation-pattern-panel" aria-label="词谱选择与格律预览">
              <section className="selected-pattern-bar" aria-label="当前创作词谱">
                <div className="selected-pattern-controls">
                  <label>
                    <span>选择词牌</span>
                    <select
                      aria-label="创作词牌"
                      value={selectedPattern.name}
                      onChange={(event) => {
                        const family = patternFamilies.find(
                          ({ name }) => name === event.target.value,
                        );
                        const standard =
                          family?.patterns.find(({ variant }) => variant === '正体') ??
                          family?.patterns[0];
                        if (standard !== undefined) selectPattern(standard.id);
                      }}
                    >
                      {patternFamilies.map((family) => (
                        <option key={family.name} value={family.name}>
                          {family.name} · {family.patterns.length}体
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span>选择体式</span>
                    <select
                      aria-label="创作体式"
                      value={selectedPattern.id}
                      onChange={(event) => selectPattern(event.target.value)}
                    >
                      {selectedPatternFamily?.patterns.map((pattern) => {
                        return (
                          <option key={pattern.id} value={pattern.id}>
                            {formatPatternVariantSummary(pattern)}
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </section>

              <div className="creation-pattern-preview-block">
                <span className="creation-pattern-current-label">当前词牌</span>
                <details className="creation-pattern-preview">
                  <summary className="pattern-header creation-pattern-summary">
                    <PatternPreviewTitle
                      pattern={selectedPattern}
                      level={2}
                      id="creation-pattern-title"
                    />
                    <span className="pattern-preview-disclosure" aria-hidden="true">
                      <span>展开</span>
                      <span>收起</span>
                    </span>
                  </summary>
                  <div className="creation-pattern-preview-body">
                    <PatternPreview
                      pattern={selectedPattern}
                      onInspectCharacter={inspectCharacter}
                      showHeader={false}
                    />
                  </div>
                </details>
              </div>
            </section>

            <section className="creation-input-panel" aria-label="创作主题与生成设置">
              <section className="theme-editor" aria-labelledby="theme-title">
                <div className="theme-heading">
                  <div className="creation-section-title">
                    <span className="creation-step">01</span>
                    <h2 className="creation-panel-title" id="theme-title">
                      创作主题
                    </h2>
                  </div>
                  <span>{theme.length}/2000</span>
                </div>
                <label>
                  <span className="sr-only">作品主题</span>
                  <textarea
                    value={theme}
                    onChange={(event) => setTheme(event.target.value)}
                    placeholder="暮春江上归舟，忽忆多年未见的故友。希望词意含蓄，以江风、残照和远帆寄托惆怅。"
                    rows={6}
                    maxLength={2_000}
                    required
                  />
                </label>
                <div className="theme-ideas" aria-label="大模型灵感推荐" aria-live="polite">
                  <div className="theme-ideas-header">
                    <span>灵感推荐</span>
                    <button
                      type="button"
                      disabled={ideaSuggestions.status === 'loading'}
                      onClick={() => requestIdeaSuggestions(true)}
                    >
                      {ideaSuggestions.status === 'loading'
                        ? '构思中…'
                        : ideaSuggestions.status === 'error'
                          ? '重新获取'
                          : '换一组'}
                    </button>
                  </div>
                  <div className="theme-prompts">
                    {ideaSuggestions.suggestions.map((prompt) => (
                      <button key={prompt} type="button" onClick={() => setTheme(prompt)}>
                        {prompt}
                      </button>
                    ))}
                    {ideaSuggestions.status === 'loading' &&
                      ideaSuggestions.suggestions.length === 0 && (
                        <span className="theme-ideas-status">大模型正在整理创作主题…</span>
                      )}
                    {ideaSuggestions.status === 'error' &&
                      ideaSuggestions.suggestions.length === 0 && (
                        <span className="theme-ideas-status" data-error="true">
                          暂时无法获取灵感，请稍后重试。
                        </span>
                      )}
                  </div>
                </div>
              </section>

              <GenerationSettings
                pattern={selectedPattern}
                rhymeGroups={rhymeGroups}
                rhymeAssignments={rhymeAssignments}
                rounds={rounds}
                requirements={requirements}
                status={submissionStatus}
                canSubmit={theme.trim() !== '' && generationAvailable}
                onRhymeChange={(label, groupId) =>
                  setRhymeAssignments((current) => {
                    const next = { ...current };
                    if (groupId === '') delete next[label];
                    else next[label] = groupId;
                    return next;
                  })
                }
                onRoundsChange={setRounds}
                onRequirementsChange={setRequirements}
              />
            </section>

            {submissionStatus.result !== undefined && (
              <GenerationResultPanel
                result={submissionStatus.result}
                pattern={selectedPattern}
                onInspectCharacter={inspectCharacter}
                onRefine={refineCurrentResult}
                versions={resultVersions}
                onSelectVersion={selectResultVersion}
              />
            )}
          </form>
        </main>
      )}
    </div>
  );
}

interface CreateRefinementRequestInput {
  readonly sourceResult: GenerationResult;
  readonly pattern: CiPattern;
  readonly selections: ReadonlyArray<TextSelection>;
  readonly maxRounds: number;
  readonly preferredRhymeGroup: Parameters<
    AppClient['createRefinementSession']
  >[0]['preferredRhymeGroup'];
  readonly additionalRequirements: ReadonlyArray<string>;
}

function createRefinementRequest({
  sourceResult,
  pattern,
  selections,
  maxRounds,
  preferredRhymeGroup,
  additionalRequirements,
}: CreateRefinementRequestInput): Parameters<AppClient['createRefinementSession']>[0] {
  return {
    patternId: pattern.id,
    theme: sourceResult.draft.theme,
    draft: {
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

function LoadingState({ message }: { readonly message: string }) {
  return (
    <main className="loading-state" role="status">
      <span />
      <h1>正在展开词谱</h1>
      <p>{message}</p>
    </main>
  );
}

function progressMessage(progress: unknown): string | undefined {
  if (typeof progress !== 'object' || progress === null) return undefined;
  const message = (progress as { message?: unknown }).message;
  return typeof message === 'string' ? message : undefined;
}
