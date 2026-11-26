// Web Audio API による打鍵音・完成音・間違い音（音源ファイルなし、仕様 v0.2 §6）。
// AudioContext が使えない環境（テストや非対応ブラウザ）では静かに何もしない。

type AudioContextCtor = typeof AudioContext;

let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const ctor: AudioContextCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor }).webkitAudioContext;
  if (!ctor) return null;

  try {
    if (!sharedContext || sharedContext.state === 'closed') {
      sharedContext = new ctor();
    }
    if (sharedContext.state === 'suspended') {
      void sharedContext.resume();
    }
    return sharedContext;
  } catch {
    return null;
  }
}

interface ToneStep {
  readonly frequency: number;
  readonly endFrequency?: number;
  readonly startOffsetSec: number;
  readonly durationSec: number;
  readonly type: OscillatorType;
  readonly gain: number;
}

function playSequence(steps: readonly ToneStep[], volume: number): void {
  if (volume <= 0) return;
  const ctx = getAudioContext();
  if (!ctx) return;

  const now = ctx.currentTime;
  const master = Math.max(0, Math.min(1, volume));

  for (const step of steps) {
    const osc = ctx.createOscillator();
    const amp = ctx.createGain();
    const start = now + step.startOffsetSec;
    const end = start + step.durationSec;

    osc.type = step.type;
    osc.frequency.setValueAtTime(step.frequency, start);
    if (step.endFrequency !== undefined) {
      osc.frequency.exponentialRampToValueAtTime(step.endFrequency, end);
    }

    const peak = Math.max(0.0001, step.gain * master);
    amp.gain.setValueAtTime(0.0001, start);
    amp.gain.exponentialRampToValueAtTime(peak, start + 0.008);
    amp.gain.exponentialRampToValueAtTime(0.0001, end);

    osc.connect(amp);
    amp.connect(ctx.destination);

    osc.start(start);
    osc.stop(end + 0.01);
  }
}

/** 通常の打鍵音（軽やかで短いクリック音）。 */
export function playKeySound(volume: number): void {
  playSequence(
    [{ frequency: 520, endFrequency: 440, startOffsetSec: 0, durationSec: 0.055, type: 'triangle', gain: 0.22 }],
    volume,
  );
}

/** かな1文字が完成したときの短い上昇音。 */
export function playKanaCompleteSound(volume: number): void {
  playSequence(
    [
      { frequency: 523.25, startOffsetSec: 0, durationSec: 0.075, type: 'sine', gain: 0.24 },
      { frequency: 659.25, startOffsetSec: 0.055, durationSec: 0.11, type: 'sine', gain: 0.26 },
    ],
    volume,
  );
}

/** お題（単語）完成音（playWordCompleteSound）の再生時間（ミリ秒）。読み上げとの重なり回避に使う。 */
export const WORD_COMPLETE_SOUND_DURATION_MS = 420;

/** お題（単語）が完成したときの小さなフレーズ。 */
export function playWordCompleteSound(volume: number): void {
  playSequence(
    [
      { frequency: 523.25, startOffsetSec: 0, durationSec: 0.09, type: 'sine', gain: 0.25 },
      { frequency: 659.25, startOffsetSec: 0.07, durationSec: 0.09, type: 'sine', gain: 0.25 },
      { frequency: 783.99, startOffsetSec: 0.14, durationSec: 0.1, type: 'sine', gain: 0.26 },
      { frequency: 1046.5, startOffsetSec: 0.22, durationSec: 0.2, type: 'sine', gain: 0.28 },
    ],
    volume,
  );
}

/** 間違いキーのときのやわらかく低いお知らせ音。 */
export function playWrongKeySound(volume: number): void {
  playSequence(
    [{ frequency: 195, endFrequency: 150, startOffsetSec: 0, durationSec: 0.1, type: 'triangle', gain: 0.2 }],
    volume,
  );
}
