// 進捗データの型（仕様 v0.3 詳細仕様 §6）。端末内の IndexedDB にだけ保存する。

/** かな単位の記録。 */
export interface KanaProgress {
  /** かな1単位（拗音は2文字）。 */
  kana: string;
  /** このかなを打ち切った回数（案内の有無や詰まりに関係なく数える）。 */
  correctCount: number;
  /** 詰まった（ヒント使用・5秒停止）回数。1回の出題につき最大1。 */
  hintCount: number;
  lastPracticedAt: Date;
  /** 案内なしで詰まらずに打てた連続回数。定着度の判定に使う。 */
  unguidedStreak: number;
  /** 詰まりの連続回数。出題頻度を上げる判定に使う。 */
  stuckStreak: number;
}

/** レッスン単位の記録。記録があるレッスンはクリア済み。 */
export interface LessonProgress {
  lessonId: string;
  /** 最初にクリアした日時。 */
  clearedAt: Date;
}

/** 単語単位の記録。記録がある単語は打てた単語（ことば図鑑に出す）。 */
export interface WordProgress {
  wordId: string;
  typedCount: number;
}

/** 1回のれんしゅうの記録。保護者ゲートで確認する。 */
export interface SessionRecord {
  /** れんしゅうを始めた日時。 */
  date: Date;
  durationSec: number;
  typedKanaCount: number;
}

export interface Settings {
  soundOn: boolean;
  /** 0（無音）〜1（最大）。 */
  soundVolume: number;
}
