import { useEffect, useMemo, useState } from 'react';

import type { CiPattern, GenerationResult, TextSelection } from '@poesygen/client-sdk';

import { formatGenerationTitle } from './model.js';

interface GenerationResultPanelProps {
  readonly result: GenerationResult;
  readonly pattern: CiPattern;
  readonly onInspectCharacter: (character: string) => void;
  readonly onRefine?: (selections: ReadonlyArray<TextSelection>) => Promise<void>;
  readonly versions?: ReadonlyArray<GenerationResult>;
  readonly onSelectVersion?: (result: GenerationResult) => void;
}

type ResultView = 'poem' | 'prosody' | 'refinement';
type RefinementStatus = 'idle' | 'submitting' | 'error';

interface ActiveSelection extends Omit<TextSelection, 'instruction'> {
  readonly text: string;
  readonly lineIndex: number;
}

interface RefinementItem extends ActiveSelection {
  readonly instruction: string;
}

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function GenerationResultPanel({
  result,
  pattern,
  onInspectCharacter,
  onRefine,
  versions,
  onSelectVersion,
}: GenerationResultPanelProps) {
  const [view, setView] = useState<ResultView>('poem');
  const refinementMode = view === 'refinement';
  const [selection, setSelection] = useState<ActiveSelection>();
  const [instruction, setInstruction] = useState('');
  const [refinementItems, setRefinementItems] = useState<ReadonlyArray<RefinementItem>>([]);
  const [refinementStatus, setRefinementStatus] = useState<RefinementStatus>('idle');
  const [refinementError, setRefinementError] = useState('');
  const availableVersions = versions === undefined || versions.length === 0 ? [result] : versions;
  const activeVersionIndex = Math.max(
    availableVersions.findIndex(({ draft }) => draft.id === result.draft.id),
    0,
  );
  const patternLines = pattern.sections.flatMap((section) => section.lines);
  const sectionStartIndexes = useMemo(() => {
    let lineCount = 0;
    return pattern.sections.map((section) => {
      const startIndex = lineCount;
      lineCount += section.lines.length;
      return startIndex;
    });
  }, [pattern.sections]);
  const issuesByPosition = useMemo(() => {
    type Issue = (typeof result.report.issues)[number];
    const indexed = new Map<string, Map<number, Issue>>();
    for (const issue of result.report.issues) {
      if (issue.charIndex === undefined) continue;
      const lineIssues = indexed.get(issue.lineId) ?? new Map<number, Issue>();
      const current = lineIssues.get(issue.charIndex);
      if (current === undefined || issue.severity === 'error') {
        lineIssues.set(issue.charIndex, issue);
      }
      indexed.set(issue.lineId, lineIssues);
    }
    return indexed;
  }, [result.report.issues]);

  useEffect(() => {
    setView((current) => (current === 'refinement' ? 'poem' : current));
    setSelection(undefined);
    setInstruction('');
    setRefinementItems([]);
    setRefinementStatus('idle');
    setRefinementError('');
  }, [result.draft.id]);

  const selectResultView = (nextView: ResultView): void => {
    setView(nextView);
    setSelection(undefined);
    setInstruction('');
    setRefinementItems([]);
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const renderAnnotatedLine = (
    line: GenerationResult['draft']['lines'][number],
    lineIndex: number,
  ) => (
    <div className="annotated-line" key={line.id}>
      <span className="annotated-line-number">{lineIndex + 1}</span>
      <div>
        {Array.from(line.text).map((character, characterIndex) => {
          const position = patternLines[lineIndex]?.positions[characterIndex];
          const issue = issuesByPosition.get(line.id)?.get(characterIndex);
          const tone = position?.tone;
          const toneLabel = tone === undefined ? '?' : toneLabels[tone];
          const rhyme = position?.rhyme !== undefined;
          const positionLabel =
            tone === undefined ? '超出词谱句式' : `${toneLabel}声${rhyme ? '韵脚' : '位'}`;
          return (
            <button
              className="annotated-character"
              data-issue={issue?.severity}
              data-rhyme={rhyme}
              data-tone={tone ?? 'unknown'}
              key={`${line.id}-${characterIndex}`}
              type="button"
              onClick={() => onInspectCharacter(character)}
              aria-label={`第${lineIndex + 1}句第${characterIndex + 1}字“${character}”：${positionLabel}`}
              title={`${positionLabel}；点击查询“${character}”${issue === undefined ? '' : `；${issue.message}`}`}
            >
              <span className="annotated-tone">{toneLabel}</span>
              <span>{character}</span>
              {rhyme && <small>韵</small>}
            </button>
          );
        })}
      </div>
    </div>
  );

  const selectCharacter = (
    line: GenerationResult['draft']['lines'][number],
    lineIndex: number,
    characterIndex: number,
  ): void => {
    const characters = Array.from(line.text);
    setSelection((current) => {
      const continuingSingleSelection =
        current?.lineId === line.id && current.end - current.start === 1;
      const start = continuingSingleSelection
        ? Math.min(current.start, characterIndex)
        : characterIndex;
      const end = continuingSingleSelection
        ? Math.max(current.end, characterIndex + 1)
        : characterIndex + 1;
      return {
        lineId: line.id,
        lineIndex,
        start,
        end,
        text: characters.slice(start, end).join(''),
      };
    });
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const selectLine = (
    line: GenerationResult['draft']['lines'][number],
    lineIndex: number,
  ): void => {
    setSelection({
      lineId: line.id,
      lineIndex,
      start: 0,
      end: Array.from(line.text).length,
      text: line.text,
    });
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const addRefinementItem = (): void => {
    if (selection === undefined || instruction.trim() === '') return;
    const item: RefinementItem = {
      ...selection,
      instruction: instruction.trim(),
    };
    setRefinementItems((current) => [
      ...current.filter(
        ({ lineId, start, end }) =>
          lineId !== item.lineId || start !== item.start || end !== item.end,
      ),
      item,
    ]);
    setSelection(undefined);
    setInstruction('');
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const updateRefinementInstruction = (itemIndex: number, value: string): void => {
    setRefinementItems((current) =>
      current.map((item, index) => (index === itemIndex ? { ...item, instruction: value } : item)),
    );
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const removeRefinementItem = (itemIndex: number): void => {
    setRefinementItems((current) => current.filter((_, index) => index !== itemIndex));
    setRefinementStatus('idle');
    setRefinementError('');
  };

  const submitRefinement = async (): Promise<void> => {
    if (
      onRefine === undefined ||
      refinementItems.length === 0 ||
      refinementItems.some((item) => item.instruction.trim() === '')
    ) {
      return;
    }
    setRefinementStatus('submitting');
    setRefinementError('');
    try {
      await onRefine(
        refinementItems.map(({ lineId, start, end, instruction: itemInstruction }) => ({
          lineId,
          start,
          end,
          instruction: itemInstruction.trim(),
        })),
      );
    } catch (error) {
      setRefinementStatus('error');
      setRefinementError(error instanceof Error ? error.message : '局部修改失败');
    }
  };

  const renderPoemLine = (line: GenerationResult['draft']['lines'][number], lineIndex: number) => (
    <div className="generated-line" key={line.id}>
      <p>
        {Array.from(line.text).map((character, index) => {
          const selected =
            refinementMode &&
            selection?.lineId === line.id &&
            index >= selection.start &&
            index < selection.end;
          const queued =
            refinementMode &&
            refinementItems.some(
              (item) => item.lineId === line.id && index >= item.start && index < item.end,
            );
          return (
            <button
              data-refinement-selected={selected}
              data-refinement-queued={queued}
              key={`${line.id}-${index}`}
              type="button"
              onClick={() =>
                refinementMode
                  ? selectCharacter(line, lineIndex, index)
                  : onInspectCharacter(character)
              }
              aria-label={
                refinementMode
                  ? `选择第${lineIndex + 1}句第${index + 1}字“${character}”`
                  : undefined
              }
              title={refinementMode ? `选择“${character}”` : `查询“${character}”`}
            >
              {character}
            </button>
          );
        })}
      </p>
      {refinementMode && (
        <button
          className="select-whole-line"
          type="button"
          onClick={() => selectLine(line, lineIndex)}
        >
          整句
        </button>
      )}
    </div>
  );

  return (
    <section className="generation-result" aria-labelledby="result-title">
      <header>
        <p className="section-kicker">生成结果</p>
        <div className="result-view-switcher" role="group" aria-label="结果视图">
          <button
            type="button"
            aria-pressed={view === 'poem'}
            onClick={() => selectResultView('poem')}
          >
            正文
          </button>
          <button
            type="button"
            aria-pressed={view === 'prosody'}
            onClick={() => selectResultView('prosody')}
          >
            格律标注
          </button>
          {onRefine !== undefined && (
            <button
              type="button"
              aria-pressed={view === 'refinement'}
              onClick={() => selectResultView('refinement')}
            >
              局部修改
            </button>
          )}
        </div>
      </header>

      <div className="result-view-actions">
        <div className="result-version-switcher" role="group" aria-label="作品版本">
          {availableVersions.length > 1 && onSelectVersion !== undefined && (
            <button
              type="button"
              aria-label="上一版本"
              disabled={activeVersionIndex === 0}
              onClick={() => onSelectVersion(availableVersions[activeVersionIndex - 1]!)}
            >
              ←
            </button>
          )}
          <span className="result-version-label">
            版本 {activeVersionIndex + 1}/{availableVersions.length}
          </span>
          {availableVersions.length > 1 && onSelectVersion !== undefined && (
            <button
              type="button"
              aria-label="下一版本"
              disabled={activeVersionIndex === availableVersions.length - 1}
              onClick={() => onSelectVersion(availableVersions[activeVersionIndex + 1]!)}
            >
              →
            </button>
          )}
        </div>
      </div>

      <div className="result-content" aria-label="词作内容">
        <h2 id="result-title">{formatGenerationTitle(pattern.name, result.draft.title)}</h2>

        {view !== 'prosody' ? (
          <div className="generated-poem" aria-label="词作正文">
            {pattern.sections.length > 1 ? (
              <>
                {pattern.sections.map((section, sectionIndex) => {
                  const startIndex = sectionStartIndexes[sectionIndex] ?? 0;
                  return (
                    <section
                      className="generated-stanza"
                      key={section.id}
                      aria-label={section.name}
                    >
                      {result.draft.lines
                        .slice(startIndex, startIndex + section.lines.length)
                        .map((line, lineIndex) => renderPoemLine(line, startIndex + lineIndex))}
                    </section>
                  );
                })}
                {result.draft.lines.length > patternLines.length && (
                  <section className="generated-stanza" aria-label="词谱外正文">
                    {result.draft.lines
                      .slice(patternLines.length)
                      .map((line, lineIndex) =>
                        renderPoemLine(line, patternLines.length + lineIndex),
                      )}
                  </section>
                )}
              </>
            ) : (
              result.draft.lines.map(renderPoemLine)
            )}
          </div>
        ) : (
          <div className="annotated-poem" aria-label="平仄韵脚标注">
            {pattern.sections.length > 1 ? (
              <div className="annotated-stanza-list">
                {pattern.sections.map((section, sectionIndex) => (
                  <section className="stanza" key={section.id} aria-label={section.name}>
                    <div className="stanza-label">
                      <span>{section.name}</span>
                    </div>
                    <div className="annotated-line-list">
                      {section.lines.map((_, sectionLineIndex) => {
                        const lineIndex =
                          (sectionStartIndexes[sectionIndex] ?? 0) + sectionLineIndex;
                        const line = result.draft.lines[lineIndex];
                        return line === undefined ? null : renderAnnotatedLine(line, lineIndex);
                      })}
                    </div>
                  </section>
                ))}
                {result.draft.lines
                  .slice(patternLines.length)
                  .map((line, overflowIndex) =>
                    renderAnnotatedLine(line, patternLines.length + overflowIndex),
                  )}
              </div>
            ) : (
              result.draft.lines.map((line, lineIndex) => renderAnnotatedLine(line, lineIndex))
            )}
            <div className="result-prosody-legend" aria-label="格律标注图例">
              <span data-tone="level">平</span>平声
              <span data-tone="oblique">仄</span>仄声
              <span data-tone="either">中</span>可平可仄
              <i />
              韵脚
            </div>
          </div>
        )}
      </div>

      {view === 'refinement' && (
        <section className="refinement-editor" aria-label="局部修改">
          <header>
            <div>
              <p className="section-kicker">局部修改</p>
              <h3>{selection === undefined ? '请选择要修改的内容' : `已选“${selection.text}”`}</h3>
            </div>
            <span>{refinementItems.length} 项修改</span>
          </header>
          <p className="refinement-guide">
            选择字、词、片段或整句，填写对应意见后加入清单；可重复添加多项，再统一生成。
          </p>
          <div className="refinement-draft">
            <label>
              <span>
                {selection === undefined
                  ? '请先在正文中选择内容'
                  : `第 ${selection.lineIndex + 1} 句 · “${selection.text}”`}
              </span>
              <textarea
                aria-label="当前修改意见"
                value={instruction}
                onChange={(event) => setInstruction(event.target.value)}
                rows={3}
                maxLength={1_000}
                disabled={selection === undefined}
                placeholder="例如：换成更含蓄的表达，并与上下文自然衔接。"
              />
            </label>
            <button
              className="refinement-add"
              type="button"
              disabled={
                selection === undefined ||
                instruction.trim() === '' ||
                refinementStatus === 'submitting'
              }
              onClick={addRefinementItem}
            >
              加入修改清单
            </button>
          </div>

          {refinementItems.length > 0 && (
            <div className="refinement-list" aria-label="修改清单">
              {refinementItems.map((item, index) => (
                <article
                  className="refinement-item"
                  key={`${item.lineId}-${item.start}-${item.end}`}
                >
                  <header>
                    <strong>
                      第 {item.lineIndex + 1} 句 · “{item.text}”
                    </strong>
                    <button
                      type="button"
                      aria-label={`删除“${item.text}”修改项`}
                      disabled={refinementStatus === 'submitting'}
                      onClick={() => removeRefinementItem(index)}
                    >
                      删除
                    </button>
                  </header>
                  <label>
                    <span className="sr-only">第 {index + 1} 项修改意见</span>
                    <textarea
                      aria-label={`第 ${index + 1} 项修改意见`}
                      value={item.instruction}
                      onChange={(event) => updateRefinementInstruction(index, event.target.value)}
                      rows={2}
                      maxLength={1_000}
                      disabled={refinementStatus === 'submitting'}
                    />
                  </label>
                </article>
              ))}
            </div>
          )}

          <button
            className="refinement-submit"
            type="button"
            disabled={
              refinementItems.length === 0 ||
              refinementItems.some((item) => item.instruction.trim() === '') ||
              refinementStatus === 'submitting'
            }
            onClick={() => void submitRefinement()}
          >
            {refinementStatus === 'submitting' ? '正在重新生成…' : '根据全部意见重新生成'}
          </button>
          {refinementStatus === 'error' && (
            <p className="refinement-error" role="alert">
              {refinementError}
            </p>
          )}
        </section>
      )}

      {result.report.issues.length > 0 && (
        <details>
          <summary>查看格律报告</summary>
          <ul>
            {result.report.issues.map((issue, index) => (
              <li key={`${issue.lineId}-${issue.charIndex ?? 'line'}-${index}`}>
                <strong>{issue.severity === 'error' ? '错误' : '提示'}</strong>
                {issue.lineId}
                {issue.charIndex === undefined ? '' : ` 第 ${issue.charIndex + 1} 字`}：
                {issue.message}
              </li>
            ))}
          </ul>
        </details>
      )}

      <footer>
        <div className="result-footer-meta">
          <span>优化 {result.rounds} 轮</span>
          {/* <span>版本 {result.draft.version}</span> */}
          <span>{result.report.issues.length} 项提示</span>
        </div>
      </footer>
    </section>
  );
}
