import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { progressStore, type SessionRecord } from '../progress';
import { ParentGateScreen } from '../screens/ParentGateScreen';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await progressStore.close();
});

/** 見出し行を除いた、表の各行のセルの文字。 */
async function historyRows() {
  const table = await screen.findByRole('table');
  return within(table)
    .getAllByRole('row')
    .slice(1)
    .map((row) => within(row).getAllByRole('cell').map((cell) => cell.textContent));
}

const storeOf = (sessions: SessionRecord[]) => ({ getSessions: () => Promise.resolve(sessions) });

describe('保護者ゲートのれんしゅう記録', () => {
  it('保存した記録を、アプリの画面から新しい順で確認できる', async () => {
    await progressStore.addSession({
      date: new Date(2026, 10, 25, 9, 5),
      durationSec: 45,
      typedKanaCount: 12,
    });
    await progressStore.addSession({
      date: new Date(2026, 10, 26, 18, 30),
      durationSec: 185,
      typedKanaCount: 30,
    });

    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    fireEvent.click(screen.getByRole('button', { name: 'おうちのひと' }));

    expect(await historyRows()).toEqual([
      ['2026/11/26 18:30', '3分5秒', '30'],
      ['2026/11/25 09:05', '45秒', '12'],
    ]);
  });

  it('記録がなければ、その旨を出す', async () => {
    render(<ParentGateScreen onBack={() => {}} store={storeOf([])} />);
    expect(await screen.findByText('まだ記録がありません。')).toBeDefined();
    expect(screen.queryByRole('table')).toBeNull();
  });

  it('読み込めないときは、記録なしと区別して知らせ、もどれる', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onBack = vi.fn();
    const store = { getSessions: () => Promise.reject(new Error('unavailable')) };
    render(<ParentGateScreen onBack={onBack} store={store} />);

    expect((await screen.findByRole('alert')).textContent).toBe('記録を読み込めませんでした。');
    expect(screen.queryByText('まだ記録がありません。')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'もどる' }));
    expect(onBack).toHaveBeenCalledOnce();
  });
});
