// テーマ別単語パック（仕様 v0.3 詳細仕様 §5）。
// 語はひらがな表記が自然なものに限り、ローマ字は §5 の推奨綴り表記に合わせる。

import { createMatcher } from '../core/matcher';

export type ThemeId =
  | 'space'
  | 'plants'
  | 'geography'
  | 'architecture'
  | 'food'
  | 'animals'
  | 'vehicles';

export interface WordEntry {
  /** かな表記。wordProgress の wordId としても使う。 */
  readonly kana: string;
  /** 仕様 v0.3 §5 のローマ字表記。 */
  readonly romaji: string;
}

export interface ThemePack {
  readonly id: ThemeId;
  readonly name: string;
  readonly words: readonly WordEntry[];
}

export const THEME_PACKS: readonly ThemePack[] = [
  {
    id: 'space',
    name: '宇宙',
    words: [
      { kana: 'ほし', romaji: 'hoshi' },
      { kana: 'つき', romaji: 'tsuki' },
      { kana: 'たいよう', romaji: 'taiyou' },
      { kana: 'ちきゅう', romaji: 'chikyuu' },
      { kana: 'かせい', romaji: 'kasei' },
      { kana: 'きんせい', romaji: 'kinsei' },
      { kana: 'すいせい', romaji: 'suisei' },
      { kana: 'もくせい', romaji: 'mokusei' },
      { kana: 'どせい', romaji: 'dosei' },
      { kana: 'わくせい', romaji: 'wakusei' },
      { kana: 'うちゅう', romaji: 'uchuu' },
      { kana: 'ぎんが', romaji: 'ginga' },
      { kana: 'せいざ', romaji: 'seiza' },
      { kana: 'ながれぼし', romaji: 'nagareboshi' },
      { kana: 'いんせき', romaji: 'inseki' },
      { kana: 'えいせい', romaji: 'eisei' },
      { kana: 'じゅうりょく', romaji: 'juuryoku' },
      { kana: 'あまのがわ', romaji: 'amanogawa' },
      { kana: 'ほしぞら', romaji: 'hoshizora' },
      { kana: 'つきよ', romaji: 'tsukiyo' },
      { kana: 'そら', romaji: 'sora' },
      { kana: 'よる', romaji: 'yoru' },
      { kana: 'ひかり', romaji: 'hikari' },
      { kana: 'かげ', romaji: 'kage' },
      { kana: 'だーくまたー', romaji: 'da-kumata-' },
      { kana: 'ぶらっくほーる', romaji: 'burakkuho-ru' },
      { kana: 'にゅーとりの', romaji: 'nyu-torino' },
    ],
  },
  {
    id: 'plants',
    name: '植物',
    words: [
      { kana: 'はな', romaji: 'hana' },
      { kana: 'はっぱ', romaji: 'happa' },
      { kana: 'はなびら', romaji: 'hanabira' },
      { kana: 'き', romaji: 'ki' },
      { kana: 'たね', romaji: 'tane' },
      { kana: 'め', romaji: 'me' },
      { kana: 'ねっこ', romaji: 'nekko' },
      { kana: 'くさ', romaji: 'kusa' },
      { kana: 'もり', romaji: 'mori' },
      { kana: 'はやし', romaji: 'hayashi' },
      { kana: 'さくら', romaji: 'sakura' },
      { kana: 'たんぽぽ', romaji: 'tanpopo' },
      { kana: 'ひまわり', romaji: 'himawari' },
      { kana: 'あさがお', romaji: 'asagao' },
      { kana: 'すみれ', romaji: 'sumire' },
      { kana: 'もみじ', romaji: 'momiji' },
      { kana: 'いちょう', romaji: 'ichou' },
      { kana: 'まつ', romaji: 'matsu' },
      { kana: 'たけ', romaji: 'take' },
      { kana: 'うめ', romaji: 'ume' },
      { kana: 'ふじ', romaji: 'fuji' },
      { kana: 'かえで', romaji: 'kaede' },
      { kana: 'どんぐり', romaji: 'donguri' },
      { kana: 'わかば', romaji: 'wakaba' },
      { kana: 'つぼみ', romaji: 'tsubomi' },
    ],
  },
  {
    id: 'geography',
    name: '地理',
    words: [
      { kana: 'やま', romaji: 'yama' },
      { kana: 'かわ', romaji: 'kawa' },
      { kana: 'うみ', romaji: 'umi' },
      { kana: 'しま', romaji: 'shima' },
      { kana: 'みずうみ', romaji: 'mizuumi' },
      { kana: 'さばく', romaji: 'sabaku' },
      { kana: 'たに', romaji: 'tani' },
      { kana: 'ぬま', romaji: 'numa' },
      { kana: 'いけ', romaji: 'ike' },
      { kana: 'すな', romaji: 'suna' },
      { kana: 'しお', romaji: 'shio' },
      { kana: 'なみ', romaji: 'nami' },
      { kana: 'みなと', romaji: 'minato' },
      { kana: 'はんとう', romaji: 'hantou' },
      { kana: 'かざん', romaji: 'kazan' },
      { kana: 'たき', romaji: 'taki' },
      { kana: 'どうくつ', romaji: 'doukutsu' },
      { kana: 'こうげん', romaji: 'kougen' },
      { kana: 'へいや', romaji: 'heiya' },
      { kana: 'がけ', romaji: 'gake' },
      { kana: 'すなはま', romaji: 'sunahama' },
      { kana: 'ちず', romaji: 'chizu' },
      { kana: 'さわ', romaji: 'sawa' },
      { kana: 'おーすとらりあ', romaji: 'o-sutoraria' },
    ],
  },
  {
    id: 'architecture',
    name: '建築',
    words: [
      { kana: 'いえ', romaji: 'ie' },
      { kana: 'うち', romaji: 'uchi' },
      { kana: 'たてもの', romaji: 'tatemono' },
      { kana: 'はしら', romaji: 'hashira' },
      { kana: 'かべ', romaji: 'kabe' },
      { kana: 'やね', romaji: 'yane' },
      { kana: 'まど', romaji: 'mado' },
      { kana: 'とびら', romaji: 'tobira' },
      { kana: 'かいだん', romaji: 'kaidan' },
      { kana: 'げんかん', romaji: 'genkan' },
      { kana: 'にわ', romaji: 'niwa' },
      { kana: 'もん', romaji: 'mon' },
      { kana: 'てら', romaji: 'tera' },
      { kana: 'じんじゃ', romaji: 'jinja' },
      { kana: 'しろ', romaji: 'shiro' },
      { kana: 'とう', romaji: 'tou' },
      { kana: 'はし', romaji: 'hashi' },
      { kana: 'えき', romaji: 'eki' },
      { kana: 'みせ', romaji: 'mise' },
      { kana: 'がっこう', romaji: 'gakkou' },
      { kana: 'こうえん', romaji: 'kouen' },
      { kana: 'へい', romaji: 'hei' },
      { kana: 'さっかー', romaji: 'sakka-' },
    ],
  },
  {
    id: 'food',
    name: '食べ物',
    words: [
      { kana: 'ごはん', romaji: 'gohan' },
      { kana: 'みそしる', romaji: 'misoshiru' },
      { kana: 'さかな', romaji: 'sakana' },
      { kana: 'たまご', romaji: 'tamago' },
      { kana: 'やさい', romaji: 'yasai' },
      { kana: 'くだもの', romaji: 'kudamono' },
      { kana: 'りんご', romaji: 'ringo' },
      { kana: 'みかん', romaji: 'mikan' },
      { kana: 'すいか', romaji: 'suika' },
      { kana: 'もも', romaji: 'momo' },
      { kana: 'ぶどう', romaji: 'budou' },
      { kana: 'いちご', romaji: 'ichigo' },
      { kana: 'なし', romaji: 'nashi' },
      { kana: 'かき', romaji: 'kaki' },
      { kana: 'さくらんぼ', romaji: 'sakuranbo' },
      { kana: 'ぎゅうにゅう', romaji: 'gyuunyuu' },
      { kana: 'うどん', romaji: 'udon' },
      { kana: 'そば', romaji: 'soba' },
      { kana: 'すし', romaji: 'sushi' },
      { kana: 'みそ', romaji: 'miso' },
      { kana: 'しょうゆ', romaji: 'shouyu' },
      { kana: 'さとう', romaji: 'satou' },
      { kana: 'しお', romaji: 'shio' },
      { kana: 'えび', romaji: 'ebi' },
      { kana: 'けーき', romaji: 'ke-ki' },
    ],
  },
  {
    id: 'animals',
    name: '動物',
    words: [
      { kana: 'いぬ', romaji: 'inu' },
      { kana: 'ねこ', romaji: 'neko' },
      { kana: 'うま', romaji: 'uma' },
      { kana: 'うし', romaji: 'ushi' },
      { kana: 'ぶた', romaji: 'buta' },
      { kana: 'ひつじ', romaji: 'hitsuji' },
      { kana: 'やぎ', romaji: 'yagi' },
      { kana: 'うさぎ', romaji: 'usagi' },
      { kana: 'ねずみ', romaji: 'nezumi' },
      { kana: 'とり', romaji: 'tori' },
      { kana: 'からす', romaji: 'karasu' },
      { kana: 'すずめ', romaji: 'suzume' },
      { kana: 'かも', romaji: 'kamo' },
      { kana: 'つる', romaji: 'tsuru' },
      { kana: 'かめ', romaji: 'kame' },
      { kana: 'かえる', romaji: 'kaeru' },
      { kana: 'へび', romaji: 'hebi' },
      { kana: 'とかげ', romaji: 'tokage' },
      { kana: 'ちょう', romaji: 'chou' },
      { kana: 'あり', romaji: 'ari' },
      { kana: 'はち', romaji: 'hachi' },
      { kana: 'くも', romaji: 'kumo' },
      { kana: 'せみ', romaji: 'semi' },
      { kana: 'かぶとむし', romaji: 'kabutomushi' },
      { kana: 'くわがた', romaji: 'kuwagata' },
      { kana: 'ほたる', romaji: 'hotaru' },
      { kana: 'ざりがに', romaji: 'zarigani' },
      { kana: 'ことり', romaji: 'kotori' },
    ],
  },
  {
    id: 'vehicles',
    name: 'のりもの・踏切',
    words: [
      { kana: 'でんしゃ', romaji: 'densha' },
      { kana: 'ふみきり', romaji: 'fumikiri' },
      { kana: 'しんごう', romaji: 'shingou' },
      { kana: 'せんろ', romaji: 'senro' },
      { kana: 'きしゃ', romaji: 'kisha' },
      { kana: 'れっしゃ', romaji: 'ressha' },
      { kana: 'とっきゅう', romaji: 'tokkyuu' },
      { kana: 'しんかんせん', romaji: 'shinkansen' },
      { kana: 'ちかてつ', romaji: 'chikatetsu' },
      { kana: 'ふね', romaji: 'fune' },
      { kana: 'ひこうき', romaji: 'hikouki' },
      { kana: 'じてんしゃ', romaji: 'jitensha' },
      { kana: 'くるま', romaji: 'kuruma' },
      { kana: 'しょうぼうしゃ', romaji: 'shoubousha' },
      { kana: 'きゅうきゅうしゃ', romaji: 'kyuukyuusha' },
      { kana: 'せんすいかん', romaji: 'sensuikan' },
      { kana: 'ききゅう', romaji: 'kikyuu' },
      { kana: 'そり', romaji: 'sori' },
      { kana: 'ろけっと', romaji: 'roketto' },
    ],
  },
];

/** 単語パックに含まれる全かなの集合。 */
export const PACK_KANA_SET: ReadonlySet<string> = new Set(
  THEME_PACKS.flatMap((pack) => pack.words.map((word) => word.kana)),
);

/**
 * 単語の推奨ローマ字表記を返す。
 * 単語パックに含まれる語は §5 の表記をそのまま返し、含まれない語（ステージ例語など）は
 * 照合エンジンの推奨綴りから組み立てる。
 */
export function romajiForWord(kana: string): string {
  for (const pack of THEME_PACKS) {
    const found = pack.words.find((word) => word.kana === kana);
    if (found) return found.romaji;
  }
  try {
    const matcher = createMatcher(kana);
    return matcher.units.map((unit) => unit.options[0]?.romaji ?? '').join('');
  } catch {
    return '';
  }
}
