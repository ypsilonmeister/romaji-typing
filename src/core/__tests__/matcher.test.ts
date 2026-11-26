// @vitest-environment node
// DOM のない環境で実行し、マッチャが UI に依存しないことも確かめる。
import { describe, expect, it } from 'vitest';
import {
  backspace,
  candidates,
  createMatcher,
  guideKey,
  isComplete,
  type MatcherState,
  nextKeys,
  pressKey,
  splitKana,
} from '../matcher';
import { ROMAJI_TABLE, spellingsOf } from '../romajiTable';

/** キー列を順に入力する。受け付けられないキーがあってもそのまま続ける。 */
function type(word: string | MatcherState, keys: string): MatcherState {
  const start = typeof word === 'string' ? createMatcher(word) : word;
  return [...keys].reduce((state, key) => pressKey(state, key).state, start);
}

/** ミスなしで、ちょうどお題が完成する。 */
function expectCompletes(word: string, keys: string) {
  const before = type(word, keys.slice(0, -1));
  expect(isComplete(before), `${word}: ${keys} の途中で完成`).toBe(false);
  const state = type(before, keys.slice(-1));
  expect(state.mistakeCount, `${word}: ${keys} のミス`).toBe(0);
  expect(isComplete(state), `${word}: ${keys} で未完成`).toBe(true);
}

/** 案内どおりに打ち切ったときのキー列。 */
function followGuide(word: string): string {
  let state = createMatcher(word);
  let keys = '';
  while (!isComplete(state)) {
    const key = guideKey(state)!;
    expect(key, `${word}: ${keys} の次の案内`).toBeDefined();
    const result = pressKey(state, key);
    expect(result.accepted).toBe(true);
    state = result.state;
    keys += key;
    expect(keys.length).toBeLessThan(100);
  }
  return keys;
}

/** 案内のキーを順に返しながら、keys を入力する。 */
function guideWhileTyping(word: string, keys: string): (string | undefined)[] {
  let state = createMatcher(word);
  return [...keys].map((key) => {
    const guide = guideKey(state);
    state = pressKey(state, key).state;
    return guide;
  });
}

describe('基本の照合', () => {
  it('1文字ずつ受けて、綴りが完結したら次のかなへ進む', () => {
    const first = pressKey(createMatcher('かさ'), 'k');
    expect(first).toMatchObject({ accepted: true, completed: [] });
    expect(first.state).toMatchObject({ index: 0, typed: 'k' });

    const second = pressKey(first.state, 'a');
    expect(second.completed).toEqual([{ kana: 'か', romaji: 'ka' }]);
    expect(second.state).toMatchObject({ index: 1, typed: '' });

    const end = type(second.state, 'sa');
    expect(isComplete(end)).toBe(true);
    expect(nextKeys(end)).toEqual([]);
    expect(candidates(end)).toEqual([]);
  });

  it('打ったキーに矛盾しない候補だけが残る', () => {
    const romaji = (state: MatcherState) => candidates(state).map((option) => option.romaji);
    expect(romaji(createMatcher('ちゃ'))).toEqual(['cha', 'tya', 'cya', 'chixya', 'chilya', 'tixya', 'tilya']);
    expect(romaji(type('ちゃ', 'c'))).toEqual(['cha', 'cya', 'chixya', 'chilya']);
    expect(romaji(type('ちゃ', 'cy'))).toEqual(['cya']);
  });

  it('元の状態は書き換わらない', () => {
    const start = createMatcher('か');
    const snapshot = structuredClone(start);
    type(start, 'xka');
    expect(start).toEqual(snapshot);
  });

  it('拗音は2文字で1単位に分ける', () => {
    expect(splitKana('きゃきしゅ')).toEqual(['きゃ', 'き', 'しゅ']);
    expect(splitKana('あゃ')).toEqual(['あ', 'ゃ']);
  });

  it.each(['', 'カ', 'らーめん', 'ab', 'あ い'])('扱えないお題「%s」は例外', (word) => {
    expect(() => createMatcher(word)).toThrow();
  });
});

describe('許容綴りの受理', () => {
  const singles = Object.keys(ROMAJI_TABLE).flatMap((kana) =>
    spellingsOf(kana)!.map((romaji) => [kana, romaji] as const),
  );

  it.each(singles)('%s = %s', (kana, romaji) => {
    expectCompletes(kana, romaji);
    expect(type(kana, romaji).completed).toEqual([{ kana, romaji }]);
  });

  it.each([
    ['を', 'o'],
    ['し', 'ci'],
    ['じゃ', 'jilo'],
  ])('%s は %s では完成しない', (kana, romaji) => {
    expect(isComplete(type(kana, romaji))).toBe(false);
  });
});

