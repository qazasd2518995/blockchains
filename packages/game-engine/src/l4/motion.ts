/**
 * L4 motion preferences — 一個 query 即時讀取使用者是否要降低動效。
 * 用在所有 Scene 的「裝飾性」動畫上：粒子、shake、glow、ambient pulse 等。
 * 「結果動畫」本身仍應保留（不然玩家無法理解局勢），只是縮短時程或降低強度。
 */

let cached: boolean | null = null;
let mediaQueryList: MediaQueryList | null = null;

function compute(): boolean {
  if (typeof window === 'undefined' || !window.matchMedia) return false;
  if (!mediaQueryList) {
    mediaQueryList = window.matchMedia('(prefers-reduced-motion: reduce)');
    mediaQueryList.addEventListener?.('change', () => {
      cached = mediaQueryList?.matches ?? false;
    });
  }
  return mediaQueryList.matches;
}

export function prefersReducedMotion(): boolean {
  if (cached === null) cached = compute();
  return cached;
}

/** 把一個強度數字按 reduced motion 縮放：reduce → ratio (預設 0.35)；否則原值 */
export function motionScale(value: number, ratio = 0.35): number {
  return prefersReducedMotion() ? value * ratio : value;
}

/** 是否該完全跳過某個純裝飾的 ambient 效果（粒子飄、霓虹掃光等） */
export function shouldSkipAmbient(): boolean {
  return prefersReducedMotion();
}
