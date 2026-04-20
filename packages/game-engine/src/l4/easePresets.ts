/**
 * L4 easing 預設 — 不可使用 linear。
 * 參考 Stake/Roobet：至少 ease-out-quart。
 */
export const EASE = {
  /** 一般 reveal / UI tween */
  out: 'power2.out',
  outStrong: 'power3.out',
  /** 權威落定：滑桿、輪盤減速、倍率落定 */
  expoOut: 'expo.out',
  /** 大獎 punch / 彈性 overshoot */
  back: 'back.out(1.7)',
  backSoft: 'back.out(1.1)',
  /** 緊張 ramp（曲線加速） */
  in: 'power2.in',
  inStrong: 'power3.in',
  /** 無重力感 */
  elastic: 'elastic.out(1, 0.5)',
  /** 循環節奏（呼吸、tick） */
  sineInOut: 'sine.inOut',
} as const;
