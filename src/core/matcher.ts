// かな→ローマ字の照合（仕様 v0.3 詳細仕様 §2）。DOM に依存しない純粋な状態機械。
// 状態は書き換えず、操作のたびに新しい状態を返す。

import { allowsSingleN, recommendedSpelling, SINGLE_N, spellingsOf } from './romajiTable';

/** 現在のかなに対する打ち方の1つ。 */
export interface Option {
  readonly romaji: string;
  /**
   * ない場合は、romaji を打ち切るとかなが完成する。
   * ある場合は、romaji の次にこのどれかを打つと完成する（そのキーは次のかなの1打目になる）。
   * 「ん」の n 1つと、促音の子音重ねに使う。
   */
  readonly followers?: readonly string[];
  /** 受け付けるが、打ち始める前は案内に出さない打ち方（§1.4 の x・l の単独入力）。 */
  readonly acceptOnly?: boolean;
}

export interface Unit {
  /** かな1単位。拗音は2文字。 */
  readonly kana: string;
  /** 案内の優先順。推奨の打ち方があれば先頭。 */
  readonly options: readonly Option[];
}

export interface CompletedKana {
  readonly kana: string;
  /** このかなに使った綴り。 */
  readonly romaji: string;
}

export interface MatcherState {
  readonly units: readonly Unit[];
  /** 入力中のかなの位置。units.length ならお題が完成している。 */
  readonly index: number;
  /** 入力中のかなに打ったキー。 */
  readonly typed: string;
  readonly completed: readonly CompletedKana[];
  /** 詰まりの検出用（§2.4）。画面には出さない。 */
  readonly mistakeCount: number;
  /** 語末の「ん」を n 1つで完成させた直後で、余分な n を1つ受け流せる。 */
  readonly absorbableN: boolean;
}

export interface KeyResult {
  readonly state: MatcherState;
  /** 入力として受け付けた。true になるのは、キー（小文字化後）が直前の nextKeys にある場合だけ。 */
  readonly accepted: boolean;
  /**
   * 語末の「ん」を n 1つで完成させた直後の、余分な n を受け流した。
   * 入力ではないので accepted は false。ミスにも数えないので、画面はミスの表示を出さない。
   */
  readonly absorbed: boolean;
  /** このキーで完成したかな。促音や「ん」では、前のかなと今のかなが同時に入ることがある。 */
  readonly completed: readonly CompletedKana[];
}

/** 促音で重ねられない先頭文字。母音と n（nn は「ん」）、小さいかなの x・l 接頭辞、長音の '-'。 */
const NOT_DOUBLABLE = new Set('aiueonxl-');

/** かなの打ち始めになりうるキー。推奨の打ち方があれば、そのキーが先。 */
function firstKeys(unit: Unit): string[] {
  return [...new Set(unit.options.map((option) => option.romaji[0]))];
}

function buildUnit(kana: string, next: Unit | undefined, isOnlyUnit: boolean): Unit {
  const spellings = spellingsOf(kana);
  if (!spellings) throw new Error(`対応表にないかなです: ${kana}`);
  const acceptOnly = recommendedSpelling(kana) === undefined;
  const options: Option[] = spellings.map((romaji) => ({ romaji, acceptOnly }));

  if (kana === 'ん' && allowsSingleN(next?.kana, isOnlyUnit)) {
    // 語末は n を打った時点で確定し、語中は次のかなの1打目で確定する。
    options.push({ romaji: SINGLE_N, followers: next && firstKeys(next) });
  }

  if (kana === 'っ' && next) {
    const doubled = firstKeys(next)
      .filter((key) => !NOT_DOUBLABLE.has(key))
      .map((key) => ({ romaji: key, followers: [key] }));
    // 子音の重ねを推奨にする。重ねられない位置では、案内できる打ち方がない（§1.4）。
    options.unshift(...doubled);
  }

  return { kana, options };
}

/** お題をかな単位に分ける。拗音（2文字）を優先する。 */
export function splitKana(word: string): string[] {
  const result: string[] = [];
  for (let i = 0; i < word.length; ) {
    const pair = word.slice(i, i + 2);
    const kana = pair.length === 2 && spellingsOf(pair) ? pair : word[i];
    if (!spellingsOf(kana)) throw new Error(`対応表にないかなです: ${kana}`);
    result.push(kana);
    i += kana.length;
  }
  return result;
}

