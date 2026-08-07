import { useEffect, useMemo, useRef, useState } from 'react';

import type {
  CiPattern,
  GenerationRequest,
  GenerationResult,
  TextSelection,
} from '@poesygen/domain';

import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from './catalog-types.js';
import { DictionaryWorkspace } from './DictionaryWorkspace.js';
import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import { GenerationResultPanel } from './GenerationResultPanel.js';
import {
  GenerationSettings,
  isSubmissionInProgress,
  RhymeSettings,
  type SubmissionProgressEntry,
  type SubmissionStatus,
} from './GenerationSettings.js';
import { LlmConfigDialog } from './LlmConfigDialog.js';
import { MobileAppChrome, type ApplicationView } from './MobileAppChrome.js';
import { MobilePatternWorkspace } from './MobilePatternWorkspace.js';
import { PatternBrowser } from './PatternBrowser.js';
import { PatternPreview } from './PatternPreview.js';
import {
  isDirectLlmConfigReady,
  loadDirectLlmConfig,
  saveDirectLlmConfig,
} from './direct-llm-config.js';
import {
  runDirectGeneration,
  runDirectIdeaSuggestions,
  type DirectGenerationProgress,
} from './direct-generation.js';
import { toUserMessage } from './errors.js';
import {
  addGenerationHistoryEntry,
  addGenerationHistoryVersion,
  loadGenerationHistory,
  saveGenerationHistory,
  type GenerationHistoryEntry,
} from './generation-history.js';
import { LocalCatalogClient } from './local-catalog.js';
import { randomLocalCreationIdeas } from './local-ideas.js';
import {
  displayRhymeLabel,
  formatPatternVariantSummary,
  groupPatternsByName,
  patternRhymeLabels,
  sortPatternFamiliesByPinyin,
  splitRequirements,
} from './model.js';

