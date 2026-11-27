import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVoicePlayer, type AudioLike } from '../audio/voice';
import type { VoiceManifest } from '../audio/voiceManifest';
import { progressStore } from '../progress';
import { ShiritoriScreen } from '../screens/ShiritoriScreen';

class MockAudio implements AudioLike {
  readonly src: string;
  currentTime = 0;
  playCount = 0;
  pauseCount = 0;
  private readonly listeners = new Map<'ended' | 'error', Set<() => void>>();

  constructor(src: string) {
    this.src = src;
  }

  play(): Promise<void> {
    this.playCount++;
    return Promise.resolve();
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

  finish(): void {
    for (const listener of [...(this.listeners.get('ended') ?? [])]) {
      listener();
    }
  }
}

function createTestVoicePlayer(manifest: VoiceManifest) {
  const audios: MockAudio[] = [];
  const player = createVoicePlayer({
    manifest,
    baseUrl: '/',
    createAudio: (url) => {
      const audio = new MockAudio(url);
      audios.push(audio);
      return audio;
    },
  });
  return { player, audios };
}

function keyButton(code: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.kb-key[data-key="${code}"]`);
  if (!el) throw new Error(`Key button not found: ${code}`);
  return el;
}

function typeWord(keys: string) {
  for (const key of keys) {
    fireEvent.keyDown(window, { key });
  }
}

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  await progressStore.close();
});

describe('ShiritoriScreen', () => {
  it('開始時にアプリが最初の言葉を出し、続けかなと次に打てるキーを表示する', () => {
    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま', 'まど']}
        random={() => 0}
        onFinish={vi.fn()}
      />,
    );

    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('ほし');
    expect(screen.getByTestId('expected-kana').textContent).toBe('し');
    expect(screen.getByRole('region', { name: 'キーボード' })).toBeDefined();

    // 初期状態では打てるキー（例: s, a）が光り、打てないキー（q, v）は光らない
    expect(keyButton('s').dataset.next).toBe('true');
    expect(keyButton('a').dataset.next).toBe('true');
    expect(keyButton('q').dataset.next).toBeUndefined();
    expect(keyButton('v').dataset.next).toBeUndefined();

    // 's' を打つとバッファ 'S' が表示され、次に打てるキーが絞り込まれる
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByTestId('shiritori-buffer').textContent).toBe('S');
    expect(keyButton('h').dataset.next).toBe('true');
    expect(keyButton('i').dataset.next).toBe('true');
    expect(keyButton('k').dataset.next).toBeUndefined();
  });

  it('開始→入力→受け付け→アプリの応答→ことば図鑑記録→終了の基本フローが動く', async () => {
    const onFinish = vi.fn();
    const { player, audios } = createTestVoicePlayer({
      phrases: {},
      words: {
        しま: 'audio/words/shima.mp3',
      },
    });

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま', 'まど', 'どんぐり']}
        random={() => 0}
        appResponseDelayMs={150}
        voice={player}
        onFinish={onFinish}
      />,
    );

    // 設定読み込み（voiceOn: true）を待つ
    await waitFor(async () => {
      expect((await progressStore.getSettings()).voiceOn).toBe(true);
    });

    vi.useFakeTimers();

    // 「しま」を入力して Enter で決定
    typeWord('shima');
    expect(screen.getByTestId('shiritori-input').textContent).toContain('しま');

    fireEvent.keyDown(window, { key: 'Enter' });

    // チェーンに「しま」が追加され、入力欄はクリアされる
    const chain = screen.getByRole('region', { name: 'ことばの つながり' });
    expect(chain.textContent).toContain('しま');

    // アプリの応答（まど）が返る
    act(() => {
      vi.advanceTimersByTime(150);
    });
    expect(chain.textContent).toContain('まど');
    expect(screen.getByTestId('expected-kana').textContent).toBe('ど');

    // 登録済み単語「しま」の音声が鳴る（効果音分の遅延後）
    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(audios.map((a) => a.src)).toEqual(['/audio/words/shima.mp3']);

    // 「おわる」ボタンでいつでも終了できる
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));
    expect(onFinish).toHaveBeenCalledTimes(1);

    vi.useRealTimers();

    // 子どもが受け付けられた言葉「しま」がことば図鑑用の progressStore に記録されている
    await waitFor(async () => {
      const progress = await progressStore.getWordProgress();
      expect(progress.map((p) => p.wordId)).toContain('しま');
      expect(progress.map((p) => p.wordId)).not.toContain('ほし');
      expect(progress.map((p) => p.wordId)).not.toContain('まど');
    });
  });

  it('差し戻し（続けかな違い・ん終わり・辞書に無い・使用済み）は罰せず打ち直せる', async () => {
    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま', 'しんかんせん', 'まど', 'やま', 'まし']}
        random={() => 0}
        appResponseDelayMs={100}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });
    vi.useFakeTimers();

    // 1. 続けかな違い（「やま」→ expected は「し」）
    typeWord('yama');
    fireEvent.click(screen.getByRole('button', { name: 'けってい' }));
    expect(screen.getByTestId('shiritori-feedback').textContent).toContain('し');
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).not.toContain('やま');

    // Backspace で消して打ち直せる
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });

    // 2. 「ん」で終わる言葉（しんかんせん）→ 受け付けずゲームオーバーにしない
    typeWord('shinkansen');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('shiritori-feedback').textContent).toContain('ん');
    expect(screen.getByTestId('expected-kana').textContent).toBe('し');

    // すべて消す（6かな: し・ん・か・ん・せ・ん）
    for (let i = 0; i < 6; i++) {
      fireEvent.keyDown(window, { key: 'Backspace' });
    }

    // 3. 辞書に無い言葉（しかた）
    typeWord('shikata');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('shiritori-feedback').textContent).toContain('しらない');

    for (let i = 0; i < 3; i++) {
      fireEvent.keyDown(window, { key: 'Backspace' });
    }

    // 4. 正しい言葉「しま」をバーチャルキーボードでも入力して「けってい」ボタンで受理
    fireEvent.click(keyButton('s'));
    fireEvent.click(keyButton('i'));
    fireEvent.click(keyButton('m'));
    fireEvent.click(keyButton('a'));
    fireEvent.click(screen.getByRole('button', { name: 'けってい' }));
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('しま');

    // アプリが「まど」か「まし」を返す（random=0 で辞書の先頭側「まど」→ もし使用済みテストをするなら辞書を調整）
    act(() => {
      vi.advanceTimersByTime(100);
    });
  });

  it('使用済みの言葉は受け付けず、打ち直せる', async () => {
    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま', 'まし', 'しろ']}
        random={() => 0}
        appResponseDelayMs={100}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });
    vi.useFakeTimers();

    // アプリ「ほし」→ 子ども「しま」→ アプリ「まし」→ 次は「し」
    typeWord('shima');
    fireEvent.keyDown(window, { key: 'Enter' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(screen.getByTestId('expected-kana').textContent).toBe('し');

    // すでに出た「しま」をもう一度打つと差し戻される
    typeWord('shima');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByTestId('shiritori-feedback').textContent).toContain('もう でた');

    // 消して「しろ」を打てば受け付けられる
    fireEvent.keyDown(window, { key: 'Backspace' });
    fireEvent.keyDown(window, { key: 'Backspace' });
    typeWord('shiro');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('しろ');
  });

  it('アプリが続けられなくなったら穏やかに終了へ誘導し、終了できる', async () => {
    const onFinish = vi.fn();

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま']}
        random={() => 0}
        appResponseDelayMs={100}
        onFinish={onFinish}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });
    vi.useFakeTimers();

    typeWord('shima');
    fireEvent.keyDown(window, { key: 'Enter' });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByText(/おもいつかなかったよ/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'おわりにする' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('アプリが返した後に子どもが返せる言葉が尽きたら終了案内を表示し、終了できる', async () => {
    const onFinish = vi.fn();

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しか', 'かげ', 'げんかん']}
        random={() => 0}
        appResponseDelayMs={100}
        onFinish={onFinish}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });
    vi.useFakeTimers();

    typeWord('shika');
    fireEvent.keyDown(window, { key: 'Enter' });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('かげ');
    expect(screen.getByText(/「げ」から はじまる ことばが もう ないよ/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'おわりにする' }));
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('拗音はまとめ打ち（kya）も分け打ち（kixya）も Backspace 1回で空欄になる', () => {
    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま']}
        random={() => 0}
        onFinish={vi.fn()}
      />,
    );

    typeWord('kya');
    expect(screen.getByTestId('shiritori-input').textContent).toContain('きゃ');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('shiritori-input').textContent).not.toContain('き');
    expect(screen.getByTestId('shiritori-input').textContent).toContain('ローマじで うってね');

    typeWord('kixya');
    expect(screen.getByTestId('shiritori-input').textContent).toContain('きゃ');
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(screen.getByTestId('shiritori-input').textContent).not.toContain('き');
    expect(screen.getByTestId('shiritori-input').textContent).toContain('ローマじで うってね');
  });

  it('IME の composition 中の keydown は無視する', () => {
    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま']}
        random={() => 0}
        onFinish={vi.fn()}
      />,
    );

    fireEvent.keyDown(window, { key: 's', isComposing: true });
    expect(screen.queryByTestId('shiritori-buffer')).toBeNull();

    fireEvent.keyDown(window, { key: 's', keyCode: 229 });
    expect(screen.queryByTestId('shiritori-buffer')).toBeNull();

    fireEvent(window, new Event('compositionstart'));
    fireEvent.keyDown(window, { key: 's' });
    expect(screen.queryByTestId('shiritori-buffer')).toBeNull();
    fireEvent(window, new Event('compositionend'));

    fireEvent.keyDown(window, { key: 's' });
    expect(screen.getByTestId('shiritori-buffer').textContent).toBe('S');
  });

  it('拡張辞書を遅延読み込みし、読み込み完了前も従来辞書で遊べ、完了後は「りんご」の後に「ごま」が打てる', async () => {
    let resolveFetch!: (res: Response) => void;
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(
      () =>
        new Promise<Response>((resolve) => {
          resolveFetch = resolve;
        }),
    );

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しり', 'りんご', 'まど']}
        random={() => 0}
        appResponseDelayMs={50}
        onFinish={vi.fn()}
      />,
    );

    // 入場時に shiritori-dict.json を fetch している
    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(/shiritori-dict\.json$/),
      expect.any(Object),
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });

    // 読み込み完了前でも従来辞書で遊べる: アプリ「ほし」→ 子ども「しり」→ アプリ「りんご」
    typeWord('shiri');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('しり');

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'りんご',
      );
    });

    // 拡張辞書の読み込み完了（「ごま」が使えるようになる）
    await act(async () => {
      resolveFetch(new Response(JSON.stringify(['ごま', 'まくら']), { status: 200 }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('expected-kana').textContent).toBe('ご');
    });

    // 「りんご」の後に拡張辞書の「ごま」が受理される
    typeWord('goma');
    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain('ごま');
    expect(screen.queryByTestId('shiritori-feedback')).toBeNull();

    // アプリの答えは従来辞書（「まど」）を拡張辞書（「まくら」）より優先する
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'まど',
      );
    });
  });

  it('拡張辞書の読み込みに失敗してもエラーを出さず従来辞書だけで遊べる', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('offline'));

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しま', 'まど', 'どんぐり']}
        random={() => 0}
        appResponseDelayMs={50}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });

    expect(screen.queryByTestId('shiritori-feedback')).toBeNull();
    expect(screen.getByTestId('expected-kana').textContent).toBe('し');

    typeWord('shima');
    fireEvent.keyDown(window, { key: 'Enter' });

    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'まど',
      );
    });
    expect(screen.queryByTestId('shiritori-feedback')).toBeNull();
  });

  it('従来辞書に候補が無い場合のみ、アプリは拡張辞書の4文字以下の語から返す', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(['ごりらたち', 'ごま', 'まりも']), { status: 200 }),
    );

    render(
      <ShiritoriScreen
        dictionary={['ほし', 'しりんご', 'まり']}
        random={() => 0}
        appResponseDelayMs={50}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });

    // アプリ「ほし」→ 子ども「しりんご」（次「ご」は従来辞書に無い）
    typeWord('shiringo');
    fireEvent.keyDown(window, { key: 'Enter' });

    // アプリは5文字の「ごりらたち」を避け、4文字以下の「ごま」を返す
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'ごま',
      );
    });
    expect(screen.getByTestId('expected-kana').textContent).toBe('ま');
  });

  it('長音「ー」を物理キー - と仮想キーボード「ー」ボタンの両方で打てて、末尾正規化が働く', async () => {
    render(
      <ShiritoriScreen
        dictionary={['あさ', 'さっかー', 'あめ', 'めーたー', 'あり']}
        random={() => 0}
        appResponseDelayMs={50}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(async () => {
      expect((await progressStore.getSettings()).soundOn).toBe(true);
    });

    // 初期状態で「ー」キーも次に打てるキーとして強調される
    expect(keyButton('-').textContent).toBe('ー');
    expect(keyButton('-').dataset.next).toBe('true');

    // 1. 仮想キーボードの「ー」ボタンで「さっかー」を入力して決定
    typeWord('sakka');
    fireEvent.click(keyButton('-'));
    expect(screen.getByTestId('shiritori-input').textContent).toContain('さっかー');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
      'さっかー',
    );

    // 末尾が「ー」→ 直前「か」の母音「あ」に正規化され、アプリが「あめ」を返す
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'あめ',
      );
    });

    // 2. 物理キーボードの '-' キーで「めーたー」を入力して決定
    typeWord('me');
    fireEvent.keyDown(window, { key: '-' });
    typeWord('ta');
    fireEvent.keyDown(window, { key: '-' });
    expect(screen.getByTestId('shiritori-input').textContent).toContain('めーたー');

    fireEvent.keyDown(window, { key: 'Enter' });
    expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
      'めーたー',
    );

    // 末尾が「ー」→ 直前「た」の母音「あ」に正規化され、アプリが「あり」を返す
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'ことばの つながり' }).textContent).toContain(
        'あり',
      );
    });
  });
});
