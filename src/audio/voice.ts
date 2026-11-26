// 事前生成した音声ファイルの再生基盤（Issue #13）。
// speechSynthesis は使わず、HTMLAudioElement で再生する。
// 既存の打鍵音・完成音（Web Audio）とは別レイヤーとして扱い、読み上げ同士の同時再生を抑制する。

import {
  DEFAULT_VOICE_MANIFEST,
  resolveVoiceUrl,
  type VoiceManifest,
  type VoicePhraseKey,
} from './voiceManifest';

export interface AudioLike {
  currentTime: number;
  play(): Promise<void> | void;
  pause(): void;
  addEventListener(type: 'ended' | 'error', listener: () => void): void;
  removeEventListener(type: 'ended' | 'error', listener: () => void): void;
}

export interface VoicePlayOptions {
  /** 要求時点から再生開始までの最小待機時間（ミリ秒）。先行音声の終了後も残り時間があれば待機し、完成音との重なりを避ける。 */
  readonly delayMs?: number;
}

export interface VoicePlayer {
  /** 固定文キーの音声を再生する。マニフェスト未登録などで再生対象がない場合は false を返す。 */
  playPhrase(key: VoicePhraseKey, options?: VoicePlayOptions): boolean;
  /** 単語の読み上げ音声を再生する。マニフェスト未登録などで再生対象がない場合は false を返す。 */
  playWord(word: string, options?: VoicePlayOptions): boolean;
  /** 現在音声が再生中かどうかを返す。効果音の音量調整などに使う。 */
  isPlaying(): boolean;
  /** 再生中の音声を止め、待機中のキューも空にする。 */
  stop(): void;
}

export interface CreateVoicePlayerOptions {
  readonly manifest?: VoiceManifest;
  readonly baseUrl?: string;
  readonly createAudio?: (url: string) => AudioLike | null;
  /**
   * 再生中に後続リクエストが来たときの基準待機上限（既定 3、0 でキュー無効）。
   * 満杯時は古い単語読み上げから破棄する。
   * 例外として、開始・完了・終了の声かけ（milestone）と最新1件の自己申告（self-report）の固定文は
   * 破棄せず保護するため、破棄できる単語がキューにない状態で固定文が並んだ場合は
   * maxQueueSize（>= 1）を超えて待機することがある。
   */
  readonly maxQueueSize?: number;
}

type QueueKind = 'milestone' | 'self-report' | 'word';

interface QueueEntry {
  readonly url: string;
  readonly kind: QueueKind;
  readonly notBefore: number;
}

const DEFAULT_MAX_QUEUE_SIZE = 3;

function classifyPhrase(key: VoicePhraseKey): QueueKind {
  switch (key) {
    case 'lesson-start':
    case 'lesson-clear':
    case 'session-end':
      return 'milestone';
    case 'self-report-good':
    case 'self-report-ok':
    case 'self-report-tired':
    case 'self-report-skip':
      return 'self-report';
  }
}

function defaultCreateAudio(url: string): AudioLike | null {
  if (typeof Audio !== 'function') return null;
  try {
    return new Audio(url);
  } catch {
    return null;
  }
}

/**
 * マニフェストを引いて音声を再生するプレイヤーを作る。
 *
 * - 未登録キーや空パスは無音で素通りし、例外を投げない。
 * - 再生中に次の読み上げが来た場合は重ねず、再生中の終端（ended / error）まで待ってから順に再生する。
 * - 待機キュー満杯時は古い単語読み上げから破棄する。開始・完了・終了の声かけは破棄せず保護し、
 *   待機中の自己申告は最新1件で置き換える（破棄できる単語がない場合は固定文保護を優先し、
 *   maxQueueSize >= 1 の範囲で上限を超えて待機することがある）。
 * - ファイル読み込み失敗や自動再生制限（play() の reject）でもエラーにせず次へ進める。
 */
