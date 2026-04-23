/**
 * 大獎階層門檻（Stake 慣例）：決定 celebrate 強度
 * - small: 1-10x
 * - big: 10-100x
 * - huge: 100-1000x
 * - mega: 1000x+
 */
export type WinTier = 'none' | 'small' | 'big' | 'huge' | 'mega';

export function classifyWinTier(multiplier: number, won: boolean): WinTier {
  if (!won || multiplier <= 0) return 'none';
  if (multiplier >= 500) return 'mega';
  if (multiplier >= 50) return 'huge';
  if (multiplier >= 8) return 'big';
  if (multiplier >= 1.5) return 'small';
  return 'small';
}

export const TIER_CONFIG: Record<WinTier, {
  /** 粒子數量 */
  particles: number;
  /** shake 強度 */
  shakeAmp: number;
  /** shake 時長 秒 */
  shakeDuration: number;
  /** 邊緣 glow 時長 秒 */
  edgeGlowMs: number;
  /** 要不要 radial ray burst */
  rayBurst: boolean;
  /** 彩帶 confetti */
  confetti: boolean;
}> = {
  none: {
    particles: 0,
    shakeAmp: 0,
    shakeDuration: 0,
    edgeGlowMs: 0,
    rayBurst: false,
    confetti: false,
  },
  small: {
    particles: 24,
    shakeAmp: 1.5,
    shakeDuration: 0.18,
    edgeGlowMs: 320,
    rayBurst: false,
    confetti: false,
  },
  big: {
    particles: 56,
    shakeAmp: 3.5,
    shakeDuration: 0.38,
    edgeGlowMs: 540,
    rayBurst: true,
    confetti: false,
  },
  huge: {
    particles: 104,
    shakeAmp: 7.5,
    shakeDuration: 0.62,
    edgeGlowMs: 980,
    rayBurst: true,
    confetti: true,
  },
  mega: {
    particles: 156,
    shakeAmp: 12,
    shakeDuration: 0.95,
    edgeGlowMs: 1800,
    rayBurst: true,
    confetti: true,
  },
};