describe('間違いキー', () => {
  it('受け付けず、候補と打った分を保ち、内部で数える', () => {
    const before = type('し', 's');
    const result = pressKey(before, 'a');
    expect(result).toMatchObject({ accepted: false, completed: [] });
    expect(result.state).toEqual({ ...before, mistakeCount: 1 });
    expect(candidates(result.state)).toEqual(candidates(before));
    expect(isComplete(type(result.state, 'i'))).toBe(true);
  });

  it.each([' ', '1', '-'])('英字でない1文字「%s」もミス', (key) => {
    expect(pressKey(createMatcher('あ'), key).state.mistakeCount).toBe(1);
  });

  it.each(['Shift', 'Enter', 'Backspace', ''])('「%s」は無視してミスに数えない', (key) => {
    const state = createMatcher('あ');
    expect(pressKey(state, key)).toEqual({ state, accepted: false, absorbed: false, completed: [] });
  });

  it('大文字でも受け付ける', () => {
    expectCompletes('か', 'KA');
  });

});

describe('Backspace', () => {
  it('入力中のかなの1打を取り消し、別の綴りに切り替えられる', () => {
    const state = backspace(type('ちゃ', 'ty'));
    expect(state.typed).toBe('t');
    expect(type(backspace(state), 'cha').completed).toEqual([{ kana: 'ちゃ', romaji: 'cha' }]);
  });

  it('完成したかなには戻らない', () => {
    const state = type('かさ', 'ka');
    expect(backspace(state)).toBe(state);
    const done = type(state, 'sa');
    expect(backspace(done)).toBe(done);
  });

  it('子音重ねの2打目を消すと、促音は完成のまま次のかなを打ち直せる', () => {
    const state = backspace(type('まっち', 'macc'));
    expect(state).toMatchObject({ index: 2, typed: '' });
    expect(isComplete(type(state, 'ti'))).toBe(true);
  });

  it('促音の重ねの1打目は取り消せる', () => {
    const state = backspace(type('かっこ', 'kak'));
    expect(isComplete(type(state, 'xtuko'))).toBe(true);
  });
});

describe('「ん」の確定条件', () => {
  it('かに と かんい を打ち分ける', () => {
    expectCompletes('かに', 'kani');
    expectCompletes('かんい', 'kanni');
    expect(type('かんい', 'kani')).toMatchObject({ index: 1, typed: 'n', mistakeCount: 1 });
  });

  it('きんよう と きにょう を打ち分ける', () => {
    expectCompletes('きにょう', 'kinyou');
    expectCompletes('きんよう', 'kinnyou');
    expect(type('きんよう', 'kiny').mistakeCount).toBe(1);
  });

  it.each([...'あいうえおやゆよらりるれろわをなにぬねのん'])(
    '次が「%s」なら nn が必要',
    (next) => {
      // 語末の「ん」は n 1つで完成する。
      const keys = next === 'ん' ? 'n' : followGuide(next);
      expectCompletes(`ん${next}`, `nn${keys}`);
      const single = type(`ん${next}`, `n${keys[0]}`);
      expect(single.completed).not.toContainEqual({ kana: 'ん', romaji: 'n' });
    },
  );

  it.each(['にゃ', 'にゅ', 'にょ', 'りゃ', 'りゅ', 'りょ'])('次が「%s」でも nn が必要', (next) => {
    expectCompletes(`こん${next}`, `konn${followGuide(next)}`);
    const single = type(`こん${next}`, `kon${followGuide(next)}`);
    expect(isComplete(single)).toBe(false);
    expect(single.mistakeCount).toBeGreaterThan(0);
  });

  it.each([
    ['おんな', 'onnna'],
    ['こんにゃく', 'konnnyaku'],
  ])('な行の前も nn: %s = %s', (word, keys) => {
    expectCompletes(word, keys);
  });

  const others = Object.keys(ROMAJI_TABLE).filter(
    (kana) => !'あいうえおやゆよらりるれろわをなにぬねのん'.includes(kana[0]),
  );

  it.each(others)('次が「%s」なら n でも nn でもよい', (next) => {
    for (const romaji of spellingsOf(next)!) {
      expectCompletes(`ん${next}`, `n${romaji}`);
      expectCompletes(`ん${next}`, `nn${romaji}`);
    }
  });

  it('n 1つの場合は、次のかなの1打目で「ん」が確定する', () => {
    const pending = type('ぎんが', 'gin');
    expect(pending).toMatchObject({ index: 1, typed: 'n' });
    const result = pressKey(pending, 'g');
    expect(result.completed).toEqual([{ kana: 'ん', romaji: 'n' }]);
    expect(result.state).toMatchObject({ index: 2, typed: 'g' });
  });

  it('n 1つの後の合わないキーはミスで、「ん」は未確定のまま', () => {
    expect(type('ぎんが', 'ginz')).toMatchObject({ index: 1, typed: 'n', mistakeCount: 1 });
  });

  it('次が促音でも n 1つでよい', () => {
    expectCompletes('しんっか', 'shinkka');
    expectCompletes('しんっか', 'shinxtuka');
    expectCompletes('しんっか', 'shinnkka');
  });

  it('語末は n 1つで確定する', () => {
    expectCompletes('みかん', 'mikan');
    expect(type('みかん', 'mikan').completed.slice(-1)[0]).toEqual({ kana: 'ん', romaji: 'n' });
  });

  it('単独の「ん」は nn のみ', () => {
    expect(isComplete(type('ん', 'n'))).toBe(false);
    expectCompletes('ん', 'nn');
  });
});

