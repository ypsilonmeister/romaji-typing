/** 保護者ゲート（仮）。開き方・設定・進捗の確認は後続で実装する。 */
export function ParentGateScreen({ onBack }: { onBack: () => void }) {
  return (
    <main className="screen screen-center">
      <h1>保護者ゲート</h1>
      <p className="panel">設定と進捗の確認は、準備中です。</p>
      <button type="button" className="button" onClick={onBack}>
        もどる
      </button>
    </main>
  );
}
