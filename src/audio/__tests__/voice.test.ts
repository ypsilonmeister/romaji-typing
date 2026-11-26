import { afterEach, describe, expect, it, vi } from 'vitest';
import { createVoicePlayer, type AudioLike } from '../voice';
import {
  DEFAULT_VOICE_MANIFEST,
  resolveVoiceUrl,
  SELF_REPORT_VOICE_KEYS,
  type VoiceManifest,
} from '../voiceManifest';

class FakeAudio implements AudioLike {
  readonly src: string;
  currentTime = 0;
  playCount = 0;
  pauseCount = 0;
  private readonly listeners = new Map<'ended' | 'error', Set<() => void>>();
  private readonly playImpl: () => Promise<void> | void;

  constructor(src: string, playImpl: () => Promise<void> | void = () => Promise.resolve()) {
    this.src = src;
    this.playImpl = playImpl;
  }

  play(): Promise<void> | void {
    this.playCount++;
    return this.playImpl();
  }

  pause(): void {
    this.pauseCount++;
  }

  addEventListener(type: 'ended' | 'error', listener: () => void): void {
    const set = this.listeners.get(type) ?? new Set();
    set.add(listener);
    this.listeners.set(type, set);
  }

  removeEventListener(type: 'ended' | 'error', listener: () => void): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: 'ended' | 'error'): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) {
      listener();
    }
  }
}

const SAMPLE_MANIFEST: VoiceManifest = {
  phrases: {
    'lesson-start': 'audio/phrases/lesson-start.mp3',
    'lesson-clear': 'audio/phrases/lesson-clear.mp3',
    'session-end': 'audio/phrases/session-end.mp3',
    'self-report-good': 'audio/phrases/self-report-good.mp3',
    'self-report-ok': 'audio/phrases/self-report-ok.mp3',
    'self-report-tired': 'audio/phrases/self-report-tired.mp3',
  },
  words: {
    あさ: 'audio/words/asa.mp3',
    かさ: 'audio/words/kasa.mp3',
  },
};

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('resolveVoiceUrl', () => {
  it('Vite の base URL に合わせて相対パスを解決する', () => {
    expect(resolveVoiceUrl('audio/words/asa.mp3', '/romaji-typing/')).toBe(
      '/romaji-typing/audio/words/asa.mp3',
    );
    expect(resolveVoiceUrl('/audio/words/asa.mp3', '/romaji-typing')).toBe(
      '/romaji-typing/audio/words/asa.mp3',
    );
    expect(resolveVoiceUrl('https://example.com/asa.mp3', '/romaji-typing/')).toBe(
      'https://example.com/asa.mp3',
    );
  });
});

describe('音声マニフェスト既定値', () => {
  it('実音声ファイル未同梱の初期状態でもエラーなく無音で素通りする', () => {
    const created: FakeAudio[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn(function (url: string) {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      }),
    );

    const player = createVoicePlayer({ manifest: DEFAULT_VOICE_MANIFEST });
    expect(player.playPhrase('lesson-start')).toBe(false);
    expect(player.playWord('あさ')).toBe(false);
    expect(created).toHaveLength(0);
  });

  it('自己申告のすべての選択肢に固定文キーが割り当てられている', () => {
    expect(SELF_REPORT_VOICE_KEYS).toEqual({
      good: 'self-report-good',
      ok: 'self-report-ok',
      hard: 'self-report-tired',
      skip: 'self-report-skip',
    });
  });
});

