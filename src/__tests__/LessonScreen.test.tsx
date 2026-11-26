import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fingerOfKey } from '../lesson/keyboardLayout';
import { LessonScreen } from '../screens/LessonScreen';

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function keyButton(code: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`.kb-key[data-key="${code}"]`);
  if (!el) throw new Error(`Key button not found: ${code}`);
  return el;
}

function fingerElement(fingerId: string): HTMLElement {
  const el = document.querySelector<HTMLElement>(`[data-finger-id="${fingerId}"]`);
  if (!el) throw new Error(`Finger element not found: ${fingerId}`);
  return el;
}

describe('指の割り当て（仕様 v0.3 §3）', () => {
  it.each([
    ['q', 'left-pinky'],
    ['a', 'left-pinky'],
    ['z', 'left-pinky'],
    ['w', 'left-ring'],
    ['s', 'left-ring'],
    ['x', 'left-ring'],
    ['e', 'left-middle'],
    ['d', 'left-middle'],
    ['c', 'left-middle'],
    ['r', 'left-index'],
    ['f', 'left-index'],
    ['v', 'left-index'],
    ['t', 'left-index'],
    ['g', 'left-index'],
    ['b', 'left-index'],
    ['y', 'right-index'],
    ['h', 'right-index'],
    ['n', 'right-index'],
    ['u', 'right-index'],
    ['j', 'right-index'],
    ['m', 'right-index'],
    ['i', 'right-middle'],
    ['k', 'right-middle'],
    [',', 'right-middle'],
    ['o', 'right-ring'],
    ['l', 'right-ring'],
    ['.', 'right-ring'],
    ['p', 'right-pinky'],
    [';', 'right-pinky'],
    ['/', 'right-pinky'],
    [' ', 'right-thumb'],
  ] as const)('キー %s は %s に割り当てられる', (key, expectedFinger) => {
    expect(fingerOfKey(key)).toBe(expectedFinger);
  });
});