export function createVoicePlayer(options: CreateVoicePlayerOptions = {}): VoicePlayer {
  const manifest = options.manifest ?? DEFAULT_VOICE_MANIFEST;
  const baseUrl = options.baseUrl;
  const createAudio = options.createAudio ?? defaultCreateAudio;
  const maxQueueSize = Math.max(0, options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE);

  let currentAudio: AudioLike | null = null;
  let detachCurrent: (() => void) | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  const queue: QueueEntry[] = [];

  function isBusy(): boolean {
    return currentAudio !== null || pendingTimer !== null;
  }

  function cleanupCurrent(): void {
    if (detachCurrent) {
      detachCurrent();
      detachCurrent = null;
    }
    currentAudio = null;
  }

  function scheduleOrStart(url: string, delayMs: number): void {
    if (delayMs > 0) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        startPlayback(url);
      }, delayMs);
    } else {
      startPlayback(url);
    }
  }

  function advanceQueue(): void {
    while (queue.length > 0 && !isBusy()) {
      const next = queue.shift()!;
      const remainingMs = next.notBefore > 0 ? Math.max(0, next.notBefore - Date.now()) : 0;
      scheduleOrStart(next.url, remainingMs);
    }
  }

  function startPlayback(url: string): void {
    let audio: AudioLike | null;
    try {
      audio = createAudio(url);
    } catch {
      audio = null;
    }
    if (!audio) {
      advanceQueue();
      return;
    }

    let settled = false;
    const onDone = () => {
      if (settled) return;
      settled = true;
      if (currentAudio === audio) {
        cleanupCurrent();
        advanceQueue();
      }
    };

    audio.addEventListener('ended', onDone);
    audio.addEventListener('error', onDone);
    currentAudio = audio;
    detachCurrent = () => {
      audio.removeEventListener('ended', onDone);
      audio.removeEventListener('error', onDone);
    };

    try {
      const result = audio.play();
      if (result && typeof result.then === 'function') {
        void result.catch(() => {
          onDone();
        });
      }
    } catch {
      onDone();
    }
  }

  function evictOldestWord(): boolean {
    const wordIdx = queue.findIndex((entry) => entry.kind === 'word');
    if (wordIdx === -1) return false;
    queue.splice(wordIdx, 1);
    return true;
  }

  function enqueuePath(
    path: string | undefined,
    kind: QueueKind,
    playOptions?: VoicePlayOptions,
  ): boolean {
    if (!path || path.trim().length === 0) return false;
    const url = resolveVoiceUrl(path, baseUrl);
    const delayMs = Math.max(0, playOptions?.delayMs ?? 0);

    if (!isBusy()) {
      scheduleOrStart(url, delayMs);
      return true;
    }

    if (maxQueueSize === 0) {
      return false;
    }

    const notBefore = delayMs > 0 ? Date.now() + delayMs : 0;

    if (kind === 'self-report') {
      // 待機中の自己申告がすでにあれば最新の選択で置き換え、完了・終了の声かけを押し出さない。
      const existingSelfReportIdx = queue.findIndex((entry) => entry.kind === 'self-report');
      if (existingSelfReportIdx !== -1) {
        queue.splice(existingSelfReportIdx, 1);
      } else if (queue.length >= maxQueueSize) {
        evictOldestWord();
      }
      queue.push({ url, kind, notBefore });
      return true;
    }

    if (kind === 'milestone') {
      // 開始・完了・終了の声かけは満杯時でも破棄しない（単語の待機分があればそれを先に退避する）。
      if (queue.length >= maxQueueSize) {
        evictOldestWord();
      }
      queue.push({ url, kind, notBefore });
      return true;
    }

    // 単語読み上げ: キューが満杯なら古い単語のみを破棄し、固定文は押し出さない。
    if (queue.length >= maxQueueSize) {
      if (!evictOldestWord()) {
        return false;
      }
    }
    queue.push({ url, kind, notBefore });
    return true;
  }

  return {
    playPhrase(key: VoicePhraseKey, playOptions?: VoicePlayOptions): boolean {
      return enqueuePath(manifest.phrases[key], classifyPhrase(key), playOptions);
    },

    playWord(word: string, playOptions?: VoicePlayOptions): boolean {
      return enqueuePath(manifest.words[word], 'word', playOptions);
    },

    isPlaying(): boolean {
      return currentAudio !== null;
    },

    stop(): void {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      queue.length = 0;
      const audio = currentAudio;
      cleanupCurrent();
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // 停止に失敗しても進行は止めない
        }
      }
    },
  };
}

/** アプリ全体で共有する音声プレイヤー（画面をまたいでも読み上げが重ならないようにする）。 */
export const voicePlayer: VoicePlayer = createVoicePlayer();
