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
import { fingerOfKey } from '../lesson/keyboardLayout';
import { SAMPLE_WORDS } from '../lesson/sampleWords';
import { DEFAULT_SETTINGS, progressStore } from '../progress';
import type { LessonMode } from '../screen';

const TITLES: Record<LessonMode, string> = {
  stage: 'レッスン',
  theme: 'テーマで あそぶ',
};

const DEFAULT_HINT_DELAY_MS = 5000;
const DEFAULT_WORD_TRANSITION_MS = 550;
const KEY_FLASH_MS = 140;
const SHAKE_MS = 320;

export interface LessonScreenProps {
  readonly mode: LessonMode;
  readonly onFinish: () => void;
  /** 出題する単語リスト。省略時は組み込みのサンプル単語を使う（本実装は Issue #4）。 */
  readonly words?: readonly string[];
  /** 通常のキー案内を出すか（既定 true）。 */
  readonly showGuide?: boolean;
  /** 無入力から自動ヒントまでの時間（ミリ秒）。既定 5000ms。 */
  readonly hintDelayMs?: number;
  /** 単語完成から次のお題へ進むまでの間（ミリ秒）。既定 550ms。 */
  readonly wordTransitionMs?: number;
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
  words = SAMPLE_WORDS,
  showGuide = true,
  hintDelayMs = DEFAULT_HINT_DELAY_MS,
  wordTransitionMs = DEFAULT_WORD_TRANSITION_MS,
}: LessonScreenProps) {
  const activeWords = words.length > 0 ? words : SAMPLE_WORDS;

  const [wordIndex, setWordIndex] = useState(0);
  const [matcher, setMatcher] = useState<MatcherState>(() => createMatcher(activeWords[0]));
  const [hintActive, setHintActive] = useState(false);
  const [pressedKey, setPressedKey] = useState<string | null>(null);
  const [shakePhase, setShakePhase] = useState<0 | 1 | 2>(0);
  const [soundOn, setSoundOn] = useState(DEFAULT_SETTINGS.soundOn);
  const [soundVolume, setSoundVolume] = useState(DEFAULT_SETTINGS.soundVolume);

  const isComposingRef = useRef(false);
  const hintTimerRef = useRef<number | undefined>(undefined);
  const flashTimerRef = useRef<number | undefined>(undefined);
  const shakeTimerRef = useRef<number | undefined>(undefined);
  const advanceTimerRef = useRef<number | undefined>(undefined);

  // 保存済みの音設定を読み込む（IndexedDB が使えない環境では既定値のまま進める）。
  useEffect(() => {
    let cancelled = false;
    progressStore
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
  }, []);

  // クリーンアップ
  useEffect(() => {
    return () => {
      window.clearTimeout(hintTimerRef.current);
      window.clearTimeout(flashTimerRef.current);
      window.clearTimeout(shakeTimerRef.current);
      window.clearTimeout(advanceTimerRef.current);
    };
  }, []);

  const wordCompleted = isComplete(matcher);
  const currentGuideKey = guideKey(matcher);
  const currentNextKeys = guideNextKeys(matcher);
  const activeFinger = showGuide || hintActive ? fingerOfKey(currentGuideKey) : undefined;
  const effectiveVolume = soundOn ? soundVolume : 0;

  // 5秒間入力が止まったら次のキーを自動で光らせる（仕様 v0.3 §2.4）。
  useEffect(() => {
    window.clearTimeout(hintTimerRef.current);
    if (wordCompleted || hintActive) return;

    hintTimerRef.current = window.setTimeout(() => {
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

  const scheduleNextWord = useCallback(
    (completedIndex: number) => {
      window.clearTimeout(advanceTimerRef.current);
      advanceTimerRef.current = window.setTimeout(() => {
        const nextIndex = completedIndex + 1;
        if (nextIndex < activeWords.length) {
          setWordIndex(nextIndex);
          setMatcher(createMatcher(activeWords[nextIndex]));
          setHintActive(false);
        } else {
          onFinish();
        }
      }, wordTransitionMs);
    },
    [activeWords, onFinish, wordTransitionMs],
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

        if (isComplete(result.state)) {
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
    [effectiveVolume, flashKey, matcher, scheduleNextWord, triggerShake, wordIndex],
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
    void progressStore.updateSettings({ soundOn: next }).catch(() => {
      // 保存に失敗しても画面の動作は止めない
    });
  };

  const remainingGuide = remainingGuideSpelling(matcher);
  const showRemainingGuide = (showGuide || hintActive) && remainingGuide.length > 0;
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
          <span className="lesson-progress" aria-label={`おだい ${wordIndex + 1} / ${activeWords.length}`}>
            {wordIndex + 1} / {activeWords.length}
          </span>
        </div>
        <div className="lesson-bar-actions">
          <button
            type="button"
            className="button button-hint"
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => setHintActive(true)}
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
          <button type="button" className="button" onClick={onFinish}>
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
        showGuide={showGuide}
        pressedKey={pressedKey}
        onVirtualKeyPress={handleKeyInput}
      />

      <HandDiagram activeFinger={activeFinger} hintActive={hintActive} />
    </main>
  );
}
