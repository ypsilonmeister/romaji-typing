// 進捗データ層の入口。画面からはここを import する。

export {
  applyKanaAttempt,
  frequencyWeight,
  FREQUENCY_WEIGHTS,
  kanaStatus,
  MASTERY_STREAK,
  STRUGGLING_STREAK,
  type KanaAttempt,
  type KanaStatus,
} from './mastery';
export { createProgressStore, DEFAULT_SETTINGS, progressStore, type ProgressStore } from './store';
export type {
  KanaProgress,
  LessonProgress,
  SelfReport,
  SessionRecord,
  Settings,
  WordProgress,
} from './types';
export { isLessonUnlocked } from './unlock';
