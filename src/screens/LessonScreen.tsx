import type { LessonMode } from '../screen';

const TITLES: Record<LessonMode, string> = {
  stage: 'レッスン',
  theme: 'テーマで あそぶ',
};

/**
 * レッスン画面（仮）。お題・入力表示・バーチャルキーボード・手の図の置き場所だけを確保する。
 * 各枠の大きさは styles.css の .lesson が画面の高さから割り振るので、
 * 中身は枠に収まる大きさで作る。
 */
export function LessonScreen({ mode, onFinish }: { mode: LessonMode; onFinish: () => void }) {
  return (
    <main className="lesson">
      <header className="bar lesson-bar">
        <h1>{TITLES[mode]}</h1>
        {/* 仮のボタン。レッスン進行ができたら、完了時の遷移に置き換える。 */}
        <button type="button" className="button" onClick={onFinish}>
          おわる
        </button>
      </header>
      <section className="slot lesson-prompt" aria-label="おだい">
        おだい（じゅんびちゅう）
      </section>
      <section className="slot lesson-typed" aria-label="うった もじ">
        うった もじ（じゅんびちゅう）
      </section>
      <section className="slot lesson-keyboard" aria-label="キーボード">
        キーボード（じゅんびちゅう）
      </section>
      <section className="slot lesson-hands" aria-label="てのず">
        てのず（じゅんびちゅう）
      </section>
    </main>
  );
}