describe('完成後のキー', () => {
  const keys = [...'abcdefghijklmnopqrstuvwxyzN', 'Shift', '1'];

  it.each([
    ['みかん', 'mikan'],
    ['あ', 'a'],
    ['ん', 'nn'],
  ])('%s を %s で完成させた後は、次のキーも案内もなく、どのキーも accepted にならない', (word, typed) => {
    const done = type(word, typed);
    expect(isComplete(done)).toBe(true);
    expect(nextKeys(done)).toEqual([]);
    expect(guideKey(done)).toBeUndefined();
    for (const key of keys) {
      const result = pressKey(done, key);
      expect(result, key).toMatchObject({ accepted: false, completed: [] });
      expect(result.state.mistakeCount, key).toBe(0);
    }
  });

  it.each(['n', 'N'])('語末の「ん」を n 1つで完成させた後の %s は、受け流しとして返す', (key) => {
    const done = type('みかん', 'mikan');
    const result = pressKey(done, key);
    expect(result).toEqual({
      state: { ...done, absorbableN: false },
      accepted: false,
      absorbed: true,
      completed: [],
    });
  });

  it('受け流すのは1つだけ', () => {
    const once = type('みかん', 'mikann');
    expect(pressKey(once, 'n')).toEqual({ state: once, accepted: false, absorbed: false, completed: [] });
  });

  it('間に別の1文字キーを挟むと受け流しは失効する', () => {
    const done = type('みかん', 'mikan');
    const other = pressKey(done, 'a');
    expect(other).toEqual({
      state: { ...done, absorbableN: false },
      accepted: false,
      absorbed: false,
      completed: [],
    });
    expect(pressKey(other.state, 'n')).toEqual({
      state: other.state,
      accepted: false,
      absorbed: false,
      completed: [],
    });
  });

  it('Shift などの1文字でないキーを挟んでも直後の n は受け流す', () => {
    const done = type('みかん', 'mikan');
    const afterShift = pressKey(done, 'Shift');
    expect(afterShift).toEqual({ state: done, accepted: false, absorbed: false, completed: [] });
    expect(pressKey(afterShift.state, 'N')).toEqual({
      state: { ...done, absorbableN: false },
      accepted: false,
      absorbed: true,
      completed: [],
    });
  });

  it.each([
    ['あ', 'a'],
    ['ん', 'nn'],
  ])('%s を %s で完成させた後の n は受け流さない', (word, typed) => {
    expect(pressKey(type(word, typed), 'n').absorbed).toBe(false);
  });

  it('完成前の受理は absorbed にならない', () => {
    expect(pressKey(createMatcher('な'), 'n')).toMatchObject({ accepted: true, absorbed: false });
  });
});

