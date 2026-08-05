import { useCallback, useEffect, useState } from 'react';

import type {
  CharacterPronunciationResponse,
  RhymeGroupDetail,
  RhymeGroupSummary,
} from '@poesygen/client-sdk';

import { toUserMessage } from './errors.js';

interface DictionaryClient {
  getCharacterPronunciations(character: string): Promise<CharacterPronunciationResponse>;
  getCilinRhymeGroup(groupId: string): Promise<RhymeGroupDetail>;
}

interface DictionaryWorkspaceProps {
  readonly client: DictionaryClient;
  readonly rhymeGroups: ReadonlyArray<RhymeGroupSummary>;
  readonly initialCharacter?: string;
  readonly onInitialCharacterHandled: () => void;
}

export function DictionaryWorkspace({
  client,
  rhymeGroups,
  initialCharacter,
  onInitialCharacterHandled,
}: DictionaryWorkspaceProps) {
  const [query, setQuery] = useState('');
  const [characterResult, setCharacterResult] = useState<CharacterPronunciationResponse>();
  const [characterStatus, setCharacterStatus] = useState('输入一个汉字，查询古今读音。');
  const [selectedGroupId, setSelectedGroupId] = useState('');
  const [groupDetail, setGroupDetail] = useState<RhymeGroupDetail>();

  const lookup = useCallback(
    async (character: string): Promise<void> => {
      const normalized = character.trim();
      if (splitGraphemes(normalized).length !== 1) {
        setCharacterStatus('请输入一个汉字。');
        return;
      }
      setCharacterResult(undefined);
      setCharacterStatus('正在查询…');
      try {
        const result = await client.getCharacterPronunciations(normalized);
        setCharacterResult(result);
        setCharacterStatus(`已载入“${normalized}”的字音资料。`);
      } catch (error) {
        setCharacterStatus(toUserMessage(error));
      }
    },
    [client],
  );

  useEffect(() => {
    if (selectedGroupId === '' && rhymeGroups[0] !== undefined) {
      setSelectedGroupId(rhymeGroups[0].id);
    }
  }, [rhymeGroups, selectedGroupId]);

  useEffect(() => {
    if (selectedGroupId === '') return;
    let active = true;
    setGroupDetail(undefined);
    void client
      .getCilinRhymeGroup(selectedGroupId)
      .then((detail) => {
        if (active) setGroupDetail(detail);
      })
      .catch((error: unknown) => {
        if (active) setCharacterStatus(toUserMessage(error));
      });
    return () => {
      active = false;
    };
  }, [client, selectedGroupId]);

  useEffect(() => {
    if (initialCharacter === undefined) return;
    setQuery(initialCharacter);
    void lookup(initialCharacter);
    onInitialCharacterHandled();
  }, [initialCharacter, lookup, onInitialCharacterHandled]);

  const submitLookup = (event: { preventDefault(): void }): void => {
    event.preventDefault();
    void lookup(query);
  };

  const inspectRhymeCharacter = (character: string): void => {
    setQuery(character);
    void lookup(character);
  };

  return (
    <main className="page-workspace">
      <header className="workspace-header">
        <div>
          <p className="section-kicker">字典</p>
          <h1>音韵字典</h1>
          <p>查询古今读音、传统平仄和《词林正韵》十九部。</p>
        </div>
      </header>

      <div className="workspace-grid dictionary-layout">
        <section className="dictionary-lookup" aria-labelledby="dictionary-title">
          <header className="dictionary-panel-header">
            <p className="section-kicker">单字查询</p>
            <h2 id="dictionary-title">一字，见古今声韵</h2>
            <p>普通话读音来自 Unihan；平仄与韵部以《词林正韵》为准。</p>
          </header>

          <form className="character-search" onSubmit={submitLookup}>
            <label>
              <span className="sr-only">输入一个汉字</span>
              <input
                value={query}
                onChange={(event) => setQuery(splitGraphemes(event.target.value)[0] ?? '')}
                placeholder="字"
                aria-label="输入一个汉字"
              />
            </label>
            <button type="submit">查询</button>
          </form>
          <p className="lookup-status" role="status">
            {characterStatus}
          </p>

          {characterResult !== undefined && <CharacterCard result={characterResult} />}
        </section>

        <section className="rhyme-browser" aria-labelledby="rhyme-title">
          <header className="rhyme-browser-header">
            <div>
              <p className="section-kicker">词林正韵</p>
              <h2 id="rhyme-title">十九部</h2>
            </div>
            <select
              value={selectedGroupId}
              onChange={(event) => setSelectedGroupId(event.target.value)}
              aria-label="选择词林正韵韵部"
            >
              {rhymeGroups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </header>

          {groupDetail === undefined ? (
            <p className="empty-copy">正在载入韵字…</p>
          ) : (
            <div className="rhyme-sections">
              {groupDetail.sections.map((section) => (
                <section key={`${groupDetail.id}-${section.name}`}>
                  <h3>
                    <span>
                      {section.name}
                      <small>{section.tone === 'level' ? '平声' : '仄声'}</small>
                    </span>
                    <em>{splitGraphemes(section.characters).length} 字</em>
                  </h3>
                  <div className="rhyme-characters">
                    {splitGraphemes(section.characters).map((character, index) => (
                      <button
                        key={`${character}-${index}`}
                        type="button"
                        onClick={() => inspectRhymeCharacter(character)}
                        title={`查询“${character}”`}
                      >
                        {character}
                      </button>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

const graphemeSegmenter = new Intl.Segmenter('zh-CN', {
  granularity: 'grapheme',
});

export function splitGraphemes(value: string): ReadonlyArray<string> {
  return [...graphemeSegmenter.segment(value)].map(({ segment }) => segment);
}

function CharacterCard({ result }: { readonly result: CharacterPronunciationResponse }) {
  return (
    <article className="character-card">
      <div className="character-glyph" aria-hidden="true">
        {result.character}
      </div>
      <div className="reading-content">
        <dl className="modern-readings">
          <div>
            <dt>普通话</dt>
            <dd>{result.readings?.mandarin?.join(' / ') ?? '未收录'}</dd>
          </div>
          <div>
            <dt>反切</dt>
            <dd>{result.readings?.fanqie?.join(' / ') ?? '未收录'}</dd>
          </div>
          <div>
            <dt>唐音</dt>
            <dd>{result.readings?.tang?.join(' / ') ?? '未收录'}</dd>
          </div>
        </dl>

        <div className="prosody-readings">
          <h3>《词林正韵》</h3>
          {result.prosody.length === 0 ? (
            <p>未收录传统韵部。</p>
          ) : (
            result.prosody.map((pronunciation, index) => (
              <div
                className="prosody-reading"
                key={`${pronunciation.tone}-${pronunciation.rhymeGroups.join('-')}-${index}`}
              >
                <span data-tone={pronunciation.tone}>
                  {pronunciation.tone === 'level' ? '平' : '仄'}
                </span>
                <p>
                  <strong>{pronunciation.rhymeGroups.join(' / ')}</strong>
                  <small>{pronunciation.rhymeSections?.join('、') ?? '小韵未明'}</small>
                </p>
              </div>
            ))
          )}
        </div>
      </div>
    </article>
  );
}
