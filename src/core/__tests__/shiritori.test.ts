// @vitest-environment node
// DOM に依存しないしりとりゲームロジックの単体テスト。
import { describe, expect, it, vi } from 'vitest';
import {
  advanceAppTurn,
  appCandidateWords,
  createShiritoriGame,
  MAX_APP_EXTRA_WORD_LENGTH,
  mergeShiritoriDictionarySet,
  normalizeNextKana,
  pickAppWord,
  SHIRITORI_DICTIONARY,
  SHIRITORI_DICTIONARY_SET,
  submitChildWord,
} from '../shiritori';
import {
  loadExtendedShiritoriDictionary,
  resolveShiritoriDictUrl,
} from '../shiritoriDict';
import { THEME_PACKS } from '../../data/wordPacks';
import { STAGES } from '../../lesson/stages';

describe('しりとり辞書', () => {
  it('テーマ別単語パックとステージ単語の和集合を重複なく含む', () => {
    for (const pack of THEME_PACKS) {
      for (const word of pack.words) {
        expect(SHIRITORI_DICTIONARY_SET.has(word.kana)).toBe(true);
      }
    }
    for (const stage of STAGES) {
      for (const word of [...stage.exampleWords, ...stage.practiceWords]) {
        expect(SHIRITORI_DICTIONARY_SET.has(word)).toBe(true);
      }
    }
    expect(SHIRITORI_DICTIONARY.length).toBe(SHIRITORI_DICTIONARY_SET.size);
  });
});

describe('続けかなの正規化（normalizeNextKana）', () => {
  it('通常のひらがなは最後の1文字をそのまま返す', () => {
    expect(normalizeNextKana('りんご')).toBe('ご');
    expect(normalizeNextKana('ほし')).toBe('し');
    expect(normalizeNextKana('あさ')).toBe('さ');
  });

  it('末尾が ゃ/ゅ/ょ なら や/ゆ/よ に正規化する', () => {
    expect(normalizeNextKana('でんしゃ')).toBe('や');
    expect(normalizeNextKana('かしゃ')).toBe('や');
    expect(normalizeNextKana('しゅ')).toBe('ゆ');
    expect(normalizeNextKana('しょ')).toBe('よ');
  });

  it('末尾が ー なら直前のかなの母音（あ/い/う/え/お）を返す', () => {
    expect(normalizeNextKana('かー')).toBe('あ');
    expect(normalizeNextKana('るびー')).toBe('い');
    expect(normalizeNextKana('すー')).toBe('う');
    expect(normalizeNextKana('けー')).toBe('え');
    expect(normalizeNextKana('こー')).toBe('お');
    expect(normalizeNextKana('きゃー')).toBe('あ');
    expect(normalizeNextKana('しゅー')).toBe('う');
    expect(normalizeNextKana('しょー')).toBe('お');
    expect(normalizeNextKana('かーー')).toBe('あ');
  });

  it('空文字列は空文字を返す', () => {
    expect(normalizeNextKana('')).toBe('');
  });
});

