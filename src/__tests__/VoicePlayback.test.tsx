import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import * as sound from '../audio/sound';
import { createVoicePlayer, type AudioLike } from '../audio/voice';
import type { VoiceManifest } from '../audio/voiceManifest';
import { DEFAULT_SETTINGS, progressStore, type Settings } from '../progress';
import { EndScreen } from '../screens/EndScreen';
import { LessonScreen } from '../screens/LessonScreen';
import { ParentGateScreen } from '../screens/ParentGateScreen';

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

const TEST_MANIFEST: VoiceManifest = {
  phrases: {
    'lesson-start': 'audio/phrases/lesson-start.mp3',
    'lesson-clear': 'audio/phrases/lesson-clear.mp3',
    'session-end': 'audio/phrases/session-end.mp3',
    'self-report-good': 'audio/phrases/self-report-good.mp3',
    'self-report-ok': 'audio/phrases/self-report-ok.mp3',
    'self-report-tired': 'audio/phrases/self-report-tired.mp3',
    'self-report-skip': 'audio/phrases/self-report-skip.mp3',
  },
  words: {
    // 1文字導入かなで鳴らないことを確実に検証するため、あえて「あ」も登録しておく
    あ: 'audio/words/a.mp3',
    あさ: 'audio/words/asa.mp3',
  },
};

function createTestVoicePlayer(manifest: VoiceManifest = TEST_MANIFEST) {
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

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await progressStore.close();
});

describe('レッスン画面の音声再生（Issue #13）', () => {
  it('開始時・単語完成時・完了時に音声を鳴らし、1文字導入かなと未登録単語では鳴らさない', async () => {
    const { player, audios } = createTestVoicePlayer();
    const onFinish = vi.fn();

    render(
      <LessonScreen
        mode="stage"
        prompts={[
          { text: 'あ', showGuide: true, kind: 'new', isWord: false },
          { text: 'あさ', showGuide: true, kind: 'new', isWord: true },
          { text: 'かさ', showGuide: true, kind: 'new', isWord: true },
        ]}
        wordTransitionMs={50}
        voice={player}
        onFinish={onFinish}
      />,
    );

    // 1. レッスン開始時の声かけ
    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/lesson-start.mp3']);
    });
    audios[0].finish();

    vi.useFakeTimers();

    // 2. 1文字の導入かな「あ」（isWord: false）を打ち終えても読み上げは鳴らない
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('できた！')).toBeDefined();
    expect(audios).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(50);
    });

    // 3. 単語「あさ」（isWord: true、マニフェスト登録済み）を打ち終えると完成音の後に読み上げが鳴る
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    expect(audios).toHaveLength(1);
    fireEvent.keyDown(window, { key: 'a' });
    // 効果音 ON のため、完成音と同時には鳴らず WORD_COMPLETE_SOUND_DURATION_MS 後に再生が始まる
    expect(audios).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(sound.WORD_COMPLETE_SOUND_DURATION_MS);
    });
    expect(audios.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
    ]);
    audios[1].finish();

    // 4. 未登録単語「かさ」を打ち終えると単語読み上げは無音で素通りし、最終問なので完成音後に lesson-clear が鳴る
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(audios).toHaveLength(2);

    act(() => {
      vi.advanceTimersByTime(sound.WORD_COMPLETE_SOUND_DURATION_MS);
    });
    expect(audios.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
      '/audio/phrases/lesson-clear.mp3',
    ]);
    expect(onFinish).toHaveBeenCalledOnce();
  });

  it('効果音 ON 時は完成音の後に単語読み上げを開始し、効果音 OFF 時は即座に読み上げを開始する', async () => {
    const wordCompleteSpy = vi.spyOn(sound, 'playWordCompleteSound');
    const { player, audios } = createTestVoicePlayer();

    render(
      <LessonScreen
        mode="stage"
        words={['あさ', 'あさ']}
        wordTransitionMs={500}
        voice={player}
        onFinish={vi.fn()}
      />,
    );

    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/lesson-start.mp3']);
    });
    audios[0].finish();

    vi.useFakeTimers();

    // 効果音 ON の状態で「あさ」を完了: 完成音が先に鳴り、読み上げは遅延する
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(wordCompleteSpy).toHaveBeenCalledTimes(1);
    expect(audios).toHaveLength(1);

    act(() => {
      vi.advanceTimersByTime(sound.WORD_COMPLETE_SOUND_DURATION_MS);
    });
    expect(audios.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
    ]);
    audios[1].finish();

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 効果音を OFF に切り替えて2問目の「あさ」を完了: 遅延せず即座に読み上げが始まる
    fireEvent.click(screen.getByRole('button', { name: 'おと ON' }));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(audios.map((a) => a.src)).toEqual([
      '/audio/phrases/lesson-start.mp3',
      '/audio/words/asa.mp3',
      '/audio/words/asa.mp3',
    ]);
  });

  it('音声の再生中は打鍵音の音量を下げて重なりを抑える', async () => {
    const keySoundSpy = vi.spyOn(sound, 'playKeySound');
    const { player, audios } = createTestVoicePlayer();

    render(
      <LessonScreen
        mode="stage"
        words={['かさ']}
        voice={player}
        onFinish={vi.fn()}
      />,
    );

    // lesson-start 再生中のまま打鍵する（'k' で打鍵音、'a' で「か」完成音）
    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/lesson-start.mp3']);
    });
    fireEvent.keyDown(window, { key: 'k' });
    const volumeDuringVoice = keySoundSpy.mock.calls[0][0];
    fireEvent.keyDown(window, { key: 'a' });

    // 音声が終わってから打鍵する（'s' で通常音量の打鍵音）
    audios[0].finish();
    fireEvent.keyDown(window, { key: 's' });
    const volumeAfterVoice = keySoundSpy.mock.calls[1][0];

    expect(volumeDuringVoice).toBeGreaterThan(0);
    expect(volumeDuringVoice).toBeLessThan(volumeAfterVoice);
  });

  it('保存済みの音声 OFF を読み込む前に単語を完了しても、単語読み上げと完了の声かけが鳴らない', async () => {
    const { player, audios } = createTestVoicePlayer();
    let resolveSettings!: (settings: Settings) => void;
    const delayedSettings = new Promise<Settings>((resolve) => {
      resolveSettings = resolve;
    });

    const store = {
      getSettings: () => delayedSettings,
      updateSettings: vi.fn().mockResolvedValue(DEFAULT_SETTINGS),
      recordWordTyped: vi.fn().mockResolvedValue(undefined),
      addSession: vi.fn().mockResolvedValue(1),
      recordKanaAttempt: vi.fn().mockResolvedValue(undefined),
      markLessonCleared: vi.fn().mockResolvedValue(undefined),
    };

    render(
      <LessonScreen
        mode="stage"
        words={['あさ']}
        wordTransitionMs={500}
        store={store}
        voice={player}
        onFinish={vi.fn()}
      />,
    );

    vi.useFakeTimers();

    // getSettings() が返る前に「あさ」1問を打ち切る
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });

    act(() => {
      vi.advanceTimersByTime(sound.WORD_COMPLETE_SOUND_DURATION_MS + 100);
    });
    expect(audios).toHaveLength(0);

    // その後 voiceOn: false で設定が返っても無音のまま
    await act(async () => {
      resolveSettings({ ...DEFAULT_SETTINGS, voiceOn: false });
      await delayedSettings;
    });
    expect(audios).toHaveLength(0);
  });

  it('途中で「おわる」を押した場合は lesson-clear を鳴らさない', async () => {
    const { player, audios } = createTestVoicePlayer();
    const onFinish = vi.fn();

    render(
      <LessonScreen
        mode="stage"
        words={['あさ', 'かさ']}
        voice={player}
        onFinish={onFinish}
      />,
    );

    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/lesson-start.mp3']);
    });
    audios[0].finish();

    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));
    expect(onFinish).toHaveBeenCalledOnce();
    expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/lesson-start.mp3']);
  });
});

