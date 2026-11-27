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
    ['-', 'right-pinky'],
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

  it('推奨キーのない特殊かな（単独の「ゃ」や促音）では入力前に x/l を強調せず、打ち始め後に追従する', () => {
    render(<LessonScreen mode="stage" words={['ゃ']} onFinish={vi.fn()} />);

    expect(keyButton('x').dataset.guide).toBeUndefined();
    expect(keyButton('l').dataset.guide).toBeUndefined();
    expect(keyButton('x').className).not.toContain('kb-key-alt');
    expect(keyButton('l').className).not.toContain('kb-key-alt');

    // 手動ヒントを押しても x/l の候補強調は出ない
    fireEvent.click(screen.getByRole('button', { name: 'ヒント' }));
    expect(keyButton('x').className).not.toContain('kb-key-alt');
    expect(keyButton('l').className).not.toContain('kb-key-alt');

    // x を打ち始めると y と右人差し指に追従する
    fireEvent.keyDown(window, { key: 'x' });
    expect(keyButton('y').dataset.guide).toBe('true');
    expect(fingerElement('right-index').dataset.active).toBe('true');

    cleanup();

    // 子音前の促音でも x/l は acceptOnly のため候補強調しない
    render(<LessonScreen mode="stage" words={['っか']} onFinish={vi.fn()} />);
    expect(keyButton('k').dataset.guide).toBe('true');
    expect(keyButton('x').className).not.toContain('kb-key-alt');
    expect(keyButton('l').className).not.toContain('kb-key-alt');

    cleanup();

    // 通常の別綴り（「ち」の c / t）は引き続き候補強調される
    render(<LessonScreen mode="stage" words={['ち']} onFinish={vi.fn()} />);
    expect(keyButton('c').dataset.guide).toBe('true');
    expect(keyButton('t').className).toContain('kb-key-alt');
  });

  it('ボタンにフォーカスがある状態で Space を押しても誤入力にならず既定動作を妨げない', () => {
    render(<LessonScreen mode="stage" words={['あさ']} onFinish={vi.fn()} />);

    const typedSection = screen.getByRole('region', { name: 'うった もじ' });
    const buttons = [
      screen.getByRole('button', { name: 'ヒント' }),
      screen.getByRole('button', { name: 'おと ON' }),
      screen.getByRole('button', { name: 'おわる' }),
    ];

    for (const btn of buttons) {
      btn.focus();
      const event = new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true });
      act(() => {
        btn.dispatchEvent(event);
      });
      expect(event.defaultPrevented).toBe(false);
      expect(typedSection.className).not.toContain('lesson-typed-shake');
      expect(keyButton('a').dataset.hint).toBeUndefined();
    }

    // フォーカスがボタンにあっても通常の文字キーはそのまま入力できる
    fireEvent.keyDown(buttons[0], { key: 'a' });
    expect(keyButton('s').dataset.guide).toBe('true');
  });

  it('短い間隔で連続して誤打鍵しても、毎回揺れアニメーションのクラスが切り替わる', () => {
    vi.useFakeTimers();
    render(<LessonScreen mode="stage" words={['あ']} onFinish={vi.fn()} />);

    const typedSection = screen.getByRole('region', { name: 'うった もじ' });

    fireEvent.keyDown(window, { key: 'z' });
    expect(typedSection.className).toContain('lesson-typed-shake');
    const firstClass = typedSection.className;

    act(() => {
      vi.advanceTimersByTime(65);
    });
    fireEvent.keyDown(window, { key: 'z' });
    expect(typedSection.className).toContain('lesson-typed-shake');
    expect(typedSection.className).not.toBe(firstClass);

    act(() => {
      vi.advanceTimersByTime(65);
    });
    fireEvent.keyDown(window, { key: 'z' });
    expect(typedSection.className).toContain('lesson-typed-shake');
    expect(typedSection.className).toBe(firstClass);

    // 最後の誤打鍵から 320ms 後に揺れクラスが解除される
    act(() => {
      vi.advanceTimersByTime(320);
    });
    expect(typedSection.className).not.toContain('lesson-typed-shake');
  });

  it('長音「ー」を含む語（けーき）で仮想キーボード「ー」ボタンと右小指を案内し、物理・仮想どちらでも打てる', () => {
    render(<LessonScreen mode="stage" words={['けーき']} onFinish={vi.fn()} />);

    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'e' });

    // 次の案内は '-'（仮想キーボードの「ー」ボタン・右小指）
    const longVowelBtn = keyButton('-');
    expect(longVowelBtn.textContent).toBe('ー');
    expect(longVowelBtn.dataset.guide).toBe('true');
    expect(fingerElement('right-pinky').dataset.active).toBe('true');

    // ヒント表示にも「ー」と「-」が示される
    fireEvent.click(screen.getByRole('button', { name: 'ヒント' }));
    const hintText = screen.getByTestId('hint-indicator').textContent ?? '';
    expect(hintText).toContain('ー');
    expect(hintText).toContain('-');

    // 仮想キーボードの「ー」ボタンクリックで「ー」が入力できる
    fireEvent.click(longVowelBtn);
    expect(keyButton('k').dataset.guide).toBe('true');

    fireEvent.keyDown(window, { key: 'k' });
    fireEvent.keyDown(window, { key: 'i' });
    expect(screen.getByText('できた！')).toBeDefined();

    cleanup();

    // 物理キーボードの '-' でも最後まで打てる
    render(<LessonScreen mode="stage" words={['けーき']} onFinish={vi.fn()} />);
    for (const key of 'ke-ki') {
      fireEvent.keyDown(window, { key });
    }
    expect(screen.getByText('できた！')).toBeDefined();
  });
});
