/** 終了画面。スコア・正答率・速さ・ミスは表示しない（仕様 v0.3 §7）。 */
export function EndScreen({ onBackToStart }: { onBackToStart: () => void }) {
  return (
    <main className="screen screen-center">
      <h1 className="big-message">またね</h1>
      <button type="button" className="button button-primary" onClick={onBackToStart}>
        はじめに もどる
      </button>
    </main>
  );
}
