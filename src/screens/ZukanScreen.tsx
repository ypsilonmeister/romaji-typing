import { useEffect, useState } from 'react';
import { PACK_KANA_SET, romajiForWord, THEME_PACKS, type WordEntry } from '../data/wordPacks';
import { progressStore, type ProgressStore, type WordProgress } from '../progress';

export interface ZukanScreenProps {
  onBack: () => void;
  store?: Pick<ProgressStore, 'getWordProgress'>;
}

interface ZukanSection {
  readonly id: string;
  readonly name: string;
  readonly words: readonly WordEntry[];
}

type LoadState =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sections: readonly ZukanSection[] };

function buildSections(progress: readonly WordProgress[]): ZukanSection[] {
  const typedIds = new Set(progress.filter((item) => item.typedCount > 0).map((item) => item.wordId));
  const sections: ZukanSection[] = [];

  for (const pack of THEME_PACKS) {
    const words = pack.words.filter((word) => typedIds.has(word.kana));
    if (words.length > 0) {
      sections.push({ id: pack.id, name: pack.name, words });
    }
  }

  const otherWords: WordEntry[] = [];
  for (const wordId of typedIds) {
    if (!PACK_KANA_SET.has(wordId)) {
      otherWords.push({ kana: wordId, romaji: romajiForWord(wordId) });
    }
  }
  if (otherWords.length > 0) {
    sections.push({ id: 'other', name: 'そのほか', words: otherWords });
  }

  return sections;
}

/**
 * ことば図鑑（さんすうクラフト方式・仕様 v0.3 §7）。
 * 打てた単語だけをテーマ別に並べ、かなとローマ字を併記する。
 * 未習得の空き枠・正答率・速さ・ヒント回数・ミスは表示しない。
 */
export function ZukanScreen({ onBack, store = progressStore }: ZukanScreenProps) {
  const [state, setState] = useState<LoadState>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    store.getWordProgress().then(
      (progress) => {
        if (active) setState({ status: 'ready', sections: buildSections(progress) });
      },
      (error: unknown) => {
        console.error('ことば図鑑を読み込めませんでした', error);
        if (active) setState({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);

  return (
    <main className="screen screen-zukan">
      <header className="bar">
        <h1>ことば図鑑</h1>
        <button type="button" className="button" onClick={onBack}>
          もどる
        </button>
      </header>

      <div className="zukan-body">
        {state.status === 'loading' && (
          <p className="panel" role="status">
            読み込んでいます。
          </p>
        )}
        {state.status === 'error' && (
          <p className="panel" role="alert">
            ことば図鑑を 読み込めませんでした。
          </p>
        )}
        {state.status === 'ready' && state.sections.length === 0 && (
          <p className="panel zukan-empty">
            まだ ことばは ありません。れんしゅうで うてた ことばが ここに ならびます。
          </p>
        )}
        {state.status === 'ready' &&
          state.sections.map((section) => (
            <section
              key={section.id}
              className="panel zukan-theme"
              aria-labelledby={`zukan-theme-${section.id}`}
            >
              <h2 id={`zukan-theme-${section.id}`} className="zukan-theme-title">
                {section.name}
              </h2>
              <ul className="zukan-grid">
                {section.words.map((word) => (
                  <li key={`${section.id}-${word.kana}`} className="zukan-card">
                    <span className="zukan-kana">{word.kana}</span>
                    {word.romaji && <span className="zukan-romaji">{word.romaji}</span>}
                  </li>
                ))}
              </ul>
            </section>
          ))}
      </div>
    </main>
  );
}
