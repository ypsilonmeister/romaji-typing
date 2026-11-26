import { useCallback, useEffect, useRef, useState } from 'react';
import {
  playKanaCompleteSound,
  playKeySound,
  playWordCompleteSound,
  playWrongKeySound,
} from '../audio/sound';
import { HandDiagram } from '../components/HandDiagram';
import { VirtualKeyboard } from '../components/VirtualKeyboard';
import {
  backspace,
  candidates,
  createMatcher,
  guideKey,
  isComplete,
  nextKeys,
  pressKey,
  type MatcherState,
} from '../core/matcher';
import { THEME_PACKS } from '../data/wordPacks';
import { fingerOfKey } from '../lesson/keyboardLayout';
import type { LessonPrompt } from '../lesson';
import { SAMPLE_WORDS } from '../lesson/sampleWords';
import { DEFAULT_SETTINGS, progressStore, type ProgressStore } from '../progress';
import type { LessonMode } from '../screen';

const TITLES: Record<LessonMode, string> = {
  stage: 'レッスン',
  theme: 'テーマで あそぶ',
};

const DEFAULT_THEME_WORDS: readonly string[] = THEME_PACKS[0].words
  .slice(0, 10)
  .map((word) => word.kana);

const DEFAULT_HINT_DELAY_MS = 5000;
const DEFAULT_WORD_TRANSITION_MS = 550;
const KEY_FLASH_MS = 140;
const SHAKE_MS = 320;

export interface LessonScreenProps {
  readonly mode: LessonMode;
  readonly onFinish: (sessionIdPromise?: Promise<number | undefined>) => void;
  /** 出題する単語リスト。prompts が指定されていないときに使う。省略時は組み込みのサンプル単語（theme 時は単語パック）を使う。 */
  readonly words?: readonly string[];
  /** 案内有無を含むレッスンお題リスト（Issue #4）。指定時は words より優先する。 */
  readonly prompts?: readonly LessonPrompt[];
  /** クリアを記録するレッスン ID（例: 'stage-a'）。全問打ち切ったときに解放・保存する。 */
  readonly lessonId?: string;
  /** ヘッダーに添えるステージ名など。 */
  readonly stageLabel?: string;
  /** 通常のキー案内を出すか（既定 true）。prompts の各お題の showGuide と組み合わせて使う。 */
  readonly showGuide?: boolean;
  /** 無入力から自動ヒントまでの時間（ミリ秒）。既定 5000ms。 */
  readonly hintDelayMs?: number;
  /** 単語完成から次のお題へ進むまでの間（ミリ秒）。既定 550ms。 */
  readonly wordTransitionMs?: number;
  /** 進捗の保存先。テストで差し替えられる。 */
  readonly store?: Pick<
    ProgressStore,
    | 'getSettings'
    | 'updateSettings'
    | 'recordWordTyped'
    | 'addSession'
    | 'recordKanaAttempt'
    | 'markLessonCleared'
  >;
  /** 全問打ち切ってレッスンをクリアしたときのコールバック。 */
  readonly onLessonCleared?: (lessonId: string) => void;
}

function remainingGuideSpelling(state: MatcherState): string {
  const first = candidates(state)[0];
  if (!first) return '';
  if (state.typed === '' && first.acceptOnly) return '';
  if (first.romaji.length > state.typed.length) {
    return first.romaji.slice(state.typed.length);
  }
  return guideKey(state) ?? '';
}

function guideNextKeys(state: MatcherState): string[] {
  if (state.typed !== '') return nextKeys(state);
  const keys = candidates(state)
    .filter((option) => !option.acceptOnly)
    .flatMap((option) =>
      option.romaji.length > 0 ? [option.romaji[0]] : (option.followers ?? []),
    );
  return [...new Set(keys)];
}

function isButtonElement(target: EventTarget | null): boolean {
  return target instanceof Element && target.closest('button, [role="button"]') !== null;
}

