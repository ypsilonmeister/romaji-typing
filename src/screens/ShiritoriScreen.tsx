import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  playKanaCompleteSound,
  playKeySound,
  playWordCompleteSound,
  playWrongKeySound,
  WORD_COMPLETE_SOUND_DURATION_MS,
} from '../audio/sound';
import { voicePlayer, type VoicePlayer } from '../audio/voice';
import { VirtualKeyboard } from '../components/VirtualKeyboard';
import {
  backspaceConverter,
  commitConverter,
  convertedText,
  createConverter,
  nextConverterKeys,
  pressConverterKey,
  type ConverterState,
} from '../core/romajiConverter';
import {
  advanceAppTurn,
  appCandidateWords,
  createShiritoriGame,
  mergeShiritoriDictionarySet,
  SHIRITORI_DICTIONARY,
  submitChildWord,
  type RejectReason,
  type ShiritoriState,
} from '../core/shiritori';
import { loadExtendedShiritoriDictionary } from '../core/shiritoriDict';
import { DEFAULT_SETTINGS, progressStore, type ProgressStore } from '../progress';

const DEFAULT_APP_RESPONSE_DELAY_MS = 650;
const KEY_FLASH_MS = 140;
const SHAKE_MS = 320;
const VOICE_DUCKING_FACTOR = 0.35;

export interface ShiritoriScreenProps {
  readonly onFinish: (sessionIdPromise?: Promise<number | undefined>) => void;
  /** しりとり辞書。省略時はテーマ単語＋ステージ単語の和集合を使う。 */
  readonly dictionary?: readonly string[];
  /** 乱数生成関数（既定 Math.random）。テストで決定的にできる。 */
  readonly random?: () => number;
  /** 子どもの言葉を受け付けてからアプリが返すまでの間（ミリ秒）。既定 650ms。 */
  readonly appResponseDelayMs?: number;
  /** 進捗の保存先。テストで差し替えられる。 */
  readonly store?: Pick<
    ProgressStore,
    'getSettings' | 'updateSettings' | 'recordWordTyped' | 'addSession'
  >;
  /** 音声プレイヤー。テストで差し替えられる。 */
  readonly voice?: VoicePlayer;
}

type TurnPhase = 'child-turn' | 'app-thinking' | 'app-stuck' | 'child-stuck';

function isButtonElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, [role="button"]') !== null;
}

function rejectMessage(reason: RejectReason, expectedKana: string): string {
  switch (reason) {
    case 'empty':
    case 'wrong-start':
      return `「${expectedKana}」からはじまる ことばを うってみよう`;
    case 'ends-with-n':
      return '「ん」で おわるよ！ べつの ことばに してみよう';
    case 'already-used':
      return 'もう でた ことばだよ！ べつの ことばに してみよう';
    case 'not-in-dictionary':
      return 'しらない ことばかも？ べつの ことばに してみよう';
  }
}

