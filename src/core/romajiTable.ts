// ローマ字対応表（仕様 v0.3 詳細仕様 §1）。
// 各かなの配列は、先頭が推奨綴り（案内に出す）、2番目以降が許容綴り（正解として受け入れる）。
//
// 「ん」の n 1つと、促音の子音重ねは、次のかなで決まるのでこの表に持たない（matcher.ts）。

export type Spellings = readonly [recommended: string, ...accepted: string[]];

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
  だ: ['da'], ぢ: ['ji', 'di'], づ: ['zu', 'du'], で: ['de'], ど: ['do'],
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
  ぢゃ: ['ja', 'dya'], ぢゅ: ['ju', 'dyu'], ぢょ: ['jo', 'dyo'],
  びゃ: ['bya'], びゅ: ['byu'], びょ: ['byo'],
  ぴゃ: ['pya'], ぴゅ: ['pyu'], ぴょ: ['pyo'],

  // §1.4 特殊（単独入力の綴り。促音の通常の打ち方は次の子音の重ね）
  っ: ['xtu', 'ltu'],
  ゃ: ['xya', 'lya'], ゅ: ['xyu', 'lyu'], ょ: ['xyo', 'lyo'],
};

/**
 * かな1単位（拗音は2文字で1単位）の、前後のかなに依存しない受理綴り。先頭が推奨綴り。
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