describe('ゲーム開始とアプリの手番', () => {
  it('開始時はアプリが「ん」で終わらない最初の言葉を出し、usedWords と expectedKana を設定する', () => {
    const dict = ['みかん', 'ほし', 'しま', 'まり'];
    const state = createShiritoriGame(dict, () => 0);

    expect(state.chain).toHaveLength(1);
    expect(state.chain[0].speaker).toBe('app');
    expect(state.chain[0].word).toBe('ほし');
    expect(state.usedWords.has('ほし')).toBe(true);
    expect(state.expectedKana).toBe('し');
    expect(state.status).toBe('playing');
  });

  it('アプリの手番は「未使用・ん で終わらない・続けかなで始まる」語だけから選ぶ', () => {
    const dict = ['しま', 'しんかんせん', 'しろ', 'ほし', 'まり'];
    const used = new Set(['しま']);

    expect(appCandidateWords('し', used, dict)).toEqual(['しろ']);
    expect(pickAppWord('し', used, dict, () => 0)).toBe('しろ');
  });

  it('続けられる語が無ければアプリは続けられず app-stuck になる', () => {
    const dict = ['ほし', 'しんかんせん'];
    const start = createShiritoriGame(['ほし', 'しま'], () => 0);
    const result = advanceAppTurn(start, dict, () => 0);

    expect(result.moved).toBe(false);
    expect(result.state.status).toBe('app-stuck');
  });

  it('アプリが語を選べた場合はチェーンと usedWords と expectedKana を更新する', () => {
    const dict = ['ほし', 'しま', 'まり'];
    const start = createShiritoriGame(dict, () => 0); // ほし
    const result = advanceAppTurn(start, dict, () => 0); // しま

    expect(result.moved).toBe(true);
    if (result.moved) {
      expect(result.word).toBe('しま');
      expect(result.state.chain).toEqual([
        { word: 'ほし', speaker: 'app' },
        { word: 'しま', speaker: 'app' },
      ]);
      expect(result.state.expectedKana).toBe('ま');
      expect(result.state.usedWords.has('しま')).toBe(true);
    }
  });

  it('アプリは子どもが返せる語が残る候補を優先して選ぶ（既定辞書: ほし→しか の後に「かげ」を避ける）', () => {
    const start = createShiritoriGame(SHIRITORI_DICTIONARY, () => 0); // ほし
    const child = submitChildWord(start, 'しか', SHIRITORI_DICTIONARY_SET);
    expect(child.accepted).toBe(true);
    if (!child.accepted) return;

    // 乱数 3/28 でも「かげ」（次が「げ」で辞書に「げんかん」しかない）ではなく返答可能な語を選ぶ
    const app = advanceAppTurn(child.state, SHIRITORI_DICTIONARY, () => 3 / 28);
    expect(app.moved).toBe(true);
    expect(app.state.status).toBe('playing');
    expect(appCandidateWords(app.state.expectedKana, app.state.usedWords).length).toBeGreaterThan(0);
  });

  it('アプリが返した後に子どもが返せる語が尽きた場合は child-stuck になる', () => {
    // ほし -> しか -> かげ（次「げ」は「げんかん」のみで返せない）
    const dict = ['ほし', 'しか', 'かげ', 'げんかん'];
    const start = createShiritoriGame(dict, () => 0); // ほし
    const child = submitChildWord(start, 'しか', new Set(dict));
    expect(child.accepted).toBe(true);
    if (!child.accepted) return;

    const app = advanceAppTurn(child.state, dict, () => 0);
    expect(app.moved).toBe(true);
    if (app.moved) {
      expect(app.word).toBe('かげ');
    }
    expect(app.state.expectedKana).toBe('げ');
    expect(app.state.status).toBe('child-stuck');
  });

  it('開始時点で子どもが返せる語が辞書に無い場合は child-stuck で開始する', () => {
    const start = createShiritoriGame(['ほし'], () => 0);
    expect(start.chain).toEqual([{ word: 'ほし', speaker: 'app' }]);
    expect(start.expectedKana).toBe('し');
    expect(start.status).toBe('child-stuck');
  });
});

describe('子どもの手番の検証（submitChildWord）', () => {
  const dict = ['ほし', 'しま', 'でんしゃ', 'やま', 'みかん', 'しんかんせん', 'まど'];
  const dictSet = new Set(dict);

  it('正しい言葉を受け付け、チェーン・使用済み・続けかなを更新する', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0); // ほし -> expected 'し'
    const res = submitChildWord(start, 'しま', dictSet);

    expect(res.accepted).toBe(true);
    if (res.accepted) {
      expect(res.word).toBe('しま');
      expect(res.state.chain).toEqual([
        { word: 'ほし', speaker: 'app' },
        { word: 'しま', speaker: 'child' },
      ]);
      expect(res.state.usedWords.has('しま')).toBe(true);
      expect(res.state.expectedKana).toBe('ま');
      expect(res.state.status).toBe('playing');
    }
  });

  it('空入力は empty として受け付けない', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0);
    expect(submitChildWord(start, '', dictSet)).toEqual({ accepted: false, reason: 'empty' });
  });

  it('続けかなで始まっていない言葉は wrong-start として受け付けない', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0); // expected 'し'
    expect(submitChildWord(start, 'やま', dictSet)).toEqual({
      accepted: false,
      reason: 'wrong-start',
    });
  });

  it('「ん」で終わる言葉は ends-with-n として受け付けず、ゲームオーバーにしない', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0); // expected 'し'
    expect(submitChildWord(start, 'しんかんせん', dictSet)).toEqual({
      accepted: false,
      reason: 'ends-with-n',
    });
    expect(start.status).toBe('playing');
  });

  it('使用済みの言葉は already-used として受け付けない', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0);
    const afterChild = submitChildWord(start, 'しま', dictSet);
    expect(afterChild.accepted).toBe(true);
    if (!afterChild.accepted) return;

    // 仮に expectedKana が 'し' に戻った状態で「しま」を再提出
    const backToShi = { ...afterChild.state, expectedKana: 'し' };
    expect(submitChildWord(backToShi, 'しま', dictSet)).toEqual({
      accepted: false,
      reason: 'already-used',
    });
  });

  it('辞書に無い言葉は not-in-dictionary として受け付けない', () => {
    const start = createShiritoriGame(['ほし', 'しま'], () => 0);
    expect(submitChildWord(start, 'しかた', dictSet)).toEqual({
      accepted: false,
      reason: 'not-in-dictionary',
    });
  });

  it('末尾が ゃ の言葉（でんしゃ）の次は「や」で始められる', () => {
    const start = createShiritoriGame(['でんしゃ', 'やま'], () => 0);
    expect(start.expectedKana).toBe('や');
    const res = submitChildWord(start, 'やま', dictSet);
    expect(res.accepted).toBe(true);
  });
});

