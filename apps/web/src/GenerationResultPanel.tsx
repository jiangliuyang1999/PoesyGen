import type { GenerationResult } from '@poesygen/client-sdk';

interface GenerationResultPanelProps {
  readonly result: GenerationResult;
  readonly onInspectCharacter: (character: string) => void;
}

export function GenerationResultPanel({ result, onInspectCharacter }: GenerationResultPanelProps) {
  return (
    <section className="generation-result" aria-labelledby="result-title">
      <header>
        <div>
          <p className="section-kicker">生成结果</p>
          <h2 id="result-title">{result.draft.title ?? '无题'}</h2>
        </div>
        <span data-passed={result.report.passed}>
          {result.report.passed ? '格律通过' : '达到轮次上限'}
        </span>
      </header>

      <div className="generated-poem">
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
