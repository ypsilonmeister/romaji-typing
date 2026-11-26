import { useEffect, useState } from 'react';
import { voicePlayer, type VoicePlayer } from '../audio/voice';
import {
  DEFAULT_SETTINGS,
  progressStore,
  type ProgressStore,
  type SessionRecord,
  type Settings,
} from '../progress';

type Props = {
  onBack: () => void;
  store?: Pick<ProgressStore, 'getSessions'> &
    Partial<Pick<ProgressStore, 'getSettings' | 'updateSettings'>>;
  voice?: VoicePlayer;
};

type History =
  | { status: 'loading' }
  | { status: 'error' }
  | { status: 'ready'; sessions: SessionRecord[] };

/** 保護者ゲート。れんしゅうの記録と設定（音・音声・自己申告）を扱う。開き方は後続で実装する。 */
export function ParentGateScreen({
  onBack,
  store = progressStore,
  voice = voicePlayer,
}: Props) {
  const [history, setHistory] = useState<History>({ status: 'loading' });
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);

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
    if (store.getSettings) {
      store
        .getSettings()
        .then((loaded) => {
          if (active) setSettings(loaded);
        })
        .catch(() => {
          // 既定値のまま続行
        });
    }
    return () => {
      active = false;
    };
  }, [store]);

  const handleUpdateSetting = (changes: Partial<Settings>) => {
    setSettings((prev) => ({ ...prev, ...changes }));
    if (changes.voiceOn === false) {
      voice.stop();
    }
    if (store.updateSettings) {
      void store.updateSettings(changes).catch(() => {
        // 保存に失敗しても画面の動作は止めない
      });
    }
  };

  return (
    <main className="screen screen-center">
      <h1>保護者ゲート</h1>
      <section className="panel parent-settings" aria-labelledby="settings-heading">
        <h2 id="settings-heading">設定</h2>
        <label className="setting-row">
          <input
            type="checkbox"
            checked={settings.soundOn}
            onChange={(event) => handleUpdateSetting({ soundOn: event.target.checked })}
          />
          <span>効果音を鳴らす</span>
        </label>
        <label className="setting-row">
          <input
            type="checkbox"
            checked={settings.voiceOn}
            onChange={(event) => handleUpdateSetting({ voiceOn: event.target.checked })}
          />
          <span>音声（声かけ・読み上げ）を鳴らす</span>
        </label>
        <label className="setting-row">
          <input
            type="checkbox"
            checked={settings.selfReportOn}
            onChange={(event) => handleUpdateSetting({ selfReportOn: event.target.checked })}
          />
          <span>終了画面で自己申告「きょうは どうだった？」を表示する</span>
        </label>
      </section>
      <section className="panel history" aria-labelledby="history-heading">
        <h2 id="history-heading">れんしゅうの記録</h2>
        <p>記録は、この端末の中にだけ保存します。</p>
        <HistoryBody history={history} />
      </section>
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
