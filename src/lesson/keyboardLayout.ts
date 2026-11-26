// JIS 配列ベースの表示と指の割り当て（仕様 v0.3 詳細仕様 §3）。

export type FingerGroup = 'pinky' | 'ring' | 'middle' | 'index' | 'thumb';

export type FingerId =
  | 'left-pinky'
  | 'left-ring'
  | 'left-middle'
  | 'left-index'
  | 'left-thumb'
  | 'right-thumb'
  | 'right-index'
  | 'right-middle'
  | 'right-ring'
  | 'right-pinky';

export interface KeySpec {
  /** 入力文字（小文字）。スペースは ' '、Backspace は 'Backspace'。 */
  readonly code: string;
  /** キーに大きく表示するラベル。 */
  readonly label: string;
  /** 担当指。修飾キーなど担当外は undefined。 */
  readonly finger?: FingerId;
  /** キー幅の相対倍率（通常キー = 1）。 */
  readonly width?: number;
  /** ホームポジション（ASDF / JKL;）。 */
  readonly isHome?: boolean;
  /** ホームポジションの突起があるキー（F / J）。 */
  readonly hasBump?: boolean;
  /** 補助キー（装飾・特殊キー）。 */
  readonly isSpecial?: boolean;
}

export const FINGER_GROUP: Record<FingerId, FingerGroup> = {
  'left-pinky': 'pinky',
  'left-ring': 'ring',
  'left-middle': 'middle',
  'left-index': 'index',
  'left-thumb': 'thumb',
  'right-thumb': 'thumb',
  'right-index': 'index',
  'right-middle': 'middle',
  'right-ring': 'ring',
  'right-pinky': 'pinky',
};

export const FINGER_LABELS: Record<FingerId, string> = {
  'left-pinky': 'ひだり こゆび',
  'left-ring': 'ひだり くすりゆび',
  'left-middle': 'ひだり なかゆび',
  'left-index': 'ひだり ひとさしゆび',
  'left-thumb': 'ひだり おやゆび',
  'right-thumb': 'みぎ おやゆび',
  'right-index': 'みぎ ひとさしゆび',
  'right-middle': 'みぎ なかゆび',
  'right-ring': 'みぎ くすりゆび',
  'right-pinky': 'みぎ こゆび',
};

/**
 * JIS 配列ベースのバーチャルキーボード定義。
 * 1366×768（実効高さ 約650px）でキーを大きく保つため、ローマ字入力で使う文字段3行＋スペース行で構成する。
 */
export const KEYBOARD_ROWS: readonly (readonly KeySpec[])[] = [
  [
    { code: 'q', label: 'Q', finger: 'left-pinky' },
    { code: 'w', label: 'W', finger: 'left-ring' },
    { code: 'e', label: 'E', finger: 'left-middle' },
    { code: 'r', label: 'R', finger: 'left-index' },
    { code: 't', label: 'T', finger: 'left-index' },
    { code: 'y', label: 'Y', finger: 'right-index' },
    { code: 'u', label: 'U', finger: 'right-index' },
    { code: 'i', label: 'I', finger: 'right-middle' },
    { code: 'o', label: 'O', finger: 'right-ring' },
    { code: 'p', label: 'P', finger: 'right-pinky' },
    { code: '@', label: '@', finger: 'right-pinky' },
    { code: '[', label: '[', finger: 'right-pinky' },
    { code: 'Backspace', label: 'BS', finger: 'right-pinky', width: 1.5, isSpecial: true },
  ],
  [
    { code: 'a', label: 'A', finger: 'left-pinky', isHome: true },
    { code: 's', label: 'S', finger: 'left-ring', isHome: true },
    { code: 'd', label: 'D', finger: 'left-middle', isHome: true },
    { code: 'f', label: 'F', finger: 'left-index', isHome: true, hasBump: true },
    { code: 'g', label: 'G', finger: 'left-index' },
    { code: 'h', label: 'H', finger: 'right-index' },
    { code: 'j', label: 'J', finger: 'right-index', isHome: true, hasBump: true },
    { code: 'k', label: 'K', finger: 'right-middle', isHome: true },
    { code: 'l', label: 'L', finger: 'right-ring', isHome: true },
    { code: ';', label: ';', finger: 'right-pinky', isHome: true },
    { code: ':', label: ':', finger: 'right-pinky' },
    { code: ']', label: ']', finger: 'right-pinky' },
  ],
  [
    { code: 'z', label: 'Z', finger: 'left-pinky' },
    { code: 'x', label: 'X', finger: 'left-ring' },
    { code: 'c', label: 'C', finger: 'left-middle' },
    { code: 'v', label: 'V', finger: 'left-index' },
    { code: 'b', label: 'B', finger: 'left-index' },
    { code: 'n', label: 'N', finger: 'right-index' },
    { code: 'm', label: 'M', finger: 'right-index' },
    { code: ',', label: ',', finger: 'right-middle' },
    { code: '.', label: '.', finger: 'right-ring' },
    { code: '/', label: '/', finger: 'right-pinky' },
    { code: '\\', label: '\\', finger: 'right-pinky' },
  ],
  [
    {
      code: ' ',
      label: 'スペース',
      finger: 'right-thumb',
      width: 6.5,
      isSpecial: true,
    },
  ],
];

const KEY_TO_FINGER: ReadonlyMap<string, FingerId> = new Map(
  KEYBOARD_ROWS.flat()
    .filter((spec): spec is KeySpec & { finger: FingerId } => spec.finger !== undefined)
    .map((spec) => [spec.code.toLowerCase(), spec.finger]),
);

/** キー文字（小文字化前でも可）から担当指を返す。 */
export function fingerOfKey(key: string | undefined): FingerId | undefined {
  if (!key) return undefined;
  return KEY_TO_FINGER.get(key.toLowerCase());
}

/** ホームポジションの各指と対応キー（手の図の常時表示に使う）。 */
export const HOME_POSITION_KEYS: Readonly<Partial<Record<FingerId, string>>> = {
  'left-pinky': 'A',
  'left-ring': 'S',
  'left-middle': 'D',
  'left-index': 'F',
  'right-index': 'J',
  'right-middle': 'K',
  'right-ring': 'L',
  'right-pinky': ';',
};
