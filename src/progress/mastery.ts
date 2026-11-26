// 定着度の判定（仕様 v0.3 詳細仕様 §6）。保存先に依存しない純粋関数。

import type { KanaProgress } from './types';

// 以下の数値は調整値（§6「数値は実装時に調整する調整値として扱う」）。

/** 案内なしでこの回数だけ連続して打てたら定着とみなす。 */
export const MASTERY_STREAK = 3;
/** この回数だけ連続して詰まったら、出題頻度を上げる。 */
export const STRUGGLING_STREAK = 2;

/** - mastered: 定着（出題頻度を下げる） - struggling: 詰まりが続く（上げる） - learning: どちらでもない */
export type KanaStatus = 'mastered' | 'learning' | 'struggling';

/** 出題の相対的な重み。learning を 1 とする。 */
export const FREQUENCY_WEIGHTS: Readonly<Record<KanaStatus, number>> = {
  mastered: 0.5,
  learning: 1,
  struggling: 2,
};

/** かな1つを打ち切ったときの状況。間違いキーは記録上のペナルティにしないため、含めない（§2.4）。 */
export interface KanaAttempt {
  /** 次のキーの案内を最初から表示していた。 */
  guided: boolean;
  /** 手動のヒントボタンを使った。 */
  hintUsed: boolean;
  /** 入力が5秒止まった（§2.4 の自動ヒントが出た）。 */
  stalled: boolean;
}

/**
 * 1回分の結果を反映した新しい記録を返す。previous は書き換えない。
 *
 * - 詰まった: 定着の連続回数を 0 に戻し、詰まりの連続回数を増やす。
 * - 案内なしで詰まらず打てた: 定着の連続回数を増やし、詰まりの連続回数を 0 に戻す。
 * - 案内ありで詰まらず打てた: 定着の連続回数と詰まりの連続回数を 0 に戻す。
 *
 * そのため定着は、直近の MASTERY_STREAK 回がすべて「案内なしで詰まらず打てた」かなだけになる。
 */
export function applyKanaAttempt(
  previous: KanaProgress | undefined,
  kana: string,
  attempt: KanaAttempt,
  practicedAt: Date,
): KanaProgress {
  const stuck = attempt.hintUsed || attempt.stalled;
  return {
    kana,
    correctCount: (previous?.correctCount ?? 0) + 1,
    hintCount: (previous?.hintCount ?? 0) + (stuck ? 1 : 0),
    lastPracticedAt: practicedAt,
    unguidedStreak: stuck || attempt.guided ? 0 : (previous?.unguidedStreak ?? 0) + 1,
    stuckStreak: stuck ? (previous?.stuckStreak ?? 0) + 1 : 0,
  };
}

/** 記録のないかなは learning。 */
export function kanaStatus(progress: KanaProgress | undefined): KanaStatus {
  if (!progress) return 'learning';
  if (progress.stuckStreak >= STRUGGLING_STREAK) return 'struggling';
  if (progress.unguidedStreak >= MASTERY_STREAK) return 'mastered';
  return 'learning';
}

export function frequencyWeight(progress: KanaProgress | undefined): number {
  return FREQUENCY_WEIGHTS[kanaStatus(progress)];
}