export function LessonScreen({
  mode,
  onFinish,
  words,
  prompts,
  lessonId,
  stageLabel,
  showGuide = true,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  wordTransitionMs = DEFAULT_WORD_TRANSITION_MS,
  store = progressStore,
  onLessonCleared,
}: LessonScreenProps) {
  const defaultWords = mode === 'theme' ? DEFAULT_THEME_WORDS : SAMPLE_WORDS;
  const fallbackWords = words && words.length > 0 ? words : defaultWords;
  const activePrompts: readonly LessonPrompt[] =
    prompts && prompts.length > 0
      ? prompts
      : fallbackWords.map((text) => ({
          text,
          showGuide: true,
          kind: 'new' as const,
          isWord: true,
        }));

  const [wordIndex, setWordIndex] = useState(0);
  const [matcher, setMatcher] = useState<MatcherState>(() => createMatcher(activePrompts[0].text));
  const [hintActive, setHintActive] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [shakePhase, setShakePhase] = useState<0 | 1 | 2>(0);
  const [soundOn, setSoundOn] = useState(DEFAULT_SETTINGS.soundOn);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SETTINGS.soundVolume);

  const isComposingRef = useRef(false);
  const finishedRef = useRef(false);
  const hintTimerRef = useRef<number | undefined>(undefined);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const shakeTimerRef = useRef<number | undefined>(undefined);
  const advanceTimerRef = useRef<number | undefined>(undefined);
  const hintUsedForKanaRef = useRef(false);
  const stalledForKanaRef = useRef(false);
  const sessionStartRef = useRef<Date>(new Date());
  const typedKanaCountRef = useRef(0);
  const sessionSavedRef = useRef(false);
  const sessionIdPromiseRef = useRef<Promise<number | undefined> | undefined>(undefined);
  const lessonClearedRef = useRef(false);

  // 保存済みの音設定を読み込む（IndexedDB が使えない環境では既定値のまま進める）。
  useEffect(() => {
    let cancelled = false;
    store
      .getSettings()
      .then((settings) => {
        if (!cancelled) {
          setSoundOn(settings.soundOn);
          setSoundVolume(settings.soundVolume);
        }
      })
      .catch(() => {
        // 既定値のまま続行
      });
    return () => {
      cancelled = true;
    };
  }, [store]);

  // クリーンアップ
  useEffect(() => {
    return () => {
      window.clearTimeout(hintTimerRef.current);
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(shakeTimerRef.current);
      window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const currentPrompt = activePrompts[wordIndex] ?? activePrompts[0];
  const effectiveShowGuide = showGuide && currentPrompt.showGuide;
  const wordCompleted = isComplete(matcher);
  const currentGuideKey = guideKey(matcher);
  const currentNextKeys = guideNextKeys(matcher);
  const activeFinger = effectiveShowGuide || hintActive ? fingerOfKey(currentGuideKey) : undefined;
  const effectiveVolume = soundOn ? soundVolume : 0;

  // 5秒間入力が止まったら次のキーを自動で光らせる（仕様 v0.3 §2.4）。
  useEffect(() => {
    window.clearTimeout(hintTimerRef.current);
    if (wordCompleted || hintActive) return;

    hintTimerRef.current = window.setTimeout(() => {
      stalledForKanaRef.current = true;
      setHintActive(true);
    }, hintDelayMs);

    return () => {
      window.clearTimeout(hintTimerRef.current);
    };
  }, [wordIndex, matcher.index, matcher.typed, wordCompleted, hintActive, hintDelayMs]);

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

  const markLessonClearedIfNeeded = useCallback(() => {
    if (!lessonId || lessonClearedRef.current) return;
    lessonClearedRef.current = true;
    void store.markLessonCleared(lessonId).catch(() => {
      // 保存に失敗しても画面遷移は止めない
    });
    onLessonCleared?.(lessonId);
  }, [lessonId, onLessonCleared, store]);

  const finishLesson = useCallback(() => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    window.clearTimeout(advanceTimerRef.current);
    const sessionIdPromise = saveSessionIfNeeded();
    onFinish(sessionIdPromise);
  }, [onFinish, saveSessionIfNeeded]);

  const scheduleNextWord = useCallback(
    (completedIndex: number) => {
      window.clearTimeout(advanceTimerRef.current);
      const nextIndex = completedIndex + 1;
      if (nextIndex >= activePrompts.length) {
        // 最終問を打ち切った時点でクリアとセッション記録を確定し、
        // 遷移待ちの間に「おわる」を押しても解放状態が失われないようにする。
        saveSessionIfNeeded();
        markLessonClearedIfNeeded();
      }
      advanceTimerRef.current = window.setTimeout(() => {
        if (nextIndex < activePrompts.length) {
          hintUsedForKanaRef.current = false;
          stalledForKanaRef.current = false;
          setWordIndex(nextIndex);
          setMatcher(createMatcher(activePrompts[nextIndex].text));
          setHintActive(false);
        } else {
          finishLesson();
        }
      }, wordTransitionMs);
    },
    [activePrompts, finishLesson, markLessonClearedIfNeeded, saveSessionIfNeeded, wordTransitionMs],
  );

  const handleKeyInput = useCallback(
    (key: string) => {
      if (key === 'Backspace') {
        flashKey('Backspace');
        setMatcher((prev) => {
          if (isComplete(prev)) return prev;
          const next = backspace(prev);
          if (next !== prev) {
            setHintActive(false);
            playKeySound(effectiveVolume);
          }
          return next;
        });
        return;
      }

      if (key.length !== 1) return;

      const result = pressKey(matcher, key);
      if (result.accepted) {
        flashKey(key);
        setMatcher(result.state);
        setHintActive(false);

        if (result.completed.length > 0) {
          const hintUsed = hintUsedForKanaRef.current;
          const stalled = stalledForKanaRef.current;
          hintUsedForKanaRef.current = false;
          stalledForKanaRef.current = false;
          typedKanaCountRef.current += result.completed.length;
          for (const item of result.completed) {
            void store
              .recordKanaAttempt(item.kana, {
                guided: effectiveShowGuide,
                hintUsed,
                stalled,
              })
              .catch(() => {
                // 保存に失敗してもれんしゅうは止めない
              });
          }
        }

        if (isComplete(result.state)) {
          const completedPrompt = activePrompts[wordIndex];
          if (completedPrompt.isWord !== false) {
            void store.recordWordTyped(completedPrompt.text).catch(() => {
              // 保存に失敗しても画面の動作は止めない
            });
          }
          playWordCompleteSound(effectiveVolume);
          scheduleNextWord(wordIndex);
        } else if (result.completed.length > 0) {
          playKanaCompleteSound(effectiveVolume);
        } else {
          playKeySound(effectiveVolume);
        }
        return;
      }

      if (result.absorbed) {
        setMatcher(result.state);
        return;
      }

      if (result.state.mistakeCount > matcher.mistakeCount) {
        setMatcher(result.state);
        setHintActive(true);
        triggerShake();
        playWrongKeySound(effectiveVolume);
      }
    },
    [
      activePrompts,
      effectiveShowGuide,
      effectiveVolume,
      flashKey,
      matcher,
      scheduleNextWord,
      store,
      triggerShake,
      wordIndex,
    ],
  );

  const handleKeyInputRef = useRef(handleKeyInput);
  handleKeyInputRef.current = handleKeyInput;

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

  const remainingGuide = remainingGuideSpelling(matcher);
  const showRemainingGuide = (effectiveShowGuide || hintActive) && remainingGuide.length > 0;
  const shakeClass =
    shakePhase === 1
      ? ' lesson-typed-shake lesson-typed-shake-a'
      : shakePhase === 2
        ? ' lesson-typed-shake lesson-typed-shake-b'
        : '';

  return (
    <main className="lesson">
      <header className="bar lesson-bar">
        <div className="lesson-bar-left">
          <h1>{TITLES[mode]}</h1>
          {stageLabel && <span className="lesson-stage-badge">{stageLabel}</span>}
          <span
            className="lesson-progress"
            aria-label={`おだい ${wordIndex + 1} / ${activePrompts.length}`}
          >
            {wordIndex + 1} / {activePrompts.length}
          </span>
        </div>
        <div className="lesson-bar-actions">
          <button
            type="button"
            className="button button-hint"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => {
              hintUsedForKanaRef.current = true;
              setHintActive(true);
            }}
            disabled={wordCompleted}
          >
            ヒント
          </button>
          <button
            type="button"
            className="button button-quiet"
            onMouseDown={(event) => event.preventDefault()}
            onClick={handleToggleSound}
          >
            {soundOn ? 'おと ON' : 'おと OFF'}
          </button>
          <button type="button" className="button" onClick={finishLesson}>
            おわる
          </button>
        </div>
      </header>

      <section
        className={`lesson-card lesson-prompt${wordCompleted ? ' lesson-prompt-done' : ''}`}
        aria-label="おだい"
      >
        <div className="prompt-kana-list" aria-live="polite">
          {matcher.units.map((unit, index) => {
            const stateClass =
              index < matcher.index
                ? 'prompt-kana-done'
                : index === matcher.index
                  ? 'prompt-kana-current'
                  : 'prompt-kana-upcoming';
            return (
              <span key={`${wordIndex}-${index}`} className={`prompt-kana ${stateClass}`}>
                {unit.kana}
              </span>
            );
          })}
        </div>
        {wordCompleted && (
          <p className="prompt-status" role="status">
            できた！
          </p>
        )}
      </section>

      <section
        className={`lesson-card lesson-typed${shakeClass}`}
        aria-label="うった もじ"
      >
        <div className="typed-romaji" aria-live="polite">
          {matcher.completed.map((item, idx) => (
            <span key={idx} className="romaji-done">
              {item.romaji.toUpperCase()}
            </span>
          ))}
          {!wordCompleted && (
            <span className="romaji-active-group">
              {matcher.typed && (
                <span className="romaji-typed">{matcher.typed.toUpperCase()}</span>
              )}
              {showRemainingGuide && (
                <span className={`romaji-guide${hintActive ? ' romaji-guide-hint' : ''}`}>
                  {remainingGuide.toUpperCase()}
                </span>
              )}
            </span>
          )}
        </div>
        {hintActive && currentGuideKey && !wordCompleted && (
          <div className="hint-badge" role="status" data-testid="hint-indicator">
            つぎの キー: <kbd>{currentGuideKey.toUpperCase()}</kbd>
          </div>
        )}
      </section>

      <VirtualKeyboard
        guideKey={currentGuideKey}
        nextKeys={currentNextKeys}
        hintActive={hintActive}
        showGuide={effectiveShowGuide}
        pressedKey={pressedKey}
        onVirtualKeyPress={handleKeyInput}
      />

      <HandDiagram activeFinger={activeFinger} hintActive={hintActive} />
    </main>
  );
}
