// レッスンの解放判定（仕様 v0.3 詳細仕様 §4.3・§6）。

/**
 * lessonIds は遊ぶ順に並べたレッスンの一覧。
 * 先頭のレッスン、直前のレッスンをクリアしたレッスン、クリア済みのレッスンが遊べる。
 * 一覧にない lessonId は遊べない。
 */
export function isLessonUnlocked(
  lessonIds: readonly string[],
  lessonId: string,
  clearedIds: ReadonlySet<string>,
): boolean {
  const index = lessonIds.indexOf(lessonId);
  if (index < 0) return false;
  return index === 0 || clearedIds.has(lessonId) || clearedIds.has(lessonIds[index - 1]);
}