describe('促音', () => {
  it.each([
    ['かっこ', 'kakko'],
    ['ずっと', 'zutto'],
    ['しっかり', 'shikkari'],
    ['はっぱ', 'happa'],
    ['まっちゃ', 'maccha'],
    ['まっちゃ', 'mattya'],
    ['まっちゃ', 'maccya'],
    ['ざっし', 'zasshi'],
    ['ざっし', 'zassi'],
    ['きっじゃ', 'kijja'],
    ['きっじゃ', 'kizzya'],
    ['きっきゃ', 'kikkixya'],
    ['あっっか', 'akkka'],
  ])('子音の重ね: %s = %s', (word, keys) => {
    expectCompletes(word, keys);
  });

  it.each(['kaxtuko', 'kaltuko'])('単独入力も受け付ける: かっこ = %s', (keys) => {
    expectCompletes('かっこ', keys);
  });

  it('重ねの2打目で促音が確定し、同じキーが次のかなの1打目になる', () => {
    const pending = type('かっこ', 'kak');
    expect(pending).toMatchObject({ index: 1, typed: 'k' });
    const result = pressKey(pending, 'k');
    expect(result.completed).toEqual([{ kana: 'っ', romaji: 'k' }]);
    expect(result.state).toMatchObject({ index: 2, typed: 'k' });
  });

  it.each(['kakt', 'kako', 'kat'])('合わない子音は受け付けない: かっこ = %s', (keys) => {
    expect(type('かっこ', keys).mistakeCount).toBe(1);
  });

  it('語末の促音は単独入力のみ', () => {
    expectCompletes('あっ', 'axtu');
    expectCompletes('あっ', 'altu');
  });

  it.each([
    ['っあ', 'a'],
    ['っな', 'n'],
    ['っん', 'n'],
  ])('母音と n は重ねない: %s', (word, key) => {
    expect(type(word, key).mistakeCount).toBe(1);
    // 語末の「ん」は n 1つで完成する。
    const rest = word === 'っん' ? 'n' : followGuide(word.slice(1));
    expectCompletes(word, `xtu${rest}`);
  });
});

describe('案内の追従', () => {
  it('打ち始める前と途中は推奨綴りに沿う', () => {
    expect(followGuide('し')).toBe('shi');
    expect(guideWhileTyping('し', 'shi')).toEqual(['s', 'h', 'i']);
  });

  // §2.2: 打ち始めが共通の間は、推奨綴りに沿う。
  it('し: s の時点では推奨の h を案内し、i も受け付ける', () => {
    const state = type('し', 's');
    expect(guideKey(state)).toBe('h');
    expect(nextKeys(state)).toEqual(['h', 'i']);
    expectCompletes('し', 'si');
  });

  it('ち: t と打ち始めた時点で別綴りに決まるので、次は i を案内する', () => {
    expect(guideKey(type('ち', 't'))).toBe('i');
    expect(nextKeys(type('ち', 't'))).toEqual(['i']);
  });

  it.each([
    ['ちゃ', 'tya', ['c', 'y', 'a']],
    ['しゃ', 'sya', ['s', 'h', 'a']],
    ['じゃ', 'zya', ['j', 'y', 'a']],
    ['じゃ', 'jya', ['j', 'a', 'a']],
    ['ぢ', 'ji', ['d', 'i']],
    ['づ', 'zu', ['d', 'u']],
    ['ぢゃ', 'ja', ['d', 'a']],
    ['ぢゅ', 'ju', ['d', 'u']],
    ['ぢょ', 'jo', ['d', 'o']],
    ['きゃ', 'kixya', ['k', 'y', 'x', 'y', 'a']],
    ['っ', 'ltu', [undefined, 't', 'u']],
  ])('%s を %s と打つと、案内がその綴りに切り替わる', (word, keys, guides) => {
    expect(guideWhileTyping(word, keys)).toEqual(guides);
  });

  it.each([
    ['ぢ', 'di', 'ji'],
    ['づ', 'du', 'zu'],
    ['ぢゃ', 'dya', 'ja'],
    ['ぢゅ', 'dyu', 'ju'],
    ['ぢょ', 'dyo', 'jo'],
  ])('ぢ・づ・ぢゃ行: %s の案内は推奨 %s に沿い、許容 %s も受理する', (kana, recommended, allowed) => {
    expect(followGuide(kana)).toBe(recommended);
    expect(guideWhileTyping(kana, recommended)).toEqual([...recommended]);
    expectCompletes(kana, recommended);
    expectCompletes(kana, allowed);
    expect(type(kana, allowed).completed).toEqual([{ kana, romaji: allowed }]);
  });

  it.each([
    ['っぢ', 'ddi', 'jji'],
    ['っづ', 'ddu', 'zzu'],
    ['っぢゃ', 'ddya', 'jja'],
  ])('促音＋ぢ・づ・ぢゃ行: %s の案内は推奨 %s に沿い、%s も受理する', (word, recommended, allowed) => {
    expect(followGuide(word)).toBe(recommended);
    expectCompletes(word, recommended);
    expectCompletes(word, allowed);
  });

  it('促音の案内は子音の重ね。別綴りの子音にも追従する', () => {
    expect(followGuide('まっちゃ')).toBe('maccha');
    expect(guideWhileTyping('まっちゃ', 'mattya')).toEqual(['m', 'a', 'c', 't', 'y', 'a']);
    expect(nextKeys(type('まっちゃ', 'ma'))).toEqual(['c', 't', 'x', 'l']);
    expect(guideKey(type('まっちゃ', 'ma'))).toBe('c');
  });

  it('xtu で打ち始めたら xtu に沿う', () => {
    expect(guideWhileTyping('かっこ', 'kaxtuko')).toEqual(['k', 'a', 'k', 't', 'u', 'k', 'o']);
  });

  it('「ん」の案内は nn。n の後は次のかなのキーも受け付ける', () => {
    expect(followGuide('ぎんが')).toBe('ginnga');
    expect(nextKeys(type('ぎんが', 'gin'))).toEqual(['n', 'g']);
    expect(nextKeys(type('かんい', 'kan'))).toEqual(['n']);
  });

  it('Backspace で戻ると案内も戻る', () => {
    expect(guideKey(backspace(type('ちゃ', 't')))).toBe('c');
  });

  it('完成後は案内がない', () => {
    expect(guideKey(type('あ', 'a'))).toBeUndefined();
  });
});

