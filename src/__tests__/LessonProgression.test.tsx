import 'fake-indexeddb/auto';
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { generateLesson, isWordAllowedInStage } from '../lesson';
import { createProgressStore, type ProgressStore } from '../progress';
import { LessonScreen } from '../screens/LessonScreen';

let dbCounter = 0;
const stores: ProgressStore[] = [];

function createTestStore(): ProgressStore {
  const store = createProgressStore(`typecraft-lesson-test-${Date.now()}-${++dbCounter}`);
  stores.push(store);
  return store;
}

afterEach(async () => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
  while (stores.length > 0) {
    await stores.pop()!.close();
  }
});

function guidedKeyCode(): string | null {
  const el = document.querySelector<HTMLElement>('.kb-key[data-guide="true"]');
  return el?.dataset.key ?? null;
}

describe('レッスン進行とステージ解放（Issue #4）', () => {
  it('Stage A を開始して案内に沿って最後まで打ち切ると Stage B が解放され、永続化される', async () => {
    const store = createTestStore();
    window.localStorage.setItem('typecraft.introSeen', '1');

    const { unmount } = render(<App store={store} />);

    // 初期状態では Stage A は解放済み、Stage B はロック中
    const stageAButton = screen.getByRole('button', { name: /^Stage A/ });
    const stageBButton = screen.getByRole('button', { name: /^Stage B/ });
    expect((stageAButton as HTMLButtonElement).disabled).toBe(false);
    expect((stageBButton as HTMLButtonElement).disabled).toBe(true);

    // Stage A のレッスンを開始
    fireEvent.click(stageAButton);
    expect(screen.getByRole('heading', { level: 1, name: /^レッスン/ })).toBeDefined();
    expect(screen.getByText('Stage A: ホームポジション')).toBeDefined();

    // 案内に沿って全問打ち切る
    vi.useFakeTimers();
    let safety = 0;
    while (!screen.queryByRole('heading', { level: 1, name: 'またね' }) && safety < 200) {
      safety++;
      const key = guidedKeyCode();
      if (key) {
        fireEvent.keyDown(window, { key });
      } else {
        // 単語完成後の遷移待ち（550ms）を進める
        act(() => {
          vi.advanceTimersByTime(600);
        });
      }
    }
    vi.useRealTimers();

    // 全問打ち切りで終了画面へ遷移
    expect(screen.getByRole('heading', { level: 1, name: 'またね' })).toBeDefined();

    // モード選択へ戻ると Stage B が解放されている
    fireEvent.click(screen.getByRole('button', { name: 'はじめに もどる' }));
    const unlockedStageB = screen.getByRole('button', { name: /^Stage B/ }) as HTMLButtonElement;
    expect(unlockedStageB.disabled).toBe(false);
    expect(screen.getByRole('button', { name: /^Stage A/ }).textContent).toContain('クリア');

    // IndexedDB にも永続化されている
    await waitFor(async () => {
      const cleared = await store.getClearedLessonIds();
      expect(cleared.has('stage-a')).toBe(true);
    });
    const sessions = await store.getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].typedKanaCount).toBeGreaterThan(0);

    // 再マウントしても IndexedDB から解放状態が復元される
    unmount();
    render(<App store={store} />);
    await waitFor(() => {
      const restoredStageB = screen.getByRole('button', { name: /^Stage B/ }) as HTMLButtonElement;
      expect(restoredStageB.disabled).toBe(false);
    });
  });

  it('最終問を打ち切った直後（遷移タイマー前）に「おわる」を押しても Stage B が解放・永続化される', async () => {
    const store = createTestStore();
    window.localStorage.setItem('typecraft.introSeen', '1');

    render(<App store={store} />);
    fireEvent.click(screen.getByRole('button', { name: /^Stage A/ }));

    vi.useFakeTimers();
    let safety = 0;
    while (safety < 200) {
      safety++;
      const progressText = screen.getByLabelText(/^おだい /).textContent?.trim();
      const isLastPrompt = progressText === '10 / 10';
      const key = guidedKeyCode();
      if (key) {
        fireEvent.keyDown(window, { key });
        if (isLastPrompt && screen.queryByText('できた！')) {
          break;
        }
      } else {
        act(() => {
          vi.advanceTimersByTime(600);
        });
      }
    }

    // 最終問で「できた！」が表示され、自動遷移（550ms）より前の状態で「おわる」を押す
    expect(screen.getByText('できた！')).toBeDefined();
    expect(screen.queryByRole('heading', { level: 1, name: 'またね' })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));
    vi.useRealTimers();

    expect(screen.getByRole('heading', { level: 1, name: 'またね' })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'はじめに もどる' }));

    const stageBButton = screen.getByRole('button', { name: /^Stage B/ }) as HTMLButtonElement;
    expect(stageBButton.disabled).toBe(false);
    expect(screen.getByRole('button', { name: /^Stage A/ }).textContent).toContain('クリア');

    await waitFor(async () => {
      const cleared = await store.getClearedLessonIds();
      expect(cleared.has('stage-a')).toBe(true);
    });
    const sessions = await store.getSessions();
    expect(sessions.length).toBe(1);
    expect(sessions[0].typedKanaCount).toBeGreaterThan(0);
  });

  it('途中で「おわる」を押した場合は Stage B が解放されない（未入力・入力途中とも）', async () => {
    const store = createTestStore();
    window.localStorage.setItem('typecraft.introSeen', '1');

    render(<App store={store} />);

    // 未入力のまま「おわる」を押す
    fireEvent.click(screen.getByRole('button', { name: /^Stage A/ }));
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はじめに もどる' }));

    expect((screen.getByRole('button', { name: /^Stage B/ }) as HTMLButtonElement).disabled).toBe(
      true,
    );
    expect((await store.getClearedLessonIds()).has('stage-a')).toBe(false);

    // 1問だけ打ってから途中で「おわる」を押す
    fireEvent.click(screen.getByRole('button', { name: /^Stage A/ }));
    const key = guidedKeyCode();
    expect(key).not.toBeNull();
    fireEvent.keyDown(window, { key: key! });
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));
    fireEvent.click(screen.getByRole('button', { name: 'はじめに もどる' }));

    const stageBButton = screen.getByRole('button', { name: /^Stage B/ }) as HTMLButtonElement;
    expect(stageBButton.disabled).toBe(true);

    const cleared = await store.getClearedLessonIds();
    expect(cleared.has('stage-a')).toBe(false);
  });

  it('LessonScreen はお題ごとの showGuide に従って案内あり／案内なしを切り替える', async () => {
    const store = createTestStore();
    await store.getSettings();
    vi.useFakeTimers();
    const onFinish = vi.fn();

    render(
      <LessonScreen
        mode="stage"
        prompts={[
          { text: 'い', showGuide: true, kind: 'new' },
          { text: 'あ', showGuide: false, kind: 'review' },
        ]}
        wordTransitionMs={100}
        store={store}
        onFinish={onFinish}
      />,
    );

    // 1問目（新規・案内あり）: 'i' キーが案内表示される
    expect(guidedKeyCode()).toBe('i');
    fireEvent.keyDown(window, { key: 'i' });
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // 2問目（既習・案内なし）: 最初はキー案内が出ない
    expect(guidedKeyCode()).toBeNull();

    // ヒントを押すと 'a' キーが光る
    fireEvent.click(screen.getByRole('button', { name: 'ヒント' }));
    expect(guidedKeyCode()).toBe('a');

    // 'a' を打つと完了
    fireEvent.keyDown(window, { key: 'a' });
    act(() => {
      vi.advanceTimersByTime(100);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('Stage B の生成レッスンをそのまま LessonScreen に渡すと全問が Stage B の範囲内で進行できる', () => {
    const lesson = generateLesson('stage-b', { random: () => 0.3 });
    for (const prompt of lesson.prompts) {
      expect(isWordAllowedInStage(prompt.text, 'stage-b')).toBe(true);
    }
    expect(lesson.prompts.some((p) => p.showGuide)).toBe(true);
    expect(lesson.prompts.some((p) => !p.showGuide)).toBe(true);
  });
});