describe('拡張辞書（Issue #19）', () => {
  it('拡張辞書の語が子どもの答えとして受理される（例: 「りんご」の後に「ごま」）', () => {
    const baseDict = ['りんご', 'まり'];
    const extraDict = ['ごま'];
    const mergedSet = mergeShiritoriDictionarySet(baseDict, extraDict);

    const start = createShiritoriGame(baseDict, () => 0, extraDict);
    expect(start.chain[0].word).toBe('りんご');
    expect(start.expectedKana).toBe('ご');
    expect(start.status).toBe('playing');

    const res = submitChildWord(start, 'ごま', mergedSet);
    expect(res.accepted).toBe(true);
    if (res.accepted) {
      expect(res.word).toBe('ごま');
      expect(res.state.expectedKana).toBe('ま');
    }
  });

  it('アプリの答えはパック・ステージ単語を優先し、候補がある間は拡張辞書を使わない', () => {
    const baseDict = ['ほし', 'しま', 'まど'];
    const extraDict = ['しろ', 'しか', 'しお'];

    const picked = pickAppWord('し', new Set(['ほし']), baseDict, () => 0, extraDict);
    expect(picked).toBe('しま');
  });

  it('従来辞書に候補が無い場合のみ、拡張辞書の4文字以下の語から選ぶ（5文字以上・ん終わりは除外）', () => {
    expect(MAX_APP_EXTRA_WORD_LENGTH).toBe(4);
    const baseDict = ['りんご', 'まり'];
    const extraDict = ['ごりらたち', 'ごうこん', 'ごま', 'ごま油あぶら'];

    const picked = pickAppWord('ご', new Set(['りんご']), baseDict, () => 0, extraDict);
    expect(picked).toBe('ごま');

    // 拡張辞書に5文字以上しか無い場合は選べず app-stuck になる
    const start = createShiritoriGame(['りんご'], () => 0, ['ごりらたち']);
    const result = advanceAppTurn(start, ['りんご'], () => 0, ['ごりらたち']);
    expect(result.moved).toBe(false);
    expect(result.state.status).toBe('app-stuck');
  });

  it('拡張辞書からのフォールバック時も、子どもが返せる語を優先し、返せなければ child-stuck にする', () => {
    const baseDict = ['りんご', 'まり'];
    // 「ごじ」（次「じ」は返せない）と「ごま」（次「ま」は baseDict の「まり」で返せる）
    const extraDict = ['ごじ', 'ごま'];
    const start = createShiritoriGame(baseDict, () => 0, extraDict);

    const app = advanceAppTurn(start, baseDict, () => 0, extraDict);
    expect(app.moved).toBe(true);
    if (app.moved) {
      expect(app.word).toBe('ごま');
    }
    expect(app.state.status).toBe('playing');

    // 返せる語がどこにも無い場合は child-stuck
    const stuckStart = createShiritoriGame(['りんご'], () => 0, ['ごじ']);
    const stuckApp = advanceAppTurn(stuckStart, ['りんご'], () => 0, ['ごじ']);
    expect(stuckApp.moved).toBe(true);
    if (stuckApp.moved) {
      expect(stuckApp.word).toBe('ごじ');
    }
    expect(stuckApp.state.status).toBe('child-stuck');
  });

  it('resolveShiritoriDictUrl は baseUrl に合わせてパスを解決する', () => {
    expect(resolveShiritoriDictUrl('/')).toBe('/shiritori-dict.json');
    expect(resolveShiritoriDictUrl('/romaji-typing/')).toBe('/romaji-typing/shiritori-dict.json');
    expect(resolveShiritoriDictUrl('/romaji-typing')).toBe('/romaji-typing/shiritori-dict.json');
  });

  it('loadExtendedShiritoriDictionary は正常時に文字列配列を返し、失敗時は空配列へフォールバックする', async () => {
    const okFetch = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify(['ごま', 'まくら']), { status: 200 }),
    );
    await expect(
      loadExtendedShiritoriDictionary({ baseUrl: '/romaji-typing/', fetchImpl: okFetch }),
    ).resolves.toEqual(['ごま', 'まくら']);
    expect(okFetch).toHaveBeenCalledWith(
      '/romaji-typing/shiritori-dict.json',
      expect.objectContaining({ signal: undefined }),
    );

    const httpErrorFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('Not Found', { status: 404 }));
    await expect(
      loadExtendedShiritoriDictionary({ fetchImpl: httpErrorFetch }),
    ).resolves.toEqual([]);

    const networkErrorFetch = vi
      .fn<typeof fetch>()
      .mockRejectedValue(new Error('network error'));
    await expect(
      loadExtendedShiritoriDictionary({ fetchImpl: networkErrorFetch }),
    ).resolves.toEqual([]);

    const badJsonFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('not-json', { status: 200 }));
    await expect(loadExtendedShiritoriDictionary({ fetchImpl: badJsonFetch })).resolves.toEqual([]);

    const nonArrayFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response(JSON.stringify({ words: ['ごま'] }), { status: 200 }));
    await expect(loadExtendedShiritoriDictionary({ fetchImpl: nonArrayFetch })).resolves.toEqual(
      [],
    );
  });
});