// §1.4: x・l の単独入力は受け付けるが、案内には出さない。
describe('推奨の打ち方がない位置', () => {
  it.each([
    ['っ', ''],
    ['ゃ', ''],
    ['ゅ', ''],
    ['ょ', ''],
    ['あっ', 'a'],
    ['あゃ', 'a'],
    ['っあ', ''],
    ['っな', ''],
    ['っん', ''],
  ])('「%s」（%s の後）: 案内は出さず、x と l は受け付ける', (word, done) => {
    const state = type(word, done);
    expect(guideKey(state)).toBeUndefined();
    expect(nextKeys(state)).toEqual(['x', 'l']);
    for (const key of ['x', 'l']) {
      expect(pressKey(state, key).accepted).toBe(true);
    }
  });

  it.each([
    ['ゃ', 'xya', [undefined, 'y', 'a']],
    ['ゅ', 'lyu', [undefined, 'y', 'u']],
    ['あっ', 'axtu', ['a', undefined, 't', 'u']],
  ])('「%s」を %s と打ち始めた後は、案内が追従する', (word, keys, guides) => {
    expect(guideWhileTyping(word, keys)).toEqual(guides);
    expectCompletes(word, keys);
  });

  it('Backspace で打ち始める前に戻ると、案内はまた消える', () => {
    expect(guideKey(backspace(type('ゃ', 'x')))).toBeUndefined();
  });
});

// 仕様 v0.3 §5 の単語とローマ字（重複は1つ）。「せんろ」だけは下で別に確かめる。
const PACK_WORDS = `
  ほし hoshi つき tsuki たいよう taiyou ちきゅう chikyuu かせい kasei きんせい kinsei
  すいせい suisei もくせい mokusei どせい dosei わくせい wakusei うちゅう uchuu ぎんが ginga
  せいざ seiza ながれぼし nagareboshi いんせき inseki えいせい eisei じゅうりょく juuryoku
  あまのがわ amanogawa ほしぞら hoshizora つきよ tsukiyo そら sora よる yoru ひかり hikari かげ kage
  はな hana はっぱ happa はなびら hanabira き ki たね tane め me ねっこ nekko くさ kusa もり mori
  はやし hayashi さくら sakura たんぽぽ tanpopo ひまわり himawari あさがお asagao すみれ sumire
  もみじ momiji いちょう ichou まつ matsu たけ take うめ ume ふじ fuji かえで kaede
  どんぐり donguri わかば wakaba つぼみ tsubomi
  やま yama かわ kawa うみ umi しま shima みずうみ mizuumi さばく sabaku たに tani ぬま numa
  いけ ike すな suna しお shio なみ nami みなと minato はんとう hantou かざん kazan たき taki
  どうくつ doukutsu こうげん kougen へいや heiya がけ gake すなはま sunahama ちず chizu さわ sawa
  いえ ie うち uchi たてもの tatemono はしら hashira かべ kabe やね yane まど mado とびら tobira
  かいだん kaidan げんかん genkan にわ niwa もん mon てら tera じんじゃ jinja しろ shiro とう tou
  はし hashi えき eki みせ mise がっこう gakkou こうえん kouen へい hei
  ごはん gohan みそしる misoshiru さかな sakana たまご tamago やさい yasai くだもの kudamono
  りんご ringo みかん mikan すいか suika もも momo ぶどう budou いちご ichigo なし nashi かき kaki
  さくらんぼ sakuranbo ぎゅうにゅう gyuunyuu うどん udon そば soba すし sushi みそ miso
  しょうゆ shouyu さとう satou えび ebi
  いぬ inu ねこ neko うま uma うし ushi ぶた buta ひつじ hitsuji やぎ yagi うさぎ usagi
  ねずみ nezumi とり tori からす karasu すずめ suzume かも kamo つる tsuru かめ kame かえる kaeru
  へび hebi とかげ tokage ちょう chou あり ari はち hachi くも kumo せみ semi
  かぶとむし kabutomushi くわがた kuwagata ほたる hotaru ざりがに zarigani ことり kotori
  でんしゃ densha ふみきり fumikiri しんごう shingou きしゃ kisha れっしゃ ressha
  とっきゅう tokkyuu しんかんせん shinkansen ちかてつ chikatetsu ふね fune ひこうき hikouki
  じてんしゃ jitensha くるま kuruma しょうぼうしゃ shoubousha きゅうきゅうしゃ kyuukyuusha
  せんすいかん sensuikan ききゅう kikyuu そり sori
`.trim().split(/\s+/);

