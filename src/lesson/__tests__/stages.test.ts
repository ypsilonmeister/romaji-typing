import { describe, expect, it } from 'vitest';
import { recommendedSpelling } from '../../core/romajiTable';
import {
  allowedKanaUpTo,
  isWordAllowedInStage,
  LESSON_IDS,
  nextRecommendedStage,
  priorKanaBefore,
  STAGE_A,
  STAGE_B,
  STAGES,
  unlockedKeysUpTo,
} from '../stages';

describe('ステージ定義データ（仕様 v0.3 §4.2）', () => {
  it('Stage A はホーム段のキー・導入かな・例単語を持つ', () => {
    expect(STAGE_A.newKeys).toEqual(['a', 's', 'd', 'f', 'g', 'h', 'j', 'k', 'l']);
    expect(STAGE_A.introducedKana).toEqual(['あ', 'か', 'さ', 'だ', 'が', 'は']);
    expect(STAGE_A.exampleWords).toEqual(['あさ', 'かさ', 'はは', 'さか', 'あか']);
  });

  it('Stage B は中指上段（E I）のキー・導入かな・例単語を持つ', () => {
    expect(STAGE_B.newKeys).toEqual(['e', 'i']);
    expect(STAGE_B.introducedKana).toEqual([
      'い',
      'え',
      'き',
      'し',
      'ひ',
      'ぎ',
      'じ',
      'で',
      'け',
      'せ',
      'へ',
      'げ',
    ]);
    expect(STAGE_B.exampleWords).toEqual([
      'いえ',
      'かい',
      'しか',
      'せかい',
      'はし',
      'えき',
      'けしき',
      'かげ',
    ]);
  });

  it.each(STAGES)('$id の導入かなはすべて解放済みキーだけで推奨綴りを打てる', (stage) => {
    const keys = unlockedKeysUpTo(stage.id);
    for (const kana of stage.introducedKana) {
      const spelling = recommendedSpelling(kana);
      expect(spelling, `${kana} の推奨綴りが存在する`).toBeDefined();
      for (const ch of spelling!) {
        expect(keys.has(ch), `${stage.id}: ${kana}(${spelling}) のキー '${ch}' が未解放`).toBe(
          true,
        );
      }
    }
  });

  it.each(STAGES)('$id の例単語・練習単語はすべてそのステージの打てるかなの範囲内', (stage) => {
    for (const word of [...stage.exampleWords, ...stage.practiceWords]) {
      expect(
        isWordAllowedInStage(word, stage.id),
        `${stage.id} に許可されない語が含まれている: ${word}`,
      ).toBe(true);
    }
  });

  it('範囲外のかなを含む語は isWordAllowedInStage で弾かれる', () => {
    // Stage B のかなは Stage A では打てない
    expect(isWordAllowedInStage('いえ', 'stage-a')).toBe(false);
    expect(isWordAllowedInStage('はし', 'stage-a')).toBe(false);
    // Stage C 以降のかなは Stage B では打てない
    expect(isWordAllowedInStage('つき', 'stage-b')).toBe(false);
    expect(isWordAllowedInStage('ねこ', 'stage-b')).toBe(false);
    // 空文字は不可
    expect(isWordAllowedInStage('', 'stage-a')).toBe(false);
  });

  it('累積かな集合と既習かな集合が整合している', () => {
    expect(priorKanaBefore('stage-a').size).toBe(0);
    expect([...priorKanaBefore('stage-b')]).toEqual(STAGE_A.introducedKana);
    expect(allowedKanaUpTo('stage-b').size).toBe(
      STAGE_A.introducedKana.length + STAGE_B.introducedKana.length,
    );
  });

  it('LESSON_IDS と nextRecommendedStage がクリア状態に応じて次ステージを返す', () => {
    expect(LESSON_IDS).toEqual(['stage-a', 'stage-b']);
    expect(nextRecommendedStage(new Set())).toBe('stage-a');
    expect(nextRecommendedStage(new Set(['stage-a']))).toBe('stage-b');
    expect(nextRecommendedStage(new Set(['stage-a', 'stage-b']))).toBe('stage-b');
  });
});
