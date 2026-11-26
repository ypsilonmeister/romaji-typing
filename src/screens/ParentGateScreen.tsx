import { useEffect, useState } from 'react';
import { progressStore, type ProgressStore, type SessionRecord } from '../progress';

type Props = {
  onBack: () => void;
  store?: Pick<ProgressStore, 'getSessions'>;
};

type History =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sessions: SessionRecord[] };

/** 保護者ゲート。れんしゅうの記録を表示する。開き方と設定は後続で実装する。 */
export function ParentGateScreen({ onBack, store = progressStore }: Props) {
  const [history, setHistory] = useState<History>({ status: 'loading' });

  useEffect(() => {
    let active = true;
    store.getSessions().then(
      (sessions) => {
        if (active) setHistory({ status: 'ready', sessions });
      },
      (error: unknown) => {
        console.error('れんしゅうの記録を読み込めませんでした', error);
        if (active) setHistory({ status: 'error' });
      },
    );
    return () => {
      active = false;
    };
  }, [store]);

  return (
    <main className="screen screen-center">
      <h1>保護者ゲート</h1>
      <section className="panel history" aria-labelledby="history-heading">
        <h2 id="history-heading">れんしゅうの記録</h2>
        <p>記録は、この端末の中にだけ保存します。</p>
        <HistoryBody history={history} />
      </section>
      <p>設定は、準備中です。</p>
      <button type="button" className="button" onClick={onBack}>
        もどる
      </button>
    </main>
  );
}

function HistoryBody({ history }: { history: History }) {
  if (history.status === 'loading') return <p role="status">読み込んでいます。</p>;
  if (history.status === 'error') return <p role="alert">記録を読み込めませんでした。</p>;
  if (history.sessions.length === 0) return <p>まだ記録がありません。</p>;

  return (
    // 件数が増えても画面に収まるように、表だけをスクロールする。キーボードでも操作できる。
    <div className="history-scroll" role="region" aria-labelledby="history-heading" tabIndex={0}>
      <table>
        <thead>
          <tr>
            <th scope="col">始めた日時</th>
            <th scope="col">時間</th>
            <th scope="col">打った かなの数</th>
          </tr>
        </thead>
        <tbody>
          {history.sessions.map((session, index) => (
            <tr key={index}>
              <td>{formatDateTime(session.date)}</td>
              <td>{formatDuration(session.durationSec)}</td>
              <td>{session.typedKanaCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** 端末の時刻で「2026/11/26 09:05」の形にする。 */
function formatDateTime(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, '0');
  const day = `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`;
  return `${day} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function formatDuration(durationSec: number): string {
  const total = Math.round(durationSec);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return minutes === 0 ? `${seconds}秒` : `${minutes}分${seconds}秒`;
}
