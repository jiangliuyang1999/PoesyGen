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
import { AutoResizeTextarea } from './AutoResizeTextarea.js';
import { DictionaryWorkspace } from './DictionaryWorkspace.js';
import { GenerationHistoryWorkspace } from './GenerationHistoryWorkspace.js';
import { GenerationResultPanel } from './GenerationResultPanel.js';
import {
  GenerationActions,
  GenerationSettings,
  isSubmissionInProgress,
  RhymeSettings,
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
import { runDirectIdeaSuggestions, runDirectThemePolish } from './direct-generation.js';
import { toUserMessage } from './errors.js';
import {
  addGenerationHistoryEntry,
  addGenerationHistoryVersion,
  loadGenerationHistory,
  removeGenerationHistoryEntry,
  saveGenerationHistory,
  type GenerationHistoryEntry,
} from './generation-history.js';
import {
  createGenerationPreferences,
  createInitialGenerationRequest,
  createRefinementRequest,
  historyRefinementPreferences,
} from './generation-request.js';
import { runGenerationSession, type GenerationSessionResult } from './generation-session.js';
import { LocalCatalogClient } from './local-catalog.js';
import { randomLocalCreationIdeas } from './local-ideas.js';
import { formatPatternVariantSummary, listPatternFamilies, patternRhymeLabels } from './model.js';
import { useCompactLayout } from './responsive-layout.js';
import { logConfigSummary, logWebError, logWebEvent } from './web-logger.js';

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
type ThemePolishStatus = 'idle' | 'loading' | 'error';

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
  const compactLayout = useCompactLayout();
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
  const [themePolishStatus, setThemePolishStatus] = useState<ThemePolishStatus>('idle');
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
  const themePolishing = themePolishStatus === 'loading';
  const themeEditingLocked = creationLocked || themePolishing;
  const themePolishLabel = themePolishing
    ? '正在润色主题描述'
    : themePolishStatus === 'error'
      ? '主题润色失败，点击重试'
      : !creationServiceAvailable
        ? '请先配置 LLM 再润色主题'
        : theme.trim() === ''
          ? '输入主题后润色'
          : '润色主题描述';
  const changeView = (nextView: ApplicationView, source: string): void => {
    logWebEvent('navigation', '切换页面', {
      from: view,
      to: nextView,
      source,
    });
    setView(nextView);
    scrollToPageTop();
  };
  const updateGenerationHistory = (
    update: (
      entries: ReadonlyArray<GenerationHistoryEntry>,
    ) => ReadonlyArray<GenerationHistoryEntry>,
  ): void => {
    setGenerationHistory((current) => {
      const next = update(current);
      const saved = saveGenerationHistory(next);
      logWebEvent('history', '应用状态中的生成记录已更新', {
        previousCount: current.length,
        totalCount: next.length,
        saved,
      });
      return next;
    });
  };

  useEffect(() => {
    logWebEvent('app', 'React 应用已挂载', {
      providedClient: providedClient !== undefined,
      initialView: view,
      historyCount: generationHistory.length,
      config: logConfigSummary(directLlmConfig),
    });
    return () => {
      logWebEvent('app', 'React 应用已卸载');
    };
  }, []);

  useEffect(() => {
    saveDirectLlmConfig(directLlmConfig);
  }, [directLlmConfig]);

  useEffect(() => {
    let active = true;

    const loadInitialData = async (): Promise<void> => {
      const startedAt = performance.now();
      logWebEvent('app', '开始初始化本地目录');
      try {
        const [loadedPatterns, loadedGroups] = await Promise.all([
          client.listPatterns(),
          client.listCilinRhymeGroups(),
        ]);
        if (!active) return;
        const tuneCount = new Set(loadedPatterns.map(({ name }) => name)).size;
        const initialPatternId = listPatternFamilies(loadedPatterns)[0]?.patterns[0]?.id ?? '';
        setPatterns(loadedPatterns);
        setRhymeGroups(loadedGroups);
        setCreationPatternId(initialPatternId);
        setCatalogPatternId(initialPatternId);
        setCatalogStatus(`已载入 ${tuneCount} 个词牌、${loadedPatterns.length} 种体式`);
        logWebEvent('app', '本地目录初始化完成', {
          durationMs: Math.round(performance.now() - startedAt),
          tuneCount,
          patternCount: loadedPatterns.length,
          rhymeGroupCount: loadedGroups.length,
          initialPatternId,
        });
      } catch (error) {
        logWebError('app', '本地目录初始化失败', error, {
          durationMs: Math.round(performance.now() - startedAt),
        });
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
  const patternFamilies = useMemo(() => listPatternFamilies(patterns), [patterns]);
  const creationPatternFamily = patternFamilies.find(({ name }) => name === creationPattern?.name);
  const catalogPatternFamily = patternFamilies.find(({ name }) => name === catalogPattern?.name);

  const selectCreationPattern = (patternId: string): void => {
    if (creationLocked) {
      logWebEvent('creation', '生成期间忽略词牌切换', { requestedPatternId: patternId });
      return;
    }
    const selected = patterns.find(({ id }) => id === patternId);
    logWebEvent('creation', '切换创作词牌体式', {
      previousPatternId: creationPatternId,
      patternId,
      patternName: selected?.name,
      variant: selected?.variant,
    });
    setCreationPatternId(patternId);
    setRhymeAssignments({});
    setSubmissionStatus(idleStatus);
    setResultVersions([]);
    setActiveHistoryRecordId(undefined);
  };

  const useCatalogPatternForCreation = (): void => {
    if (catalogPattern === undefined) return;
    logWebEvent('catalog', '从词谱页使用当前体式创作', {
      patternId: catalogPattern.id,
      patternName: catalogPattern.name,
      variant: catalogPattern.variant,
      creationLocked,
    });
    if (!creationLocked) selectCreationPattern(catalogPattern.id);
    changeView('create', 'catalog-pattern-create');
  };

  const inspectCharacter = (character: string): void => {
    logWebEvent('dictionary', '从内容进入单字查询', { character, sourceView: view });
    setDictionaryCharacter(character);
    changeView('dictionary', 'inspect-character');
  };

  function requestIdeaSuggestions(preserveCurrent = false): void {
    const requestSequence = ++ideaRequestSequence.current;
    if (!isDirectLlmConfigReady(directLlmConfig)) {
      const suggestions = randomLocalCreationIdeas();
      logWebEvent('ideas', 'LLM 未配置，使用本地灵感推荐', {
        requestSequence,
        suggestions,
      });
      setIdeaSuggestions({
        status: 'ready',
        suggestions,
      });
      return;
    }

    logWebEvent('ideas', '提交远程灵感推荐请求', {
      requestSequence,
      preserveCurrent,
      config: logConfigSummary(directLlmConfig),
    });
    setIdeaSuggestions((current) => ({
      status: 'loading',
      suggestions: preserveCurrent ? current.suggestions : [],
    }));
    void runDirectIdeaSuggestions(directLlmConfig)
      .then((suggestions) => {
        if (requestSequence !== ideaRequestSequence.current) {
          logWebEvent('ideas', '忽略已过期的灵感推荐响应', {
            requestSequence,
            currentSequence: ideaRequestSequence.current,
          });
          return;
        }
        logWebEvent('ideas', '灵感推荐已更新到页面', {
          requestSequence,
          suggestions,
        });
        setIdeaSuggestions({ status: 'ready', suggestions });
      })
      .catch((error: unknown) => {
        if (requestSequence !== ideaRequestSequence.current) {
          logWebEvent('ideas', '忽略已过期的灵感推荐错误', {
            requestSequence,
            currentSequence: ideaRequestSequence.current,
          });
          return;
        }
        logWebError('ideas', '灵感推荐更新失败', error, {
          requestSequence,
          preserveCurrent,
        });
        setIdeaSuggestions((current) => ({
          status: 'error',
          suggestions: preserveCurrent ? current.suggestions : [],
        }));
      });
  }

  const updateTheme = (nextTheme: string): void => {
    setTheme(nextTheme);
    setThemePolishStatus('idle');
  };

  const polishTheme = async (): Promise<void> => {
    const sourceTheme = theme.trim();
    if (sourceTheme === '' || themeEditingLocked || !isDirectLlmConfigReady(directLlmConfig)) {
      logWebEvent('theme', '忽略主题润色请求', {
        emptyTheme: sourceTheme === '',
        themeEditingLocked,
        configReady: isDirectLlmConfigReady(directLlmConfig),
      });
      return;
    }

    logWebEvent('theme', '提交主题润色', { sourceTheme });
    setThemePolishStatus('loading');
    try {
      const polishedTheme = await runDirectThemePolish(directLlmConfig, sourceTheme);
      setTheme(polishedTheme);
      setThemePolishStatus('idle');
      logWebEvent('theme', '主题润色已应用', { sourceTheme, polishedTheme });
    } catch (error) {
      logWebError('theme', '主题润色未能应用', error, { sourceTheme });
      setThemePolishStatus('error');
    }
  };

  const submit = async (event: { preventDefault(): void }): Promise<void> => {
    event.preventDefault();
    if (
      creationLocked ||
      themePolishing ||
      !creationServiceAvailable ||
      creationPattern === undefined ||
      theme.trim() === ''
    ) {
      logWebEvent('creation', '忽略生成提交', {
        creationLocked,
        themePolishing,
        creationServiceAvailable,
        patternReady: creationPattern !== undefined,
        themeReady: theme.trim() !== '',
      });
      return;
    }

    const preferences = createGenerationPreferences({
      pattern: creationPattern,
      rhymeAssignments,
      rhymeGroups,
      maxRounds: rounds,
      requirements,
    });
    const generationRequest = createInitialGenerationRequest({
      pattern: creationPattern,
      theme,
      maxRounds: rounds,
      preferences,
    });
    logWebEvent('creation', '已组装首次生成请求', {
      patternId: creationPattern.id,
      patternName: creationPattern.name,
      variant: creationPattern.variant,
      generationRequest,
      preferences,
    });

    const completeGeneration = (
      { result, progress }: GenerationSessionResult,
      recordId: string,
    ): void => {
      logWebEvent('creation', '首次生成结果已应用', {
        recordId,
        draftId: result.draft.id,
        resultVersion: result.draft.version,
        rounds: result.rounds,
        passed: result.report.passed,
        issues: result.report.issues,
        progress,
      });
      setSubmissionStatus({
        kind: 'completed',
        message:
          result.status === 'completed'
            ? `《${creationPattern.name}》已通过格律与文学质量校验。`
            : result.report.passed
              ? `《${creationPattern.name}》格律已通过，达到优化轮次上限后保留最佳版本。`
              : `《${creationPattern.name}》已达到优化轮次上限，保留格律问题最少的版本。`,
        result,
        progress,
      });
      setResultVersions([result]);
      setActiveHistoryRecordId(recordId);
      const historyEntry: GenerationHistoryEntry = {
        id: recordId,
        createdAt: new Date().toISOString(),
        theme: theme.trim(),
        settings: preferences.historySettings,
        pattern: creationPattern,
        result,
        versions: [result],
      };
      updateGenerationHistory((current) => addGenerationHistoryEntry(current, historyEntry));
    };

    try {
      const recordId = globalThis.crypto.randomUUID();
      logWebEvent('creation', '首次生成会话已创建', {
        recordId,
        patternId: creationPattern.id,
      });
      const session = await runGenerationSession({
        config: directLlmConfig,
        request: generationRequest,
        pattern: creationPattern,
        initialProgress: {
          stepId: 'prepare',
          stage: 'preparing',
          activity: 'completed',
          message: '已锁定创作设置，正在准备生成',
        },
        loadingMessage: '正在准备页面直连生成流程。',
        onStatus: setSubmissionStatus,
      });
      completeGeneration(session, recordId);
    } catch (error) {
      logWebError('creation', '首次生成流程结束于错误', error, {
        patternId: creationPattern.id,
      });
      return;
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
      logWebEvent('refinement', 'LLM 未配置，拒绝局部修改');
      throw new Error('请先完成 LLM 配置');
    }
    const recordId = globalThis.crypto.randomUUID();
    logWebEvent('refinement', '局部修改会话开始', {
      recordId,
      sourceDraftId: sourceResult.draft.id,
      sourceVersion: sourceResult.draft.version,
      patternId: pattern.id,
      request,
    });
    const { result, progress } = await runGenerationSession({
      config: directLlmConfig,
      request,
      pattern,
      initialProgress: {
        stepId: 'prepare-refinement',
        stage: 'preparing',
        activity: 'completed',
        message: '已接收修改意见，正在准备新版本',
      },
      loadingMessage: '已接收修改意见，正在准备新版本',
      retainedResult: sourceResult,
      onStatus: (status) => onStatus?.(status),
    });
    onStatus?.({
      kind: 'completed',
      message:
        result.status === 'completed'
          ? '新版本已按意见修改，并通过格律与文学质量校验。'
          : result.report.passed
            ? '新版本格律已通过，已保留当前文学质量最佳版本。'
            : '新版本已生成，但仍有格律问题。',
      result,
      progress,
    });
    logWebEvent('refinement', '局部修改会话完成', {
      recordId,
      sourceDraftId: sourceResult.draft.id,
      result,
      progress,
    });
    return { result, recordId };
  };

  const refineCurrentResult = async (
    selections: ReadonlyArray<TextSelection>,
    onProgress?: (status: SubmissionStatus) => void,
  ): Promise<void> => {
    const sourceResult = submissionStatus.result;
    if (creationPattern === undefined || sourceResult === undefined) {
      logWebEvent('refinement', '当前创作结果不可修改', {
        patternReady: creationPattern !== undefined,
        resultReady: sourceResult !== undefined,
      });
      throw new Error('当前没有可修改的词稿');
    }
    logWebEvent('refinement', '从创作页提交局部修改', {
      activeHistoryRecordId,
      sourceDraftId: sourceResult.draft.id,
      selections,
    });

    const preferences = createGenerationPreferences({
      pattern: creationPattern,
      rhymeAssignments,
      rhymeGroups,
      maxRounds: rounds,
      requirements,
    });

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
        preferredRhymeGroup: preferences.preferredRhymeGroup,
        additionalRequirements: preferences.additionalRequirements,
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
    updateGenerationHistory((current) =>
      activeHistoryRecordId === undefined
        ? addGenerationHistoryEntry(current, {
            id: historyRecordId,
            createdAt: new Date().toISOString(),
            theme: sourceResult.draft.theme,
            settings: preferences.historySettings,
            pattern: creationPattern,
            result,
            versions: [sourceResult, result],
          })
        : addGenerationHistoryVersion(current, historyRecordId, result),
    );
    logWebEvent('refinement', '创作页局部修改结果已归档', {
      historyRecordId,
      createdHistoryRecord: activeHistoryRecordId === undefined,
      draftId: result.draft.id,
      resultVersion: result.draft.version,
    });
  };

  const refineHistoryResult = async (
    entry: GenerationHistoryEntry,
    sourceResult: GenerationResult,
    selections: ReadonlyArray<TextSelection>,
    onProgress?: (status: SubmissionStatus) => void,
  ): Promise<GenerationResult> => {
    logWebEvent('refinement', '从历史详情提交局部修改', {
      recordId: entry.id,
      sourceDraftId: sourceResult.draft.id,
      selections,
    });
    const preferences = historyRefinementPreferences(entry, sourceResult);
    const { result } = await runRefinementSession(
      createRefinementRequest({
        sourceResult,
        pattern: entry.pattern,
        selections,
        maxRounds: preferences.maxRounds,
        preferredRhymeGroup: preferences.preferredRhymeGroup,
        additionalRequirements: preferences.additionalRequirements,
      }),
      sourceResult,
      entry.pattern,
      onProgress,
    );
    updateGenerationHistory((current) => addGenerationHistoryVersion(current, entry.id, result));
    logWebEvent('refinement', '历史详情局部修改结果已归档', {
      recordId: entry.id,
      draftId: result.draft.id,
      resultVersion: result.draft.version,
    });
    return result;
  };

  const deleteHistoryEntry = (entryId: string): void => {
    logWebEvent('history', '应用请求删除生成记录', { entryId });
    updateGenerationHistory((current) => removeGenerationHistoryEntry(current, entryId));
    if (activeHistoryRecordId === entryId) {
      setActiveHistoryRecordId(undefined);
    }
  };

  const selectResultVersion = (result: GenerationResult): void => {
    logWebEvent('result', '切换作品版本', {
      draftId: result.draft.id,
      resultVersion: result.draft.version,
      patternId: result.draft.patternId,
    });
    setSubmissionStatus((current) => ({
      ...current,
      kind: 'completed',
      message: `正在查看作品版本 ${result.draft.version}。`,
      result,
    }));
  };

  const selectCompactView = (nextView: ApplicationView): void => {
    changeView(nextView, 'compact-tabbar');
  };
  const generationConnectionLabel = creationServiceAvailable ? 'LLM 已配置' : 'LLM 未配置';

  return (
    <div className="app-shell">
      {compactLayout ? (
        <MobileAppChrome
          activeView={view}
          serviceReady={creationServiceAvailable}
          serviceLabel={generationConnectionLabel}
          onSelectView={selectCompactView}
          onOpenConfig={() => {
            logWebEvent('config', '打开 LLM 配置弹窗', { source: 'compact-header' });
            setLlmConfigOpen(true);
          }}
        />
      ) : (
        <header className="topbar">
          <button className="brand" type="button" onClick={() => changeView('create', 'brand')}>
            <span className="brand-seal">词</span>
            <span>
              <strong>PoesyGen</strong>
              <small>格律诗词作</small>
            </span>
          </button>

          <nav aria-label="主导航">
            <button
              type="button"
              data-active={view === 'create'}
              onClick={() => changeView('create', 'desktop-navigation')}
            >
              创作
            </button>
            <button
              type="button"
              data-active={view === 'history'}
              onClick={() => changeView('history', 'desktop-navigation')}
            >
              历史记录
            </button>
            <button
              type="button"
              data-active={view === 'patterns'}
              onClick={() => changeView('patterns', 'desktop-navigation')}
            >
              词谱
            </button>
            <button
              type="button"
              data-active={view === 'dictionary'}
              onClick={() => changeView('dictionary', 'desktop-navigation')}
            >
              字典
            </button>
          </nav>

          <button
            className="connection-status"
            type="button"
            title={generationConnectionLabel}
            aria-label={`生成配置：${generationConnectionLabel}`}
            onClick={() => {
              logWebEvent('config', '打开 LLM 配置弹窗', { source: 'desktop-header' });
              setLlmConfigOpen(true);
            }}
          >
            <span data-ready={creationServiceAvailable} />
            {generationConnectionLabel}
          </button>
        </header>
      )}

      <DictionaryWorkspace
        client={client}
        rhymeGroups={rhymeGroups}
        {...(dictionaryCharacter === undefined ? {} : { initialCharacter: dictionaryCharacter })}
        hidden={view !== 'dictionary'}
        onInitialCharacterHandled={() => setDictionaryCharacter(undefined)}
      />

      {patterns.length === 0 || creationPattern === undefined || catalogPattern === undefined ? (
        view === 'dictionary' ? null : (
          <LoadingState message={catalogStatus} />
        )
      ) : (
        <>
          <main className="page-workspace" key="patterns" hidden={view !== 'patterns'}>
            <header className="workspace-header">
              <div>
                <p className="section-kicker">词谱</p>
                <h1>格律词谱</h1>
                <p>浏览词牌与体式，查看逐句字数、平仄和韵位。</p>
              </div>
            </header>
            {compactLayout ? (
              <MobilePatternWorkspace
                patterns={patterns}
                query={patternQuery}
                selectedPattern={catalogPattern}
                onQueryChange={setPatternQuery}
                onSelect={(patternId) => {
                  logWebEvent('catalog', '窄屏词谱选择体式', { patternId });
                  setCatalogPatternId(patternId);
                }}
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
                  onSelect={(patternId) => {
                    logWebEvent('catalog', '宽屏词谱选择词牌', { patternId });
                    setCatalogPatternId(patternId);
                  }}
                />
                <section className="pattern-detail-panel" aria-label="词牌格律详情">
                  {catalogPatternFamily !== undefined &&
                    catalogPatternFamily.patterns.length > 1 && (
                      <label className="pattern-detail-variant">
                        <span>选择体式</span>
                        <select
                          aria-label={`${catalogPatternFamily.name}体式`}
                          value={catalogPattern.id}
                          onChange={(event) => {
                            logWebEvent('catalog', '宽屏词谱切换体式', {
                              patternId: event.target.value,
                            });
                            setCatalogPatternId(event.target.value);
                          }}
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
                    titleId="catalog-pattern-title"
                  />
                </section>
              </div>
            )}
          </main>

          <main className="page-workspace" key="history" hidden={view !== 'history'}>
            <header className="workspace-header">
              <div>
                <p className="section-kicker">历史</p>
                <h1>历史记录</h1>
                <p>查询本地保存的生成记录。</p>
              </div>
            </header>
            <GenerationHistoryWorkspace
              compactLayout={compactLayout}
              entries={generationHistory}
              onInspectCharacter={inspectCharacter}
              onRefine={refineHistoryResult}
              onDelete={deleteHistoryEntry}
            />
          </main>

          <main className="page-workspace" key="create" hidden={view !== 'create'}>
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
                      onChange={(label, groupId) => {
                        logWebEvent('creation', '更新韵部设置', {
                          patternId: creationPattern.id,
                          rhymeLabel: label,
                          groupId: groupId === '' ? undefined : groupId,
                        });
                        setRhymeAssignments((current) => {
                          const next = { ...current };
                          if (groupId === '') delete next[label];
                          else next[label] = groupId;
                          const labels = patternRhymeLabels(creationPattern);
                          for (let index = 1; index < labels.length; index += 1) {
                            const previousLabel = labels[index - 1]!;
                            const currentLabel = labels[index]!;
                            if (
                              next[currentLabel.id] !== undefined &&
                              next[currentLabel.id] === next[previousLabel.id]
                            ) {
                              delete next[currentLabel.id];
                            }
                          }
                          return next;
                        });
                      }}
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
                    <div className="theme-input-shell">
                      <label>
                        <span className="sr-only">作品主题</span>
                        <AutoResizeTextarea
                          value={theme}
                          disabled={themeEditingLocked}
                          onChange={(event) => updateTheme(event.target.value)}
                          placeholder="暮春江上归舟，忽忆多年未见的故友。希望词意含蓄，以江风、残照和远帆寄托惆怅。"
                          minRows={3}
                          maxRows={compactLayout ? 3 : 10}
                          maxLength={2_000}
                          required
                        />
                      </label>
                      <button
                        className="theme-polish-action"
                        type="button"
                        aria-label={themePolishLabel}
                        title={themePolishLabel}
                        data-state={themePolishStatus}
                        disabled={
                          themeEditingLocked || theme.trim() === '' || !creationServiceAvailable
                        }
                        onClick={() => void polishTheme()}
                      >
                        <svg aria-hidden="true" viewBox="0 0 24 24">
                          <path d="m14.5 4.5 1 2.5 2.5 1-2.5 1-1 2.5-1-2.5-2.5-1 2.5-1 1-2.5Z" />
                          <path d="m6.5 12.5.75 1.75L9 15l-1.75.75L6.5 17.5l-.75-1.75L4 15l1.75-.75.75-1.75Z" />
                          <path d="m11 15 6 6" />
                        </svg>
                      </button>
                    </div>
                    <div className="theme-ideas" aria-label="大模型灵感推荐" aria-live="polite">
                      <div className="theme-ideas-header">
                        <span>灵感推荐</span>
                        <button
                          type="button"
                          disabled={themeEditingLocked || ideaSuggestions.status === 'loading'}
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
                            disabled={themeEditingLocked}
                            onClick={() => {
                              logWebEvent('ideas', '用户采用灵感推荐', { prompt });
                              updateTheme(prompt);
                            }}
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
                    onRoundsChange={setRounds}
                    onRequirementsChange={setRequirements}
                  />
                  <GenerationActions
                    status={submissionStatus}
                    canSubmit={theme.trim() !== '' && creationServiceAvailable && !themePolishing}
                  />
                </section>

                <section className="creation-preview-panel" aria-label="当前词牌预览">
                  <PatternPreview
                    pattern={creationPattern}
                    onInspectCharacter={inspectCharacter}
                    titleId="creation-pattern-title"
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
                      titleId="creation-result-title"
                    />
                  )}
                </section>
              </div>
            </form>
          </main>
        </>
      )}

      <LlmConfigDialog
        open={llmConfigOpen}
        config={directLlmConfig}
        disabled={creationLocked}
        directReady={isDirectLlmConfigReady(directLlmConfig)}
        onChange={setDirectLlmConfig}
        onClose={() => {
          logWebEvent('config', '关闭 LLM 配置弹窗');
          setLlmConfigOpen(false);
        }}
      />
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

function scrollToPageTop(): void {
  document.documentElement.scrollTop = 0;
  document.body.scrollTop = 0;
}
