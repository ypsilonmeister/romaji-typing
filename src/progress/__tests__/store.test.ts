// @vitest-environment node
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
import { deleteDB, openDB } from 'idb';
import { beforeEach, describe, expect, it } from 'vitest';
import { DB_NAME, DB_VERSION } from '../db';
import { kanaStatus, type KanaAttempt } from '../mastery';
import { createProgressStore, DEFAULT_SETTINGS } from '../store';
import { isLessonUnlocked } from '../unlock';

const clean: KanaAttempt = { guided: false, hintUsed: false, stalled: false };

beforeEach(() => {
  // テストごとに空の IndexedDB を使う。
  globalThis.indexedDB = new IDBFactory();
});

describe('スキーマ', () => {
  it('仕様 §6 の5つのストアを作る', async () => {
    const store = createProgressStore();
    await store.getSettings();
    await store.close();

    const db = await openDB(DB_NAME);
    expect(db.version).toBe(DB_VERSION);
    expect([...db.objectStoreNames].sort()).toEqual([
      'kanaProgress',
      'lessonProgress',
      'sessions',
      'settings',
      'wordProgress',
    ]);
    const tx = db.transaction(['kanaProgress', 'lessonProgress', 'wordProgress', 'sessions']);
    expect(tx.objectStore('kanaProgress').keyPath).toBe('kana');
    expect(tx.objectStore('lessonProgress').keyPath).toBe('lessonId');
    expect(tx.objectStore('wordProgress').keyPath).toBe('wordId');
    expect([...tx.objectStore('sessions').indexNames]).toEqual(['date']);
    db.close();
  });
});

describe('開き直し', () => {
  it('閉じて開き直しても、定着度・解放・図鑑・記録・設定が残る', async () => {
    const first = createProgressStore();
    for (let i = 0; i < 3; i++) await first.recordKanaAttempt('か', clean);
    await first.markLessonCleared('a-1');
    await first.recordWordTyped('かさ');
    await first.addSession({ date: new Date(2026, 10, 26), durationSec: 200, typedKanaCount: 24 });
    await first.updateSettings({ soundOn: false });
    await first.close();

    const second = createProgressStore();
    expect(kanaStatus(await second.getKanaProgress('か'))).toBe('mastered');
    const cleared = await second.getClearedLessonIds();
    expect(isLessonUnlocked(['a-1', 'a-2'], 'a-2', cleared)).toBe(true);
    expect(await second.getWordProgress()).toEqual([{ wordId: 'かさ', typedCount: 1 }]);
    expect(await second.getSessions()).toEqual([
      { date: new Date(2026, 10, 26), durationSec: 200, typedKanaCount: 24 },
    ]);
    expect(await second.getSettings()).toEqual({ ...DEFAULT_SETTINGS, soundOn: false });
    await second.close();
  });

  it('close の後も、同じ保存先を使い続けられる', async () => {
    const store = createProgressStore();
    await store.recordWordTyped('いえ');
    await store.close();
    expect(await store.getWordProgress()).toHaveLength(1);
    await store.close();
  });
});

describe('かなの記録', () => {
  it('かなごとに分けて持つ', async () => {
    const store = createProgressStore();
    expect(await store.getKanaProgress('か')).toBeUndefined();
    await store.recordKanaAttempt('か', clean);
    await store.recordKanaAttempt('しゃ', { ...clean, hintUsed: true });
    expect(await store.getAllKanaProgress()).toMatchObject([
      { kana: 'か', correctCount: 1, hintCount: 0 },
      { kana: 'しゃ', correctCount: 1, hintCount: 1 },
    ]);
    await store.close();
  });

  it('完了を待たずに続けて記録しても、取りこぼさない', async () => {
    const store = createProgressStore();
    await Promise.all(Array.from({ length: 10 }, () => store.recordKanaAttempt('か', clean)));
    expect(await store.getKanaProgress('か')).toMatchObject({
      correctCount: 10,
      unguidedStreak: 10,
    });
    await store.close();
  });
});

