import { useEffect, useState } from 'react';
import {
  DEFAULT_SETTINGS,
  progressStore,
  type ProgressStore,
  type SelfReport,
} from '../progress';

export interface EndScreenProps {
  onBackToStart: () => void;
  sessionIdPromise?: Promise<number | undefined>;
  store?: Pick<ProgressStore, 'getSettings'> &
    Partial<Pick<ProgressStore, 'updateSessionSelfReport'>>;
}

const SELF_REPORT_OPTIONS: readonly { readonly value: SelfReport; readonly label: string }[] = [
  { value: 'good', label: 'よかった' },
  { value: 'ok', label: 'ふつう' },
  { value: 'hard', label: 'たいへんだった' },
  { value: 'skip', label: 'こたえない' },
];

/**
 * 終了画面（さんすうクラフト方式・仕様 v0.3 §7）。
 * スコア・正答率・速さ・ミスは表示しない。
 * 本人の自己申告「きょうは どうだった？」は初期 OFF、保護者設定で ON のときだけ表示する。
 */
export function EndScreen({
  onBackToStart,
  sessionIdPromise,
  store = progressStore,
}: EndScreenProps) {
  const [selfReportOn, setSelfReportOn] = useState(DEFAULT_SETTINGS.selfReportOn);
  const [selected, setSelected] = useState<SelfReport | null>(null);

  useEffect(() => {
    let active = true;
    store
      .getSettings()
      .then((settings) => {
        if (active) setSelfReportOn(settings.selfReportOn);
      })
      .catch(() => {
        // IndexedDB が使えない環境では初期値（OFF）のまま進める
      });
    return () => {
      active = false;
    };
  }, [store]);

  const handleSelect = (value: SelfReport) => {
    setSelected(value);
    if (!sessionIdPromise || !store.updateSessionSelfReport) return;
    const save = store.updateSessionSelfReport;
    void sessionIdPromise
      .then((sessionId) => {
        if (sessionId !== undefined) {
          return save(sessionId, value);
        }
      })
      .catch(() => {
        // 保存に失敗しても画面の動作は止めない
      });
  };

  return (
    <main className="screen screen-center">
      <h1 className="big-message">またね</h1>

      {selfReportOn && (
        <section className="panel self-report" aria-labelledby="self-report-heading">
          <h2 id="self-report-heading">きょうは どうだった？</h2>
          <div className="self-report-choices">
            {SELF_REPORT_OPTIONS.map((option) => {
              const isSelected = selected === option.value;
              const isSkip = option.value === 'skip';
              return (
                <button
                  key={option.value}
                  type="button"
                  className={`button${isSkip ? ' button-quiet' : ''}${isSelected ? ' self-report-selected' : ''}`}
                  aria-pressed={isSelected}
                  onClick={() => handleSelect(option.value)}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          {selected && (
            <p className="self-report-ack" role="status">
              {selected === 'skip' ? 'わかったよ。' : 'おしえてくれて ありがとう。'}
            </p>
          )}
        </section>
      )}

      <button type="button" className="button button-primary" onClick={onBackToStart}>
        はじめに もどる
      </button>
    </main>
  );
}
