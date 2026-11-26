import type { LessonMode } from '../screen';

type Props = {
  onStartLesson: (mode: LessonMode) => void;
  onOpenZukan: () => void;
  onOpenParentGate: () => void;
};

/** モード選択画面。 */
export function ModeSelectScreen({ onStartLesson, onOpenZukan, onOpenParentGate }: Props) {
  return (
    <main className="screen screen-menu">
      <header className="bar">
        <h1>タイプクラフト</h1>
        {/* 仮の入口。誤操作を防ぐ開き方は後続で置き換える。 */}
        <button type="button" className="button button-quiet" onClick={onOpenParentGate}>
          おうちのひと
        </button>
      </header>
      <div className="cards">
        <button type="button" className="card" onClick={() => onStartLesson('stage')}>
          <span className="card-title">レッスン</span>
          <span>つづきから れんしゅう</span>
        </button>
        <button type="button" className="card" onClick={() => onStartLesson('theme')}>
          <span className="card-title">テーマで あそぶ</span>
          <span>ことばを うって あそぶ</span>
        </button>
      </div>
      <button type="button" className="button" onClick={onOpenZukan}>
        ことば図鑑
      </button>
    </main>
  );
}
