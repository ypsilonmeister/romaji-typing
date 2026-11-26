// 事前生成した音声ファイルのマニフェスト定義（Issue #13）。
// 実音声データの同梱と登録は別 Issue（#14）で行う。未登録の項目は無音で素通りする。

import type { SelfReport } from '../progress/types';
import rawManifest from './voiceManifest.json';

/** 固定文（声かけ・自己申告への返し）の音声キー。 */
export const VOICE_PHRASE_KEYS = [
  'lesson-start',
  'lesson-clear',
  'session-end',
  'self-report-good',
  'self-report-ok',
  'self-report-tired',
  'self-report-skip',
] as const;

export type VoicePhraseKey = (typeof VOICE_PHRASE_KEYS)[number];

/**
 * 終了画面の自己申告の選択肢と、対応する褒め・労い音声キーの対応。
 * どの答えにも前向きに返す想定で、選択肢ごとにキーを割り当てる。
 */
export const SELF_REPORT_VOICE_KEYS: Readonly<Record<SelfReport, VoicePhraseKey>> = {
  good: 'self-report-good',
  ok: 'self-report-ok',
  hard: 'self-report-tired',
  skip: 'self-report-skip',
};

/**
 * 音声マニフェストの形式。
 * 各値は public/ 配下からの相対パス（例: "audio/phrases/lesson-start.mp3", "audio/words/asa.mp3"）を指定する。
 */
export interface VoiceManifest {
  readonly phrases: Readonly<Partial<Record<VoicePhraseKey, string>>>;
  readonly words: Readonly<Record<string, string>>;
}

export const DEFAULT_VOICE_MANIFEST: VoiceManifest = rawManifest as VoiceManifest;

/**
 * マニフェスト内の相対パスを Vite の base URL（GitHub Pages のサブパス等）に合わせて解決する。
 */
export function resolveVoiceUrl(
  path: string,
  baseUrl: string = import.meta.env.BASE_URL ?? '/',
): string {
  if (/^(?:https?:|data:|blob:)/.test(path)) {
    return path;
  }
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const trimmedPath = path.replace(/^\/+/, '');
  return `${normalizedBase}${trimmedPath}`;
}
