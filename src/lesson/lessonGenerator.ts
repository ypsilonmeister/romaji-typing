// スパイラル方式のレッスン生成（仕様 v0.3 詳細仕様 §4.1・§4.3）。
// 1レッスン 8〜12問。新しい要素は案内あり、既習要素は案内なしで混ぜて出題する。

import { splitKana } from '../core/matcher';
import { frequencyWeight, type KanaProgress } from '../progress';
import { getStage, STAGES, type StageDefinition, type StageId } from './stages';

export const MIN_LESSON_PROMPTS = 8;
export const MAX_LESSON_PROMPTS = 12;

export interface LessonPrompt {
  /** 出題するかな文字列（1文字または短い単語）。 */
  readonly text: string;
  /** 最初からキー案内を表示するか（新規要素は true、既習復習は false）。 */
  readonly showGuide: boolean;
  /** 新規導入か既習の復習か。 */
  readonly kind: 'new' | 'review';
}

export interface GeneratedLesson {
  readonly lessonId: StageId;
  readonly stage: StageDefinition;
  readonly prompts: readonly LessonPrompt[];
}

export interface GenerateLessonOptions {
  /** 1レッスンの出題数（8〜12 に丸める）。省略時はステージに応じた既定数（10〜11）。 */
  readonly promptCount?: number;
  /** かなごとの進捗。既習要素の復習頻度（定着度・詰まり）の重み付けに使う。 */
  readonly kanaProgress?: readonly KanaProgress[];
  /** テスト等で決定的にするための乱数関数（0 <= r < 1）。 */
  readonly random?: () => number;
}

function clampPromptCount(count: number): number {
  return Math.max(MIN_LESSON_PROMPTS, Math.min(MAX_LESSON_PROMPTS, Math.round(count)));
}

function wordWeight(word: string, progressMap: ReadonlyMap<string, KanaProgress>): number {
  const units = splitKana(word);
  if (units.length === 0) return 1;
  const total = units.reduce((sum, unit) => sum + frequencyWeight(progressMap.get(unit)), 0);
  return total / units.length;
}

/** 重み付き非復元抽出。 */
function pickWeightedDistinct(
  candidates: readonly string[],
  count: number,
  progressMap: ReadonlyMap<string, KanaProgress>,
  random: () => number,
): string[] {
  const remaining = [...candidates];
  const picked: string[] = [];

  while (picked.length < count && remaining.length > 0) {
    const weights = remaining.map((word) => wordWeight(word, progressMap));
    const totalWeight = weights.reduce((sum, w) => sum + w, 0);
    let threshold = random() * totalWeight;
    let chosenIndex = remaining.length - 1;
    for (let i = 0; i < remaining.length; i++) {
      threshold -= weights[i];
      if (threshold <= 0) {
        chosenIndex = i;
        break;
      }
    }
    picked.push(remaining[chosenIndex]);
    remaining.splice(chosenIndex, 1);
  }

  return picked;
}

/**
 * 新規ステージの導入かなをできるだけ少ない語数で網羅するように選ぶ（貪欲被覆）。
 * 選んだ語数が limit に満たない場合は、残りの候補語から補う。
 */
function pickCoveringWords(
  stage: StageDefinition,
  limit: number,
  progressMap: ReadonlyMap<string, KanaProgress>,
  random: () => number,
): string[] {
  const pool = [...new Set([...stage.exampleWords, ...stage.practiceWords])];
  const uncovered = new Set(stage.introducedKana);
  const picked: string[] = [];
  const used = new Set<string>();

  while (picked.length < limit && uncovered.size > 0) {
    let bestGain = 0;
    let bestCandidates: string[] = [];

    for (const word of pool) {
      if (used.has(word)) continue;
      const units = new Set(splitKana(word));
      let gain = 0;
      for (const unit of units) {
        if (uncovered.has(unit)) gain++;
      }
      if (gain > bestGain) {
        bestGain = gain;
        bestCandidates = [word];
      } else if (gain === bestGain && gain > 0) {
        bestCandidates.push(word);
      }
    }

    if (bestGain === 0) break;

    // 同じ被覆数なら進捗の重み付きで選ぶ。
    const [chosen] = pickWeightedDistinct(bestCandidates, 1, progressMap, random);
    picked.push(chosen);
    used.add(chosen);
    for (const unit of splitKana(chosen)) {
      uncovered.delete(unit);
    }
  }

  // 万一単語だけで未カバーのかなが残れば、単独かなで補う。
  for (const kana of uncovered) {
    if (picked.length >= limit) break;
    picked.push(kana);
  }

  // 枠が余っていれば、残りのステージ単語から補う。
  if (picked.length < limit) {
    const rest = pool.filter((word) => !used.has(word));
    picked.push(...pickWeightedDistinct(rest, limit - picked.length, progressMap, random));
  }

  return picked;
}

