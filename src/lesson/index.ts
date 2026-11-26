// レッスンデータと生成の入口。

export {
  generateLesson,
  MAX_LESSON_PROMPTS,
  MIN_LESSON_PROMPTS,
  type GeneratedLesson,
  type GenerateLessonOptions,
  type LessonPrompt,
} from './lessonGenerator';
export {
  allowedKanaUpTo,
  getStage,
  isWordAllowedInStage,
  LESSON_IDS,
  nextRecommendedStage,
  priorKanaBefore,
  STAGE_A,
  STAGE_B,
  STAGES,
  unlockedKeysUpTo,
  type StageDefinition,
  type StageId,
} from './stages';