const PACK_PAIRS = Array.from(
  { length: PACK_WORDS.length / 2 },
  (_, i) => [PACK_WORDS[i * 2], PACK_WORDS[i * 2 + 1]] as const,
);

describe('仕様 §5 の単語', () => {
  it.each(PACK_PAIRS)('%s は %s で打てる', (word, romaji) => {
    expectCompletes(word, romaji);
  });

  // §5 の表記は senro だが、§2.3 はら行の前の「ん」に nn を要求するので §2.3 に従う。
  it('せんろ は sennro で打ち、senro では完成しない', () => {
    expectCompletes('せんろ', 'sennro');
    expect(followGuide('せんろ')).toBe('sennro');
    expect(isComplete(type('せんろ', 'senro'))).toBe(false);
  });

  // §5 は語中の「ん」を n 1つで書いている。案内は §1.1 の推奨 nn に沿う。
  it.each(PACK_PAIRS)('%s の案内どおりのキー列', (word, romaji) => {
    const chars = [...word];
    const expected = chars.slice(0, -1).includes('ん')
      ? romaji.replace(/n(?=[^aiueoy])/g, 'nn')
      : romaji;
    expect(followGuide(word)).toBe(expected);
  });
});

describe('全項目の2つ組の連結', () => {
  // 項目を連結した文字列なので、き＋ゃ のように拗音1単位になる組も含む。
  it('2項目を連結した文字列の全到達状態で、accepted と nextKeys が一致し、行き止まりがない', () => {
    const kana = Object.keys(ROMAJI_TABLE);
    const alphabet = [...'abcdefghijklmnopqrstuvwxyz'];
    const failures: string[] = [];

    for (const first of kana) {
      for (const second of kana) {
        const stack = [createMatcher(first + second)];
        const seen = new Set<string>();
        while (stack.length > 0) {
          const state = stack.pop()!;
          const id = `${state.index}:${state.typed}:${state.absorbableN}`;
          if (seen.has(id)) continue;
          seen.add(id);
          const guided = nextKeys(state);
          // 次のキーがないのは、完成後だけ。
          if ((guided.length === 0) !== isComplete(state)) {
            failures.push(`${first}${second} 次のキーの有無 ${id}`);
          }
          const guide = guideKey(state);
          if (guide !== undefined && !guided.includes(guide)) {
            failures.push(`${first}${second} ${id} 受け付けない案内 ${guide}`);
          }
          for (const key of alphabet) {
            const result = pressKey(state, key);
            if (result.accepted !== guided.includes(key)) {
              failures.push(`${first}${second} ${id} + ${key}`);
            }
            if (result.absorbed !== (state.absorbableN && key === 'n')) {
              failures.push(`${first}${second} ${id} + ${key} 受け流し`);
            }
            if (result.accepted || result.absorbed) stack.push(result.state);
          }
        }
      }
    }
    expect(failures).toEqual([]);
  }, 60_000);
});
