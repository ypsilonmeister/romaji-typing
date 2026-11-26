// IndexedDB のスキーマと版の管理（仕様 v0.3 詳細仕様 §6）。

import { openDB, type DBSchema, type IDBPDatabase, type OpenDBCallbacks } from 'idb';
import type { KanaProgress, LessonProgress, SessionRecord, Settings, WordProgress } from './types';

export const DB_NAME = 'typecraft';
/** ストアやインデックスを変えるときは1つ上げ、upgradeSchema に移行を追加する。 */
export const DB_VERSION = 1;

export interface ProgressDB extends DBSchema {
  kanaProgress: { key: string; value: KanaProgress };
  lessonProgress: { key: string; value: LessonProgress };
  wordProgress: { key: string; value: WordProgress };
  sessions: { key: number; value: SessionRecord; indexes: { date: Date } };
  /** キー 'app' の1件だけを持つ。 */
  settings: { key: 'app'; value: Settings };
}

/**
 * 保存済みの版（初回は 0）から現在の版まで、順に移行する。
 * 公開済みの版のブロックは書き換えず、`if (oldVersion < 2)` のように下へ追加する。
 */
function upgradeSchema(db: IDBPDatabase<ProgressDB>, oldVersion: number): void {
  if (oldVersion < 1) {
    db.createObjectStore('kanaProgress', { keyPath: 'kana' });
    db.createObjectStore('lessonProgress', { keyPath: 'lessonId' });
    db.createObjectStore('wordProgress', { keyPath: 'wordId' });
    db.createObjectStore('sessions', { autoIncrement: true }).createIndex('date', 'date');
    db.createObjectStore('settings');
  }
}

export function openProgressDb(
  name: string,
  callbacks: Pick<OpenDBCallbacks<ProgressDB>, 'blocking' | 'terminated'>,
): Promise<IDBPDatabase<ProgressDB>> {
  return openDB<ProgressDB>(name, DB_VERSION, { ...callbacks, upgrade: upgradeSchema });
}
