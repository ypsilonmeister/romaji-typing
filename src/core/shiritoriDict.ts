// しりとり拡張辞書（public/shiritori-dict.json）の遅延読み込み（Issue #19）。

export const SHIRITORI_EXTENDED_DICT_PATH = 'shiritori-dict.json';

/**
 * 拡張辞書の URL を Vite の base URL（GitHub Pages のサブパス等）に合わせて解決する。
 */
export function resolveShiritoriDictUrl(
  baseUrl: string = import.meta.env.BASE_URL ?? '/',
): string {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  return `${normalizedBase}${SHIRITORI_EXTENDED_DICT_PATH}`;
}

export interface LoadExtendedDictionaryOptions {
  readonly baseUrl?: string;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

/**
 * しりとり拡張辞書を遅延読み込みする。
 * 読み込みやパースに失敗しても例外を投げず、空配列を返して従来辞書だけで続行できるようにする。
 */
export async function loadExtendedShiritoriDictionary(
  options: LoadExtendedDictionaryOptions = {},
): Promise<readonly string[]> {
  const fetchFn = options.fetchImpl ?? (typeof fetch === 'function' ? fetch : undefined);
  if (!fetchFn) return [];
  try {
    const response = await fetchFn(resolveShiritoriDictUrl(options.baseUrl), {
      signal: options.signal,
    });
    if (!response.ok) return [];
    const data: unknown = await response.json();
    if (!Array.isArray(data)) return [];
    return data.filter((item): item is string => typeof item === 'string' && item.length > 0);
  } catch {
    return [];
  }
}
