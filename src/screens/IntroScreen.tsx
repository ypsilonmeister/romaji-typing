/** 起動画面（初回のみ）。保護者向けの IME オフ案内。 */
export function IntroScreen({ onStart }: { onStart: () => void }) {
  return (
    <main className="screen screen-center">
      <h1>タイプクラフト</h1>
      <section className="panel" aria-labelledby="intro-heading">
        <h2 id="intro-heading">おうちの方へ：はじめる前に IME をオフにしてください</h2>
        <p>このアプリは、英字を直接入力する状態（IME オフ）で使います。ChromeOS の場合の手順です。</p>
        <ol>
          <li>画面右下の時計のあたりで、いまの入力方法の表示を確認します。</li>
          <li>
            <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>Space</kbd> を押して、英字のキーボード（US
            など）に切り替えます。<kbd>Ctrl</kbd> + <kbd>Space</kbd> で直前の入力方法に戻せます。
          </li>
          <li>
            切り替わらないときは、ChromeOS の設定で、使える入力方法に英字のキーボードがあるか確認してください。
          </li>
          <li>
            キーボードの <kbd>F</kbd> と <kbd>J</kbd> の出っぱりを、お子さんと指でさわって確かめてください。
          </li>
        </ol>
      </section>
      <button type="button" className="button button-primary" onClick={onStart}>
        はじめる
      </button>
    </main>
  );
}
