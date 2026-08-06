import type { CiPattern } from '@poesygen/domain';

import { formatPatternVariantSummary } from './model.js';

interface PatternPreviewProps {
  readonly pattern: CiPattern;
  readonly onInspectCharacter: (character: string) => void;
  readonly onCreate?: () => void;
  readonly showHeader?: boolean;
  readonly titleLevel?: 1 | 2;
}

interface PatternPreviewTitleProps {
  readonly pattern: CiPattern;
  readonly level?: 1 | 2;
  readonly id?: string;
}

const toneLabels = {
  level: '平',
  oblique: '仄',
  either: '中',
} as const;

export function PatternPreviewTitle({ pattern, level = 1, id }: PatternPreviewTitleProps) {
  const Heading = level === 1 ? 'h1' : 'h2';

  return (
    <div>
      <Heading {...(id === undefined ? {} : { id })}>{pattern.name}</Heading>
      <p className="pattern-source" aria-label="词牌信息">
        {formatPatternVariantSummary(pattern)}
      </p>
    </div>
  );
}

export function PatternPreview({
  pattern,
  onInspectCharacter,
  onCreate,
  showHeader = true,
  titleLevel = 1,
}: PatternPreviewProps) {
  let exampleIndex = 0;

  return (
    <section
      className="pattern-preview"
      {...(showHeader ? { 'aria-labelledby': 'pattern-title' } : { 'aria-label': '格律内容' })}
    >
      {showHeader && (
        <header className="pattern-header">
          <PatternPreviewTitle pattern={pattern} level={titleLevel} id="pattern-title" />
          <div className="pattern-header-actions">
            {pattern.reviewStatus === 'verified' && <span className="review-badge">已校勘</span>}
            {onCreate !== undefined && (
              <button className="pattern-create-action" type="button" onClick={onCreate}>
                用此体创作
              </button>
            )}
          </div>
        </header>
      )}

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
        <span className="preview-note-legend">
          <span>平</span> 平声
          <span>仄</span> 仄声
          <span>中</span> 可平可仄
          <i /> 韵脚
        </span>
        {pattern.example !== undefined && <em>例词：{pattern.example.author}</em>}
      </footer>
    </section>
  );
}
