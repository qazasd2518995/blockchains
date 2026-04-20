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
  if (multiplier >= 1000) return 'mega';
  if (multiplier >= 100) return 'huge';
  if (multiplier >= 10) return 'big';
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
    particles: 16,
    shakeAmp: 0,
    shakeDuration: 0,
    edgeGlowMs: 240,
    rayBurst: false,
    confetti: false,
  },
  big: {
    particles: 40,
    shakeAmp: 3,
    shakeDuration: 0.3,
    edgeGlowMs: 400,
    rayBurst: true,
    confetti: false,
  },
  huge: {
    particles: 80,
    shakeAmp: 6,
    shakeDuration: 0.5,
    edgeGlowMs: 800,
    rayBurst: true,
    confetti: true,
  },
  mega: {
    particles: 120,
    shakeAmp: 10,
    shakeDuration: 0.8,
    edgeGlowMs: 1500,
    rayBurst: true,
    confetti: true,
  },
};
