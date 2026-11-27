// @vitest-environment node
import { describe, expect, it } from 'vitest';
import specMarkdown from '../../../spec-v0.3-detail.md?raw';
import { createMatcher, guideKey, isComplete, pressKey } from '../../core/matcher';
import { DEFAULT_THEME_WORDS, PACK_KANA_SET, romajiForWord, THEME_PACKS } from '../wordPacks';

/** §5 では単一 n 表記だが §2.3 では ら行 の前で nn を要求する語。 */
const SPEC_SECTION5_SINGLE_N_BEFORE_R = new Set(['せんろ']);

/** spec-v0.3-detail.md の §5.1〜§5.7 からテーマ名と かな(romaji) の並びを抽出する。 */
function parseSpecSection5(): { name: string; words: { kana: string; romaji: string }[] }[] {
  const lines = specMarkdown.split(/\r?\n/);
  const packs: { name: string; words: { kana: string; romaji: string }[] }[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const headingMatch = /^### 5\.\d+\s+(.+)$/.exec(lines[i].trim());
    if (!headingMatch) continue;
    const name = headingMatch[1].trim();
    let j = i + 1;
    while (j < lines.length && lines[j].trim() === '') j += 1;
    const entryLine = lines[j]?.trim() ?? '';
    const words = entryLine.split('、').map((token) => {
      const m = /^(.+?)\(([a-z-]+)\)$/.exec(token.trim());
      if (!m) {
        throw new Error(`§5 の形式が不正です: ${name} -> ${token}`);
      }
      return { kana: m[1], romaji: m[2] };
    });
    packs.push({ name, words });
  }
  return packs;
}

describe('テーマ別単語パック（仕様 v0.3 §5）', () => {
  it('spec-v0.3-detail.md §5 の全テーマ・全171語のかなとローマ字表記に完全一致する', () => {
    const specPacks = parseSpecSection5();
    expect(specPacks.length).toBe(7);
    expect(
      THEME_PACKS.map((pack) => ({
        name: pack.name,
        words: pack.words.map((word) => ({ kana: word.kana, romaji: word.romaji })),
      })),
    ).toEqual(specPacks);
  });

  it('仕様 §5 の7テーマ・全171語を定義順で収録している', () => {
    expect(THEME_PACKS.map((pack) => [pack.name, pack.words.length])).toEqual([
      ['宇宙', 27],
      ['植物', 25],
      ['地理', 24],
      ['建築', 23],
      ['食べ物', 25],
      ['動物', 28],
      ['のりもの・踏切', 19],
    ]);
    const total = THEME_PACKS.reduce((sum, pack) => sum + pack.words.length, 0);
    expect(total).toBe(171);
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
    expect(romajiForWord('けーき')).toBe('ke-ki');
    expect(romajiForWord('だーくまたー')).toBe('da-kumata-');
    expect(romajiForWord('あさ')).toBe('asa');
  });

  it('DEFAULT_THEME_WORDS は全語がパックに存在し、Issue #21 の追加7語をすべて含む', () => {
    expect(DEFAULT_THEME_WORDS).toHaveLength(10);
    for (const kana of DEFAULT_THEME_WORDS) {
      expect(PACK_KANA_SET.has(kana), `${kana} が PACK_KANA_SET に存在しない`).toBe(true);
    }
    const addedWords = [
      'だーくまたー',
      'ぶらっくほーる',
      'にゅーとりの',
      'おーすとらりあ',
      'さっかー',
      'けーき',
      'ろけっと',
    ];
    for (const word of addedWords) {
      expect(DEFAULT_THEME_WORDS).toContain(word);
    }
  });
});
