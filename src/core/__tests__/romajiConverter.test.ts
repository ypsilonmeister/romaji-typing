// @vitest-environment node
// DOM に依存しない自由入力ローマ字コンバータの単体テスト。
import { describe, expect, it } from 'vitest';
import {
  backspaceConverter,
  commitConverter,
  convertedText,
  createConverter,
  nextConverterKeys,
  pressConverterKey,
  type ConverterState,
} from '../romajiConverter';
import { ROMAJI_TABLE } from '../romajiTable';
import { SHIRITORI_DICTIONARY } from '../shiritori';
import { romajiForWord } from '../../data/wordPacks';

function typeKeys(keys: string, initial: ConverterState = createConverter()): ConverterState {
  return [...keys].reduce((state, ch) => pressConverterKey(state, ch).state, initial);
}

describe('自由入力コンバータ: 基本変換', () => {
  it('ローマ字をその場でかなへ変換し、元の状態は書き換えない', () => {
    const start = createConverter();
    const s1 = pressConverterKey(start, 'k');
    expect(s1).toEqual({
      state: { kana: [], buffer: 'k' },
      accepted: true,
      completed: [],
    });

    const s2 = pressConverterKey(s1.state, 'a');
    expect(s2).toEqual({
      state: { kana: ['か'], buffer: '' },
      accepted: true,
      completed: ['か'],
    });

    expect(start).toEqual({ kana: [], buffer: '' });
  });

  it('大文字入力も小文字と同様に受け付ける', () => {
    const state = typeKeys('KASA');
    expect(convertedText(state)).toBe('かさ');
    expect(state.buffer).toBe('');
  });

  it('推奨綴りと許容綴りの双方を変換できる', () => {
    expect(convertedText(typeKeys('shichitsufu'))).toBe('しちつふ');
    expect(convertedText(typeKeys('sitituhu'))).toBe('しちつふ');
    expect(convertedText(typeKeys('jizididu'))).toBe('じじぢづ');
    expect(convertedText(typeKeys('zu'))).toBe('ず');
    expect(convertedText(typeKeys('wo'))).toBe('を');
  });

  it('重複する綴り（ji / zu / ja / ju / jo）は推奨側（じ・ず・じゃ行）に解決される', () => {
    expect(convertedText(typeKeys('ji'))).toBe('じ');
    expect(convertedText(typeKeys('zu'))).toBe('ず');
    expect(convertedText(typeKeys('jajujo'))).toBe('じゃじゅじょ');
    expect(convertedText(typeKeys('didudyadyudyo'))).toBe('ぢづぢゃぢゅぢょ');
  });

  it('拗音と小さいかな（x・l 接頭辞）を表のとおりに変換できる', () => {
    expect(convertedText(typeKeys('kyashachanya'))).toBe('きゃしゃちゃにゃ');
    expect(convertedText(typeKeys('syatyacyajyazyadya'))).toBe('しゃちゃちゃじゃじゃぢゃ');
    expect(convertedText(typeKeys('xyalyuxyo'))).toBe('ゃゅょ');
    expect(convertedText(typeKeys('kixya'))).toBe('きゃ');
    expect(typeKeys('kya').kana).toEqual(['きゃ']);
    expect(typeKeys('kixya').kana).toEqual(['き', 'ゃ']);
  });
});

describe('自由入力コンバータ: 「ん」の解決', () => {
  it('n の直後が子音なら「ん」として確定し、その子音から次の入力を始める', () => {
    const afterN = typeKeys('gin');
    expect(afterN).toEqual({ kana: ['ぎ'], buffer: 'n' });

    const afterG = pressConverterKey(afterN, 'g');
    expect(afterG).toEqual({
      state: { kana: ['ぎ', 'ん'], buffer: 'g' },
      accepted: true,
      completed: ['ん'],
    });

    const done = pressConverterKey(afterG.state, 'a');
    expect(convertedText(done.state)).toBe('ぎんが');
    expect(done.state.buffer).toBe('');
  });

  it('n の直後が r / w などの子音でも「ん」として確定する', () => {
    expect(convertedText(typeKeys('senro'))).toBe('せんろ');
    expect(convertedText(typeKeys('sennro'))).toBe('せんろ');
    expect(convertedText(typeKeys('konwa'))).toBe('こんわ');
  });

  it('n の直後が母音なら な行、y なら にゃ行として処理する', () => {
    expect(convertedText(typeKeys('naninuneno'))).toBe('なにぬねの');
    expect(convertedText(typeKeys('nyanyunyo'))).toBe('にゃにゅにょ');
    expect(typeKeys('ny')).toEqual({ kana: [], buffer: 'ny' });
  });

  it('nn は「ん」になり、続く母音・y 行・な行と区別できる', () => {
    expect(convertedText(typeKeys('kanni'))).toBe('かんい');
    expect(convertedText(typeKeys('kinnyou'))).toBe('きんよう');
    expect(convertedText(typeKeys('onnna'))).toBe('おんな');
    expect(convertedText(typeKeys('konnnyaku'))).toBe('こんにゃく');
  });

  it('決定（commitConverter）時点で末尾に残った n は「ん」として解決する', () => {
    const pending = typeKeys('mikan');
    expect(pending).toEqual({ kana: ['み', 'か'], buffer: 'n' });

    const committed = commitConverter(pending);
    expect(committed).toEqual({ kana: ['み', 'か', 'ん'], buffer: '' });
    expect(convertedText(committed)).toBe('みかん');
  });

  it('決定時点で n 以外の未確定バッファはそのまま残る', () => {
    const pending = typeKeys('kash');
    const committed = commitConverter(pending);
    expect(committed).toEqual({ kana: ['か'], buffer: 'sh' });
  });
});

