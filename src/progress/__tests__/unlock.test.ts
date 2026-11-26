// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { isLessonUnlocked } from '../unlock';

const lessons = ['a-1', 'a-2', 'b-1'];
const unlocked = (...cleared: string[]) =>
  lessons.filter((id) => isLessonUnlocked(lessons, id, new Set(cleared)));

describe('レッスンの解放', () => {
  it('最初は先頭のレッスンだけ遊べる', () => {
    expect(unlocked()).toEqual(['a-1']);
  });

  it('クリアすると次のレッスンだけが増える', () => {
    expect(unlocked('a-1')).toEqual(['a-1', 'a-2']);
    expect(unlocked('a-1', 'a-2')).toEqual(['a-1', 'a-2', 'b-1']);
  });

  it('クリア済みのレッスンは、前にレッスンが追加されても遊べる', () => {
    expect(isLessonUnlocked(['a-1', 'new', 'a-2'], 'a-2', new Set(['a-1', 'a-2']))).toBe(true);
  });

  it('一覧にないレッスンは遊べない', () => {
    expect(isLessonUnlocked(lessons, 'unknown', new Set(['unknown', 'b-1']))).toBe(false);
  });
});
