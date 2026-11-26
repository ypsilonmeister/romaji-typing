import { FINGER_GROUP, KEYBOARD_ROWS, type KeySpec } from '../lesson/keyboardLayout';

export interface VirtualKeyboardProps {
  /** 照合エンジンが案内する次に押すキー（小文字）。 */
  readonly guideKey: string | undefined;
  /** 次に受け付ける全キー（別綴り含む）。 */
  readonly nextKeys: readonly string[];
  /** ヒント表示中か（5秒停止・手動ヒント・間違い直後）。 */
  readonly hintActive: boolean;
  /** 通常案内を出すか（既定 true）。false のときは hintActive 時のみ光らせる。 */
  readonly showGuide?: boolean;
  /** 直前に押されたキー（瞬間発光用）。 */
  readonly pressedKey: string | null;
  /** バーチャルキーボードのタップ入力ハンドラ。 */
  readonly onVirtualKeyPress: (key: string) => void;
}

export function VirtualKeyboard({
  guideKey,
  nextKeys,
  hintActive,
  showGuide = true,
  pressedKey,
  onVirtualKeyPress,
}: VirtualKeyboardProps) {
  const normalizedGuide = guideKey?.toLowerCase();
  const normalizedPressed = pressedKey?.toLowerCase();
  const nextSet = new Set(nextKeys.map((k) => k.toLowerCase()));
  const shouldHighlightGuide = showGuide || hintActive;

  function renderKey(spec: KeySpec) {
    const code = spec.code.toLowerCase();
    const isGuide = shouldHighlightGuide && normalizedGuide === code;
    const isHintGlow = hintActive && normalizedGuide === code;
    const isAltNext = !isGuide && shouldHighlightGuide && nextSet.has(code);
    const isPressed = normalizedPressed === code;
    const fingerGroup = spec.finger ? FINGER_GROUP[spec.finger] : undefined;

    const classes = [
      'kb-key',
      fingerGroup ? `finger-${fingerGroup}` : '',
      spec.isHome ? 'kb-key-home' : '',
      spec.isSpecial ? 'kb-key-special' : '',
      isGuide ? 'kb-key-guide' : '',
      isHintGlow ? 'kb-key-hint' : '',
      isAltNext ? 'kb-key-alt' : '',
      isPressed ? 'kb-key-pressed' : '',
    ]
      .filter(Boolean)
      .join(' ');

    return (
      <button
        key={spec.code}
        type="button"
        tabIndex={-1}
        className={classes}
        style={spec.width ? { flexGrow: spec.width } : undefined}
        data-key={spec.code}
        data-finger={fingerGroup ?? ''}
        data-guide={isGuide ? 'true' : undefined}
        data-hint={isHintGlow ? 'true' : undefined}
        aria-label={spec.code === ' ' ? 'スペース' : spec.label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onVirtualKeyPress(spec.code)}
      >
        <span className="kb-key-label">{spec.label}</span>
        {spec.hasBump && <span className="kb-key-bump" aria-hidden="true" />}
      </button>
    );
  }

  return (
    <section className="lesson-keyboard keyboard-panel" aria-label="キーボード">
      <div className="kb-rows">
        {KEYBOARD_ROWS.map((row, rowIndex) => (
          <div key={rowIndex} className={`kb-row kb-row-${rowIndex}`}>
            {row.map(renderKey)}
          </div>
        ))}
      </div>
    </section>
  );
}
