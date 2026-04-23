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
  const burst = new Container();
  const core = new Graphics().circle(0, 0, radius * 0.92).fill({ color, alpha: 0.64 });
  const halo = new Graphics().circle(0, 0, radius * 1.25).fill({ color, alpha: 0.16 });
  const ring = new Graphics()
    .circle(0, 0, radius * 0.72)
    .stroke({ width: Math.max(8, radius * 0.12), color, alpha: 0.28 });
  burst.x = x;
  burst.y = y;
  burst.addChild(halo, core, ring);
  const blur = new BlurFilter({ strength: 0, quality: 4 });
  burst.filters = [blur];
  burst.alpha = 0.84;
  burst.scale.set(0.82);
  parent.addChild(burst);

  gsap.to(blur, { strength: peakBlur, duration: durationSec * 0.35, ease: EASE.out });
  gsap.to(blur, { strength: 0, duration: durationSec * 0.65, delay: durationSec * 0.35, ease: EASE.in });
  gsap.to(burst.scale, {
    x: 1.08,
    y: 1.08,
    duration: durationSec,
    ease: EASE.outStrong,
  });
  gsap.to(ring.scale, {
    x: 1.14,
    y: 1.14,
    duration: durationSec * 0.82,
    ease: EASE.out,
  });
  gsap.to(burst, {
    alpha: 0,
    duration: durationSec,
    ease: EASE.out,
    onComplete: () => {
      parent.removeChild(burst);
      burst.destroy({ children: true });
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
  const thickness = 34;
  // 畫四條邊（用 rect 疊）
  g.rect(0, 0, width, thickness).fill({ color, alpha: 0.72 });
  g.rect(0, height - thickness, width, thickness).fill({ color, alpha: 0.72 });
  g.rect(0, 0, thickness, height).fill({ color, alpha: 0.72 });
  g.rect(width - thickness, 0, thickness, height).fill({ color, alpha: 0.72 });
  g.circle(width / 2, height / 2, Math.min(width, height) * 0.24).fill({ color, alpha: 0.14 });
  g.circle(width * 0.1, height * 0.1, thickness * 1.4).fill({ color, alpha: 0.18 });
  g.circle(width * 0.9, height * 0.1, thickness * 1.4).fill({ color, alpha: 0.18 });
  g.circle(width * 0.1, height * 0.9, thickness * 1.4).fill({ color, alpha: 0.18 });
  g.circle(width * 0.9, height * 0.9, thickness * 1.4).fill({ color, alpha: 0.18 });
  const blur = new BlurFilter({ strength: 20, quality: 4 });
  g.filters = [blur];
  g.alpha = 0;
  g.scale.set(0.97);
  parent.addChild(g);

  gsap.to(g, { alpha: 1, duration: durationSec * 0.22, ease: EASE.out });
  gsap.to(g.scale, { x: 1.02, y: 1.02, duration: durationSec * 0.45, ease: EASE.outStrong });
  gsap.to(blur, { strength: 28, duration: durationSec * 0.34, ease: EASE.out });
  gsap.to(blur, { strength: 0, duration: durationSec * 0.66, delay: durationSec * 0.34, ease: EASE.in });
  gsap.to(g, {
    alpha: 0,
    duration: durationSec * 0.78,
    delay: durationSec * 0.22,
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
  const center = new Graphics().circle(0, 0, 34).fill({ color, alpha: 0.18 });
  const rays = 20;
  const innerR = 30;
  const outerR = 220;
  for (let i = 0; i < rays; i += 1) {
    const a1 = (i / rays) * Math.PI * 2;
    const a2 = a1 + 0.045;
    const rayOuter = i % 2 === 0 ? outerR : outerR * 0.82;
    g.moveTo(Math.cos(a1) * innerR, Math.sin(a1) * innerR);
    g.lineTo(Math.cos(a1) * rayOuter, Math.sin(a1) * rayOuter);
    g.lineTo(Math.cos(a2) * rayOuter, Math.sin(a2) * rayOuter);
    g.lineTo(Math.cos(a2) * innerR, Math.sin(a2) * innerR);
    g.closePath();
  }
  g.fill({ color, alpha: 0.5 });
  const burst = new Container();
  burst.x = x;
  burst.y = y;
  burst.alpha = 0;
  burst.scale.set(0.8);
  const blur = new BlurFilter({ strength: 4, quality: 2 });
  burst.filters = [blur];
  burst.addChild(g, center);
  parent.addChild(burst);

  const rotTick = (tk: Ticker) => {
    burst.rotation += 0.01 * tk.deltaTime;
  };
  app.ticker.add(rotTick);

  gsap.to(burst, { alpha: 1, duration: 0.25, ease: EASE.out });
  gsap.to(burst.scale, { x: 1.12, y: 1.12, duration: durationSec * 0.72, ease: EASE.outStrong });
  gsap.to(center.scale, { x: 1.35, y: 1.35, duration: durationSec * 0.42, ease: EASE.out });
  gsap.to(blur, { strength: 8, duration: durationSec * 0.25, ease: EASE.out });
  gsap.to(blur, { strength: 0, duration: durationSec * 0.75, delay: durationSec * 0.25, ease: EASE.in });
  gsap.to(burst, {
    alpha: 0,
    duration: durationSec * 0.7,
    delay: durationSec * 0.3,
    ease: EASE.in,
    onComplete: () => {
      app.ticker.remove(rotTick);
      parent.removeChild(burst);
      burst.destroy({ children: true });
    },
  });
}
