import { cleanup, fireEvent, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { KEYBOARD_ROWS } from '../../lesson/keyboardLayout';
import {
  KEY_GAP_RATIO,
  KEYBOARD_ROW_STAGGERS,
  VirtualKeyboard,
  computeKeyboardGeometry,
} from '../VirtualKeyboard';

afterEach(() => {
  cleanup();
});

const MAX_KEY_SIZE_PX = 4.75 * 16; // 4.75rem (76px)

describe('VirtualKeyboard', () => {
  it('正方形キー用のコンテナ構造と CSS カスタムプロパティを出力し、既存の見た目・挙動を保つ', () => {
    const onPress = vi.fn();
    const { container } = render(
      <VirtualKeyboard
        guideKey="f"
        nextKeys={['f', 'j']}
        hintActive={true}
        pressedKey="a"
        onVirtualKeyPress={onPress}
      />,
    );

    const stage = container.querySelector<HTMLElement>('.keyboard-panel > .kb-stage');
    expect(stage).not.toBeNull();

    const rows = stage?.querySelector<HTMLElement>('.kb-rows');
    expect(rows).not.toBeNull();
    const geometry = computeKeyboardGeometry(KEYBOARD_ROWS);
    expect(rows?.style.getPropertyValue('--kb-content-width-units')).toBe(
      String(geometry.contentWidthUnits),
    );
    expect(rows?.style.getPropertyValue('--kb-width-units')).toBe(String(geometry.widthUnits));
    expect(rows?.style.getPropertyValue('--kb-height-units')).toBe(String(geometry.heightUnits));
    expect(rows?.style.getPropertyValue('--kb-gap-ratio')).toBe(String(KEY_GAP_RATIO));

    // 通常キー（例: F）は --key-span 未指定（CSS 既定 1 → 1:1 正方形）かつ flexGrow を使わない
    const fKey = container.querySelector<HTMLElement>('.kb-key[data-key="f"]');
    expect(fKey).not.toBeNull();
    expect(fKey?.style.getPropertyValue('--key-span')).toBe('');
    expect(fKey?.style.flexGrow).toBe('');
    expect(fKey?.className).toContain('finger-index');
    expect(fKey?.className).toContain('kb-key-home');
    expect(fKey?.className).toContain('kb-key-guide');
    expect(fKey?.className).toContain('kb-key-hint');
    expect(fKey?.querySelector('.kb-key-bump')).not.toBeNull();

    // 特殊幅キー（Backspace / Space）は --key-span で倍率を指定し、flexGrow を使わない
    const bsKey = container.querySelector<HTMLElement>('.kb-key[data-key="Backspace"]');
    expect(bsKey?.style.getPropertyValue('--key-span')).toBe('1.5');
    expect(bsKey?.style.flexGrow).toBe('');

    const spaceKey = container.querySelector<HTMLElement>('.kb-key[data-key=" "]');
    expect(spaceKey?.style.getPropertyValue('--key-span')).toBe('6.5');
    expect(spaceKey?.style.flexGrow).toBe('');

    // 直前押下状態とクリック入力の既存挙動を維持
    const aKey = container.querySelector<HTMLElement>('.kb-key[data-key="a"]');
    expect(aKey?.className).toContain('kb-key-pressed');
    fireEvent.click(fKey!);
    expect(onPress).toHaveBeenCalledWith('f');
  });

  it.each([
    { name: '1366x768 レッスン画面（設計下限・フル）', availW: 907, availH: 355 },
    { name: '1366x650 レッスン画面（設計下限・実効高）', availW: 907, availH: 287 },
    { name: '1366x650 しりとり画面（設計下限・実効高）', availW: 1000, availH: 274 },
    { name: '1366x500 レッスン画面（低高ウィンドウ）', availW: 907, availH: 217 },
    { name: '1366x500 しりとり画面（低高ウィンドウ）', availW: 1000, availH: 207 },
    { name: '1024x600 レッスン画面', availW: 674, availH: 266 },
    { name: '1024x600 しりとり画面', availW: 978, availH: 252 },
    { name: '1920x1080 レッスン画面', availW: 1288, availH: 520 },
    { name: '1920x1080 しりとり画面', availW: 1000, availH: 500 },
    { name: '768x1024 縦長（<=820px 縦積み）', availW: 720, availH: 430 },
    { name: '480x800 小型縦長', availW: 440, availH: 336 },
    { name: '320x568 極狭幅縦長（<=820px 縦積み）', availW: 270, availH: 238 },
    { name: '900x1200 縦長デスクトップ', availW: 585, availH: 580 },
    { name: '1920x600 横長・低高', availW: 1288, availH: 240 },
  ])('$name で全キーが正方形（特殊キーは規定比）を保ち枠内に収まる', ({ availW, availH }) => {
    const geometry = computeKeyboardGeometry(KEYBOARD_ROWS);
    const keySize = Math.min(
      availW / geometry.widthUnits,
      availH / geometry.heightUnits,
      MAX_KEY_SIZE_PX,
    );
    const keyGap = keySize * KEY_GAP_RATIO;

    expect(keySize).toBeGreaterThan(0);

    // 各行が横にはみ出さないこと、通常キーは 1:1、特殊キーは spec.width : 1 であること
    KEYBOARD_ROWS.forEach((row, rowIndex) => {
      const stagger = (KEYBOARD_ROW_STAGGERS[rowIndex] ?? 0) * keySize;
      let rowWidth = stagger;
      row.forEach((spec, idx) => {
        const span = spec.width ?? 1;
        const w = keySize * span;
        const h = keySize;
        if (spec.width === undefined) {
          expect(w / h).toBeCloseTo(1, 5);
        } else {
          expect(w / h).toBeCloseTo(spec.width, 5);
        }
        rowWidth += w + (idx > 0 ? keyGap : 0);
      });
      expect(rowWidth).toBeLessThanOrEqual(availW);
    });

    // 全体高さが縦にはみ出さないこと
    const totalHeight =
      KEYBOARD_ROWS.length * keySize + Math.max(0, KEYBOARD_ROWS.length - 1) * keyGap;
    expect(totalHeight).toBeLessThanOrEqual(availH);
  });

  it('行にキーが追加されても computeKeyboardGeometry が収まる単位幅を再計算する', () => {
    const extendedRows = KEYBOARD_ROWS.map((row, idx) =>
      idx === 0 ? [...row, { code: '-', label: 'ー', finger: 'right-pinky' as const }] : row,
    );
    const base = computeKeyboardGeometry(KEYBOARD_ROWS);
    const extended = computeKeyboardGeometry(extendedRows);
    expect(extended.contentWidthUnits).toBeGreaterThan(base.contentWidthUnits);
    expect(extended.widthUnits).toBeGreaterThan(extended.contentWidthUnits);
  });

  it('styles.css が正方形アスペクト比と幅・高さ両基準のコンテナクエリ構造を持つ', async () => {
    const fsModuleName = 'node:fs';
    const { readFileSync } = (await import(/* @vite-ignore */ fsModuleName)) as {
      readFileSync: (path: string, encoding: 'utf-8') => string;
    };
    const stylesCss = readFileSync('src/styles.css', 'utf-8');

    // コンテナサイズ計測と縦積み時の inline-size フォールバック
    expect(stylesCss).toMatch(/\.kb-stage\s*\{[^}]*container-type:\s*size;/s);
    expect(stylesCss).toMatch(
      /@media\s*\(max-width:\s*820px\)[\s\S]*?\.kb-stage\s*\{[^}]*container-type:\s*inline-size;/,
    );

    // 利用可能幅（cqi）と高さ（cqb）の両方から --key-size を決定
    expect(stylesCss).toMatch(/calc\(100cqi\s*\/\s*var\(--kb-width-units/);
    expect(stylesCss).toMatch(/calc\(100cqb\s*\/\s*var\(--kb-height-units/);

    // キーの正方形（aspect-ratio）と固定伸縮（flex: 0 0 auto）
    expect(stylesCss).toMatch(/\.kb-key\s*\{[^}]*flex:\s*0\s+0\s+auto;/s);
    expect(stylesCss).toMatch(
      /\.kb-key\s*\{[^}]*inline-size:\s*calc\(var\(--key-size\)\s*\*\s*var\(--key-span,\s*1\)\);/s,
    );
    expect(stylesCss).toMatch(/\.kb-key\s*\{[^}]*block-size:\s*var\(--key-size\);/s);
    expect(stylesCss).toMatch(/\.kb-key\s*\{[^}]*aspect-ratio:\s*var\(--key-span,\s*1\)\s*\/\s*1;/s);

    // 狭幅レッスン画面で自動最小幅によるグリッド列の横はみ出しを防ぐ（minmax(0, 1fr)）
    expect(stylesCss).toMatch(
      /@media\s*\(max-width:\s*820px\)[\s\S]*?\.lesson\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s,
    );

    // 低いウィンドウ（例: 1366x500）でも 100dvh 内に収まるよう固定の min-block-size を持たない
    expect(stylesCss).not.toMatch(/\.lesson\s*\{[^}]*min-block-size:\s*35rem;/s);
    expect(stylesCss).not.toMatch(/\.shiritori\s*\{[^}]*min-block-size:\s*35rem;/s);
  });
});