describe('LessonScreen', () => {
  it('初期表示でお題・キーボード・手の図・ホームポジションと最初の案内を表示する', () => {
    render(<LessonScreen mode="stage" words={['あさ']} onFinish={vi.fn()} />);

    expect(screen.getByRole('region', { name: 'おだい' }).textContent).toContain('あさ');
    expect(screen.getByRole('region', { name: 'キーボード' })).toBeDefined();
    expect(screen.getByRole('region', { name: 'てのず' })).toBeDefined();
    expect(screen.getByLabelText('ホームポジション ASDF JKL;')).toBeDefined();

    // 最初のキー 'a' が発光し、左手小指が光る
    expect(keyButton('a').dataset.guide).toBe('true');
    expect(keyButton('a').dataset.finger).toBe('pinky');
    expect(fingerElement('left-pinky').dataset.active).toBe('true');
  });

  it('物理キーボードの keydown でお題を最後まで打つと次のお題へ進み、全問完了で onFinish を呼ぶ', () => {
    vi.useFakeTimers();
    const onFinish = vi.fn();
    render(
      <LessonScreen
        mode="stage"
        words={['あさ', 'かさ']}
        wordTransitionMs={200}
        onFinish={onFinish}
      />,
    );

    // 「あさ」を打つ: a -> s -> a
    fireEvent.keyDown(window, { key: 'a' });
    expect(keyButton('s').dataset.guide).toBe('true');
    expect(fingerElement('left-ring').dataset.active).toBe('true');

    fireEvent.keyDown(window, { key: 's' });
    expect(keyButton('a').dataset.guide).toBe('true');

    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('できた！')).toBeDefined();

    act(() => {
      vi.advanceTimersByTime(200);
    });

    // 次のお題「かさ」に進む
    expect(screen.getByRole('region', { name: 'おだい' }).textContent).toContain('かさ');
    expect(keyButton('k').dataset.guide).toBe('true');

    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'a' });
    fireEvent.keyDown(window, { key: 's' });
    fireEvent.keyDown(window, { key: 'a' });

    expect(onFinish).not.toHaveBeenCalled();
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(onFinish).toHaveBeenCalledTimes(1);
  });

  it('別綴り（ち=ti、し=si）で打ち始めた場合に案内と手の図が追従する', () => {
    render(<LessonScreen mode="stage" words={['ちし']} onFinish={vi.fn()} />);

    // 「ち」の推奨は chi → 最初は c（左中指）を案内
    expect(keyButton('c').dataset.guide).toBe('true');
    expect(fingerElement('left-middle').dataset.active).toBe('true');

    // 別綴り t で打ち始めると、次の案内は i（右中指）へ追従する
    fireEvent.keyDown(window, { key: 't' });
    expect(keyButton('i').dataset.guide).toBe('true');
    expect(fingerElement('right-middle').dataset.active).toBe('true');

    // i を打つと「ち」が完成し、次の「し」へ進む
    fireEvent.keyDown(window, { key: 'i' });
    expect(keyButton('s').dataset.guide).toBe('true');

    // 「し」で s を打つと共通接頭辞のため推奨 h を案内するが、別綴りの i も受理される
    fireEvent.keyDown(window, { key: 's' });
    expect(keyButton('h').dataset.guide).toBe('true');

    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByText('できた！')).toBeDefined();
  });

  it('間違いキーでは揺れとヒント発光で知らせ、その場で打ち直せる', () => {
    render(<LessonScreen mode="stage" words={['かさ']} onFinish={vi.fn()} />);

    const typedSection = screen.getByRole('region', { name: 'うった もじ' });
    fireEvent.keyDown(window, { key: 'z' });

    expect(typedSection.className).toContain('lesson-typed-shake');
    expect(keyButton('k').dataset.hint).toBe('true');
    expect(screen.getByTestId('hint-indicator').textContent).toContain('K');

    // 正しいキー k を打つとそのまま進み、ヒント発光は解除される
    fireEvent.keyDown(window, { key: 'k' });
    expect(keyButton('k').dataset.hint).toBeUndefined();
    expect(keyButton('a').dataset.guide).toBe('true');
  });

  it('Backspace は入力中のかなだけを取り消し、完成したかなには戻らない', () => {
    render(<LessonScreen mode="stage" words={['かさ']} onFinish={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'k' });
    expect(keyButton('a').dataset.guide).toBe('true');

    // 入力中の 'k' を消すと再び 'k' 待ちに戻る
    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(keyButton('k').dataset.guide).toBe('true');

    // 「か」を完成させた後の Backspace は何もしない
    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'a' });
    expect(keyButton('s').dataset.guide).toBe('true');

    fireEvent.keyDown(window, { key: 'Backspace' });
    expect(keyButton('s').dataset.guide).toBe('true');
  });

  it('5秒間入力が止まると自動でヒントが光り、手動ヒントボタンでも光る', () => {
    vi.useFakeTimers();
    render(<LessonScreen mode="stage" words={['あさ']} hintDelayMs={5000} onFinish={vi.fn()} />);

    expect(keyButton('a').dataset.hint).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(4999);
    });
    expect(keyButton('a').dataset.hint).toBeUndefined();

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(keyButton('a').dataset.hint).toBe('true');
    expect(screen.getByTestId('hint-indicator').textContent).toContain('A');

    // 入力するとヒントは消える
    fireEvent.keyDown(window, { key: 'a' });
    expect(keyButton('s').dataset.hint).toBeUndefined();

    // 手動ヒントボタンで即座に光る
    fireEvent.click(screen.getByRole('button', { name: 'ヒント' }));
    expect(keyButton('s').dataset.hint).toBe('true');
    expect(screen.getByTestId('hint-indicator').textContent).toContain('S');
  });

  it('IME の composition 中の keydown は無視する', () => {
    render(<LessonScreen mode="stage" words={['あ']} onFinish={vi.fn()} />);

    // isComposing: true
    fireEvent.keyDown(window, { key: 'a', isComposing: true });
    expect(screen.queryByText('できた！')).toBeNull();

    // keyCode: 229 (Safari/IME プロセスキー)
    fireEvent.keyDown(window, { key: 'a', keyCode: 229 });
    expect(screen.queryByText('できた！')).toBeNull();

    // compositionstart 〜 compositionend の間
    fireEvent(window, new Event('compositionstart'));
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.queryByText('できた！')).toBeNull();
    fireEvent(window, new Event('compositionend'));

    // composition 終了後は通常どおり受理される
    fireEvent.keyDown(window, { key: 'a' });
    expect(screen.getByText('できた！')).toBeDefined();
  });

  it('バーチャルキーボードのクリックでも入力でき、音の ON/OFF を切り替えられる', () => {
    render(<LessonScreen mode="stage" words={['あ']} onFinish={vi.fn()} />);

    const soundBtn = screen.getByRole('button', { name: 'おと ON' });
    fireEvent.click(soundBtn);
    expect(screen.getByRole('button', { name: 'おと OFF' })).toBeDefined();

    fireEvent.click(keyButton('a'));
    expect(screen.getByText('できた！')).toBeDefined();
  });
});
