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

export interface VoicePlayer {
  /** 固定文キーの音声を再生する。マニフェスト未登録などで再生対象がない場合は false を返す。 */
  playPhrase(key: VoicePhraseKey): boolean;
  /** 単語の読み上げ音声を再生する。マニフェスト未登録などで再生対象がない場合は false を返す。 */
  playWord(word: string): boolean;
  /** 再生中の音声を止め、待機中のキューも空にする。 */
  stop(): void;
}

export interface CreateVoicePlayerOptions {
  readonly manifest?: VoiceManifest;
  readonly baseUrl?: string;
  readonly createAudio?: (url: string) => AudioLike | null;
  /** 再生中に後続リクエストが来たときの最大待機数。溢れたら古い待機分を捨てる。既定 3。 */
  readonly maxQueueSize?: number;
}

const DEFAULT_MAX_QUEUE_SIZE = 3;

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
 * - ファイル読み込み失敗や自動再生制限（play() の reject）でもエラーにせず次へ進める。
 */
export function createVoicePlayer(options: CreateVoicePlayerOptions = {}): VoicePlayer {
  const manifest = options.manifest ?? DEFAULT_VOICE_MANIFEST;
  const baseUrl = options.baseUrl;
  const createAudio = options.createAudio ?? defaultCreateAudio;
  const maxQueueSize = Math.max(0, options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE);

  let currentAudio: AudioLike | null = null;
  let detachCurrent: (() => void) | null = null;
  const queue: string[] = [];

  function cleanupCurrent(): void {
    if (detachCurrent) {
      detachCurrent();
      detachCurrent = null;
    }
    currentAudio = null;
  }

  function advanceQueue(): void {
    while (queue.length > 0 && currentAudio === null) {
      const nextUrl = queue.shift()!;
      startPlayback(nextUrl);
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

  function enqueuePath(path: string | undefined): boolean {
    if (!path || path.trim().length === 0) return false;
    const url = resolveVoiceUrl(path, baseUrl);

    if (currentAudio === null) {
      startPlayback(url);
      return true;
    }

    if (maxQueueSize === 0) {
      return false;
    }
    if (queue.length >= maxQueueSize) {
      queue.shift();
    }
    queue.push(url);
    return true;
  }

  return {
    playPhrase(key: VoicePhraseKey): boolean {
      return enqueuePath(manifest.phrases[key]);
    },

    playWord(word: string): boolean {
      return enqueuePath(manifest.words[word]);
    },

    stop(): void {
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
