// しりとりゲームロジック（Issue #16）。DOM に依存しない純粋関数・状態管理。

import { THEME_PACKS } from '../data/wordPacks';
import { STAGES } from '../lesson/stages';

export type ShiritoriSpeaker = 'app' | 'child';

export interface ShiritoriEntry {
  readonly word: string;
  readonly speaker: ShiritoriSpeaker;
}

export type ShiritoriStatus = 'playing' | 'app-stuck' | 'child-stuck';

export interface ShiritoriState {
  readonly chain: readonly ShiritoriEntry[];
  readonly usedWords: ReadonlySet<string>;
  /** 次の手番で始めるべきかな（正規化済み）。 */
  readonly expectedKana: string;
  readonly status: ShiritoriStatus;
}

export type RejectReason =
  | 'empty'
  | 'wrong-start'
  | 'ends-with-n'
  | 'already-used'
  | 'not-in-dictionary';

export type SubmitWordResult =
  | { readonly accepted: true; readonly state: ShiritoriState; readonly word: string }
  | { readonly accepted: false; readonly reason: RejectReason };

export type AppTurnResult =
  | { readonly moved: true; readonly state: ShiritoriState; readonly word: string }
  | { readonly moved: false; readonly state: ShiritoriState };

/** 小さい ゃ/ゅ/ょ を次の頭文字（や/ゆ/よ）へ正規化する対応表。 */
const SMALL_TO_LARGE: Readonly<Record<string, string>> = {
  ゃ: 'や',
  ゅ: 'ゆ',
  ょ: 'よ',
};

/** かな1文字 → 対応する母音（長音「ー」で終わる言葉の続けかな決定に使う）。 */
const VOWEL_GROUPS: readonly (readonly [vowel: string, chars: string])[] = [
  ['あ', 'あかさたなはまやらわがざだばぱぁゃ'],
  ['い', 'いきしちにひみりぎじぢびぴぃ'],
  ['う', 'うくすつぬふむゆるぐずづぶぷぅゅ'],
  ['え', 'えけせてねへめれげぜでべぺぇ'],
  ['お', 'おこそとのほもよろをごぞどぼぽぉょ'],
];

const CHAR_TO_VOWEL: ReadonlyMap<string, string> = new Map(
  VOWEL_GROUPS.flatMap(([vowel, chars]) => [...chars].map((ch) => [ch, vowel] as const)),
);

/**
 * しりとり辞書を構築する。
 * テーマ別単語パックの全単語とステージ単語（exampleWords / practiceWords）の和集合。
 */
export function buildShiritoriDictionary(): readonly string[] {
  const words = new Set<string>();
  for (const pack of THEME_PACKS) {
    for (const entry of pack.words) {
      words.add(entry.kana);
    }
  }
  for (const stage of STAGES) {
    for (const word of stage.exampleWords) {
      words.add(word);
    }
    for (const word of stage.practiceWords) {
      words.add(word);
    }
  }
  return [...words];
}

/** 既定のしりとり辞書（配列）。 */
export const SHIRITORI_DICTIONARY: readonly string[] = buildShiritoriDictionary();

/** 既定のしりとり辞書（Set）。 */
export const SHIRITORI_DICTIONARY_SET: ReadonlySet<string> = new Set(SHIRITORI_DICTIONARY);

/**
 * 言葉の最後のかなから、次に続ける頭文字を正規化して返す。
 * - 最後が ゃ/ゅ/ょ → や/ゆ/よ
 * - 最後が ー → 直前のかなの母音（あ/い/う/え/お）
 * - それ以外 → 最後の1文字そのまま
 */
export function normalizeNextKana(word: string): string {
  if (word.length === 0) return '';
  const last = word[word.length - 1];

  if (last === 'ー') {
    for (let i = word.length - 2; i >= 0; i--) {
      const ch = word[i];
      if (ch === 'ー') continue;
      return CHAR_TO_VOWEL.get(ch) ?? ch;
    }
    return '';
  }

  return SMALL_TO_LARGE[last] ?? last;
}

/** 辞書からランダムに1要素を選ぶ。候補が空なら undefined。 */
function pickRandom<T>(items: readonly T[], random: () => number): T | undefined {
  if (items.length === 0) return undefined;
  const raw = random();
  const clamped = Number.isFinite(raw) ? Math.min(Math.max(raw, 0), 1 - Number.EPSILON) : 0;
  return items[Math.floor(clamped * items.length)];
}

/**
 * アプリの手番で選べる候補語（未使用・「ん」で終わらない・expectedKana で始まる）を返す。
 */
export function appCandidateWords(
  expectedKana: string,
  usedWords: ReadonlySet<string>,
  dictionary: readonly string[] = SHIRITORI_DICTIONARY,
): string[] {
  return dictionary.filter(
    (word) =>
      word.length > 0 &&
      !usedWords.has(word) &&
      !word.endsWith('ん') &&
      word[0] === expectedKana,
  );
}

