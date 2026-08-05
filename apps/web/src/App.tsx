import { useEffect, useMemo, useRef, useState } from 'react';

import {
  PoesyGenClient,
  type CharacterPronunciationResponse,
  type CiPattern,
  type GenerationHealthResponse,
  type IdeaSuggestionsResponse,
  type GenerationSessionResponse,
  type GenerationSessionStatusResponse,
  type RhymeGroupDetail,
  type RhymeGroupSummary,
} from '@poesygen/client-sdk';

import { DictionaryWorkspace } from './DictionaryWorkspace.js';
import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import { GenerationResultPanel } from './GenerationResultPanel.js';
import { GenerationSettings, type SubmissionStatus } from './GenerationSettings.js';
import { PatternBrowser } from './PatternBrowser.js';
import { PatternPreview } from './PatternPreview.js';
import { toUserMessage } from './errors.js';
import {
  addGenerationHistoryEntry,
  loadGenerationHistory,
  saveGenerationHistory,
  type GenerationHistoryEntry,
} from './generation-history.js';
import {
  displayRhymeLabel,
  groupPatternsByName,
  patternRhymeLabels,
  patternStats,
  splitRequirements,
} from './model.js';

export interface AppClient {
  listPatterns(): Promise<ReadonlyArray<CiPattern>>;
  listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>>;
  getGenerationHealth(): Promise<GenerationHealthResponse>;
  suggestCreationIdeas(patternId: string): Promise<IdeaSuggestionsResponse>;
  getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail>;
  getCharacterPronunciations(character: string): Promise<CharacterPronunciationResponse>;
  createGenerationSession(
    request: Parameters<PoesyGenClient['createGenerationSession']>[0],
  ): Promise<GenerationSessionResponse>;
  waitForGenerationSession(
    sessionId: string,
    options?: Parameters<PoesyGenClient['waitForGenerationSession']>[1],
  ): Promise<GenerationSessionStatusResponse>;
}

interface AppProps {
  readonly client?: AppClient;
}

type View = 'patterns' | 'create' | 'dictionary';
type CreateView = 'compose' | 'history';
type IdeaSuggestionsStatus = 'idle' | 'loading' | 'ready' | 'error';

interface IdeaSuggestionsState {
  readonly status: IdeaSuggestionsStatus;
  readonly suggestions: ReadonlyArray<string>;
}

const idleStatus: SubmissionStatus = {
  kind: 'idle',
  message: '',
};