describe('終了画面の音声再生（Issue #13）', () => {
  it('終了画面で session-end を鳴らし、自己申告の各選択肢に応じた褒め・労い音声を鳴らす', async () => {
    await progressStore.updateSettings({ selfReportOn: true });
    const sessionId = await progressStore.addSession({
      date: new Date(2026, 10, 26, 12, 0),
      durationSec: 60,
      typedKanaCount: 10,
    });
    const { player, audios } = createTestVoicePlayer();

    render(
      <EndScreen
        onBackToStart={vi.fn()}
        sessionIdPromise={Promise.resolve(sessionId)}
        voice={player}
      />,
    );

    // 終了画面の表示で session-end が鳴る
    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/session-end.mp3']);
    });
    audios[0].finish();

    // 各選択肢に対応するキーが鳴る
    const cases = [
      ['よかった', '/audio/phrases/self-report-good.mp3'],
      ['ふつう', '/audio/phrases/self-report-ok.mp3'],
      ['たいへんだった', '/audio/phrases/self-report-tired.mp3'],
      ['こたえない', '/audio/phrases/self-report-skip.mp3'],
    ] as const;

    for (const [label, expectedSrc] of cases) {
      fireEvent.click(await screen.findByRole('button', { name: label }));
      const last = audios[audios.length - 1];
      expect(last.src).toBe(expectedSrc);
      last.finish();
    }
  });

  it('自己申告 OFF のときは自己申告ボタンが表示されず、session-end のみ鳴る', async () => {
    const { player, audios } = createTestVoicePlayer();

    render(<EndScreen onBackToStart={vi.fn()} voice={player} />);

    await waitFor(() => {
      expect(audios.map((a) => a.src)).toEqual(['/audio/phrases/session-end.mp3']);
    });
    expect(screen.queryByText('きょうは どうだった？')).toBeNull();
  });
});

describe('保護者設定の音声 ON / OFF（Issue #13）', () => {
  it('初期値は ON で、OFF に切り替えると再生中の音声を止めて設定を保存する', async () => {
    const { player, audios } = createTestVoicePlayer();
    player.playPhrase('lesson-start');
    expect(audios).toHaveLength(1);

    render(<ParentGateScreen onBack={vi.fn()} voice={player} />);

    const checkbox = screen.getByRole('checkbox', {
      name: /音声/,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(true);

    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(false);
    expect(audios[0].pauseCount).toBe(1);

    await waitFor(async () => {
      expect((await progressStore.getSettings()).voiceOn).toBe(false);
    });
  });

  it('保護者設定で音声 OFF にすると、レッスンと終了画面・自己申告で一切鳴らない', async () => {
    await progressStore.updateSettings({ voiceOn: false, selfReportOn: true });
    const { player, audios } = createTestVoicePlayer();

    window.localStorage.setItem('typecraft.introSeen', '1');
    render(<App voice={player} />);

    // レッスン開始 → 1問入力 → 終了画面へ
    fireEvent.click(screen.getByRole('button', { name: /^レッスン/ }));
    await waitFor(async () => {
      expect((await progressStore.getSettings()).voiceOn).toBe(false);
    });

    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));

    // 終了画面で自己申告に回答しても無音
    const goodBtn = await screen.findByRole('button', { name: 'よかった' });
    fireEvent.click(goodBtn);

    expect(audios).toHaveLength(0);
  });
});
