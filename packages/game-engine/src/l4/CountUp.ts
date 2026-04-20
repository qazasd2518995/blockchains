import type { Text } from 'pixi.js';
import { gsap } from 'gsap';
import { EASE } from './easePresets.js';

interface CountUpOptions {
  decimals?: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  ease?: string;
  separator?: string;       // 千分位
  tabularNums?: boolean;    // 固定寬度數字（防跳動）
}

/**
 * L4 數字 count-up：對倍率 / 派彩 / 餘額動畫用。
 * 絕不瞬變 — 至少 120ms。預設 400ms ease-out-quart（Stake 慣例）。
 */
export function countUp(
  text: Text,
  from: number,
  to: number,
  opts: CountUpOptions = {},
): gsap.core.Tween {
  const {
    decimals = 0,
    prefix = '',
    suffix = '',
    duration = 0.4,
    ease = EASE.out,
    separator = '',
  } = opts;
  const state = { v: from };
  return gsap.to(state, {
    v: to,
    duration,
    ease,
    onUpdate: () => {
      const v = state.v;
      let s = v.toFixed(decimals);
      if (separator) {
        const [int, frac] = s.split('.');
        s = (int ?? '0').replace(/\B(?=(\d{3})+(?!\d))/g, separator) + (frac ? `.${frac}` : '');
      }
      text.text = `${prefix}${s}${suffix}`;
    },
  });
}

/** 倍率專用：保留 2 位、x 後綴 */
export function countUpMultiplier(text: Text, from: number, to: number, duration = 0.4): gsap.core.Tween {
  return countUp(text, from, to, { decimals: 2, suffix: 'x', duration });
}

/** 金額專用：保留 2 位、千分位 */
export function countUpMoney(text: Text, from: number, to: number, duration = 0.4): gsap.core.Tween {
  return countUp(text, from, to, { decimals: 2, separator: ',', duration });
}
