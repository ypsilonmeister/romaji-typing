import { useEffect, useRef, useState } from 'react';
import { voicePlayer, type VoicePlayer } from '../audio/voice';
import { SELF_REPORT_VOICE_KEYS } from '../audio/voiceManifest';
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
  voice?: VoicePlayer;
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
  voice = voicePlayer,
}: EndScreenProps) {
  const [selfReportOn, setSelfReportOn] = useState(DEFAULT_SETTINGS.selfReportOn);
  const [sessionId, setSessionId] = useState<number | undefined>(undefined);
  const [selected, setSelected] = useState<SelfReport | null>(null);
  const voiceOnRef = useRef(DEFAULT_SETTINGS.voiceOn);
  const endVoicePlayedRef = useRef(false);

  useEffect(() => {
    let active = true;
    store
      .getSettings()
      .then((settings) => {
        if (!active) return;
        setSelfReportOn(settings.selfReportOn);
        voiceOnRef.current = settings.voiceOn;
        if (settings.voiceOn && !endVoicePlayedRef.current) {
          endVoicePlayedRef.current = true;
          voice.playPhrase('session-end');
        }
      })
      .catch(() => {
        if (!active) return;
        // IndexedDB が使えない環境では既定値のまま進める
        if (DEFAULT_SETTINGS.voiceOn && !endVoicePlayedRef.current) {
          endVoicePlayedRef.current = true;
          voice.playPhrase('session-end');
        }
      });
    return () => {
      active = false;
    };
  }, [store, voice]);

  useEffect(() => {
    let active = true;
    if (!sessionIdPromise) {
      setSessionId(undefined);
      return;
    }
    sessionIdPromise
      .then((id) => {
        if (active) setSessionId(id);
      })
      .catch(() => {
        if (active) setSessionId(undefined);
      });
    return () => {
      active = false;
    };
  }, [sessionIdPromise]);

  const canSelfReport =
    selfReportOn && sessionId !== undefined && typeof store.updateSessionSelfReport === 'function';

  const handleSelect = (value: SelfReport) => {
    setSelected(value);
    if (voiceOnRef.current) {
      voice.playPhrase(SELF_REPORT_VOICE_KEYS[value]);
    }
    if (sessionId === undefined || !store.updateSessionSelfReport) return;
    void store.updateSessionSelfReport(sessionId, value).catch(() => {
      // 保存に失敗しても画面の動作は止めない
    });
  };

  return (
    <main className="screen screen-center">
      <h1 className="big-message">またね</h1>

      {canSelfReport && (
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