describe('自由入力コンバータ: 促音', () => {
  it.each([
    ['kakko', 'かっこ'],
    ['zutto', 'ずっと'],
    ['happa', 'はっぱ'],
    ['maccha', 'まっちゃ'],
    ['mattya', 'まっちゃ'],
    ['zasshi', 'ざっし'],
    ['akkka', 'あっっか'],
  ])('子音の重ね: %s → %s', (keys, expected) => {
    const state = typeKeys(keys);
    expect(convertedText(state)).toBe(expected);
    expect(state.buffer).toBe('');
  });

  it('xtu / ltu でも促音を入力できる', () => {
    expect(convertedText(typeKeys('kaxtuko'))).toBe('かっこ');
    expect(convertedText(typeKeys('kaltuko'))).toBe('かっこ');
    expect(convertedText(typeKeys('axtu'))).toBe('あっ');
  });

  it('母音・x・l の連続は促音にならない', () => {
    expect(convertedText(typeKeys('aa'))).toBe('ああ');
    expect(pressConverterKey(typeKeys('x'), 'x').accepted).toBe(false);
    expect(pressConverterKey(typeKeys('l'), 'l').accepted).toBe(false);
  });
});

describe('自由入力コンバータ: Backspace', () => {
  it('バッファがあれば末尾1文字だけを取り除く', () => {
    const s1 = typeKeys('kash');
    expect(s1).toEqual({ kana: ['か'], buffer: 'sh' });
    const s2 = backspaceConverter(s1);
    expect(s2).toEqual({ kana: ['か'], buffer: 's' });
    const s3 = backspaceConverter(s2);
    expect(s3).toEqual({ kana: ['か'], buffer: '' });
  });

  it('バッファが空なら変換済みかなの末尾1単位を取り除く（拗音も1単位）', () => {
    const s1 = typeKeys('densha');
    expect(s1).toEqual({ kana: ['で', 'ん', 'しゃ'], buffer: '' });
    const s2 = backspaceConverter(s1);
    expect(s2).toEqual({ kana: ['で', 'ん'], buffer: '' });
    const s3 = backspaceConverter(s2);
    expect(s3).toEqual({ kana: ['で'], buffer: '' });
  });

  it('空状態での Backspace は同じ状態を返す', () => {
    const empty = createConverter();
    expect(backspaceConverter(empty)).toBe(empty);
  });
});

describe('自由入力コンバータ: 無効キーと次に打てるキー', () => {
  it.each(['q', 'v', '1', ' ', '-', 'Shift', 'Enter', 'Backspace', ''])(
    '変換できないキー「%s」は受け付けず状態を保つ',
    (key) => {
      const start = createConverter();
      const result = pressConverterKey(start, key);
      expect(result).toEqual({ state: start, accepted: false, completed: [] });
    },
  );

  it('バッファ途中の無効キーも受け付けずバッファを保つ', () => {
    const state = typeKeys('sh');
    const result = pressConverterKey(state, 'e');
    expect(result).toEqual({ state, accepted: false, completed: [] });
    expect(convertedText(pressConverterKey(result.state, 'i').state)).toBe('し');
  });

  it('全到達バッファで nextConverterKeys と pressConverterKey.accepted が完全一致し、行き止まりがない', () => {
    const alphabet = [...'abcdefghijklmnopqrstuvwxyz'];
    const visited = new Set<string>();
    const queue: string[] = [''];
    const failures: string[] = [];

    while (queue.length > 0) {
      const buffer = queue.shift()!;
      if (visited.has(buffer)) continue;
      visited.add(buffer);

      const state: ConverterState = { kana: [], buffer };
      const validNext = nextConverterKeys(state);
      if (validNext.length === 0) {
        failures.push(`buffer="${buffer}" に行き止まり`);
      }

      for (const ch of alphabet) {
        const res = pressConverterKey(state, ch);
        if (res.accepted !== validNext.includes(ch)) {
          failures.push(`buffer="${buffer}" + "${ch}": accepted=${res.accepted}`);
        }
        if (res.accepted && !visited.has(res.state.buffer)) {
          queue.push(res.state.buffer);
        }
      }
    }

    expect(failures).toEqual([]);
    // ROMAJI_TABLE 由来の全接頭辞が到達可能であることも確認
    expect(visited.has('sh')).toBe(true);
    expect(visited.has('ch')).toBe(true);
    expect(visited.has('ts')).toBe(true);
    expect(visited.has('xt')).toBe(true);
    expect(visited.has('ny')).toBe(true);
  });

  it('しりとり辞書の全単語を推奨ローマ字で入力・変換できる', () => {
    const missing: string[] = [];
    for (const word of SHIRITORI_DICTIONARY) {
      const romaji = romajiForWord(word);
      const state = commitConverter(typeKeys(romaji));
      if (state.buffer !== '' || convertedText(state) !== word) {
        missing.push(`${word} (${romaji}) -> ${convertedText(state)} [${state.buffer}]`);
      }
    }
    expect(missing).toEqual([]);
  });

  it('ROMAJI_TABLE の全かなの推奨綴りを変換できる', () => {
    for (const [kana, spellings] of Object.entries(ROMAJI_TABLE)) {
      const state = typeKeys(spellings[0]);
      expect(convertedText(state)).toBe(kana);
      expect(state.buffer).toBe('');
    }
  });
});
