// ステージ定義データ（仕様 v0.3 詳細仕様 §4.2）。
// Stage A（ホーム段）と Stage B（中指の上段 +E I）のキー・導入かな・例単語を定義する。

import { splitKana } from '../core/matcher';
import { recommendedSpelling } from '../core/romajiTable';

export type StageId = 'stage-a' | 'stage-b';

export interface StageDefinition {
  readonly id: StageId;
  /** 表示用のステージ記号（A / B）。 */
  readonly code: string;
  /** ステージ名。 */
  readonly title: string;
  /** このステージで新しく解放されるキー（小文字）。 */
  readonly newKeys: readonly string[];
  /** このステージで新しく導入されるかな。 */
  readonly introducedKana: readonly string[];
  /** 仕様 §4.2 に挙げられた例単語。 */
  readonly exampleWords: readonly string[];
  /** 導入かなをまんべんなく練習するための単語（到達ステージ内のかなのみで構成）。 */
  readonly practiceWords: readonly string[];
}

export const STAGE_A: StageDefinition = {
  id: 'stage-a',
  code: 'A',
  title: 'ホームポジション',
  newKeys: ['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l'],
  introducedKana: ['あ', 'か', 'さ', 'だ', 'が', 'は'],
  exampleWords: ['あさ', 'かさ', 'はは', 'さか', 'あか'],
  practiceWords: ['はだ', 'さが'],
};

export const STAGE_B: StageDefinition = {
  id: 'stage-b',
  code: 'B',
  title: '中指の上段',
  newKeys: ['e', 'i'],
  introducedKana: ['い', 'え', 'き', 'し', 'ひ', 'ぎ', 'じ', 'で', 'け', 'せ', 'へ', 'げ'],
  exampleWords: ['いえ', 'かい', 'しか', 'せかい', 'はし', 'えき', 'けしき', 'かげ'],
  practiceWords: ['ひげ', 'かぎ', 'きじ', 'かえで', 'へい', 'あさひ', 'いけ', 'がけ'],
};

/** 遊ぶ順に並べたステージ一覧。 */
export const STAGES: readonly StageDefinition[] = [STAGE_A, STAGE_B];

/** isLessonUnlocked に渡す、遊ぶ順のレッスン ID 一覧。 */
export const LESSON_IDS: readonly StageId[] = STAGES.map((stage) => stage.id);

export function getStage(stageId: StageId): StageDefinition {
  const found = STAGES.find((stage) => stage.id === stageId);
  if (!found) {
    throw new Error(`未知のステージです: ${stageId}`);
  }
  return found;
}

/** 指定ステージまでに解放済みのキー集合（累積）。 */
export function unlockedKeysUpTo(stageId: StageId): ReadonlySet<string> {
  const keys = new Set<string>();
  for (const stage of STAGES) {
    for (const key of stage.newKeys) {
      keys.add(key);
    }
    if (stage.id === stageId) return keys;
  }
  throw new Error(`未知のステージです: ${stageId}`);
}

/** 指定ステージまでに打てるかな集合（累積）。 */
export function allowedKanaUpTo(stageId: StageId): ReadonlySet<string> {
  const kana = new Set<string>();
  for (const stage of STAGES) {
    for (const unit of stage.introducedKana) {
      kana.add(unit);
    }
    if (stage.id === stageId) return kana;
  }
  throw new Error(`未知のステージです: ${stageId}`);
}

/** 指定ステージより前に導入済みのかな集合（既習かな）。Stage A では空。 */
export function priorKanaBefore(stageId: StageId): ReadonlySet<string> {
  const kana = new Set<string>();
  for (const stage of STAGES) {
    if (stage.id === stageId) return kana;
    for (const unit of stage.introducedKana) {
      kana.add(unit);
    }
  }
  throw new Error(`未知のステージです: ${stageId}`);
}

/** 指定ステージの「打てるかな」と「解放済みキー」の範囲内でお題が打てるか検証する。 */
export function isWordAllowedInStage(word: string, stageId: StageId): boolean {
  if (word.length === 0) return false;
  const allowedKana = allowedKanaUpTo(stageId);
  const unlockedKeys = unlockedKeysUpTo(stageId);
  let units: string[];
  try {
    units = splitKana(word);
  } catch {
    return false;
  }
  return units.every((unit) => {
    if (!allowedKana.has(unit)) return false;
    const spelling = recommendedSpelling(unit);
    if (!spelling) return false;
    return [...spelling].every((ch) => unlockedKeys.has(ch));
  });
}

/**
 * 次に遊ぶべき既定のステージ ID を返す。
 * 解放済みで未クリアの先頭ステージを優先し、すべてクリア済みなら最後のステージを返す。
 */
export function nextRecommendedStage(clearedIds: ReadonlySet<string>): StageId {
  for (const stage of STAGES) {
    if (!clearedIds.has(stage.id)) {
      return stage.id;
    }
  }
  return STAGES[STAGES.length - 1].id;
}
