// 進捗の保存・読み出し。画面はこのモジュールを通して IndexedDB を使う。

import type { IDBPDatabase } from 'idb';
import { DB_NAME, openProgressDb, type ProgressDB } from './db';
import { applyKanaAttempt, type KanaAttempt } from './mastery';
import type { KanaProgress, SelfReport, SessionRecord, Settings, WordProgress } from './types';

export const DEFAULT_SETTINGS: Readonly<Settings> = {
  soundOn: true,
  soundVolume: 0.5,
  selfReportOn: false,
};

/**
 * 進捗の保存先を作る。データベースは最初の読み書きで開く。
 *
 * IndexedDB が使えない・保存に失敗した場合、各メソッドの Promise は reject する。
 * 記録に失敗してもれんしゅうは止めないように、呼び出し側で受け止める。
 */
export function createProgressStore(dbName: string = DB_NAME) {
  let connection: Promise<IDBPDatabase<ProgressDB>> | undefined;

  function open(): Promise<IDBPDatabase<ProgressDB>> {
    if (connection) return connection;
    /** この接続を使うのをやめる。次の読み書きで開き直す。 */
    const forget = () => {
      if (connection === opening) connection = undefined;
    };
    const opening: Promise<IDBPDatabase<ProgressDB>> = openProgressDb(dbName, {
      // 別のタブが新しい版を開こうとしたら、移行を止めないように閉じる。
      blocking: () => {
        forget();
        void opening.then((db) => db.close());
      },
      terminated: forget,
    });
    opening.catch(forget);
    connection = opening;
    return opening;
  }

  return {
    /** かなを1つ打ち切るたびに呼ぶ。反映後の記録を返す。 */
    async recordKanaAttempt(
      kana: string,
      attempt: KanaAttempt,
      practicedAt: Date = new Date(),
    ): Promise<KanaProgress> {
      const tx = (await open()).transaction('kanaProgress', 'readwrite');
      const next = applyKanaAttempt(await tx.store.get(kana), kana, attempt, practicedAt);
      await Promise.all([tx.store.put(next), tx.done]);
      return next;
    },

    async getKanaProgress(kana: string): Promise<KanaProgress | undefined> {
      return (await open()).get('kanaProgress', kana);
    },

    /** 練習したことのあるかなの記録。 */
    async getAllKanaProgress(): Promise<KanaProgress[]> {
      return (await open()).getAll('kanaProgress');
    },

    /** レッスンのクリアを記録する。2回目以降は最初の日時を保つ。 */
    async markLessonCleared(lessonId: string, clearedAt: Date = new Date()): Promise<void> {
      const tx = (await open()).transaction('lessonProgress', 'readwrite');
      const next = (await tx.store.get(lessonId)) ?? { lessonId, clearedAt };
      await Promise.all([tx.store.put(next), tx.done]);
    },

    /** isLessonUnlocked にそのまま渡せる。 */
    async getClearedLessonIds(): Promise<Set<string>> {
      return new Set(await (await open()).getAllKeys('lessonProgress'));
    },

    /** 単語を打ち切るたびに呼ぶ。反映後の記録を返す。 */
    async recordWordTyped(wordId: string): Promise<WordProgress> {
      const tx = (await open()).transaction('wordProgress', 'readwrite');
      const previous = await tx.store.get(wordId);
      const next = { wordId, typedCount: (previous?.typedCount ?? 0) + 1 };
      await Promise.all([tx.store.put(next), tx.done]);
      return next;
    },

    /** 打てた単語の記録だけを返す（ことば図鑑用）。順序はテーマや表示順を表さない。 */
    async getWordProgress(): Promise<WordProgress[]> {
      return (await open()).getAll('wordProgress');
    },

    /** れんしゅうを1回終えるたびに呼ぶ。保存した記録のキーを返す。 */
    async addSession(session: SessionRecord): Promise<number> {
      return (await open()).add('sessions', session);
    },

    /** 終了画面での本人の自己申告を、直前のれんしゅう記録に付け足す。 */
    async updateSessionSelfReport(sessionId: number, selfReport: SelfReport): Promise<void> {
      const tx = (await open()).transaction('sessions', 'readwrite');
      const existing = await tx.store.get(sessionId);
      if (existing) {
        await Promise.all([tx.store.put({ ...existing, selfReport }, sessionId), tx.done]);
      } else {
        await tx.done;
      }
    },

    /** れんしゅうの記録を新しい順に返す。 */
    async getSessions(): Promise<SessionRecord[]> {
      return (await (await open()).getAllFromIndex('sessions', 'date')).reverse();
    },

    /** 保存していない項目は既定値になる。 */
    async getSettings(): Promise<Settings> {
      return { ...DEFAULT_SETTINGS, ...(await (await open()).get('settings', 'app')) };
    },

    /** 指定した項目だけを変えて保存し、反映後の設定を返す。 */
    async updateSettings(changes: Partial<Settings>): Promise<Settings> {
      const tx = (await open()).transaction('settings', 'readwrite');
      const next = { ...DEFAULT_SETTINGS, ...(await tx.store.get('app')), ...changes };
      await Promise.all([tx.store.put(next, 'app'), tx.done]);
      return next;
    },

    /** 接続を閉じる。次の読み書きで開き直す。 */
    async close(): Promise<void> {
      const current = connection;
      connection = undefined;
      (await current)?.close();
    },
  };
}

export type ProgressStore = ReturnType<typeof createProgressStore>;

/** アプリで共有する保存先。 */
export const progressStore: ProgressStore = createProgressStore();