export function ShiritoriScreen({
  onFinish,
  dictionary = SHIRITORI_DICTIONARY,
  random = Math.random,
  appResponseDelayMs = DEFAULT_APP_RESPONSE_DELAY_MS,
  store = progressStore,
  voice = voicePlayer,
}: ShiritoriScreenProps) {
  const [extraDictionary, setExtraDictionary] = useState<readonly string[]>([]);
  const extraDictionaryRef = useRef<readonly string[]>(extraDictionary);
  extraDictionaryRef.current = extraDictionary;

  const dictionarySet = useMemo(
    () => mergeShiritoriDictionarySet(dictionary, extraDictionary),
    [dictionary, extraDictionary],
  );

  const [game, setGame] = useState<ShiritoriState>(() => createShiritoriGame(dictionary, random));
  const [converter, setConverter] = useState<ConverterState>(() => createConverter());
  const [phase, setPhase] = useState<TurnPhase>(() =>
    game.status === 'child-stuck' ? 'child-stuck' : 'child-turn',
  );
  const [feedback, setFeedback] = useState<string | null>(null);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [shakePhase, setShakePhase] = useState<0 | 1 | 2>(0);
  const [soundOn, setSoundOn] = useState(DEFAULT_SETTINGS.soundOn);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SETTINGS.soundVolume);

  const isComposingRef = useRef(false);
  const finishedRef = useRef(false);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const shakeTimerRef = useRef<number | undefined>(undefined);
  const appTurnTimerRef = useRef<number | undefined>(undefined);
  const chainEndRef = useRef<HTMLLIElement | null>(null);
  const sessionStartRef = useRef<Date>(new Date());
  const typedKanaCountRef = useRef(0);
  const sessionSavedRef = useRef(false);
  const sessionIdPromiseRef = useRef<Promise<number | undefined> | undefined>(undefined);
  const voiceOnRef = useRef(false);
  const initialVoicePlayedRef = useRef(false);
  const initialWordRef = useRef(game.chain[0]?.word ?? '');

  // しりとりモード入場時に拡張辞書を遅延読み込みする（失敗時は従来辞書だけで動かす）。
  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void loadExtendedShiritoriDictionary({ signal: controller.signal }).then((words) => {
      if (cancelled || words.length === 0) return;
      setExtraDictionary(words);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, []);

  // 拡張辞書の読み込み完了で返せる言葉が増えた場合、child-stuck から復帰できるようにする。
  useEffect(() => {
    if (extraDictionary.length === 0 || phase !== 'child-stuck') return;
    if (appCandidateWords(game.expectedKana, game.usedWords, extraDictionary).length > 0) {
      setGame((prev) => (prev.status === 'child-stuck' ? { ...prev, status: 'playing' } : prev));
      setPhase('child-turn');
    }
  }, [extraDictionary, game.expectedKana, game.usedWords, phase]);

  // 保存済みの音・音声設定を読み込み、音声 ON なら最初の言葉を登録済み音声で読み上げる。
  useEffect(() => {
    let cancelled = false;
    store
      .getSettings()
      .then((settings) => {
        if (cancelled) return;
        setSoundOn(settings.soundOn);
        setSoundVolume(settings.soundVolume);
        voiceOnRef.current = settings.voiceOn;
        if (settings.voiceOn && !initialVoicePlayedRef.current && initialWordRef.current) {
          initialVoicePlayedRef.current = true;
          voice.playWord(initialWordRef.current, { allowTtsFallback: false });
        }
      })
      .catch(() => {
        if (cancelled) return;
        voiceOnRef.current = DEFAULT_SETTINGS.voiceOn;
        if (DEFAULT_SETTINGS.voiceOn && !initialVoicePlayedRef.current && initialWordRef.current) {
          initialVoicePlayedRef.current = true;
          voice.playWord(initialWordRef.current, { allowTtsFallback: false });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [store, voice]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(shakeTimerRef.current);
      window.clearTimeout(appTurnTimerRef.current);
    };
  }, []);

  // チェーンが増えたら最新の言葉が見える位置へスクロールする
  useEffect(() => {
    const el = chainEndRef.current;
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'end' });
    }
  }, [game.chain.length]);

  const effectiveVolume = soundOn ? soundVolume : 0;
  const validNextKeys = useMemo(
    () => (phase === 'child-turn' ? nextConverterKeys(converter) : []),
    [converter, phase],
  );

  const flashKey = useCallback((key: string) => {
    setPressedKey(key);
    window.clearTimeout(flashTimerRef.current);
    flashTimerRef.current = window.setTimeout(() => {
      setPressedKey(null);
    }, KEY_FLASH_MS);
  }, []);

  const triggerShake = useCallback(() => {
    window.clearTimeout(shakeTimerRef.current);
    setShakePhase((prev) => (prev === 1 ? 2 : 1));
    shakeTimerRef.current = window.setTimeout(() => {
      setShakePhase(0);
    }, SHAKE_MS);
  }, []);

  const saveSessionIfNeeded = useCallback((): Promise<number | undefined> | undefined => {
    if (sessionSavedRef.current) return sessionIdPromiseRef.current;
    if (typedKanaCountRef.current <= 0) return undefined;
    sessionSavedRef.current = true;
    const durationSec = Math.max(
      1,
      Math.round((Date.now() - sessionStartRef.current.getTime()) / 1000),
    );
    const promise = store
      .addSession({
        date: sessionStartRef.current,
        durationSec,
        typedKanaCount: typedKanaCountRef.current,
      })
      .catch(() => undefined);
    sessionIdPromiseRef.current = promise;
    return promise;
  }, [store]);

  const finishShiritori = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    window.clearTimeout(appTurnTimerRef.current);
    const sessionIdPromise = saveSessionIfNeeded();
    onFinish(sessionIdPromise);
  }, [onFinish, saveSessionIfNeeded]);

  const handleSubmit = useCallback(() => {
    if (phase !== 'child-turn') return;
    const effectVolume = voice.isPlaying()
      ? effectiveVolume * VOICE_DUCKING_FACTOR
      : effectiveVolume;

    const committed = commitConverter(converter);
    if (committed.buffer.length > 0) {
      setConverter(committed);
      setFeedback(`「${committed.buffer.toUpperCase()}」の つづきを うつか、BS で けしてね`);
      triggerShake();
      playWrongKeySound(effectVolume);
      return;
    }

    const word = convertedText(committed);
    const result = submitChildWord(game, word, dictionarySet);
    if (!result.accepted) {
      setConverter(committed);
      setFeedback(rejectMessage(result.reason, game.expectedKana));
      triggerShake();
      playWrongKeySound(effectVolume);
      return;
    }

    // 受け付けた言葉を記録し、登録済み音声があれば読み上げる
    setGame(result.state);
    setConverter(createConverter());
    setFeedback(null);
    typedKanaCountRef.current += committed.kana.length;

    const voiceDelayMs = effectVolume > 0 ? WORD_COMPLETE_SOUND_DURATION_MS : 0;
    playWordCompleteSound(effectVolume);
    void store.recordWordTyped(result.word).catch(() => {
      // 保存に失敗しても進行は止めない
    });
    if (voiceOnRef.current) {
      voice.playWord(result.word, { delayMs: voiceDelayMs });
    }

    // アプリの手番へ
    setPhase('app-thinking');
    window.clearTimeout(appTurnTimerRef.current);
    appTurnTimerRef.current = window.setTimeout(() => {
      const appResult = advanceAppTurn(
        result.state,
        dictionary,
        random,
        extraDictionaryRef.current,
      );
      setGame(appResult.state);
      if (appResult.moved) {
        setPhase(appResult.state.status === 'child-stuck' ? 'child-stuck' : 'child-turn');
        if (voiceOnRef.current) {
          voice.playWord(appResult.word);
        }
      } else {
        setPhase('app-stuck');
      }
    }, appResponseDelayMs);
  }, [
    appResponseDelayMs,
    converter,
    dictionary,
    dictionarySet,
    effectiveVolume,
    game,
    phase,
    random,
    store,
    triggerShake,
    voice,
  ]);

  const handleKeyInput = useCallback(
    (key: string) => {
      if (phase !== 'child-turn') return;
      const effectVolume = voice.isPlaying()
        ? effectiveVolume * VOICE_DUCKING_FACTOR
        : effectiveVolume;

      if (key === 'Backspace') {
        flashKey('Backspace');
        setConverter((prev) => {
          const next = backspaceConverter(prev);
          if (next !== prev) {
            setFeedback(null);
            playKeySound(effectVolume);
          }
          return next;
        });
        return;
      }

      if (key.length !== 1) return;

      const result = pressConverterKey(converter, key);
      if (result.accepted) {
        flashKey(key);
        setConverter(result.state);
        setFeedback(null);
        if (result.completed.length > 0) {
          playKanaCompleteSound(effectVolume);
        } else {
          playKeySound(effectVolume);
        }
        return;
      }

      triggerShake();
      playWrongKeySound(effectVolume);
    },
    [converter, effectiveVolume, flashKey, phase, triggerShake, voice],
  );

  const handleKeyInputRef = useRef(handleKeyInput);
  handleKeyInputRef.current = handleKeyInput;
  const handleSubmitRef = useRef(handleSubmit);
  handleSubmitRef.current = handleSubmit;

  // 物理キーボードの keydown で操作する。IME の composition 中の入力は無視する。
  useEffect(() => {
    const onCompositionStart = () => {
      isComposingRef.current = true;
    };
    const onCompositionEnd = () => {
      isComposingRef.current = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.isComposing ||
        event.keyCode === 229 ||
        event.key === 'Process' ||
        isComposingRef.current
      ) {
        return;
      }
      if (event.ctrlKey || event.metaKey || event.altKey) {
        return;
      }
      if (event.key === 'Backspace') {
        event.preventDefault();
        handleKeyInputRef.current('Backspace');
        return;
      }
      if (event.key === 'Enter') {
        if (isButtonElement(event.target) || isButtonElement(document.activeElement)) {
          return;
        }
        event.preventDefault();
        handleSubmitRef.current();
        return;
      }
      if (event.key.length === 1) {
        if (event.key === ' ') {
          if (isButtonElement(event.target) || isButtonElement(document.activeElement)) {
            return;
          }
          event.preventDefault();
        }
        handleKeyInputRef.current(event.key);
      }
    };

    window.addEventListener('compositionstart', onCompositionStart);
    window.addEventListener('compositionend', onCompositionEnd);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('compositionstart', onCompositionStart);
      window.removeEventListener('compositionend', onCompositionEnd);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, []);

  const handleToggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    void store.updateSettings({ soundOn: next }).catch(() => {
      // 保存に失敗しても画面の動作は止めない
    });
  };

  const currentKanaText = convertedText(converter);
  const canSubmit =
    phase === 'child-turn' && (converter.kana.length > 0 || converter.buffer.length > 0);
  const shakeClass =
    shakePhase === 1
      ? ' lesson-typed-shake lesson-typed-shake-a'
      : shakePhase === 2
        ? ' lesson-typed-shake lesson-typed-shake-b'
        : '';

  return (
    <main className="shiritori">
      <header className="bar shiritori-bar">
        <div className="lesson-bar-left">
          <h1>しりとり</h1>
        </div>
        <div className="lesson-bar-actions">
          <button
            type="button"
            className="button button-quiet"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleToggleSound}
          >
            {soundOn ? 'おと ON' : 'おと OFF'}
          </button>
          <button type="button" className="button" onClick={finishShiritori}>
            おわる
          </button>
        </div>
      </header>

      <section className="lesson-card shiritori-chain-panel" aria-label="ことばの つながり">
        <ol className="shiritori-chain">
          {game.chain.map((entry, idx) => {
            const isLatest = idx === game.chain.length - 1;
            const head = entry.word.slice(0, -1);
            const tail = entry.word.slice(-1);
            return (
              <li
                key={`${idx}-${entry.word}`}
                ref={isLatest ? chainEndRef : undefined}
                className={`shiritori-word-card shiritori-word-${entry.speaker}${isLatest ? ' shiritori-word-latest' : ''}`}
              >
                <span className="shiritori-word-speaker">
                  {entry.speaker === 'app' ? 'アプリ' : 'じぶん'}
                </span>
                <span className="shiritori-word-text">
                  {head}
                  <span className={isLatest ? 'shiritori-word-tail' : undefined}>{tail}</span>
                </span>
              </li>
            );
          })}
        </ol>
      </section>

      <section className={`lesson-card shiritori-input-panel${shakeClass}`} aria-label="にゅうりょく">
        {phase === 'app-stuck' || phase === 'child-stuck' ? (
          <div className="shiritori-stuck" role="status">
            <p className="shiritori-stuck-message">
              {phase === 'app-stuck'
                ? 'アプリは これいじょう おもいつかなかったよ！ たくさん つながったね。'
                : `「${game.expectedKana}」から はじまる ことばが もう ないよ！ たくさん つながったね。`}
            </p>
            <button type="button" className="button button-primary" onClick={finishShiritori}>
              おわりにする
            </button>
          </div>
        ) : (
          <>
            <div className="shiritori-prompt-row">
              <div className="shiritori-next-kana-box" aria-label="つぎの はじめのかな">
                <span className="shiritori-next-kana" data-testid="expected-kana">
                  {game.expectedKana}
                </span>
                <span className="shiritori-next-kana-caption">から はじまる ことば</span>
              </div>

              <div className="shiritori-typed-box" aria-live="polite" data-testid="shiritori-input">
                {currentKanaText && (
                  <span className="shiritori-typed-kana">{currentKanaText}</span>
                )}
                {converter.buffer && (
                  <span className="shiritori-typed-buffer" data-testid="shiritori-buffer">
                    {converter.buffer.toUpperCase()}
                  </span>
                )}
                {!currentKanaText && !converter.buffer && (
                  <span className="shiritori-placeholder">
                    {phase === 'app-thinking' ? 'アプリが かんがえているよ…' : 'ローマじで うってね'}
                  </span>
                )}
              </div>

              <button
                type="button"
                className="button shiritori-submit-button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={handleSubmit}
                disabled={!canSubmit}
              >
                けってい
              </button>
            </div>

            {feedback && (
              <p className="shiritori-feedback" role="status" data-testid="shiritori-feedback">
                {feedback}
              </p>
            )}
          </>
        )}
      </section>

      <div className="shiritori-keyboard">
        <VirtualKeyboard
          guideKey={undefined}
          nextKeys={validNextKeys}
          highlightAllNext={true}
          hintActive={false}
          showGuide={phase === 'child-turn'}
          pressedKey={pressedKey}
          onVirtualKeyPress={handleKeyInput}
        />
      </div>
    </main>
  );
}
