// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { createMatcher, guideKey, isComplete, pressKey } from '../../core/matcher';
import { romajiForWord, THEME_PACKS } from '../wordPacks';

/** §5 では単一 n 表記だが §2.3 では ら行 の前で nn を要求する語。 */
const SPEC_SECTION5_SINGLE_N_BEFORE_R = new Set(['せんろ']);

describe('テーマ別単語パック（仕様 v0.3 §5）', () => {
  it('仕様 §5 の7テーマ・全164語を定義順で収録している', () => {
    expect(THEME_PACKS.map((pack) => [pack.name, pack.words.length])).toEqual([
      ['宇宙', 24],
      ['植物', 25],
      ['地理', 23],
      ['建築', 22],
      ['食べ物', 24],
      ['動物', 28],
      ['のりもの・踏切', 18],
    ]);
    const total = THEME_PACKS.reduce((sum, pack) => sum + pack.words.length, 0);
    expect(total).toBe(164);
  });

  it('各テーマ内で同じかなが重複しない', () => {
    for (const pack of THEME_PACKS) {
      const seen = new Set<string>();
      for (const word of pack.words) {
        expect(seen.has(word.kana), `${pack.name} に ${word.kana} が重複`).toBe(false);
        seen.add(word.kana);
      }
    }
  });

  it('全単語のかなが照合エンジンで打ち切れ、§5 のローマ字表記とも整合している', () => {
    for (const pack of THEME_PACKS) {
      for (const word of pack.words) {
        // 1. かなが照合エンジンの案内に沿って必ず打ち切れること
        let guided = createMatcher(word.kana);
        let guard = 0;
        while (!isComplete(guided) && guard < 100) {
          const next = guideKey(guided);
          expect(next, `${pack.name}/${word.kana} の案内キーが途切れた`).toBeDefined();
          const result = pressKey(guided, next!);
          expect(result.accepted).toBe(true);
          guided = result.state;
          guard += 1;
        }
        expect(isComplete(guided), `${pack.name}/${word.kana} が案内どおりに完成しなかった`).toBe(
          true,
        );

        // 2. §5 のローマ字表記がそのまま受理されること（§5 vs §2.3 の既知差異を除く）
        if (SPEC_SECTION5_SINGLE_N_BEFORE_R.has(word.kana)) continue;
        let state = createMatcher(word.kana);
        for (const ch of word.romaji) {
          const result = pressKey(state, ch);
          expect(
            result.accepted,
            `${pack.name}/${word.kana} (${word.romaji}) の '${ch}' が受理されなかった`,
          ).toBe(true);
          state = result.state;
        }
        expect(
          isComplete(state),
          `${pack.name}/${word.kana} (${word.romaji}) が最後まで完成しなかった`,
        ).toBe(true);
      }
    }
  });

  it('romajiForWord は §5 の語にはパックの表記を、パック外の語には推奨綴りを返す', () => {
    expect(romajiForWord('きんせい')).toBe('kinsei');
    expect(romajiForWord('しんかんせん')).toBe('shinkansen');
    expect(romajiForWord('あさ')).toBe('asa');
  });
});