export interface AppClient {
  listPatterns(): Promise<ReadonlyArray<CiPattern>>;
  listCilinRhymeGroups(): Promise<ReadonlyArray<RhymeGroupSummary>>;
  getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail>;
  getCharacterPronunciations(character: string): Promise<CharacterPronunciationResponse>;
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

export function App({ client: providedClient }: AppProps = {}) {
  const defaultClient = useMemo(() => new LocalCatalogClient(), []);
  const client = providedClient ?? defaultClient;
  const [view, setView] = useState<ApplicationView>('create');
  const [patterns, setPatterns] = useState<ReadonlyArray<CiPattern>>([]);
  const [rhymeGroups, setRhymeGroups] = useState<ReadonlyArray<RhymeGroupSummary>>([]);
  const [creationPatternId, setCreationPatternId] = useState('');
  const [catalogPatternId, setCatalogPatternId] = useState('');
  const [patternQuery, setPatternQuery] = useState('');
  const [theme, setTheme] = useState('');
  const [requirements, setRequirements] = useState('');
  const [rounds, setRounds] = useState(8);
  const [rhymeAssignments, setRhymeAssignments] = useState<Record<string, string>>({});
  const [directLlmConfig, setDirectLlmConfig] = useState(loadDirectLlmConfig);
  const [llmConfigOpen, setLlmConfigOpen] = useState(false);
  const [ideaSuggestions, setIdeaSuggestions] = useState<IdeaSuggestionsState>({
    status: 'idle',
    suggestions: [],
  });
  const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>(idleStatus);
  const [resultVersions, setResultVersions] = useState<ReadonlyArray<GenerationResult>>([]);
  const [activeHistoryRecordId, setActiveHistoryRecordId] = useState<string>();
  const [catalogStatus, setCatalogStatus] = useState('正在载入本地词谱…');
  const [dictionaryCharacter, setDictionaryCharacter] = useState<string>();
  const [generationHistory, setGenerationHistory] =
    useState<ReadonlyArray<GenerationHistoryEntry>>(loadGenerationHistory);
  const ideaRequestSequence = useRef(0);
  const creationLocked = isSubmissionInProgress(submissionStatus);
  const creationServiceAvailable = isDirectLlmConfigReady(directLlmConfig);

  useEffect(() => {
    saveDirectLlmConfig(directLlmConfig);
  }, [directLlmConfig]);

  useEffect(() => {
    let active = true;

    const loadInitialData = async (): Promise<void> => {
      try {
        const [loadedPatterns, loadedGroups] = await Promise.all([
          client.listPatterns(),
          client.listCilinRhymeGroups(),
        ]);
        if (!active) return;
        const tuneCount = new Set(loadedPatterns.map(({ name }) => name)).size;
        const initialPatternId =
          sortPatternFamiliesByPinyin(groupPatternsByName(loadedPatterns))[0]?.patterns[0]?.id ??
          '';
        setPatterns(loadedPatterns);
        setRhymeGroups(loadedGroups);
        setCreationPatternId(initialPatternId);
        setCatalogPatternId(initialPatternId);
        setCatalogStatus(`已载入 ${tuneCount} 个词牌、${loadedPatterns.length} 种体式`);
      } catch (error) {
        if (active) setCatalogStatus(toUserMessage(error));
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

  const creationPattern = patterns.find(({ id }) => id === creationPatternId);
  const catalogPattern = patterns.find(({ id }) => id === catalogPatternId);
  const patternFamilies = useMemo(
    () => sortPatternFamiliesByPinyin(groupPatternsByName(patterns)),
    [patterns],
  );
  const creationPatternFamily = patternFamilies.find(({ name }) => name === creationPattern?.name);
  const catalogPatternFamily = patternFamilies.find(({ name }) => name === catalogPattern?.name);

  const selectCreationPattern = (patternId: string): void => {
    if (creationLocked) return;
    setCreationPatternId(patternId);
    setRhymeAssignments({});
    setSubmissionStatus(idleStatus);
    setResultVersions([]);
    setActiveHistoryRecordId(undefined);
  };

  const useCatalogPatternForCreation = (): void => {
    if (catalogPattern === undefined) return;
    if (!creationLocked) selectCreationPattern(catalogPattern.id);
    setView('create');
  };

  const inspectCharacter = (character: string): void => {
    setDictionaryCharacter(character);
    setView('dictionary');
  };

  function requestIdeaSuggestions(preserveCurrent = false): void {
    const requestSequence = ++ideaRequestSequence.current;
    if (!isDirectLlmConfigReady(directLlmConfig)) {
      setIdeaSuggestions({
        status: 'ready',
        suggestions: randomLocalCreationIdeas(),
      });
      return;
    }

    setIdeaSuggestions((current) => ({
      status: 'loading',
      suggestions: preserveCurrent ? current.suggestions : [],
    }));
    void runDirectIdeaSuggestions(directLlmConfig)
      .then((suggestions) => {
        if (requestSequence !== ideaRequestSequence.current) return;
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
    if (
      creationLocked ||
      !creationServiceAvailable ||
      creationPattern === undefined ||
      theme.trim() === ''
    ) {
      return;
    }

    let generationProgress: ReadonlyArray<SubmissionProgressEntry> = [
      {
        stage: 'preparing',
        message: '已锁定创作设置，正在准备生成',
      },
    ];
    setSubmissionStatus({
      kind: 'loading',
      message: '正在准备页面直连生成流程。',
      progress: generationProgress,
    });
    const labels = patternRhymeLabels(creationPattern);
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
    const generationRequest = {
      patternId: creationPattern.id,
      theme: theme.trim(),
      maxRounds: rounds,
      ...(preferredRhymeGroup === undefined ? {} : { preferredRhymeGroup }),
      ...(additionalRequirements.length === 0
        ? {}
        : { additionalRequirements: [...additionalRequirements] }),
    };

    const completeGeneration = (result: GenerationResult, recordId: string): void => {
      setSubmissionStatus({
        kind: 'completed',
        message: result.report.passed
          ? `《${creationPattern.name}》已通过格律校验。`
          : `《${creationPattern.name}》已达到优化轮次上限。`,
        result,
        progress: generationProgress,
      });
      setResultVersions([result]);
      setActiveHistoryRecordId(recordId);
      const historyEntry: GenerationHistoryEntry = {
        id: recordId,
        createdAt: new Date().toISOString(),
        theme: theme.trim(),
        settings: historySettings,
        pattern: creationPattern,
        result,
        versions: [result],
      };
      setGenerationHistory((current) => {
        const next = addGenerationHistoryEntry(current, historyEntry);
        saveGenerationHistory(next);
        return next;
      });
    };

    try {
      const recordId = globalThis.crypto.randomUUID();
      const result = await runDirectGeneration(
        directLlmConfig,
        generationRequest,
        creationPattern,
        {
          onProgress(progress) {
            generationProgress = [
              ...generationProgress,
              directProgressToSubmissionProgress(progress),
            ];
            setSubmissionStatus({
              kind: progress.phase,
              message: progress.message,
              progress: generationProgress,
            });
          },
        },
      );
      completeGeneration(result, recordId);
    } catch (error) {
      const message = toUserMessage(error);
      generationProgress = [
        ...generationProgress,
        {
          stage: 'error',
          message,
        },
      ];
      setSubmissionStatus({
        kind: 'error',
        message,
        progress: generationProgress,
      });
    }
  };

  const runRefinementSession = async (
    request: GenerationRequest,
    sourceResult: GenerationResult,
    pattern: CiPattern,
    onStatus?: (status: SubmissionStatus) => void,
  ): Promise<{
    readonly result: GenerationResult;
    readonly recordId: string;
  }> => {
    if (!isDirectLlmConfigReady(directLlmConfig)) {
      throw new Error('请先完成 LLM 配置');
    }
    const recordId = globalThis.crypto.randomUUID();
    let generationProgress: ReadonlyArray<SubmissionProgressEntry> = [
      {
        stage: 'preparing',
        message: '已接收修改意见，正在准备新版本',
      },
    ];
    onStatus?.({
      kind: 'loading',
      message: generationProgress[0]!.message,
      result: sourceResult,
      progress: generationProgress,
    });
    let result: GenerationResult;
    try {
      result = await runDirectGeneration(directLlmConfig, request, pattern, {
        onProgress(progress) {
          generationProgress = [
            ...generationProgress,
            directProgressToSubmissionProgress(progress),
          ];
          onStatus?.({
            kind: progress.phase,
            message: progress.message,
            result: sourceResult,
            progress: generationProgress,
          });
        },
      });
    } catch (error) {
      const message = toUserMessage(error);
      generationProgress = [
        ...generationProgress,
        {
          stage: 'error',
          message,
        },
      ];
      onStatus?.({
        kind: 'error',
        message,
        result: sourceResult,
        progress: generationProgress,
      });
      throw error;
    }
    onStatus?.({
      kind: 'completed',
      message: result.report.passed
        ? '新版本已按意见修改并通过格律校验。'
        : '新版本已生成，但仍有格律问题。',
      result,
      progress: generationProgress,
    });
    return { result, recordId };
  };

  const refineCurrentResult = async (
    selections: ReadonlyArray<TextSelection>,
    onProgress?: (status: SubmissionStatus) => void,
  ): Promise<void> => {
    const sourceResult = submissionStatus.result;
    if (creationPattern === undefined || sourceResult === undefined) {
      throw new Error('当前没有可修改的词稿');
    }

    const labels = patternRhymeLabels(creationPattern);
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
      const updateRefinementProgress = (status: SubmissionStatus): void => {
        const targetedStatus: SubmissionStatus = {
          ...status,
          progressTarget: 'refinement',
        };
        setSubmissionStatus(targetedStatus);
        onProgress?.(targetedStatus);
      };
      const { result, recordId } = await runRefinementSession(
        createRefinementRequest({
          sourceResult,
          pattern: creationPattern,
          selections,
          maxRounds: rounds,
          preferredRhymeGroup,
          additionalRequirements,
        }),
        sourceResult,
        creationPattern,
        updateRefinementProgress,
      );
      setResultVersions((current) => [
        ...current.filter(({ draft }) => draft.id !== result.draft.id),
        result,
      ]);
      const historyRecordId = activeHistoryRecordId ?? recordId;
      if (activeHistoryRecordId === undefined) setActiveHistoryRecordId(historyRecordId);
      setGenerationHistory((current) => {
        const next =
          activeHistoryRecordId === undefined
            ? addGenerationHistoryEntry(current, {
                id: historyRecordId,
                createdAt: new Date().toISOString(),
                theme: sourceResult.draft.theme,
                settings: historySettings,
                pattern: creationPattern,
                result,
                versions: [sourceResult, result],
              })
            : addGenerationHistoryVersion(current, historyRecordId, result);
        saveGenerationHistory(next);
        return next;
      });
    } catch (error) {
      throw error;
    }
  };

  const refineHistoryResult = async (
    entry: GenerationHistoryEntry,
    sourceResult: GenerationResult,
    selections: ReadonlyArray<TextSelection>,
    onProgress?: (status: SubmissionStatus) => void,
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
      entry.pattern,
      onProgress,
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
  const generationConnectionLabel = creationServiceAvailable ? 'LLM 已配置' : 'LLM 未配置';

  return (
    <div className="app-shell">
      {mobilePlatform ? (
        <MobileAppChrome
          activeView={view}
          serviceReady={creationServiceAvailable}
          serviceLabel={generationConnectionLabel}
          onSelectView={selectMobileView}
          onOpenConfig={() => setLlmConfigOpen(true)}
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

          <button
            className="connection-status"
            type="button"
            title={generationConnectionLabel}
            aria-label={`生成配置：${generationConnectionLabel}`}
            onClick={() => setLlmConfigOpen(true)}
          >
            <span data-ready={creationServiceAvailable} />
            {generationConnectionLabel}
          </button>
        </header>
      )}

      {view === 'dictionary' ? (
        <DictionaryWorkspace
          client={client}
          rhymeGroups={rhymeGroups}
          {...(dictionaryCharacter === undefined ? {} : { initialCharacter: dictionaryCharacter })}
          onInitialCharacterHandled={() => setDictionaryCharacter(undefined)}
        />
      ) : patterns.length === 0 || creationPattern === undefined || catalogPattern === undefined ? (
        <LoadingState message={catalogStatus} />
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
              selectedPattern={catalogPattern}
              onQueryChange={setPatternQuery}
              onSelect={setCatalogPatternId}
              onInspectCharacter={inspectCharacter}
              onCreate={useCatalogPatternForCreation}
            />
          ) : (
            <div className="workspace-grid pattern-catalog-layout">
              <PatternBrowser
                patterns={patterns}
                query={patternQuery}
                selectedPatternId={catalogPattern.id}
                onQueryChange={setPatternQuery}
                onSelect={setCatalogPatternId}
              />
              <section className="pattern-detail-panel" aria-label="词牌格律详情">
                {catalogPatternFamily !== undefined && catalogPatternFamily.patterns.length > 1 && (
                  <label className="pattern-detail-variant">
                    <span>选择体式</span>
                    <select
                      aria-label={`${catalogPatternFamily.name}体式`}
                      value={catalogPattern.id}
                      onChange={(event) => setCatalogPatternId(event.target.value)}
                    >
                      {catalogPatternFamily.patterns.map((pattern) => (
                        <option key={pattern.id} value={pattern.id}>
                          {formatPatternVariantSummary(pattern)}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <PatternPreview
                  pattern={catalogPattern}
                  onInspectCharacter={inspectCharacter}
                  onCreate={useCatalogPatternForCreation}
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

          <form
            className="creation-form"
            aria-busy={creationLocked}
            onSubmit={(event) => void submit(event)}
          >
            <div className="creation-workspace-grid" aria-label="创作工作区">
              <section className="creation-controls-panel" aria-label="创作设置">
                <section
                  className="creation-pattern-panel"
                  aria-labelledby="pattern-settings-title"
                >
                  <div className="creation-section-title">
                    <span className="creation-step">01</span>
                    <h2 className="creation-panel-title" id="pattern-settings-title">
                      词牌设置
                    </h2>
                  </div>
                  <div className="selected-pattern-bar">
                    <div className="selected-pattern-controls">
                      <label>
                        <span>选择词牌</span>
                        <select
                          aria-label="创作词牌"
                          value={creationPattern.name}
                          disabled={creationLocked}
                          onChange={(event) => {
                            const family = patternFamilies.find(
                              ({ name }) => name === event.target.value,
                            );
                            const standard =
                              family?.patterns.find(({ variant }) => variant === '正体') ??
                              family?.patterns[0];
                            if (standard !== undefined) selectCreationPattern(standard.id);
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
                          value={creationPattern.id}
                          disabled={creationLocked}
                          onChange={(event) => selectCreationPattern(event.target.value)}
                        >
                          {creationPatternFamily?.patterns.map((pattern) => (
                            <option key={pattern.id} value={pattern.id}>
                              {formatPatternVariantSummary(pattern)}
                            </option>
                          ))}
                        </select>
                      </label>
                    </div>
                  </div>
                  <RhymeSettings
                    pattern={creationPattern}
                    rhymeGroups={rhymeGroups}
                    rhymeAssignments={rhymeAssignments}
                    disabled={creationLocked}
                    onChange={(label, groupId) =>
                      setRhymeAssignments((current) => {
                        const next = { ...current };
                        if (groupId === '') delete next[label];
                        else next[label] = groupId;
                        return next;
                      })
                    }
                  />
                </section>

                <section className="theme-editor" aria-labelledby="theme-title">
                  <div className="theme-heading">
                    <div className="creation-section-title">
                      <span className="creation-step">02</span>
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
                      disabled={creationLocked}
                      onChange={(event) => setTheme(event.target.value)}
                      placeholder="暮春江上归舟，忽忆多年未见的故友。希望词意含蓄，以江风、残照和远帆寄托惆怅。"
                      rows={3}
                      maxLength={2_000}
                      required
                    />
                  </label>
                  <div className="theme-ideas" aria-label="大模型灵感推荐" aria-live="polite">
                    <div className="theme-ideas-header">
                      <span>灵感推荐</span>
                      <button
                        type="button"
                        disabled={creationLocked || ideaSuggestions.status === 'loading'}
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
                        <button
                          key={prompt}
                          type="button"
                          disabled={creationLocked}
                          onClick={() => setTheme(prompt)}
                        >
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
                  rounds={rounds}
                  requirements={requirements}
                  status={submissionStatus}
                  canSubmit={theme.trim() !== '' && creationServiceAvailable}
                  onRoundsChange={setRounds}
                  onRequirementsChange={setRequirements}
                />
              </section>

              <section className="creation-preview-panel" aria-label="当前词牌预览">
                <PatternPreview
                  pattern={creationPattern}
                  onInspectCharacter={inspectCharacter}
                  titleLevel={2}
                />
                {submissionStatus.result !== undefined && (
                  <GenerationResultPanel
                    result={submissionStatus.result}
                    pattern={creationPattern}
                    onInspectCharacter={inspectCharacter}
                    onRefine={refineCurrentResult}
                    versions={resultVersions}
                    onSelectVersion={selectResultVersion}
                  />
                )}
              </section>
            </div>
          </form>
        </main>
      )}

      <LlmConfigDialog
        open={llmConfigOpen}
        config={directLlmConfig}
        disabled={creationLocked}
        directReady={isDirectLlmConfigReady(directLlmConfig)}
        onChange={setDirectLlmConfig}
        onClose={() => setLlmConfigOpen(false)}
      />
    </div>
  );
}

interface CreateRefinementRequestInput {
  readonly sourceResult: GenerationResult;
  readonly pattern: CiPattern;
  readonly selections: ReadonlyArray<TextSelection>;
  readonly maxRounds: number;
  readonly preferredRhymeGroup: GenerationRequest['preferredRhymeGroup'];
  readonly additionalRequirements: ReadonlyArray<string>;
}

function createRefinementRequest({
  sourceResult,
  pattern,
  selections,
  maxRounds,
  preferredRhymeGroup,
  additionalRequirements,
}: CreateRefinementRequestInput): GenerationRequest {
  return {
    patternId: pattern.id,
    theme: sourceResult.draft.theme,
    sourceDraft: {
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

function directProgressToSubmissionProgress(
  progress: DirectGenerationProgress,
): SubmissionProgressEntry {
  return {
    stage: progress.stage,
    message: progress.message,
    ...(progress.round === undefined ? {} : { round: progress.round }),
    ...(progress.maxRounds === undefined ? {} : { maxRounds: progress.maxRounds }),
    ...(progress.issueCount === undefined ? {} : { issueCount: progress.issueCount }),
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