/** お題（ひらがなの1文字または単語）の照合を始める。対応表にない文字があると例外を投げる。 */
export function createMatcher(word: string): MatcherState {
  const kanaList = splitKana(word);
  if (kanaList.length === 0) throw new Error('お題が空です');

  // 「ん」と促音は次のかなで打ち方が決まるので、後ろから組み立てる。
  const units: Unit[] = [];
  for (let i = kanaList.length - 1; i >= 0; i--) {
    units.unshift(buildUnit(kanaList[i], units[0], kanaList.length === 1));
  }
  return { units, index: 0, typed: '', completed: [], mistakeCount: 0, absorbableN: false };
}

export function isComplete(state: MatcherState): boolean {
  return state.index === state.units.length;
}

/** 入力中のかなについて、打ったキーと矛盾しない打ち方（案内の優先順）。完成後は空。 */
export function candidates(state: MatcherState): readonly Option[] {
  if (isComplete(state)) return [];
  return state.units[state.index].options.filter((option) => option.romaji.startsWith(state.typed));
}

/**
 * 受け付けるキー（案内の優先順）。pressKey の accepted が true になるキーと一致する。
 * 案内の表示には guideKey を使う。完成後は空（受け流す n は入力ではないので含まない）。
 */
export function nextKeys(state: MatcherState): string[] {
  const keys = candidates(state).flatMap((option) =>
    option.romaji.length > state.typed.length
      ? [option.romaji[state.typed.length]]
      : (option.followers ?? []),
  );
  return [...new Set(keys)];
}

/**
 * 案内するキー（§2.2）。推奨綴りに沿い、別の綴りで打ち始めていればその綴りに沿う。
 * 完成後と、打ち始める前で推奨の打ち方がない場合（§1.4）は undefined。
 */
export function guideKey(state: MatcherState): string | undefined {
  if (state.typed === '' && candidates(state).every((option) => option.acceptOnly)) {
    return undefined;
  }
  return nextKeys(state)[0];
}

function completeCurrent(state: MatcherState, romaji: string): KeyResult {
  const kana = state.units[state.index].kana;
  const done = { kana, romaji };
  const index = state.index + 1;
  return {
    accepted: true,
    absorbed: false,
    completed: [done],
    state: {
      ...state,
      index,
      typed: '',
      completed: [...state.completed, done],
      absorbableN: index === state.units.length && kana === 'ん' && romaji === 'n',
    },
  };
}

/**
 * キーを1つ入力する。key は KeyboardEvent.key をそのまま渡せる（大文字小文字は区別しない）。
 * Shift などの1文字でないキーと、完成後のキーは、受け付けないがミスにも数えない。
 * 語末の「ん」を n 1つで完成させた場合は、直後の n を1つだけ absorbed として返す（別の1文字キーを挟むと失効する）。
 * 合わないキーは受け付けず、候補を保ったままミスを数える（§2.4）。
 */
export function pressKey(state: MatcherState, key: string): KeyResult {
  const ignored: KeyResult = { state, accepted: false, absorbed: false, completed: [] };
  if (key.length !== 1) return ignored;
  const char = key.toLowerCase();

  if (isComplete(state)) {
    if (!state.absorbableN) return ignored;
    return { ...ignored, absorbed: char === 'n', state: { ...state, absorbableN: false } };
  }

  const { options } = state.units[state.index];
  const typed = state.typed + char;

  if (options.some((option) => option.romaji.startsWith(typed))) {
    if (options.some((option) => !option.followers && option.romaji === typed)) {
      return completeCurrent(state, typed);
    }
    return { state: { ...state, typed }, accepted: true, absorbed: false, completed: [] };
  }

  const carried = options.some(
    (option) => option.romaji === state.typed && option.followers?.includes(char),
  );
  if (carried) {
    // 今のかなを確定し、このキーを次のかなの1打目にする。
    const first = completeCurrent(state, state.typed);
    const second = pressKey(first.state, char);
    return { ...second, completed: [...first.completed, ...second.completed] };
  }

  return { ...ignored, state: { ...state, mistakeCount: state.mistakeCount + 1 } };
}

/** 入力中のかなの1打を取り消す。完成したかなには戻らない（§2.4）。 */
export function backspace(state: MatcherState): MatcherState {
  if (state.typed === '') return state;
  return { ...state, typed: state.typed.slice(0, -1) };
}
