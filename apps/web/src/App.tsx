import { type FormEvent, useEffect, useMemo, useState } from 'react';

import {
  PoesyGenClient,
  type CharacterPronunciationResponse,
  type CiPattern,
  type GenerationHealthResponse,
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
  groupPatternsByName,
  patternRhymeLabels,
  patternStats,
  splitRequirements,
} from './model.js';

export interface AppClient {
  listPatterns(): Promise<ReadonlyArray<CiPattern>>;
  listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>>;
  getGenerationHealth(): Promise<GenerationHealthResponse>;
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
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(idleStatus);
  const [connectionStatus, setConnectionStatus] = useState('正在载入词谱…');
  const [generationAvailable, setGenerationAvailable] = useState(false);
  const [dictionaryCharacter, setDictionaryCharacter] = useState<string>();
  const [generationHistory, setGenerationHistory] =
    useState<ReadonlyArray<GenerationHistoryEntry>>(loadGenerationHistory);

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

  const selectedPattern = patterns.find(({ id }) => id === selectedPatternId);
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

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
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
          <button
            type="button"
            data-active={view === 'patterns'}
            onClick={() => setView('patterns')}
          >
            词谱
          </button>
          <button type="button" data-active={view === 'create'} onClick={() => setView('create')}>
            创作
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
        <main className="pattern-catalog-layout">
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
        </main>
      ) : (
        <main className="creation-workspace">
          <header className="creation-workspace-header">
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
                <label>
                  <span>词牌</span>
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
                  <span>体式</span>
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
                <div className="selected-pattern-summary">
                  <span>当前</span>
                  <strong>
                    《{selectedPattern.name}》{selectedPattern.variant}
                  </strong>
                </div>
              </section>

              <form className="creation-form" onSubmit={(event) => void submit(event)}>
                <div className="composition-column">
                  <PatternPreview pattern={selectedPattern} onInspectCharacter={inspectCharacter} />

                  {submissionStatus.result !== undefined && (
                    <GenerationResultPanel
                      result={submissionStatus.result}
                      pattern={selectedPattern}
                      onInspectCharacter={inspectCharacter}
                    />
                  )}

                  <section className="theme-editor" aria-labelledby="theme-title">
                    <div className="theme-heading">
                      <div>
                        <p className="section-kicker">立意</p>
                        <h2 id="theme-title">写下想表达的内容</h2>
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
                    <div className="theme-prompts" aria-label="主题示例">
                      {['暮春归舟', '雪夜怀人', '故园新雨'].map((prompt) => (
                        <button key={prompt} type="button" onClick={() => setTheme(prompt)}>
                          {prompt}
                        </button>
                      ))}
                    </div>
                  </section>
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