export function App({ client: providedClient }: AppProps = {}) {
  const defaultClient = useMemo(
    () =>
      new PoesyGenClient({
        baseUrl: import.meta.env['VITE_API_URL'] ?? '/api',
      }),
    [],
  );
  const client = providedClient ?? defaultClient;
  const [view, setView] = useState<View>('create');
  const [createView, setCreateView] = useState<CreateView>('compose');
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
  const [connectionStatus, setConnectionStatus] = useState('正在载入词谱…');
  const [generationAvailable, setGenerationAvailable] = useState(false);
  const [dictionaryCharacter, setDictionaryCharacter] = useState<string>();
  const [generationHistory, setGenerationHistory] =
    useState<ReadonlyArray<GenerationHistoryEntry>>(loadGenerationHistory);
  const ideaRequestSequence = useRef(0);
  const ideaSuggestionCache = useRef(new Map<string, ReadonlyArray<string>>());

  useEffect(() => {
    let active = true;
    void Promise.all([
      client.listPatterns(),
      client.listCilinRhymeGroups(),
      client.getGenerationHealth(),
    ])
      .then(([loadedPatterns, loadedGroups, generation]) => {
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
      })
      .catch((error: unknown) => {
        if (active) setConnectionStatus(toUserMessage(error));
      });
    return () => {
      active = false;
    };
  }, [client]);

  useEffect(() => {
    if (selectedPatternId === '' || view !== 'create' || createView !== 'compose') return;
    const cached = ideaSuggestionCache.current.get(selectedPatternId);
    if (cached !== undefined) {
      setIdeaSuggestions({ status: 'ready', suggestions: cached });
      return;
    }
    requestIdeaSuggestions(selectedPatternId);
    return () => {
      ideaRequestSequence.current += 1;
    };
  }, [client, createView, selectedPatternId, view]);

  const selectedPattern = patterns.find(({ id }) => id === selectedPatternId);
  const selectedPatternStats =
    selectedPattern === undefined ? undefined : patternStats(selectedPattern);
  const patternFamilies = useMemo(() => groupPatternsByName(patterns), [patterns]);
  const selectedPatternFamily = patternFamilies.find(({ name }) => name === selectedPattern?.name);

  const selectPattern = (patternId: string): void => {
    setSelectedPatternId(patternId);
    setRhymeAssignments({});
    setSubmissionStatus(idleStatus);
  };

  const inspectCharacter = (character: string): void => {
    setDictionaryCharacter(character);
    setView('dictionary');
  };

  function requestIdeaSuggestions(patternId: string, preserveCurrent = false): void {
    const requestSequence = ++ideaRequestSequence.current;
    setIdeaSuggestions((current) => ({
      status: 'loading',
      suggestions: preserveCurrent ? current.suggestions : [],
    }));
    void client
      .suggestCreationIdeas(patternId)
      .then((response) => {
        if (requestSequence !== ideaRequestSequence.current) return;
        const suggestions = response.suggestions
          .map((suggestion) => suggestion.trim())
          .filter((suggestion) => suggestion !== '' && Array.from(suggestion).length <= 50)
          .slice(0, 3);
        if (suggestions.length !== 3) {
          throw new Error('灵感推荐结果格式不正确');
        }
        ideaSuggestionCache.current.set(patternId, suggestions);
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
        const historyEntry: GenerationHistoryEntry = {
          id: completed.id,
          createdAt: new Date().toISOString(),
          theme: theme.trim(),
          settings: historySettings,
          pattern: selectedPattern,
          result: completed.result,
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

  return (
    <div className="app-shell">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => setView('create')}>
          <span className="brand-seal">词</span>
          <span>
            <strong>PoesyGen</strong>
            <small>格律词作工作台</small>
          </span>
        </button>

        <nav aria-label="主导航">
          <button type="button" data-active={view === 'create'} onClick={() => setView('create')}>
            创作
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
        <main className="page-workspace">
          <header className="workspace-header">
            <div>
              <p className="section-kicker">词谱</p>
              <h1>格律词谱</h1>
              <p>浏览词牌与体式，查看逐句字数、平仄和韵位。</p>
            </div>
          </header>
          <div className="workspace-grid pattern-catalog-layout">
            <PatternBrowser
              patterns={patterns}
              query={patternQuery}
              selectedPatternId={selectedPattern.id}
              onQueryChange={setPatternQuery}
              onSelect={selectPattern}
            />
            <PatternPreview
              pattern={selectedPattern}
              onInspectCharacter={inspectCharacter}
              onCreate={() => {
                setCreateView('compose');
                setView('create');
              }}
            />
          </div>
        </main>
      ) : (
        <main className="page-workspace creation-workspace">
          <header className="workspace-header creation-workspace-header">
            <div>
              <p className="section-kicker">创作</p>
              <h1>依谱填词</h1>
              <p>选择主题与韵部，生成后由程序逐字校验。</p>
            </div>
            <div className="create-view-switcher" role="group" aria-label="创作视图">
              <button
                type="button"
                aria-pressed={createView === 'compose'}
                onClick={() => setCreateView('compose')}
              >
                新作
              </button>
              <button
                type="button"
                aria-pressed={createView === 'history'}
                onClick={() => setCreateView('history')}
              >
                历史记录
                <span>{generationHistory.length}</span>
              </button>
            </div>
          </header>

          {createView === 'history' ? (
            <GenerationHistoryWorkspace
              entries={generationHistory}
              onInspectCharacter={inspectCharacter}
            />
          ) : (
            <>
              <section className="selected-pattern-bar" aria-label="当前创作词谱">
                <header className="selected-pattern-heading">
                  <div>
                    <p className="section-kicker">创作词谱</p>
                    <strong>
                      《{selectedPattern.name}》{selectedPattern.variant}
                    </strong>
                  </div>
                  <div className="selected-pattern-stats" aria-label="当前词谱统计">
                    <span>
                      <strong>{selectedPatternStats?.characters ?? 0}</strong> 字
                    </span>
                    <span>
                      <strong>{selectedPatternStats?.lines ?? 0}</strong> 句
                    </span>
                    <span>
                      <strong>{selectedPatternStats?.sections ?? 0}</strong> 阕
                    </span>
                  </div>
                </header>

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
                        const stats = patternStats(pattern);
                        return (
                          <option key={pattern.id} value={pattern.id}>
                            {pattern.variant} · {stats.characters}字/{stats.lines}句
                          </option>
                        );
                      })}
                    </select>
                  </label>
                </div>
              </section>

              <form className="creation-form" onSubmit={(event) => void submit(event)}>
                <div className="composition-column">
                  <section className="theme-editor" aria-labelledby="theme-title">
                    <div className="theme-heading">
                      <div className="creation-section-title">
                        <span className="creation-step">01</span>
                        <div>
                          <p className="section-kicker">创作主题</p>
                          <h2 id="theme-title">写下想表达的内容</h2>
                        </div>
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
                          onClick={() => requestIdeaSuggestions(selectedPattern.id, true)}
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

                  {submissionStatus.result !== undefined && (
                    <GenerationResultPanel
                      result={submissionStatus.result}
                      pattern={selectedPattern}
                      onInspectCharacter={inspectCharacter}
                    />
                  )}

                  <PatternPreview pattern={selectedPattern} onInspectCharacter={inspectCharacter} />
                </div>

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
              </form>
            </>
          )}
        </main>
      )}
    </div>
  );
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
