import { useCallback, useEffect, useState } from 'react';
import { voicePlayer, type VoicePlayer } from './audio/voice';
import { getThemePack, type ThemeId } from './data/wordPacks';
import { hasSeenIntro, markIntroSeen } from './introStorage';
import { generateLesson, nextRecommendedStage, type StageId } from './lesson';
import { progressStore, type KanaProgress, type ProgressStore } from './progress';
import type { LessonMode, Screen } from './screen';
import { EndScreen } from './screens/EndScreen';
import { IntroScreen } from './screens/IntroScreen';
import { LessonScreen } from './screens/LessonScreen';
import { ModeSelectScreen } from './screens/ModeSelectScreen';
import { ParentGateScreen } from './screens/ParentGateScreen';
import { ShiritoriScreen } from './screens/ShiritoriScreen';
import { ZukanScreen } from './screens/ZukanScreen';

export interface AppProps {
  readonly store?: ProgressStore;
  readonly voice?: VoicePlayer;
}

export function App({ store = progressStore, voice = voicePlayer }: AppProps = {}) {
  const [screen, setScreen] = useState<Screen>(() => ({ name: hasSeenIntro() ? 'menu' : 'intro' }));
  const [clearedLessonIds, setClearedLessonIds] = useState<ReadonlySet<string>>(() => new Set());
  const [kanaProgress, setKanaProgress] = useState<readonly KanaProgress[]>([]);

  // 起動時に保存済みの解放状態とかな進捗を読み込む（IndexedDB が使えない環境では空のまま進める）。
  useEffect(() => {
    let active = true;
    Promise.all([store.getClearedLessonIds(), store.getAllKanaProgress()])
      .then(([cleared, kana]) => {
        if (!active) return;
        setClearedLessonIds((prev) => {
          if (cleared.size === 0) return prev;
          if (prev.size === 0) return cleared;
          let changed = false;
          const merged = new Set(prev);
          for (const id of cleared) {
            if (!merged.has(id)) {
              merged.add(id);
              changed = true;
            }
          }
          return changed ? merged : prev;
        });
        setKanaProgress((prev) => (prev.length === 0 ? kana : prev));
      })
      .catch(() => {
        // 保存先が使えない環境でもそのまま遊べるようにする
      });
    return () => {
      active = false;
    };
  }, [store]);

  const toMenu = useCallback(() => {
    setScreen({ name: 'menu' });
  }, []);

  const startStage = useCallback(
    (stageId: StageId) => {
      const lesson = generateLesson(stageId, { kanaProgress });
      setScreen({ name: 'lesson', mode: 'stage', lesson });
    },
    [kanaProgress],
  );

  const startTheme = useCallback((themeId: ThemeId) => {
    setScreen({ name: 'lesson', mode: 'theme', themeId });
  }, []);

  const startLesson = useCallback(
    (mode: LessonMode) => {
      if (mode === 'stage') {
        startStage(nextRecommendedStage(clearedLessonIds));
      } else {
        setScreen({ name: 'lesson', mode });
      }
    },
    [clearedLessonIds, startStage],
  );

  const handleLessonCleared = useCallback(
    (lessonId: string) => {
      setClearedLessonIds((prev) => {
        if (prev.has(lessonId)) return prev;
        const next = new Set(prev);
        next.add(lessonId);
        return next;
      });
      void store
        .getAllKanaProgress()
        .then((kana) => setKanaProgress(kana))
        .catch(() => {
          // 取得できなくても進行は止めない
        });
    },
    [store],
  );

  switch (screen.name) {
    case 'intro':
      return (
        <IntroScreen
          onStart={() => {
            markIntroSeen();
            toMenu();
          }}
        />
      );
    case 'menu':
      return (
        <ModeSelectScreen
          clearedLessonIds={clearedLessonIds}
          onStartLesson={startLesson}
          onStartStage={startStage}
          onStartTheme={startTheme}
          onStartShiritori={() => setScreen({ name: 'shiritori' })}
          onOpenZukan={() => setScreen({ name: 'zukan' })}
          onOpenParentGate={() => setScreen({ name: 'parentGate' })}
        />
      );
    case 'shiritori':
      return (
        <ShiritoriScreen
          store={store}
          voice={voice}
          onFinish={(sessionIdPromise) => setScreen({ name: 'end', sessionIdPromise })}
        />
      );
    case 'lesson': {
      const themePack = screen.themeId ? getThemePack(screen.themeId) : undefined;
      return (
        <LessonScreen
          mode={screen.mode}
          words={themePack?.words.map((word) => word.kana)}
          prompts={screen.lesson?.prompts}
          lessonId={screen.lesson?.lessonId}
          stageLabel={
            screen.lesson
              ? `Stage ${screen.lesson.stage.code}: ${screen.lesson.stage.title}`
              : themePack?.name
          }
          store={store}
          voice={voice}
          onLessonCleared={handleLessonCleared}
          onFinish={(sessionIdPromise) => setScreen({ name: 'end', sessionIdPromise })}
        />
      );
    }
    case 'end':
      return (
        <EndScreen
          sessionIdPromise={screen.sessionIdPromise}
          onBackToStart={toMenu}
          store={store}
          voice={voice}
        />
      );
    case 'zukan':
      return <ZukanScreen onBack={toMenu} store={store} />;
    case 'parentGate':
      return <ParentGateScreen onBack={toMenu} store={store} voice={voice} />;
  }
}
