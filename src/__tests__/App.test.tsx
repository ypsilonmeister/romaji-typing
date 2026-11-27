import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
  window.localStorage.clear();
});

const click = (name: string | RegExp) => fireEvent.click(screen.getByRole('button', { name }));
const heading = (name: string | RegExp) => screen.getByRole('heading', { level: 1, name });
const introHeading = () => screen.queryByRole('heading', { name: /IME をオフ/ });

function renderAtMenu() {
  render(<App />);
  click('はじめる');
}

describe('画面遷移', () => {
  it('初回は IME オフの案内を出し、はじめるでモード選択へ進む', () => {
    render(<App />);
    expect(introHeading()).not.toBeNull();
    click('はじめる');
    expect(introHeading()).toBeNull();
    expect(screen.getByRole('button', { name: /^レッスン/ })).toBeDefined();
  });

  it('2回目以降は案内を省略する', () => {
    renderAtMenu();
    cleanup();
    render(<App />);
    expect(introHeading()).toBeNull();
    expect(screen.getByRole('button', { name: /^レッスン/ })).toBeDefined();
  });

  it('はじめるを押す前に開き直すと、案内がもう一度出る', () => {
    render(<App />);
    cleanup();
    render(<App />);
    expect(introHeading()).not.toBeNull();
  });

  it.each([/^レッスン/, /^テーマで あそぶ/])('%s → レッスン → 終了 → モード選択', (card) => {
    renderAtMenu();
    click(card);
    expect(heading(card)).toBeDefined();
    expect(screen.getByRole('region', { name: 'キーボード' })).toBeDefined();
    click('おわる');
    expect(heading('またね')).toBeDefined();
    click('はじめに もどる');
    expect(screen.getByRole('button', { name: /^レッスン/ })).toBeDefined();
  });

  it('しりとり → 終了 → モード選択', () => {
    renderAtMenu();
    click(/^しりとり/);
    expect(heading('しりとり')).toBeDefined();
    expect(screen.getByRole('region', { name: 'キーボード' })).toBeDefined();
    click('おわる');
    expect(heading('またね')).toBeDefined();
    click('はじめに もどる');
    expect(screen.getByRole('button', { name: /^しりとり/ })).toBeDefined();
  });

  it.each([
    ['ことば図鑑', 'ことば図鑑'],
    ['おうちのひと', '保護者ゲート'],
  ])('%s を開いてモード選択へ戻る', (button, title) => {
    renderAtMenu();
    click(button);
    expect(heading(title)).toBeDefined();
    click('もどる');
    expect(screen.getByRole('button', { name: /^レッスン/ })).toBeDefined();
  });

  it('localStorage が使えなくても、案内からモード選択へ進める', () => {
    const fail = () => {
      throw new Error('storage unavailable');
    };
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(fail);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(fail);
    renderAtMenu();
    expect(screen.getByRole('button', { name: /^レッスン/ })).toBeDefined();
  });

  it('通常の「テーマで あそぶ」入口から長音「ー」を含む語に到達し、物理 - キーで打ち切れる', () => {
    vi.useFakeTimers();
    renderAtMenu();
    click(/^テーマで あそぶ/);

    // 1問目「ほし」を打ち切って次のお題へ進む
    expect(screen.getByRole('region', { name: 'おだい' }).textContent).toContain('ほし');
    for (const key of 'hoshi') {
      fireEvent.keyDown(window, { key });
    }
    act(() => {
      vi.advanceTimersByTime(600);
    });

    // 2問目で長音語「けーき」に到達し、'-'（ーボタン）が案内されて打ち切れる
    expect(screen.getByRole('region', { name: 'おだい' }).textContent).toContain('けーき');
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'e' });

    const longVowelKey = document.querySelector<HTMLButtonElement>('[data-key="-"]');
    expect(longVowelKey).not.toBeNull();
    expect(longVowelKey?.textContent).toBe('ー');
    expect(longVowelKey?.dataset.guide).toBe('true');

    for (const key of '-ki') {
      fireEvent.keyDown(window, { key });
    }
    expect(screen.getByText('できた！')).toBeDefined();
  });
});
