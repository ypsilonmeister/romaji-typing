// 自由入力用のローマ字→かなコンバータ（しりとりモード・Issue #16）。
// DOM に依存しない純粋な状態機械。既存の ROMAJI_TABLE（仕様 v0.3 §1）を再利用する。
// 状態は書き換えず、操作のたびに新しい状態を返す。

import { ROMAJI_TABLE } from './romajiTable';

export interface ConverterState {
  /** 変換済みのかな単位列（拗音は2文字で1単位）。 */
  readonly kana: readonly string[];
  /** 変換途中のローマ字バッファ（小文字）。 */
  readonly buffer: string;
}

export interface ConverterKeyResult {
  readonly state: ConverterState;
  /** キーが有効な継続として受け付けられたか。 */
  readonly accepted: boolean;
  /** このキー入力で新しく確定したかな単位（0〜2単位）。 */
  readonly completed: readonly string[];
}

/** 促音で重ねられない先頭文字。母音と n（nn は「ん」）、小さいかなの x・l 接頭辞。 */
const NOT_DOUBLABLE = new Set('aiueonxl');

/** 母音。n の直後に来ると な行（な・に・ぬ・ね・の）になる。 */
const VOWELS = new Set('aiueo');

/**
 * ROMAJI_TABLE から ローマ字 → かな の逆引き表を組み立てる。
 * 同じ綴りが複数かなに現れる場合（ji: じ/ぢ、zu: ず/づ、ja/ju/jo: じゃ/ぢゃ等）は、
 * 推奨綴り（配列の先頭）として定義されているかなを優先する。
 */
function buildRomajiToKana(): ReadonlyMap<string, string> {
  const map = new Map<string, string>();
  // 1周目: 各かなの推奨綴り（先頭）を登録
  for (const [kana, spellings] of Object.entries(ROMAJI_TABLE)) {
    const first = spellings[0];
    if (!map.has(first)) {
      map.set(first, kana);
    }
  }
  // 2周目: 許容綴り（2番目以降）を未登録分だけ登録
  for (const [kana, spellings] of Object.entries(ROMAJI_TABLE)) {
    for (let i = 1; i < spellings.length; i++) {
      const spelling = spellings[i];
      if (!map.has(spelling)) {
        map.set(spelling, kana);
      }
    }
  }
  return map;
}

const ROMAJI_TO_KANA: ReadonlyMap<string, string> = buildRomajiToKana();

/** 接頭辞 → 次に打てるキー集合（ROMAJI_TABLE の綴りから導出）。 */
function buildPrefixNextKeys(): ReadonlyMap<string, ReadonlySet<string>> {
  const map = new Map<string, Set<string>>();
  for (const romaji of ROMAJI_TO_KANA.keys()) {
    for (let i = 0; i < romaji.length; i++) {
      const prefix = romaji.slice(0, i);
      const nextChar = romaji[i];
      let set = map.get(prefix);
      if (!set) {
        set = new Set();
        map.set(prefix, set);
      }
      set.add(nextChar);
    }
  }
  return map;
}

const PREFIX_NEXT_KEYS: ReadonlyMap<string, ReadonlySet<string>> = buildPrefixNextKeys();

/** ローマ字の打ち始めになり得るキー集合（ROMAJI_TABLE 由来の全先頭文字）。 */
const START_KEYS: ReadonlySet<string> = PREFIX_NEXT_KEYS.get('') ?? new Set();

function isDoublableConsonant(ch: string): boolean {
  return START_KEYS.has(ch) && !NOT_DOUBLABLE.has(ch);
}

/** 初期状態を作る。 */
export function createConverter(): ConverterState {
  return { kana: [], buffer: '' };
}

/** 変換済みのかな文字列を返す（バッファ未変換分は含まない）。 */
export function convertedText(state: ConverterState): string {
  return state.kana.join('');
}

/**
 * 現在の状態から次に打てるキー（有効な継続、小文字）を返す。
 * pressConverterKey で accepted === true になるキー集合と一致する。
 */
export function nextConverterKeys(state: ConverterState): string[] {
  const keys = new Set<string>();
  const { buffer } = state;

  const direct = PREFIX_NEXT_KEYS.get(buffer);
  if (direct) {
    for (const ch of direct) {
      keys.add(ch);
    }
  }

  // 促音の子音重ね（buffer が重ね可能な単一子音のとき、同じ子音を重ねられる）
  if (buffer.length === 1 && isDoublableConsonant(buffer)) {
    keys.add(buffer);
  }

  // 「ん」の解決: buffer が 'n' のとき、母音・y・n 以外でローマ字の開始になり得る子音も受け付ける
  if (buffer === 'n') {
    for (const ch of START_KEYS) {
      if (!VOWELS.has(ch) && ch !== 'y' && ch !== 'n') {
        keys.add(ch);
      }
    }
  }

  return [...keys];
}

/**
 * キーを1文字入力する。大文字小文字は区別しない。
 * 1文字でないキー（Shift / Enter / Backspace 等）と変換できないキーは受け付けず、状態を保つ。
 */
export function pressConverterKey(state: ConverterState, key: string): ConverterKeyResult {
  const rejected: ConverterKeyResult = { state, accepted: false, completed: [] };
  if (key.length !== 1) return rejected;

  const ch = key.toLowerCase();
  const { buffer } = state;
  const candidate = buffer + ch;

  // 1. 最長一致: バッファ＋キーが表に完全一致する場合（より長い接頭辞が表に無いことも確認）
  const exact = ROMAJI_TO_KANA.get(candidate);
  if (exact !== undefined && !PREFIX_NEXT_KEYS.has(candidate)) {
    return {
      state: { kana: [...state.kana, exact], buffer: '' },
      accepted: true,
      completed: [exact],
    };
  }

  // 2. 変換途中として有効な接頭辞になる場合
  if (PREFIX_NEXT_KEYS.has(candidate)) {
    return {
      state: { kana: state.kana, buffer: candidate },
      accepted: true,
      completed: [],
    };
  }

  // 3. 促音: 単一子音の重ね（例: k + k → っ + buffer 'k'）
  if (buffer.length === 1 && ch === buffer && isDoublableConsonant(ch)) {
    return {
      state: { kana: [...state.kana, 'っ'], buffer: ch },
      accepted: true,
      completed: ['っ'],
    };
  }

  // 4. 「ん」の解決: n の直後が子音（母音・y・n 以外の開始可能文字）なら「ん」を確定して新バッファを開始
  if (buffer === 'n' && START_KEYS.has(ch) && !VOWELS.has(ch) && ch !== 'y' && ch !== 'n') {
    return {
      state: { kana: [...state.kana, 'ん'], buffer: ch },
      accepted: true,
      completed: ['ん'],
    };
  }

  return rejected;
}

/**
 * Backspace: バッファがあれば末尾1文字、なければ変換済みかなの末尾1単位を取り除く。
 * どちらも空なら同じ状態を返す。
 */
export function backspaceConverter(state: ConverterState): ConverterState {
  if (state.buffer.length > 0) {
    return { kana: state.kana, buffer: state.buffer.slice(0, -1) };
  }
  if (state.kana.length > 0) {
    return { kana: state.kana.slice(0, -1), buffer: '' };
  }
  return state;
}

/**
 * 決定（Enter）時点の解決を行う。
 * 末尾に 'n' が残っていれば「ん」として確定する。その他の未確定バッファはそのまま残す。
 */
export function commitConverter(state: ConverterState): ConverterState {
  if (state.buffer === 'n') {
    return { kana: [...state.kana, 'ん'], buffer: '' };
  }
  return state;
}
