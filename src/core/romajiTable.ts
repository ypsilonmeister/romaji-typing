// ローマ字対応表（仕様 v0.3 詳細仕様 §1）。
// ROMAJI_TABLE は、前後のかなに依存しない受理綴り。どれが推奨かは recommendedSpelling で調べる。
// 通常のかなは先頭が推奨綴り、残りが許容綴り。っ と単独の ゃゅょ はすべて許容綴りで、推奨はない。
//
// 次のかなで決まる打ち方のうち、「ん」の n 1つは allowsSingleN が条件を持つ。
// 促音の子音重ねは次のかなの打ち始めのキーそのものなので、matcher.ts が組み立てる。

export type Spellings = readonly [first: string, ...rest: string[]];

export const ROMAJI_TABLE: Readonly<Record<string, Spellings>> = {
  // §1.1 清音
  あ: ['a'], い: ['i'], う: ['u'], え: ['e'], お: ['o'],
  か: ['ka'], き: ['ki'], く: ['ku'], け: ['ke'], こ: ['ko'],
  さ: ['sa'], し: ['shi', 'si'], す: ['su'], せ: ['se'], そ: ['so'],
  た: ['ta'], ち: ['chi', 'ti'], つ: ['tsu', 'tu'], て: ['te'], と: ['to'],
  な: ['na'], に: ['ni'], ぬ: ['nu'], ね: ['ne'], の: ['no'],
  は: ['ha'], ひ: ['hi'], ふ: ['fu', 'hu'], へ: ['he'], ほ: ['ho'],
  ま: ['ma'], み: ['mi'], む: ['mu'], め: ['me'], も: ['mo'],
  や: ['ya'], ゆ: ['yu'], よ: ['yo'],
  ら: ['ra'], り: ['ri'], る: ['ru'], れ: ['re'], ろ: ['ro'],
  わ: ['wa'], を: ['wo'],
  ん: ['nn'],

  // §1.2 濁点・半濁点
  が: ['ga'], ぎ: ['gi'], ぐ: ['gu'], げ: ['ge'], ご: ['go'],
  ざ: ['za'], じ: ['ji', 'zi'], ず: ['zu'], ぜ: ['ze'], ぞ: ['zo'],
  だ: ['da'], ぢ: ['di', 'ji'], づ: ['du', 'zu'], で: ['de'], ど: ['do'],
  ば: ['ba'], び: ['bi'], ぶ: ['bu'], べ: ['be'], ぼ: ['bo'],
  ぱ: ['pa'], ぴ: ['pi'], ぷ: ['pu'], ぺ: ['pe'], ぽ: ['po'],

  // §1.3 拗音
  きゃ: ['kya'], きゅ: ['kyu'], きょ: ['kyo'],
  しゃ: ['sha', 'sya'], しゅ: ['shu', 'syu'], しょ: ['sho', 'syo'],
  ちゃ: ['cha', 'tya', 'cya'], ちゅ: ['chu', 'tyu', 'cyu'], ちょ: ['cho', 'tyo', 'cyo'],
  にゃ: ['nya'], にゅ: ['nyu'], にょ: ['nyo'],
  ひゃ: ['hya'], ひゅ: ['hyu'], ひょ: ['hyo'],
  みゃ: ['mya'], みゅ: ['myu'], みょ: ['myo'],
  りゃ: ['rya'], りゅ: ['ryu'], りょ: ['ryo'],
  ぎゃ: ['gya'], ぎゅ: ['gyu'], ぎょ: ['gyo'],
  じゃ: ['ja', 'jya', 'zya'], じゅ: ['ju', 'jyu', 'zyu'], じょ: ['jo', 'jyo', 'zyo'],
  ぢゃ: ['dya', 'ja'], ぢゅ: ['dyu', 'ju'], ぢょ: ['dyo', 'jo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],

  // §1.4 特殊（促音の通常の打ち方は次の子音の重ね。長音「ー」は '-' が推奨綴り）
  っ: ['xtu', 'ltu'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
  ー: ['-'],
};

/** 推奨綴りがないかな。単独の綴り（x・l 接頭辞）は受け付けるが、案内には出さない（§1.4）。 */
const NO_RECOMMENDED = new Set(['っ', 'ゃ', 'ゅ', 'ょ']);

/** 「ん」の許容綴り（§1.1）。受け付けるかは allowsSingleN で決まる。 */
export const SINGLE_N = 'n';

/** 次のかながこれらで始まる場合は nn が必要（§2.3 の母音・や行・ら行・わ行・な行・ん）。 */
const NEEDS_DOUBLE_N = new Set('あいうえおやゆよらりるれろわをなにぬねのん');

/**
 * 「ん」を n 1つでも受け付けるか（§2.3）。next は次のかな（語末は undefined）。
 * 単独の「ん」のお題は nn のみ。
 */
export function allowsSingleN(next: string | undefined, isOnlyKana: boolean): boolean {
  if (next === undefined) return !isOnlyKana;
  return !NEEDS_DOUBLE_N.has(next[0]);
}

/** 案内に出す推奨綴り。推奨がないかな（っ・単独の ゃゅょ）と、表にないかなは undefined。 */
export function recommendedSpelling(kana: string): string | undefined {
  return NO_RECOMMENDED.has(kana) ? undefined : spellingsOf(kana)?.[0];
}

/**
 * かな1単位（拗音は2文字で1単位）の、前後のかなに依存しない受理綴り。推奨綴りがあれば先頭。
 * 拗音は、表の綴りに加えて「大きいかな＋小さい ゃゅょ」の分け打ち（kixya など）も受け付ける。
 * 表にないかなは undefined。
 */
export function spellingsOf(kana: string): readonly string[] | undefined {
  if (!Object.prototype.hasOwnProperty.call(ROMAJI_TABLE, kana)) return undefined;
  const listed = ROMAJI_TABLE[kana];
  if (kana.length === 1) return listed;
  const [base, small] = kana;
  const split = ROMAJI_TABLE[base].flatMap((head) => ROMAJI_TABLE[small].map((tail) => head + tail));
  return [...listed, ...split];
}
