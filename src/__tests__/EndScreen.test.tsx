import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { progressStore } from '../progress';
import { EndScreen } from '../screens/EndScreen';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await progressStore.close();
});

describe('終了画面（仕様 v0.3 §7）', () => {
  it('初期状態（自己申告 OFF）では「またね」と戻るボタンだけを表示し、自己申告やスコアは出さない', async () => {
    const onBackToStart = vi.fn();
    render(<EndScreen onBackToStart={onBackToStart} />);

    expect(screen.getByRole('heading', { level: 1, name: 'またね' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'はじめに もどる' })).toBeDefined();

    // 設定読み込み後も自己申告は出ない
    await waitFor(async () => {
      expect((await progressStore.getSettings()).selfReportOn).toBe(false);
    });
    expect(screen.queryByText('きょうは どうだった？')).toBeNull();
    expect(document.body.textContent).not.toMatch(/スコア|正答率|ミス|WPM|速度/);

    fireEvent.click(screen.getByRole('button', { name: 'はじめに もどる' }));
    expect(onBackToStart).toHaveBeenCalledOnce();
  });

  it('保護者設定で自己申告 ON のとき、3択＋こたえないを表示し、回答をセッション記録へ保存する', async () => {
    await progressStore.updateSettings({ selfReportOn: true });
    const sessionId = await progressStore.addSession({
      date: new Date(2026, 10, 26, 12, 0),
      durationSec: 120,
      typedKanaCount: 20,
    });

    render(
      <EndScreen
        onBackToStart={vi.fn()}
        sessionIdPromise={Promise.resolve(sessionId)}
      />,
    );

    expect(await screen.findByText('きょうは どうだった？')).toBeDefined();
    expect(screen.getByRole('button', { name: 'よかった' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'ふつう' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'たいへんだった' })).toBeDefined();
    expect(screen.getByRole('button', { name: 'こたえない' })).toBeDefined();

    fireEvent.click(screen.getByRole('button', { name: 'よかった' }));
    expect(screen.getByRole('button', { name: 'よかった' }).getAttribute('aria-pressed')).toBe(
      'true',
    );
    expect(screen.getByRole('status').textContent).toContain('ありがとう');

    await waitFor(async () => {
      const sessions = await progressStore.getSessions();
      expect(sessions[0]?.selfReport).toBe('good');
    });
  });

  it('保護者ゲートで自己申告を ON にし、かなを打って終了すると自己申告が表示され回答が保存される', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    fireEvent.click(screen.getByRole('button', { name: 'おうちのひと' }));

    const checkbox = screen.getByRole('checkbox', {
      name: /自己申告/,
    }) as HTMLInputElement;
    expect(checkbox.checked).toBe(false);
    fireEvent.click(checkbox);
    expect(checkbox.checked).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'もどる' }));
    fireEvent.click(screen.getByRole('button', { name: /^レッスン/ }));
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));

    expect(await screen.findByText('きょうは どうだった？')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'よかった' }));

    await waitFor(async () => {
      const sessions = await progressStore.getSessions();
      expect(sessions).toHaveLength(1);
      expect(sessions[0]?.selfReport).toBe('good');
    });
  });

  it('自己申告が ON でも無入力で終了した場合は保存先がないため選択肢を表示しない', async () => {
    await progressStore.updateSettings({ selfReportOn: true });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    fireEvent.click(screen.getByRole('button', { name: /^テーマで あそぶ/ }));
    fireEvent.click(screen.getByRole('button', { name: 'おわる' }));

    expect(screen.getByRole('heading', { level: 1, name: 'またね' })).toBeDefined();
    await waitFor(async () => {
      expect((await progressStore.getSettings()).selfReportOn).toBe(true);
    });
    expect(screen.queryByText('きょうは どうだった？')).toBeNull();
    expect(await progressStore.getSessions()).toHaveLength(0);
  });
});