/**
 * 新規（案内あり）と既習（案内なし）をスパイラル状に交互配置する。
 * 先頭は必ず新規要素（最初の2問を新規で始め、その後は既習を均等に差し込む）。
 */
function interleaveSpiral(
  newPrompts: readonly LessonPrompt[],
  reviewPrompts: readonly LessonPrompt[],
): LessonPrompt[] {
  if (reviewPrompts.length === 0) return [...newPrompts];
  if (newPrompts.length === 0) return [...reviewPrompts];

  const result: LessonPrompt[] = [];
  const leadCount = Math.min(2, newPrompts.length);
  for (let i = 0; i < leadCount; i++) {
    result.push(newPrompts[i]);
  }

  const remainingNew = newPrompts.slice(leadCount);
  const totalSlots = remainingNew.length + reviewPrompts.length;
  let newIdx = 0;
  let reviewIdx = 0;

  for (let slot = 0; slot < totalSlots; slot++) {
    // 均等な間隔で review を差し込む。
    const shouldPlaceReview =
      reviewIdx < reviewPrompts.length &&
      (newIdx >= remainingNew.length ||
        Math.floor((slot * reviewPrompts.length) / totalSlots) >= reviewIdx);

    if (shouldPlaceReview) {
      result.push(reviewPrompts[reviewIdx++]);
    } else {
      result.push(remainingNew[newIdx++]);
    }
  }

  return result;
}

/**
 * 指定ステージのレッスン（8〜12問）を生成する。
 *
 * - Stage A（既習ステージなし）: 新規かな 6文字を案内ありで導入し、続いてホーム段の単語を案内ありで練習する。
 * - Stage B（Stage A が既習）: Stage B の新規かなを網羅する単語（案内あり）と、
 *   Stage A の既習単語（案内なし）をスパイラル方式で混ぜて出題する。
 */
export function generateLesson(
  stageId: StageId,
  options: GenerateLessonOptions = {},
): GeneratedLesson {
  const stage = getStage(stageId);
  const stageIndex = STAGES.findIndex((s) => s.id === stageId);
  const priorStages = STAGES.slice(0, stageIndex);
  const random = options.random ?? Math.random;
  const progressMap = new Map<string, KanaProgress>(
    (options.kanaProgress ?? []).map((item) => [item.kana, item]),
  );

  // Stage A は 10問、Stage B は全12かなの導入＋既習復習3問が余裕で収まる 11問を既定とする。
  const defaultCount = priorStages.length === 0 ? 10 : 11;
  const totalCount = clampPromptCount(options.promptCount ?? defaultCount);

  if (priorStages.length === 0) {
    // Stage A: 新規かなを1文字ずつ導入し、残りをステージ単語で埋める（すべて案内あり）。
    const introKana = stage.introducedKana.slice(0, totalCount);
    const wordPool = [...new Set([...stage.exampleWords, ...stage.practiceWords])];
    const wordCount = Math.max(0, totalCount - introKana.length);
    const words = pickWeightedDistinct(wordPool, wordCount, progressMap, random);

    const prompts: LessonPrompt[] = [...introKana, ...words].map((text) => ({
      text,
      showGuide: true,
      kind: 'new',
    }));

    return { lessonId: stage.id, stage, prompts };
  }

  // Stage B 以降: 新規（案内あり）と既習（案内なし）を混ぜる。
  const reviewPool = [
    ...new Set(priorStages.flatMap((prior) => [...prior.exampleWords, ...prior.practiceWords])),
  ];

  // 新規かなを網羅しつつ、最低2問は既習（案内なし）を混ぜる。
  const targetReviewCount = Math.max(2, Math.round(totalCount * 0.25));
  const maxNewCount = totalCount - targetReviewCount;
  const newWords = pickCoveringWords(stage, maxNewCount, progressMap, random);
  const reviewCount = Math.min(totalCount - newWords.length, reviewPool.length);
  const reviewWords = pickWeightedDistinct(reviewPool, reviewCount, progressMap, random);

  const newPrompts: LessonPrompt[] = newWords.map((text) => ({
    text,
    showGuide: true,
    kind: 'new',
  }));
  const reviewPrompts: LessonPrompt[] = reviewWords.map((text) => ({
    text,
    showGuide: false,
    kind: 'review',
  }));

  return {
    lessonId: stage.id,
    stage,
    prompts: interleaveSpiral(newPrompts, reviewPrompts),
  };
}
