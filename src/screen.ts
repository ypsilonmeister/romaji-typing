/** モード選択の2枚のカード（仕様 v0.3 §7）。レッスン内容の切り替えは後続チケットで使う。 */
export type LessonMode = 'stage' | 'theme';

/** 画面遷移の状態。ルーターは使わず、App がこの値で表示する画面を切り替える。 */
export type Screen =
  | { name: 'intro' }
  | { name: 'menu' }
  | { name: 'lesson'; mode: LessonMode }
  | { name: 'end'; sessionIdPromise?: Promise<number | undefined> }
  | { name: 'zukan' }
  | { name: 'parentGate' };
