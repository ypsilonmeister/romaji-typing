// 事前生成した音声ファイルの再生基盤（Issue #13）および
// 録音がない単語の speechSynthesis フォールバック（Issue #23）。
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

export interface SpeechSynthesisVoiceLike {
  readonly lang: string;
  readonly name?: string;
  readonly default?: boolean;
  readonly localService?: boolean;
}

export interface SpeechUtteranceLike {
  text: string;
  lang: string;
  rate: number;
  voice: SpeechSynthesisVoiceLike | null;
  onend: ((event?: unknown) => void) | null;
  onerror: ((event?: unknown) => void) | null;
  addEventListener?: (type: 'end' | 'error', listener: () => void) => void;
  removeEventListener?: (type: 'end' | 'error', listener: () => void) => void;
}

export interface SpeechSynthesisLike {
  speak(utterance: SpeechUtteranceLike): void;
  cancel(): void;
  getVoices(): readonly SpeechSynthesisVoiceLike[];
  addEventListener?: (type: 'voiceschanged', listener: () => void) => void;
  removeEventListener?: (type: 'voiceschanged', listener: () => void) => void;
}

export interface VoicePlayOptions {
  /** 要求時点から再生開始までの最小待機時間（ミリ秒）。先行音声の終了後も残り時間があれば待機し、完成音との重なりを避ける。 */
  readonly delayMs?: number;
  /** 録音が無い場合にブラウザ読み上げ（speechSynthesis）へフォールバックするか（既定 true）。 */
  readonly allowTtsFallback?: boolean;
}

