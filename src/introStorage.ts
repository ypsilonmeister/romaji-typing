// 起動時の IME 案内を「初回のみ」にするための記録。
// 端末内の localStorage だけを使う。読み書きできない環境では、毎回案内を出す。
const KEY = 'typecraft.introSeen';

export function hasSeenIntro(): boolean {
  try {
    return window.localStorage.getItem(KEY) === '1';
  } catch {
    return false;
  }
}

export function markIntroSeen(): void {
  try {
    window.localStorage.setItem(KEY, '1');
  } catch {
    // 保存できなくても、今回の画面遷移は止めない。
  }
}
