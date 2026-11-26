// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { ROMAJI_TABLE, spellingsOf } from '../romajiTable';

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

describe('対応表の網羅', () => {
  const all = [...SEION, ...DAKUON, ...HANDAKUON, ...YOON, ...SPECIAL];

  it('清音・濁点・半濁点・拗音・促音の全かながあり、余分な項目がない', () => {
    expect([SEION, DAKUON, HANDAKUON, YOON].map((list) => list.length)).toEqual([46, 20, 5, 36]);
    expect(Object.keys(ROMAJI_TABLE).sort()).toEqual([...all].sort());
  });

  it.each(all)('%s に推奨綴りがあり、綴りは英小文字で重複しない', (kana) => {
    const spellings = spellingsOf(kana)!;
    expect(spellings[0]).toBe(ROMAJI_TABLE[kana][0]);
    expect(spellings.every((s) => /^[a-z]+$/.test(s))).toBe(true);
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
      ぢ: ['ji', 'di'],
      づ: ['zu', 'du'],
      を: ['wo'],
      ん: ['nn'],
    });
  });

  it('拗音の別綴り', () => {
    expect(ROMAJI_TABLE).toMatchObject({
      しゃ: ['sha', 'sya'],
      ちゅ: ['chu', 'tyu', 'cyu'],
      じょ: ['jo', 'jyo', 'zyo'],
      ぢゃ: ['ja', 'dya'],
    });
  });

  it('拗音は分け打ちも持つ', () => {
    expect(spellingsOf('きゃ')).toEqual(['kya', 'kixya', 'kilya']);
    expect(spellingsOf('しゅ')).toEqual([
      'shu', 'syu', 'shixyu', 'shilyu', 'sixyu', 'silyu',
    ]);
  });

  it.each(['', 'ア', 'ー', 'a', 'きあ', 'toString'])('表にない「%s」は undefined', (kana) => {
    expect(spellingsOf(kana)).toBeUndefined();
  });
});
