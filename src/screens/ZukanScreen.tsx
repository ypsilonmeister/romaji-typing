/** ことば図鑑（仮）。 */
export function ZukanScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen screen-center">
      <h1>ことば図鑑</h1>
      <p className="panel">じゅんびちゅう</p>
      <button type="button" className="button" onClick={onBack}>
        もどる
      </button>
    </main>
  );
}
