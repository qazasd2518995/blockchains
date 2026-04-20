import { Container, Graphics, BlurFilter, type Ticker } from 'pixi.js';
import { gsap } from 'gsap';
import { EASE } from './easePresets.js';

/**
 * L4 Glow burst：
 * - BlurFilter.strength tween 0→peak→0 做中心光暈
 * - 比起 re-render 或 GlowFilter 便宜（GlowFilter 在 Pixi v8 有 shader bug）
 */
export function emitGlowBurst(
  parent: Container,
  x: number,
  y: number,
  color: number,
  opts: { radius?: number; peakBlur?: number; durationSec?: number } = {},
): void {
  const { radius = 80, peakBlur = 20, durationSec = 0.6 } = opts;
  const core = new Graphics().circle(0, 0, radius).fill({ color, alpha: 0.7 });
  core.x = x;
  core.y = y;
  const blur = new BlurFilter({ strength: 0, quality: 4 });
  core.filters = [blur];
  parent.addChild(core);

  gsap.to(blur, { strength: peakBlur, duration: durationSec * 0.35, ease: EASE.out });
  gsap.to(blur, { strength: 0, duration: durationSec * 0.65, delay: durationSec * 0.35, ease: EASE.in });
  gsap.to(core, {
    alpha: 0,
    duration: durationSec,
    ease: EASE.out,
    onComplete: () => {
      parent.removeChild(core);
      core.destroy();
    },
  });
}

/**
 * 邊緣 edge glow：L4 win reveal 時螢幕四邊短暫發光。
 */
export function emitEdgeGlow(
  parent: Container,
  width: number,
  height: number,
  color: number,
  durationSec = 0.3,
): void {
  const g = new Graphics();
  const thickness = 24;
  // 畫四條邊（用 rect 疊）
  g.rect(0, 0, width, thickness).fill({ color, alpha: 0.7 });
  g.rect(0, height - thickness, width, thickness).fill({ color, alpha: 0.7 });
  g.rect(0, 0, thickness, height).fill({ color, alpha: 0.7 });
  g.rect(width - thickness, 0, thickness, height).fill({ color, alpha: 0.7 });
  const blur = new BlurFilter({ strength: 16, quality: 4 });
  g.filters = [blur];
  g.alpha = 0;
  parent.addChild(g);

  gsap.to(g, { alpha: 1, duration: durationSec * 0.3, ease: EASE.out });
  gsap.to(g, {
    alpha: 0,
    duration: durationSec * 0.7,
    delay: durationSec * 0.3,
    ease: EASE.in,
    onComplete: () => {
      parent.removeChild(g);
      g.destroy();
    },
  });
}

/**
 * Radial ray burst（大獎專用）：8-12 條光線自中心向外發散並旋轉。
 */
export function emitRayBurst(
  parent: Container,
  app: { ticker: { add: (fn: (tk: Ticker) => void) => void; remove: (fn: (tk: Ticker) => void) => void } },
  x: number,
  y: number,
  color: number,
  durationSec = 1.2,
): void {
  const g = new Graphics();
  const rays = 12;
  const innerR = 30;
  const outerR = 220;
  for (let i = 0; i < rays; i += 1) {
    const a1 = (i / rays) * Math.PI * 2;
    const a2 = a1 + 0.06;
    g.moveTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    g.lineTo(Math.cos(a1) * outerR, Math.sin(a1) * outerR);
    g.lineTo(Math.cos(a2) * outerR, Math.sin(a2) * outerR);
    g.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
    g.closePath();
  }
  g.fill({ color, alpha: 0.5 });
  g.x = x;
  g.y = y;
  g.alpha = 0;
  const blur = new BlurFilter({ strength: 4, quality: 2 });
  g.filters = [blur];
  parent.addChild(g);

  const rotTick = (tk: Ticker) => {
    g.rotation += 0.01 * tk.deltaTime;
  };
  app.ticker.add(rotTick);

  gsap.to(g, { alpha: 1, duration: 0.25, ease: EASE.out });
  gsap.to(g, {
    alpha: 0,
    duration: durationSec * 0.7,
    delay: durationSec * 0.3,
    ease: EASE.in,
    onComplete: () => {
      app.ticker.remove(rotTick);
      parent.removeChild(g);
      g.destroy();
    },
  });
}