/**
 * 指定の語を出したあと、次の手番で返せる未使用・非「ん」終わりの語が辞書に1つ以上あるか。
 */
function hasPlayableReply(
  word: string,
  usedWords: ReadonlySet<string>,
  dictionary: readonly string[],
): boolean {
  const nextKana = normalizeNextKana(word);
  if (nextKana.length === 0) return false;
  return dictionary.some(
    (other) =>
      other.length > 0 &&
      other !== word &&
      !usedWords.has(other) &&
      !other.endsWith('ん') &&
      other[0] === nextKana,
  );
}

/**
 * アプリの手番として辞書からランダムに1語選ぶ。
 * 子どもが返せる候補が残る語を優先し、返せる語が無い場合のみ残り候補から選ぶ。候補が無ければ undefined。
 */
export function pickAppWord(
  expectedKana: string,
  usedWords: ReadonlySet<string>,
  dictionary: readonly string[] = SHIRITORI_DICTIONARY,
  random: () => number = Math.random,
): string | undefined {
  const candidates = appCandidateWords(expectedKana, usedWords, dictionary);
  const playable = candidates.filter((word) => hasPlayableReply(word, usedWords, dictionary));
  return pickRandom(playable.length > 0 ? playable : candidates, random);
}

/**
 * しりとりゲームを開始する。アプリが最初の言葉を1つ出す。
 * 最初の言葉は「ん」で終わらず、子どもが返せる候補が辞書に1つ以上ある語を優先して選ぶ。
 * 選んだ語のあとに子どもが返せる候補が無ければ status は 'child-stuck' になる。
 */
export function createShiritoriGame(
  dictionary: readonly string[] = SHIRITORI_DICTIONARY,
  random: () => number = Math.random,
): ShiritoriState {
  const nonNWords = dictionary.filter((word) => word.length > 0 && !word.endsWith('ん'));
  const emptyUsed = new Set<string>();
  const playableStarts = nonNWords.filter((word) => hasPlayableReply(word, emptyUsed, dictionary));

  const firstWord = pickRandom(playableStarts.length > 0 ? playableStarts : nonNWords, random);
  if (!firstWord) {
    throw new Error('しりとりを開始できる単語が辞書にありません');
  }

  const usedWords = new Set([firstWord]);
  const expectedKana = normalizeNextKana(firstWord);
  const childCanReply = appCandidateWords(expectedKana, usedWords, dictionary).length > 0;

  return {
    chain: [{ word: firstWord, speaker: 'app' }],
    usedWords,
    expectedKana,
    status: childCanReply ? 'playing' : 'child-stuck',
  };
}

/**
 * 子どもの手番の入力を検証し、受け付けた場合はチェーンへ追加した新しい状態を返す。
 * いずれの差し戻しでもゲームオーバーにはしない。
 */
export function submitChildWord(
  state: ShiritoriState,
  word: string,
  dictionarySet: ReadonlySet<string> = SHIRITORI_DICTIONARY_SET,
): SubmitWordResult {
  if (word.length === 0) {
    return { accepted: false, reason: 'empty' };
  }
  if (word[0] !== state.expectedKana) {
    return { accepted: false, reason: 'wrong-start' };
  }
  if (word.endsWith('ん')) {
    return { accepted: false, reason: 'ends-with-n' };
  }
  if (state.usedWords.has(word)) {
    return { accepted: false, reason: 'already-used' };
  }
  if (!dictionarySet.has(word)) {
    return { accepted: false, reason: 'not-in-dictionary' };
  }

  const nextUsed = new Set(state.usedWords);
  nextUsed.add(word);
  return {
    accepted: true,
    word,
    state: {
      chain: [...state.chain, { word, speaker: 'child' }],
      usedWords: nextUsed,
      expectedKana: normalizeNextKana(word),
      status: 'playing',
    },
  };
}

/**
 * アプリの手番を進める。
 * - 続けられる言葉が無ければ app-stuck にする。
 * - 言葉を選べた場合でも、その次に子どもが返せる未使用・非「ん」終わり語が辞書に無ければ child-stuck にする。
 */
export function advanceAppTurn(
  state: ShiritoriState,
  dictionary: readonly string[] = SHIRITORI_DICTIONARY,
  random: () => number = Math.random,
): AppTurnResult {
  const picked = pickAppWord(state.expectedKana, state.usedWords, dictionary, random);
  if (!picked) {
    return {
      moved: false,
      state: { ...state, status: 'app-stuck' },
    };
  }

  const nextUsed = new Set(state.usedWords);
  nextUsed.add(picked);
  const nextExpected = normalizeNextKana(picked);
  const childCanReply = appCandidateWords(nextExpected, nextUsed, dictionary).length > 0;
  return {
    moved: true,
    word: picked,
    state: {
      chain: [...state.chain, { word: picked, speaker: 'app' }],
      usedWords: nextUsed,
      expectedKana: nextExpected,
      status: childCanReply ? 'playing' : 'child-stuck',
    },
  };
}
