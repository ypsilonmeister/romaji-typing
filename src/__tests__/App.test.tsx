import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';

afterEach(() => {
  cleanup();
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
});
