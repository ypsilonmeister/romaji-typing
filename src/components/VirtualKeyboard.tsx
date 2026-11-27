import type { CSSProperties } from 'react';
import { FINGER_GROUP, KEYBOARD_ROWS, type KeySpec } from '../lesson/keyboardLayout';

/** 行ごとの左オフセット（通常キー幅 = 1 に対する倍率）。 */
export const KEYBOARD_ROW_STAGGERS: readonly number[] = [0, 0.35, 0.85, 0];

/** キー間ギャップの通常キー幅に対する比率。 */
export const KEY_GAP_RATIO = 0.1;

/** 境界・発光リング用の余白（キー単位）。 */
const WIDTH_SAFETY_MARGIN = 0.2;
const HEIGHT_SAFETY_MARGIN = 0.1;

export interface KeyboardGeometry {
  /** 最も広い行の横幅（キー単位、余白なし）。 */
  readonly contentWidthUnits: number;
  /** 利用可能幅からキーサイズを求める際の分母（余白込み）。 */
  readonly widthUnits: number;
  /** 利用可能高さからキーサイズを求める際の分母（余白込み）。 */
  readonly heightUnits: number;
}

/** キーボード全体の幅・高さを通常キー1辺あたりの単位数で計算する。 */
export function computeKeyboardGeometry(
  rows: readonly (readonly KeySpec[])[],
  rowStaggers: readonly number[] = KEYBOARD_ROW_STAGGERS,
  gapRatio: number = KEY_GAP_RATIO,
): KeyboardGeometry {
  let contentWidthUnits = 0;
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const keysWidth = row.reduce((sum, spec) => sum + (spec.width ?? 1), 0);
    const gapsWidth = Math.max(0, row.length - 1) * gapRatio;
    const stagger = rowStaggers[i] ?? 0;
    const rowWidth = stagger + keysWidth + gapsWidth;
    if (rowWidth > contentWidthUnits) {
      contentWidthUnits = rowWidth;
    }
  }

  const rowCount = rows.length;
  const contentHeightUnits = rowCount + Math.max(0, rowCount - 1) * gapRatio;

  return {
    contentWidthUnits: Number(contentWidthUnits.toFixed(4)),
    widthUnits: Number((contentWidthUnits + WIDTH_SAFETY_MARGIN).toFixed(4)),
    heightUnits: Number((contentHeightUnits + HEIGHT_SAFETY_MARGIN).toFixed(4)),
  };
}

const KEYBOARD_GEOMETRY = computeKeyboardGeometry(KEYBOARD_ROWS);

export interface VirtualKeyboardProps {
  /** 照合エンジンが案内する次に押すキー（小文字）。 */
  readonly guideKey: string | undefined;
  /** 次に受け付ける全キー（別綴り含む）。 */
  readonly nextKeys: readonly string[];
  /** ヒント表示中か（5秒停止・手動ヒント・間違い直後）。 */
  readonly hintActive: boolean;
  /** 通常案内を出すか（既定 true）。false のときは hintActive 時のみ光らせる。 */
  readonly showGuide?: boolean;
  /** 自由入力モードなど、単一の案内キーがない場合に nextKeys 全体を光らせるか（既定 false）。 */
  readonly highlightAllNext?: boolean;
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
  highlightAllNext = false,
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
    const isAltNext =
      normalizedGuide !== undefined && !isGuide && shouldHighlightGuide && nextSet.has(code);
    const isNextHighlight =
      highlightAllNext && !isGuide && shouldHighlightGuide && nextSet.has(code);
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
      isNextHighlight ? 'kb-key-next' : '',
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
        style={spec.width ? ({ '--key-span': spec.width } as CSSProperties) : undefined}
        data-key={spec.code}
        data-finger={fingerGroup ?? ''}
        data-guide={isGuide ? 'true' : undefined}
        data-hint={isHintGlow ? 'true' : undefined}
        data-next={isNextHighlight ? 'true' : undefined}
        aria-label={spec.code === ' ' ? 'スペース' : spec.label}
        onMouseDown={(event) => event.preventDefault()}
        onClick={() => onVirtualKeyPress(spec.code)}
      >
        <span className="kb-key-label">{spec.label}</span>
        {spec.hasBump && <span className="kb-key-bump" aria-hidden="true" />}
      </button>
    );
  }

  const rowsStyle = {
    '--kb-content-width-units': KEYBOARD_GEOMETRY.contentWidthUnits,
    '--kb-width-units': KEYBOARD_GEOMETRY.widthUnits,
    '--kb-height-units': KEYBOARD_GEOMETRY.heightUnits,
    '--kb-gap-ratio': KEY_GAP_RATIO,
  } as CSSProperties;

  return (
    <section className="lesson-keyboard keyboard-panel" aria-label="キーボード">
      <div className="kb-stage">
        <div className="kb-rows" style={rowsStyle}>
          {KEYBOARD_ROWS.map((row, rowIndex) => {
            const stagger = KEYBOARD_ROW_STAGGERS[rowIndex] ?? 0;
            const rowStyle =
              stagger > 0 ? ({ '--kb-row-stagger': stagger } as CSSProperties) : undefined;
            return (
              <div key={rowIndex} className={`kb-row kb-row-${rowIndex}`} style={rowStyle}>
                {row.map(renderKey)}
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
