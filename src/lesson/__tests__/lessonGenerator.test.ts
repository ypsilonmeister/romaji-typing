import { describe, expect, it } from 'vitest';
import { splitKana } from '../../core/matcher';
import type { KanaProgress } from '../../progress';
import {
  generateLesson,
  MAX_LESSON_PROMPTS,
  MIN_LESSON_PROMPTS,
} from '../lessonGenerator';
import { isWordAllowedInStage, priorKanaBefore, STAGE_A, STAGE_B } from '../stages';

function seededRandom(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('generateLesson（スパイラル方式・仕様 v0.3 §4）', () => {
  it('Stage A: 8〜12問で全導入かなを案内ありで含み、範囲外のかなを含まない', () => {
    const lesson = generateLesson('stage-a', { random: seededRandom(1) });
    expect(lesson.lessonId).toBe('stage-a');
    expect(lesson.prompts.length).toBeGreaterThanOrEqual(MIN_LESSON_PROMPTS);
    expect(lesson.prompts.length).toBeLessThanOrEqual(MAX_LESSON_PROMPTS);

    const guidedKana = new Set<string>();
    for (const prompt of lesson.prompts) {
      expect(isWordAllowedInStage(prompt.text, 'stage-a')).toBe(true);
      expect(prompt.showGuide).toBe(true);
      for (const unit of splitKana(prompt.text)) {
        guidedKana.add(unit);
      }
    }

    for (const kana of STAGE_A.introducedKana) {
      expect(guidedKana.has(kana), `Stage A の新規かな ${kana} が含まれていない`).toBe(true);
    }
  });

  it('Stage B: 8〜12問で新規かなを案内ありで網羅し、既習（Stage A）を案内なしで混ぜる', () => {
    const lesson = generateLesson('stage-b', { random: seededRandom(42) });
    expect(lesson.lessonId).toBe('stage-b');
    expect(lesson.prompts.length).toBeGreaterThanOrEqual(MIN_LESSON_PROMPTS);
    expect(lesson.prompts.length).toBeLessThanOrEqual(MAX_LESSON_PROMPTS);

    // 先頭は必ず新規（案内あり）から始まる
    expect(lesson.prompts[0].kind).toBe('new');
    expect(lesson.prompts[0].showGuide).toBe(true);

    const guidedNewKana = new Set<string>();
    const priorKana = priorKanaBefore('stage-b');
    let reviewCount = 0;

    for (const prompt of lesson.prompts) {
      expect(isWordAllowedInStage(prompt.text, 'stage-b')).toBe(true);

      if (prompt.kind === 'new') {
        expect(prompt.showGuide).toBe(true);
        for (const unit of splitKana(prompt.text)) {
          guidedNewKana.add(unit);
        }
      } else {
        reviewCount++;
        expect(prompt.showGuide).toBe(false);
        // 既習復習は Stage A のかなだけで構成されている
        for (const unit of splitKana(prompt.text)) {
          expect(priorKana.has(unit), `既習復習 ${prompt.text} に未習かな ${unit}`).toBe(true);
        }
      }
    }

    expect(reviewCount).toBeGreaterThanOrEqual(2);
    for (const kana of STAGE_B.introducedKana) {
      expect(guidedNewKana.has(kana), `Stage B の新規かな ${kana} が案内ありで含まれていない`).toBe(
        true,
      );
    }
  });

  it('promptCount は 8〜12 の範囲に収まる', () => {
    expect(generateLesson('stage-a', { promptCount: 3, random: seededRandom(1) }).prompts).toHaveLength(
      MIN_LESSON_PROMPTS,
    );
    expect(generateLesson('stage-a', { promptCount: 20, random: seededRandom(1) }).prompts).toHaveLength(
      MAX_LESSON_PROMPTS,
    );
    expect(generateLesson('stage-b', { promptCount: 9, random: seededRandom(2) }).prompts).toHaveLength(
      9,
    );
  });

  it('複数シードで生成しても常に各ステージの打てるかな範囲を超えない', () => {
    for (let seed = 1; seed <= 30; seed++) {
      for (const stageId of ['stage-a', 'stage-b'] as const) {
        const lesson = generateLesson(stageId, { random: seededRandom(seed) });
        expect(lesson.prompts.length).toBeGreaterThanOrEqual(MIN_LESSON_PROMPTS);
        expect(lesson.prompts.length).toBeLessThanOrEqual(MAX_LESSON_PROMPTS);
        for (const prompt of lesson.prompts) {
          expect(
            isWordAllowedInStage(prompt.text, stageId),
            `seed=${seed}, stage=${stageId}, word=${prompt.text}`,
          ).toBe(true);
        }
      }
    }
  });

  it('詰まりが続く既習かなは、定着済みの既習かなより復習に選ばれやすい', () => {
    const now = new Date();
    const progress: KanaProgress[] = [
      // 「は」「だ」が詰まり状態（「はだ」の重みが高くなる）
      { kana: 'は', correctCount: 2, hintCount: 2, lastPracticedAt: now, unguidedStreak: 0, stuckStreak: 3 },
      { kana: 'だ', correctCount: 2, hintCount: 2, lastPracticedAt: now, unguidedStreak: 0, stuckStreak: 3 },
      // 「あ」「か」「さ」「が」は定着済み
      { kana: 'あ', correctCount: 5, hintCount: 0, lastPracticedAt: now, unguidedStreak: 4, stuckStreak: 0 },
      { kana: 'か', correctCount: 5, hintCount: 0, lastPracticedAt: now, unguidedStreak: 4, stuckStreak: 0 },
      { kana: 'さ', correctCount: 5, hintCount: 0, lastPracticedAt: now, unguidedStreak: 4, stuckStreak: 0 },
      { kana: 'が', correctCount: 5, hintCount: 0, lastPracticedAt: now, unguidedStreak: 4, stuckStreak: 0 },
    ];

    let hadaCount = 0;
    let akaCount = 0;
    for (let seed = 1; seed <= 100; seed++) {
      const lesson = generateLesson('stage-b', {
        kanaProgress: progress,
        random: seededRandom(seed),
      });
      for (const prompt of lesson.prompts) {
        if (prompt.kind !== 'review') continue;
        if (prompt.text === 'はだ') hadaCount++;
        if (prompt.text === 'あか') akaCount++;
      }
    }

    expect(hadaCount).toBeGreaterThan(akaCount);
  });
});