describe('レッスンと単語の記録', () => {
  it('レッスンは最初にクリアした日時を保つ', async () => {
    const store = createProgressStore();
    const first = new Date(2026, 10, 1);
    await store.markLessonCleared('a-1', first);
    await store.markLessonCleared('a-1', new Date(2026, 10, 2));
    await store.close();

    const db = await openDB(DB_NAME);
    expect(await db.getAll('lessonProgress')).toEqual([{ lessonId: 'a-1', clearedAt: first }]);
    db.close();
  });

  it('単語は打った回数を足していく', async () => {
    const store = createProgressStore();
    await Promise.all([store.recordWordTyped('あさ'), store.recordWordTyped('あさ')]);
    expect(await store.getWordProgress()).toEqual([{ wordId: 'あさ', typedCount: 2 }]);
    await store.close();
  });
});

describe('れんしゅうの記録', () => {
  it('追加した順に関係なく、新しい順に返す', async () => {
    const store = createProgressStore();
    for (const day of [2, 3, 1]) {
      await store.addSession({ date: new Date(2026, 10, day), durationSec: 60, typedKanaCount: day });
    }
    const sessions = await store.getSessions();
    expect(sessions.map((session) => session.typedKanaCount)).toEqual([3, 2, 1]);
    await store.close();
  });

  it('同じ日時の記録も、それぞれ残る', async () => {
    const store = createProgressStore();
    const session = { date: new Date(2026, 10, 1), durationSec: 60, typedKanaCount: 5 };
    await store.addSession(session);
    await store.addSession(session);
    expect(await store.getSessions()).toHaveLength(2);
    await store.close();
  });

  it('保存した記録に自己申告を付け足せる', async () => {
    const store = createProgressStore();
    const id = await store.addSession({
      date: new Date(2026, 10, 26),
      durationSec: 90,
      typedKanaCount: 15,
    });
    await store.updateSessionSelfReport(id, 'good');
    expect(await store.getSessions()).toEqual([
      { date: new Date(2026, 10, 26), durationSec: 90, typedKanaCount: 15, selfReport: 'good' },
    ]);
    await store.close();
  });
});

describe('設定', () => {
  it('保存前は既定値を返す', async () => {
    const store = createProgressStore();
    expect(await store.getSettings()).toEqual({
      soundOn: true,
      soundVolume: 0.5,
      selfReportOn: false,
    });
    await store.close();
  });

  it('項目を別々に変えても、互いに打ち消さない', async () => {
    const store = createProgressStore();
    await Promise.all([
      store.updateSettings({ soundOn: false }),
      store.updateSettings({ soundVolume: 0.8 }),
      store.updateSettings({ selfReportOn: true }),
    ]);
    expect(await store.getSettings()).toEqual({
      soundOn: false,
      soundVolume: 0.8,
      selfReportOn: true,
    });
    await store.close();
  });
});

describe('版の管理', () => {
  it('新しい版を開くときは接続を閉じて譲り、データは残る', async () => {
    const store = createProgressStore();
    await store.recordWordTyped('そら');

    // 将来の版のアプリが別のタブで開いた状況。接続を閉じないと、この open は完了しない。
    const newer = await openDB(DB_NAME, DB_VERSION + 1);
    expect(await newer.getAll('wordProgress')).toEqual([{ wordId: 'そら', typedCount: 1 }]);
    newer.close();

    // 古い版のコードは、新しい版のデータベースを開けない。
    await expect(store.getWordProgress()).rejects.toMatchObject({ name: 'VersionError' });
  });

  it('開くのに失敗しても、次の読み書きで開き直す', async () => {
    const newer = await openDB(DB_NAME, DB_VERSION + 1);
    newer.close();
    const store = createProgressStore();
    await expect(store.getSettings()).rejects.toMatchObject({ name: 'VersionError' });

    await deleteDB(DB_NAME);
    expect(await store.getSettings()).toEqual(DEFAULT_SETTINGS);
    await store.close();
  });
});
