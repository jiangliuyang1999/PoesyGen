import { useMemo, useState } from 'react';

import type { CiPattern, GenerationResult } from '@poesygen/client-sdk';

import { formatGenerationTitle } from './model.js';

interface GenerationResultPanelProps {
  readonly result: GenerationResult;
  readonly pattern: CiPattern;
  readonly onInspectCharacter: (character: string) => void;
}

type ResultView = 'poem' | 'prosody';

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function GenerationResultPanel({
  result,
  pattern,
  onInspectCharacter,
}: GenerationResultPanelProps) {
  const [view, setView] = useState<ResultView>('poem');
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

  return (
    <section className="generation-result" aria-labelledby="result-title">
      <header>
        <p className="section-kicker">生成结果</p>
        <span data-passed={result.report.passed}>
          {result.report.passed ? '格律通过' : '达到轮次上限'}
        </span>
      </header>

      <div className="result-view-switcher" role="group" aria-label="结果视图">
        <button type="button" aria-pressed={view === 'poem'} onClick={() => setView('poem')}>
          正文
        </button>
        <button type="button" aria-pressed={view === 'prosody'} onClick={() => setView('prosody')}>
          格律标注
        </button>
      </div>

      <div className="result-content" aria-label="词作内容">
        <h2 id="result-title">{formatGenerationTitle(pattern.name, result.draft.title)}</h2>

        {view === 'poem' ? (
          <div className="generated-poem" aria-label="词作正文">
            {result.draft.lines.map((line) => (
              <p key={line.id}>
                {Array.from(line.text).map((character, index) => (
                  <button
                    key={`${line.id}-${index}`}
                    type="button"
                    onClick={() => onInspectCharacter(character)}
                    title={`查询“${character}”`}
                  >
                    {character}
                  </button>
                ))}
              </p>
            ))}
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

      <footer>
        <span>优化 {result.rounds} 轮</span>
        <span>版本 {result.draft.version}</span>
        <span>{result.report.issues.length} 项提示</span>
      </footer>

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
    </section>
  );
}
