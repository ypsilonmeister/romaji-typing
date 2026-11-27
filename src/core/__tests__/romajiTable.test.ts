// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { allowsSingleN, recommendedSpelling, ROMAJI_TABLE, spellingsOf } from '../romajiTable';

const words = (text: string) => text.trim().split(/\s+/);

// 対応表とは別に書き出した、仕様 §1 が対象とするかなの一覧。
const SEION = words(`
  あ い う え お か き く け こ さ し す せ そ た ち つ て と な に ぬ ね の
  は ひ ふ へ ほ ま み む め も や ゆ よ ら り る れ ろ わ を ん`);
const DAKUON = words('が ぎ ぐ げ ご ざ じ ず ぜ ぞ だ ぢ づ で ど ば び ぶ べ ぼ');
const HANDAKUON = words('ぱ ぴ ぷ ぺ ぽ');
const YOON = words('き し ち に ひ み り ぎ じ ぢ び ぴ').flatMap((base) =>
  ['ゃ', 'ゅ', 'ょ'].map((small) => base + small),
);
const SPECIAL = words('っ ゃ ゅ ょ');
const LONG_VOWEL = words('ー');

describe('対応表の網羅', () => {
  const all = [...SEION, ...DAKUON, ...HANDAKUON, ...YOON, ...SPECIAL, ...LONG_VOWEL];

  it('清音・濁点・半濁点・拗音・促音・長音の全かながあり、余分な項目がない', () => {
    expect([SEION, DAKUON, HANDAKUON, YOON].map((list) => list.length)).toEqual([46, 20, 5, 36]);
    expect(Object.keys(ROMAJI_TABLE).sort()).toEqual([...all].sort());
  });

  it.each(all.filter((kana) => !SPECIAL.includes(kana)))('%s に推奨綴りがある', (kana) => {
    expect(recommendedSpelling(kana)).toBe(ROMAJI_TABLE[kana][0]);
  });

  // §1.4: 単独の綴りは受け付けるが案内には出さない。
  it.each(SPECIAL)('%s は許容綴りだけで、推奨綴りがない', (kana) => {
    expect(recommendedSpelling(kana)).toBeUndefined();
    expect(spellingsOf(kana)!.length).toBeGreaterThan(0);
  });

  it.each(all)('%s の綴りは英小文字またはハイフンで重複しない', (kana) => {
    const spellings = spellingsOf(kana)!;
    expect(spellings.every((s) => /^[a-z-]+$/.test(s))).toBe(true);
    expect(new Set(spellings).size).toBe(spellings.length);
  });

  it.each(all)('%s の綴りに、別の綴りの打ち始めになっているものがない', (kana) => {
    const spellings = spellingsOf(kana)!;
    for (const a of spellings) {
      expect(spellings.filter((b) => b !== a && b.startsWith(a))).toEqual([]);
    }
  });
});

describe('仕様 §1 の綴り', () => {
  it('推奨が訓令式と異なるかな', () => {
    expect(ROMAJI_TABLE).toMatchObject({
      し: ['shi', 'si'],
      ち: ['chi', 'ti'],
      つ: ['tsu', 'tu'],
      ふ: ['fu', 'hu'],
      じ: ['ji', 'zi'],
      を: ['wo'],
      ん: ['nn'],
    });
  });

  it('ぢ・づ・ぢゃ行の推奨は di/du/dya 系で、従来の ji/zu/ja 系も許容する', () => {
    expect(ROMAJI_TABLE).toMatchObject({
      ぢ: ['di', 'ji'],
      づ: ['du', 'zu'],
      ぢゃ: ['dya', 'ja'],
      ぢゅ: ['dyu', 'ju'],
      ぢょ: ['dyo', 'jo'],
    });
    expect(recommendedSpelling('ぢ')).toBe('di');
    expect(recommendedSpelling('づ')).toBe('du');
    expect(recommendedSpelling('ぢゃ')).toBe('dya');
    expect(recommendedSpelling('ぢゅ')).toBe('dyu');
    expect(recommendedSpelling('ぢょ')).toBe('dyo');
  });

  it('拗音の別綴り', () => {
    expect(ROMAJI_TABLE).toMatchObject({
      しゃ: ['sha', 'sya'],
      ちゅ: ['chu', 'tyu', 'cyu'],
      じょ: ['jo', 'jyo', 'zyo'],
      ぢゃ: ['dya', 'ja'],
    });
  });

  // §2.3: 「ん」の n は、次のかなによって受け付ける。
  it.each([...'あいうえおやゆよらりるれろわをなにぬねのん', 'にゃ', 'りゅ'])(
    '次が「%s」の「ん」は n 1つを受け付けない',
    (next) => {
      expect(allowsSingleN(next, false)).toBe(false);
    },
  );

  it.each(['か', 'さ', 'ぱ', 'きゃ', 'っ', 'ゃ'])('次が「%s」の「ん」は n 1つも受け付ける', (next) => {
    expect(allowsSingleN(next, false)).toBe(true);
  });

  it('語末の「ん」は n 1つを受け付け、単独の「ん」は受け付けない', () => {
    expect(allowsSingleN(undefined, false)).toBe(true);
    expect(allowsSingleN(undefined, true)).toBe(false);
  });

  it.each(['', 'ア', 'toString'])('表にない「%s」の推奨綴りは undefined', (kana) => {
    expect(recommendedSpelling(kana)).toBeUndefined();
  });

  it('拗音は分け打ちも持つ', () => {
    expect(spellingsOf('きゃ')).toEqual(['kya', 'kixya', 'kilya']);
    expect(spellingsOf('しゅ')).toEqual([
      'shu', 'syu', 'shixyu', 'shilyu', 'sixyu', 'silyu',
    ]);
  });

  it('長音「ー」の推奨綴りは - で、許容綴りは持たない', () => {
    expect(recommendedSpelling('ー')).toBe('-');
    expect(spellingsOf('ー')).toEqual(['-']);
  });

  it.each(['', 'ア', 'a', 'きあ', 'toString'])('表にない「%s」は undefined', (kana) => {
    expect(spellingsOf(kana)).toBeUndefined();
  });
});