describe('createVoicePlayer', () => {
  it('マニフェストに登録された固定文と単語を Audio で再生し、未登録項目は無音で素通りする', () => {
    const created: FakeAudio[] = [];
    vi.stubGlobal(
      'Audio',
      vi.fn(function (url: string) {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      }),
    );

    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/romaji-typing/',
    });

    expect(player.playPhrase('lesson-start')).toBe(true);
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe('/romaji-typing/audio/phrases/lesson-start.mp3');
    expect(created[0].playCount).toBe(1);

    // 終端後に単語を再生
    created[0].emit('ended');
    expect(player.playWord('あさ')).toBe(true);
    expect(created).toHaveLength(2);
    expect(created[1].src).toBe('/romaji-typing/audio/words/asa.mp3');

    // 未登録の単語・キーは無音で素通りし Audio を作らない
    expect(player.playWord('そら')).toBe(false);
    expect(player.playPhrase('self-report-skip')).toBe(false);
    expect(created).toHaveLength(2);
  });

  it('再生中に次の読み上げが重なっても同時再生せず、終端を待ってから順に再生する', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    expect(player.playWord('あさ')).toBe(true);
    expect(player.playWord('かさ')).toBe(true);
    expect(player.playPhrase('lesson-clear')).toBe(true);

    // 1つ目の再生中は2つ目以降をまだ生成・再生しない
    expect(created).toHaveLength(1);
    expect(created[0].src).toBe('/audio/words/asa.mp3');

    // 1つ目が終わると2つ目が再生される
    created[0].emit('ended');
    expect(created).toHaveLength(2);
    expect(created[1].src).toBe('/audio/words/kasa.mp3');

    // 2つ目が終わると3つ目が再生される
    created[1].emit('ended');
    expect(created).toHaveLength(3);
    expect(created[2].src).toBe('/audio/phrases/lesson-clear.mp3');
  });

  it('play() の失敗や error イベントでも例外を出さず、次の待機音声へ進める', async () => {
    const created: FakeAudio[] = [];
    let attempt = 0;
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        attempt++;
        const playImpl =
          attempt === 1 ? () => Promise.reject(new Error('not found')) : () => Promise.resolve();
        const audio = new FakeAudio(url, playImpl);
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ');
    player.playWord('かさ');
    player.playPhrase('lesson-clear');

    // 1つ目の play() reject が処理されると2つ目へ進む
    await Promise.resolve();
    await Promise.resolve();
    expect(created).toHaveLength(2);
    expect(created[1].src).toBe('/audio/words/kasa.mp3');

    // 2つ目が error イベントを出しても3つ目へ進む
    created[1].emit('error');
    expect(created).toHaveLength(3);
    expect(created[2].src).toBe('/audio/phrases/lesson-clear.mp3');
  });

  it('stop() で再生中の音声を止め、待機キューも破棄する', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        audio.currentTime = 1.5;
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ');
    player.playWord('かさ');
    player.stop();

    expect(created).toHaveLength(1);
    expect(created[0].pauseCount).toBe(1);
    expect(created[0].currentTime).toBe(0);

    // 停止後に ended が発火しても待機していた「かさ」は鳴らない
    created[0].emit('ended');
    expect(created).toHaveLength(1);
  });

  it('待機キューの上限を超えた場合は古い単語の待機分を捨てて最新を残す', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      maxQueueSize: 1,
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ');
    player.playWord('かさ');
    player.playPhrase('lesson-clear');

    created[0].emit('ended');
    expect(created).toHaveLength(2);
    expect(created[1].src).toBe('/audio/phrases/lesson-clear.mp3');
  });

  it('混雑時でも完了・終了の声かけは破棄せず、待機中の自己申告は最新1件に集約する', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      maxQueueSize: 3,
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    // 最終単語の再生中に lesson-clear・session-end が待機し、さらに自己申告を3回押す
    player.playWord('あさ');
    player.playPhrase('lesson-clear');
    player.playPhrase('session-end');
    player.playPhrase('self-report-good');
    player.playPhrase('self-report-ok');
    player.playPhrase('self-report-tired');

    expect(created.map((a) => a.src)).toEqual(['/audio/words/asa.mp3']);

    created[0].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
    ]);

    created[1].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
      '/audio/phrases/session-end.mp3',
    ]);

    created[2].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
      '/audio/phrases/session-end.mp3',
      '/audio/phrases/self-report-tired.mp3',
    ]);

    created[3].emit('ended');
    expect(created).toHaveLength(4);
  });

  it('単語読み上げがキュー上限を超えても待機中の開始・完了・終了の声かけは押し出さない', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      maxQueueSize: 2,
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ');
    player.playPhrase('lesson-clear');
    player.playWord('かさ');
    player.playWord('あさ');

    created[0].emit('ended');
    expect(created[1].src).toBe('/audio/phrases/lesson-clear.mp3');

    created[1].emit('ended');
    expect(created[2].src).toBe('/audio/words/asa.mp3');

    created[2].emit('ended');
    expect(created).toHaveLength(3);
  });

  it('isPlaying() は再生中のみ true を返し、終了・停止後は false を返す', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    expect(player.isPlaying()).toBe(false);
    player.playWord('あさ');
    expect(player.isPlaying()).toBe(true);

    created[0].emit('ended');
    expect(player.isPlaying()).toBe(false);

    player.playWord('かさ');
    expect(player.isPlaying()).toBe(true);
    player.stop();
    expect(player.isPlaying()).toBe(false);
  });

  it('delayMs 指定時はアイドルから指定ミリ秒後に再生を開始し、その間の後続要求は後ろに並べる', () => {
    vi.useFakeTimers();
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    expect(player.playWord('あさ', { delayMs: 420 })).toBe(true);
    expect(player.playPhrase('lesson-clear', { delayMs: 420 })).toBe(true);
    expect(created).toHaveLength(0);
    expect(player.isPlaying()).toBe(false);

    vi.advanceTimersByTime(419);
    expect(created).toHaveLength(0);

    vi.advanceTimersByTime(1);
    expect(created.map((a) => a.src)).toEqual(['/audio/words/asa.mp3']);
    expect(player.isPlaying()).toBe(true);

    // 単語の再生が終わったら lesson-clear が順に再生される
    created[0].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
    ]);
  });

  it('stop() は delayMs で待機中の再生も取り消す', () => {
    vi.useFakeTimers();
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ', { delayMs: 420 });
    player.stop();
    vi.advanceTimersByTime(1000);
    expect(created).toHaveLength(0);
  });

  it('先行音声の再生中に delayMs 付きでキューに入った要求は、先行音声終了後も残り時間を待ってから再生する', () => {
    vi.useFakeTimers();
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    expect(player.playPhrase('lesson-start')).toBe(true);
    expect(player.playWord('あさ', { delayMs: 420 })).toBe(true);
    expect(player.playPhrase('lesson-clear', { delayMs: 420 })).toBe(true);

    // 1 ms 後に先行音声が終了しても、残り 419 ms は再生しない
    vi.advanceTimersByTime(1);
    created[0].emit('ended');
    expect(created).toHaveLength(1);
    expect(player.isPlaying()).toBe(false);

    vi.advanceTimersByTime(418);
    expect(created).toHaveLength(1);

    // 要求時点からちょうど 420 ms 経過したタイミングで再生を開始する
    vi.advanceTimersByTime(1);
    expect(created.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
    ]);

    // すでに 420 ms を過ぎている後続の lesson-clear は追加待機なしで即時再生される
    created[1].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
    ]);
  });

  it('先行音声が delayMs より長く再生された場合は、終了後に追加待機せず即座に再生する', () => {
    vi.useFakeTimers();
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    player.playPhrase('lesson-start');
    player.playWord('あさ', { delayMs: 420 });

    vi.advanceTimersByTime(500);
    created[0].emit('ended');
    expect(created.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
    ]);
  });

  it('破棄できる単語がキューにない場合は、固定文保護のため maxQueueSize を超えても待機を保持する', () => {
    const created: FakeAudio[] = [];
    const player = createVoicePlayer({
      manifest: SAMPLE_MANIFEST,
      baseUrl: '/',
      maxQueueSize: 3,
      createAudio: (url) => {
        const audio = new FakeAudio(url);
        created.push(audio);
        return audio;
      },
    });

    player.playWord('あさ');
    player.playPhrase('lesson-start');
    player.playPhrase('lesson-clear');
    player.playPhrase('session-end');
    player.playPhrase('self-report-good');

    for (let i = 0; i < 4; i++) {
      created[i].emit('ended');
    }

    expect(created.map((a) => a.src)).toEqual([
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-start.mp3',
      '/audio/phrases/lesson-clear.mp3',
      '/audio/phrases/session-end.mp3',
      '/audio/phrases/self-report-good.mp3',
    ]);
  });
});
