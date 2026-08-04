import type { CiPattern } from '@poesygen/client-sdk';

import { patternStats } from './model.js';

interface PatternPreviewProps {
  readonly pattern: CiPattern;
  readonly onInspectCharacter: (character: string) => void;
}

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function PatternPreview({ pattern, onInspectCharacter }: PatternPreviewProps) {
  const stats = patternStats(pattern);
  let exampleIndex = 0;

  return (
    <section className="pattern-preview" aria-labelledby="pattern-title">
      <header className="pattern-header">
        <div>
          <p className="section-kicker">格律预览</p>
          <h1 id="pattern-title">{pattern.name}</h1>
          <p className="pattern-source">
            {pattern.variant} · {stats.characters} 字 · {stats.sections === 1 ? '单调' : '双调'}
          </p>
        </div>
        <span className="review-badge" data-status={pattern.reviewStatus}>
          {pattern.reviewStatus === 'verified' ? '已校勘' : '机器回查'}
        </span>
      </header>

      <div className="stat-row" aria-label="词牌统计">
        <span>
          <strong>{stats.lines}</strong> 句
        </span>
        <span>
          <strong>{stats.rhymePositions}</strong> 韵位
        </span>
        <span>
          <strong>{pattern.sections.length}</strong> 阕
        </span>
      </div>

      <div className="stanza-list">
        {pattern.sections.map((section) => (
          <section className="stanza" key={section.id} aria-label={section.name}>
            <div className="stanza-label">
              <span>{section.name}</span>
            </div>
            <div className="line-list">
              {section.lines.map((line) => {
                const example = Array.from(pattern.example?.lines[exampleIndex] ?? '');
                const currentIndex = exampleIndex;
                exampleIndex += 1;
                return (
                  <div className="prosody-line" key={line.id}>
                    <span className="line-number">{currentIndex + 1}</span>
                    <div className="character-track">
                      {line.positions.map((position, characterIndex) => {
                        const character = example[characterIndex] ?? '□';
                        return (
                          <button
                            className="character-cell"
                            data-tone={position.tone}
                            data-rhyme={position.rhyme !== undefined}
                            key={`${line.id}-${characterIndex}`}
                            type="button"
                            onClick={() => character !== '□' && onInspectCharacter(character)}
                            title={
                              position.rhyme === undefined
                                ? `${toneLabels[position.tone]}声位`
                                : `${toneLabels[position.tone]}声韵位，查询“${character}”`
                            }
                            disabled={character === '□'}
                          >
                            <span className="tone-mark">{toneLabels[position.tone]}</span>
                            <span className="example-character">{character}</span>
                            {position.rhyme !== undefined && (
                              <span className="rhyme-dot" aria-label="韵脚" />
                            )}
                          </button>
                        );
                      })}
                      <span className="line-punctuation">{line.punctuation ?? ''}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ))}
      </div>

      <footer className="preview-note">
        <span>平</span> 平声
        <span>仄</span> 仄声
        <span>中</span> 可平可仄
        <i /> 韵脚
        {pattern.example !== undefined && <em>例词：{pattern.example.author}</em>}
      </footer>
    </section>
  );
}