export interface VoicePlayer {
  /** 固定文キーの音声を再生する。マニフェスト未登録などで再生対象がない場合は false を返す。 */
  playPhrase(key: VoicePhraseKey, options?: VoicePlayOptions): boolean;
  /** 単語の読み上げ音声を再生する。録音があれば録音を優先し、無い場合は speechSynthesis で代用する。 */
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
  /** 録音がない単語の読み上げに使う SpeechSynthesis 実装。省略時は globalThis.speechSynthesis を使う。 */
  readonly speechSynthesis?: SpeechSynthesisLike | null;
  /** SpeechSynthesisUtterance の生成関数。省略時は globalThis.SpeechSynthesisUtterance を使う。 */
  readonly createUtterance?: (text: string) => SpeechUtteranceLike | null;
  /** ブラウザ読み上げの再生速度（既定 0.9: 子ども向けに少しゆっくり）。 */
  readonly ttsRate?: number;
  /** 初回 getVoices() が空だったときに voiceschanged を待つ上限時間（ミリ秒、既定 500）。 */
  readonly voiceLoadTimeoutMs?: number;
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

type QueuePayload =
  | { readonly type: 'audio'; readonly url: string }
  | { readonly type: 'speech'; readonly text: string };

interface QueueEntry {
  readonly payload: QueuePayload;
  readonly kind: QueueKind;
  readonly notBefore: number | null;
}

const DEFAULT_MAX_QUEUE_SIZE = 3;
export const DEFAULT_TTS_LANG = 'ja-JP';
export const DEFAULT_TTS_RATE = 0.9;
export const DEFAULT_VOICE_LOAD_TIMEOUT_MS = 500;

function nowMs(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

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

function resolveGlobalSpeechSynthesis(): SpeechSynthesisLike | null {
  if (typeof globalThis === 'undefined') return null;
  try {
    const candidate = (globalThis as { speechSynthesis?: unknown }).speechSynthesis;
    if (
      candidate &&
      typeof candidate === 'object' &&
      typeof (candidate as SpeechSynthesisLike).speak === 'function' &&
      typeof (candidate as SpeechSynthesisLike).cancel === 'function' &&
      typeof (candidate as SpeechSynthesisLike).getVoices === 'function'
    ) {
      return candidate as SpeechSynthesisLike;
    }
    return null;
  } catch {
    return null;
  }
}

function defaultCreateUtterance(text: string): SpeechUtteranceLike | null {
  if (typeof globalThis === 'undefined') return null;
  const ctor = (globalThis as { SpeechSynthesisUtterance?: new (text: string) => unknown })
    .SpeechSynthesisUtterance;
  if (typeof ctor !== 'function') return null;
  try {
    return new ctor(text) as SpeechUtteranceLike;
  } catch {
    return null;
  }
}

/**
 * 音声一覧から日本語（ja-JP 優先、なければ ja-*）の声を選ぶ。
 */
export function selectJapaneseVoice(
  voices: readonly SpeechSynthesisVoiceLike[],
): SpeechSynthesisVoiceLike | null {
  let firstJaJp: SpeechSynthesisVoiceLike | null = null;
  let defaultJa: SpeechSynthesisVoiceLike | null = null;
  let firstJa: SpeechSynthesisVoiceLike | null = null;

  for (const voice of voices) {
    const lang = typeof voice.lang === 'string' ? voice.lang.trim().toLowerCase().replace(/_/g, '-') : '';
    if (lang === 'ja-jp') {
      if (voice.default) return voice;
      if (!firstJaJp) firstJaJp = voice;
    } else if (lang === 'ja' || lang.startsWith('ja-')) {
      if (voice.default && !defaultJa) defaultJa = voice;
      if (!firstJa) firstJa = voice;
    }
  }

  return firstJaJp ?? defaultJa ?? firstJa;
}

/**
 * マニフェストを引いて音声を再生するプレイヤーを作る。
 *
 * - 録音音声がある言葉・固定文は HTMLAudioElement で再生する。
 * - 録音音声がない単語は、speechSynthesis が利用可能であれば ja-JP で代用再生する。
 *   利用不可な環境や未登録の固定文は無音で素通りし、例外を投げない。
 * - 再生中に次の読み上げが来た場合は録音・ブラウザ読み上げを問わず重ねず、
 *   再生中の終端まで待ってから同じキュー経路で順に再生する。
 * - 待機キュー満杯時は古い単語読み上げから破棄する。開始・完了・終了の声かけは破棄せず保護し、
 *   待機中の自己申告は最新1件で置き換える（破棄できる単語がない場合は固定文保護を優先し、
 *   maxQueueSize >= 1 の範囲で上限を超えて待機することがある）。
 * - ファイル読み込み失敗や自動再生制限（play() の reject）、speak() の失敗でもエラーにせず次へ進める。
 */
export function createVoicePlayer(options: CreateVoicePlayerOptions = {}): VoicePlayer {
  const manifest = options.manifest ?? DEFAULT_VOICE_MANIFEST;
  const baseUrl = options.baseUrl;
  const createAudio = options.createAudio ?? defaultCreateAudio;
  const ttsRate = options.ttsRate ?? DEFAULT_TTS_RATE;
  const voiceLoadTimeoutMs = Math.max(
    0,
    options.voiceLoadTimeoutMs ?? DEFAULT_VOICE_LOAD_TIMEOUT_MS,
  );
  const maxQueueSize = Math.max(0, options.maxQueueSize ?? DEFAULT_MAX_QUEUE_SIZE);

  let currentAudio: AudioLike | null = null;
  let currentSpeech: SpeechUtteranceLike | null = null;
  let currentSpeechSynth: SpeechSynthesisLike | null = null;
  let detachCurrent: (() => void) | null = null;
  let pendingTimer: ReturnType<typeof setTimeout> | null = null;
  let cancelPendingVoiceWait: (() => void) | null = null;
  let attachedSynth: SpeechSynthesisLike | null = null;
  let cachedJaVoice: SpeechSynthesisVoiceLike | null = null;
  const queue: QueueEntry[] = [];

  function getSpeechSynthesis(): SpeechSynthesisLike | null {
    if (options.speechSynthesis !== undefined) {
      return options.speechSynthesis;
    }
    return resolveGlobalSpeechSynthesis();
  }

  function canCreateUtterance(): boolean {
    if (options.createUtterance !== undefined) return true;
    return (
      typeof globalThis !== 'undefined' &&
      typeof (globalThis as { SpeechSynthesisUtterance?: unknown }).SpeechSynthesisUtterance ===
        'function'
    );
  }

  function buildUtterance(text: string): SpeechUtteranceLike | null {
    if (options.createUtterance) {
      try {
        return options.createUtterance(text);
      } catch {
        return null;
      }
    }
    return defaultCreateUtterance(text);
  }

  function readVoices(synth: SpeechSynthesisLike): readonly SpeechSynthesisVoiceLike[] | null {
    try {
      const voices = synth.getVoices();
      return Array.isArray(voices) ? voices : null;
    } catch {
      return null;
    }
  }

  function refreshVoices(synth: SpeechSynthesisLike): SpeechSynthesisVoiceLike | null {
    const voices = readVoices(synth);
    if (voices && voices.length > 0) {
      cachedJaVoice = selectJapaneseVoice(voices);
    }
    return cachedJaVoice;
  }

  function ensureSynthInitialized(synth: SpeechSynthesisLike): void {
    if (attachedSynth === synth) return;
    attachedSynth = synth;
    cachedJaVoice = null;
    refreshVoices(synth);
    if (typeof synth.addEventListener === 'function') {
      try {
        synth.addEventListener('voiceschanged', () => {
          if (attachedSynth === synth) {
            refreshVoices(synth);
          }
        });
      } catch {
        // voiceschanged 非対応環境では無視
      }
    }
  }

  // ブラウザの getVoices() は初回呼び出しを契機に非同期ロードされることがあるため、
  // プレイヤー生成時点で speechSynthesis があれば先に初期化しておく。
  const initialSynth = getSpeechSynthesis();
  if (initialSynth) {
    ensureSynthInitialized(initialSynth);
  }

  function isBusy(): boolean {
    return (
      currentAudio !== null ||
      currentSpeech !== null ||
      pendingTimer !== null ||
      cancelPendingVoiceWait !== null
    );
  }

  function cleanupCurrent(): void {
    if (detachCurrent) {
      detachCurrent();
      detachCurrent = null;
    }
    currentAudio = null;
    currentSpeech = null;
    currentSpeechSynth = null;
  }

  function scheduleOrStart(payload: QueuePayload, delayMs: number): void {
    if (delayMs > 0) {
      pendingTimer = setTimeout(() => {
        pendingTimer = null;
        startPlayback(payload);
      }, delayMs);
    } else {
      startPlayback(payload);
    }
  }

  function advanceQueue(): void {
    while (queue.length > 0 && !isBusy()) {
      const next = queue.shift()!;
      const remainingMs = next.notBefore !== null ? Math.max(0, next.notBefore - nowMs()) : 0;
      scheduleOrStart(next.payload, remainingMs);
    }
  }

  function startAudioPlayback(url: string): void {
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

  function speakWithCurrentVoices(synth: SpeechSynthesisLike, text: string): void {
    const voice = refreshVoices(synth);
    const utterance = buildUtterance(text);
    if (!utterance) {
      advanceQueue();
      return;
    }

    utterance.lang = DEFAULT_TTS_LANG;
    utterance.rate = ttsRate;
    if (voice) {
      utterance.voice = voice;
    }

    let settled = false;
    const onDone = () => {
      if (settled) return;
      settled = true;
      if (currentSpeech === utterance) {
        cleanupCurrent();
        advanceQueue();
      }
    };

    utterance.onend = onDone;
    utterance.onerror = onDone;
    if (typeof utterance.addEventListener === 'function') {
      utterance.addEventListener('end', onDone);
      utterance.addEventListener('error', onDone);
    }

    currentSpeech = utterance;
    currentSpeechSynth = synth;
    detachCurrent = () => {
      utterance.onend = null;
      utterance.onerror = null;
      if (typeof utterance.removeEventListener === 'function') {
        utterance.removeEventListener('end', onDone);
        utterance.removeEventListener('error', onDone);
      }
    };

    try {
      synth.speak(utterance);
    } catch {
      onDone();
    }
  }

  function startSpeechPlayback(text: string): void {
    const synth = getSpeechSynthesis();
    if (!synth) {
      advanceQueue();
      return;
    }
    ensureSynthInitialized(synth);
    const voices = readVoices(synth);
    if (voices && voices.length > 0) {
      cachedJaVoice = selectJapaneseVoice(voices);
      speakWithCurrentVoices(synth, text);
      return;
    }

    if (
      voices &&
      voices.length === 0 &&
      cachedJaVoice === null &&
      voiceLoadTimeoutMs > 0 &&
      typeof synth.addEventListener === 'function'
    ) {
      let settled = false;
      let timer: ReturnType<typeof setTimeout> | null = null;

      const cleanupWait = () => {
        if (timer !== null) {
          clearTimeout(timer);
          timer = null;
        }
        if (typeof synth.removeEventListener === 'function') {
          try {
            synth.removeEventListener('voiceschanged', onVoicesChanged);
          } catch {
            // 無視
          }
        }
        if (cancelPendingVoiceWait === cancelWait) {
          cancelPendingVoiceWait = null;
        }
      };

      const cancelWait = () => {
        if (settled) return;
        settled = true;
        cleanupWait();
      };

      const finishWait = () => {
        if (settled) return;
        settled = true;
        cleanupWait();
        speakWithCurrentVoices(synth, text);
      };

      const onVoicesChanged = () => {
        if (settled) return;
        const nextVoices = readVoices(synth);
        if (nextVoices && nextVoices.length > 0) {
          cachedJaVoice = selectJapaneseVoice(nextVoices);
          finishWait();
        }
      };

      cancelPendingVoiceWait = cancelWait;
      try {
        synth.addEventListener('voiceschanged', onVoicesChanged);
      } catch {
        cancelWait();
        speakWithCurrentVoices(synth, text);
        return;
      }
      timer = setTimeout(finishWait, voiceLoadTimeoutMs);
      return;
    }

    speakWithCurrentVoices(synth, text);
  }

  function startPlayback(payload: QueuePayload): void {
    if (payload.type === 'audio') {
      startAudioPlayback(payload.url);
    } else {
      startSpeechPlayback(payload.text);
    }
  }

  function evictOldestWord(): boolean {
    const wordIdx = queue.findIndex((entry) => entry.kind === 'word');
    if (wordIdx === -1) return false;
    queue.splice(wordIdx, 1);
    return true;
  }

  function enqueue(
    payload: QueuePayload,
    kind: QueueKind,
    playOptions?: VoicePlayOptions,
  ): boolean {
    const delayMs = Math.max(0, playOptions?.delayMs ?? 0);

    if (!isBusy()) {
      scheduleOrStart(payload, delayMs);
      return true;
    }

    if (maxQueueSize === 0) {
      return false;
    }

    const notBefore = delayMs > 0 ? nowMs() + delayMs : null;

    if (kind === 'self-report') {
      // 待機中の自己申告がすでにあれば最新の選択で置き換え、完了・終了の声かけを押し出さない。
      const existingSelfReportIdx = queue.findIndex((entry) => entry.kind === 'self-report');
      if (existingSelfReportIdx !== -1) {
        queue.splice(existingSelfReportIdx, 1);
      } else if (queue.length >= maxQueueSize) {
        evictOldestWord();
      }
      queue.push({ payload, kind, notBefore });
      return true;
    }

    if (kind === 'milestone') {
      // 開始・完了・終了の声かけは満杯時でも破棄しない（単語の待機分があればそれを先に退避する）。
      if (queue.length >= maxQueueSize) {
        evictOldestWord();
      }
      queue.push({ payload, kind, notBefore });
      return true;
    }

    // 単語読み上げ: キューが満杯なら古い単語のみを破棄し、固定文は押し出さない。
    if (queue.length >= maxQueueSize) {
      if (!evictOldestWord()) {
        return false;
      }
    }
    queue.push({ payload, kind, notBefore });
    return true;
  }

  return {
    playPhrase(key: VoicePhraseKey, playOptions?: VoicePlayOptions): boolean {
      const path = manifest.phrases[key];
      if (!path || path.trim().length === 0) return false;
      return enqueue({ type: 'audio', url: resolveVoiceUrl(path, baseUrl) }, classifyPhrase(key), playOptions);
    },

    playWord(word: string, playOptions?: VoicePlayOptions): boolean {
      const path = manifest.words[word];
      if (path && path.trim().length > 0) {
        return enqueue({ type: 'audio', url: resolveVoiceUrl(path, baseUrl) }, 'word', playOptions);
      }

      if (playOptions?.allowTtsFallback === false) return false;

      const trimmedWord = word.trim();
      if (trimmedWord.length === 0) return false;

      const synth = getSpeechSynthesis();
      if (!synth || !canCreateUtterance()) return false;
      ensureSynthInitialized(synth);
      return enqueue({ type: 'speech', text: trimmedWord }, 'word', playOptions);
    },

    isPlaying(): boolean {
      return currentAudio !== null || currentSpeech !== null;
    },

    stop(): void {
      if (pendingTimer !== null) {
        clearTimeout(pendingTimer);
        pendingTimer = null;
      }
      if (cancelPendingVoiceWait !== null) {
        cancelPendingVoiceWait();
        cancelPendingVoiceWait = null;
      }
      queue.length = 0;
      const audio = currentAudio;
      const speechSynth = currentSpeechSynth;
      cleanupCurrent();
      if (audio) {
        try {
          audio.pause();
          audio.currentTime = 0;
        } catch {
          // 停止に失敗しても進行は止めない
        }
      }
      if (speechSynth) {
        try {
          speechSynth.cancel();
        } catch {
          // 停止に失敗しても進行は止めない
        }
      }
    },
  };
}

/** アプリ全体で共有する音声プレイヤー（画面をまたいでも読み上げが重ならないようにする）。 */
export const voicePlayer: VoicePlayer = createVoicePlayer();
