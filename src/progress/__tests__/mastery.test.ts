// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  applyKanaAttempt,
  frequencyWeight,
  kanaStatus,
  MASTERY_STREAK,
  STRUGGLING_STREAK,
  type KanaAttempt,
} from '../mastery';
import type { KanaProgress } from '../types';

const clean: KanaAttempt = { guided: false, hintUsed: false, stalled: false };
const guided: KanaAttempt = { ...clean, guided: true };
const hinted: KanaAttempt = { ...clean, hintUsed: true };
const stalled: KanaAttempt = { ...clean, stalled: true };

const AT = new Date('2026-11-26T10:00:00Z');

/** 記録のない状態から、順に結果を反映する。 */
function after(...attempts: KanaAttempt[]): KanaProgress | undefined {
  return attempts.reduce<KanaProgress | undefined>(
    (progress, attempt) => applyKanaAttempt(progress, 'か', attempt, AT),
    undefined,
  );
}

describe('調整値', () => {
  it('定着は3回、詰まりは2回の連続', () => {
    expect(MASTERY_STREAK).toBe(3);
    expect(STRUGGLING_STREAK).toBe(2);
  });
});

describe('定着の判定', () => {
  it('記録のないかなは定着していない', () => {
    expect(kanaStatus(undefined)).toBe('learning');
  });

  it('案内なしの正解が2回では定着しない', () => {
    expect(kanaStatus(after(clean, clean))).toBe('learning');
  });

  it('案内なしで3回連続正解すると定着する', () => {
    expect(kanaStatus(after(clean, clean, clean))).toBe('mastered');
  });

  it('4回目以降も定着のまま', () => {
    expect(kanaStatus(after(clean, clean, clean, clean))).toBe('mastered');
  });

  it('案内ありの正解は、何回打っても定着にしない', () => {
    expect(kanaStatus(after(guided, guided, guided, guided))).toBe('learning');
  });

  it('案内ありの正解は、定着の回数に数えない', () => {
    expect(kanaStatus(after(clean, clean, guided))).toBe('learning');
  });

  it('案内ありの正解で連続が切れ、そこから3回必要になる', () => {
    expect(kanaStatus(after(clean, clean, guided, clean))).toBe('learning');
    expect(kanaStatus(after(clean, clean, guided, clean, clean))).toBe('learning');
    expect(kanaStatus(after(clean, clean, guided, clean, clean, clean))).toBe('mastered');
  });

  it('定着した後でも、案内ありの正解で定着から外れる', () => {
    expect(kanaStatus(after(clean, clean, clean, guided))).toBe('learning');
  });

  it.each([
    ['ヒント使用', hinted],
    ['5秒停止', stalled],
    ['案内ありでの詰まり', { ...stalled, guided: true }],
  ])('%s で連続が切れ、そこから3回必要になる', (_name, stuck) => {
    expect(kanaStatus(after(clean, clean, stuck, clean))).toBe('learning');
    expect(kanaStatus(after(clean, clean, stuck, clean, clean))).toBe('learning');
    expect(kanaStatus(after(clean, clean, stuck, clean, clean, clean))).toBe('mastered');
  });

  it('定着した後でも、詰まると定着から外れる', () => {
    expect(kanaStatus(after(clean, clean, clean, hinted))).toBe('learning');
  });
});

describe('詰まりの判定', () => {
  it('詰まりが1回では頻度を上げない', () => {
    expect(kanaStatus(after(hinted))).toBe('learning');
  });

  it.each([
    ['ヒント使用', hinted, hinted],
    ['5秒停止', stalled, stalled],
    ['ヒント使用と5秒停止', hinted, stalled],
  ])('%s が2回続くと頻度を上げる', (_name, first, second) => {
    expect(kanaStatus(after(first, second))).toBe('struggling');
  });

  it('定着していたかなも、詰まりが2回続くと頻度を上げる', () => {
    expect(kanaStatus(after(clean, clean, clean, stalled, stalled))).toBe('struggling');
  });

  it.each([
    ['案内なし', clean],
    ['案内あり', guided],
  ])('%s で詰まらず打てると、詰まりの連続が切れる', (_name, success) => {
    expect(kanaStatus(after(hinted, success, hinted))).toBe('learning');
    expect(kanaStatus(after(hinted, hinted, success))).toBe('learning');
  });
});

describe('出題の重み', () => {
  it('定着したかなは低く、詰まりが続くかなは高くする', () => {
    const learning = frequencyWeight(undefined);
    expect(frequencyWeight(after(clean, clean, clean))).toBeLessThan(learning);
    expect(frequencyWeight(after(hinted, hinted))).toBeGreaterThan(learning);
  });

  it('定着したかなも、出題対象からは外さない', () => {
    expect(frequencyWeight(after(clean, clean, clean))).toBeGreaterThan(0);
  });
});

describe('記録の更新', () => {
  it('打ち切った回数と詰まった回数を数え、最後の日時を持つ', () => {
    const later = new Date('2026-11-27T10:00:00Z');
    const progress = applyKanaAttempt(
      after(guided, hinted, { guided: false, hintUsed: true, stalled: true }),
      'か',
      clean,
      later,
    );
    expect(progress).toEqual({
      kana: 'か',
      correctCount: 4,
      hintCount: 2,
      lastPracticedAt: later,
      unguidedStreak: 1,
      stuckStreak: 0,
    });
  });

  it('前の記録を書き換えない', () => {
    const previous = after(clean)!;
    const copy = { ...previous };
    applyKanaAttempt(previous, 'か', hinted, new Date());
    expect(previous).toEqual(copy);
  });
});
