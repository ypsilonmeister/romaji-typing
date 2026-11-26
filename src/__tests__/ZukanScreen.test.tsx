import 'fake-indexeddb/auto';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { IDBFactory } from 'fake-indexeddb';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { App } from '../App';
import { progressStore } from '../progress';
import { LessonScreen } from '../screens/LessonScreen';
import { ZukanScreen } from '../screens/ZukanScreen';

beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
});

afterEach(async () => {
  cleanup();
  vi.restoreAllMocks();
  window.localStorage.clear();
  await progressStore.close();
});

describe('ことば図鑑（仕様 v0.3 §7）', () => {
  it('まだ打った単語がないときは空き枠を出さず、案内だけを表示する', async () => {
    render(<ZukanScreen onBack={vi.fn()} />);

    expect(await screen.findByText(/まだ ことばは ありません/)).toBeDefined();
    expect(screen.queryAllByRole('listitem')).toHaveLength(0);
    expect(screen.queryAllByRole('heading', { level: 2 })).toHaveLength(0);
  });

  it('打てた単語だけをテーマ別にかな＋ローマ字併記で並べ、未習得の空き枠や数値評価は出さない', async () => {
    await progressStore.recordWordTyped('ほし');
    await progressStore.recordWordTyped('きんせい');
    await progressStore.recordWordTyped('でんしゃ');

    render(<ZukanScreen onBack={vi.fn()} />);

    const spaceHeading = await screen.findByRole('heading', { level: 2, name: '宇宙' });
    const vehiclesHeading = screen.getByRole('heading', { level: 2, name: 'のりもの・踏切' });

    // 打っていないテーマ（植物・地理・建築・食べ物・動物）は見出しごと出さない
    expect(screen.queryByRole('heading', { level: 2, name: '植物' })).toBeNull();
    expect(screen.queryByRole('heading', { level: 2, name: '動物' })).toBeNull();

    const spaceSection = spaceHeading.closest('section')!;
    const spaceCards = within(spaceSection).getAllByRole('listitem');
    expect(spaceCards).toHaveLength(2);
    expect(spaceCards[0].textContent).toContain('ほし');
    expect(spaceCards[0].textContent).toContain('hoshi');
    expect(spaceCards[1].textContent).toContain('きんせい');
    expect(spaceCards[1].textContent).toContain('kinsei');

    const vehiclesSection = vehiclesHeading.closest('section')!;
    const vehicleCards = within(vehiclesSection).getAllByRole('listitem');
    expect(vehicleCards).toHaveLength(1);
    expect(vehicleCards[0].textContent).toContain('でんしゃ');
    expect(vehicleCards[0].textContent).toContain('densha');

    // 未習得の単語（例: つき）や、正答率・速さ・ヒント・ミス・回数は表示しない
    expect(screen.queryByText('つき')).toBeNull();
    expect(document.body.textContent).not.toMatch(/正答率|ミス|ヒント|速さ|WPM|\/\s*24/);
  });

  it('レッスンで単語を打ち終えると、ことば図鑑にその単語が増える', async () => {
    render(
      <LessonScreen
        mode="theme"
        words={['ほし']}
        wordTransitionMs={100}
        onFinish={vi.fn()}
      />,
    );

    // 「ほし」を h -> o -> s -> h -> i で打ち切る
    for (const key of ['h', 'o', 's', 'h', 'i']) {
      fireEvent.keyDown(window, { key });
    }
    expect(screen.getByText('できた！')).toBeDefined();

    await waitFor(async () => {
      const words = await progressStore.getWordProgress();
      expect(words).toEqual([{ wordId: 'ほし', typedCount: 1 }]);
    });

    cleanup();

    // 図鑑を開くと「宇宙」に「ほし / hoshi」が増えている
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'はじめる' }));
    fireEvent.click(screen.getByRole('button', { name: 'ことば図鑑' }));

    expect(await screen.findByRole('heading', { level: 2, name: '宇宙' })).toBeDefined();
    expect(screen.getByText('ほし')).toBeDefined();
    expect(screen.getByText('hoshi')).toBeDefined();
  });

  it('単語パックに含まれない語を打った場合も「そのほか」にかな＋ローマ字で表示される', async () => {
    await progressStore.recordWordTyped('あさ');

    render(<ZukanScreen onBack={vi.fn()} />);

    const otherHeading = await screen.findByRole('heading', { level: 2, name: 'そのほか' });
    const otherSection = otherHeading.closest('section')!;
    expect(otherSection.textContent).toContain('あさ');
    expect(otherSection.textContent).toContain('asa');
  });
});
