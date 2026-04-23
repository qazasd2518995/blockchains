import { Container, Text, Graphics, type Application } from 'pixi.js';
import { gsap } from 'gsap';
import { EASE } from './easePresets.js';
import { TIER_CONFIG, classifyWinTier, type WinTier } from './tierThresholds.js';
import { ParticlePool } from './ParticlePool.js';
import { ShakeController } from './ShakeController.js';
import { emitGlowBurst, emitEdgeGlow, emitRayBurst } from './GlowBurst.js';
import { Sfx } from './SfxEngine.js';

export interface WinCelebrationOptions {
  /** Pixi Application — 提供 ticker、stage 尺寸 */
  app: Application;
  /** 主場景 container — particle / glow / text 都掛這裡 */
  parent: Container;
  /** 要 shake 的目標（通常是 root container） */
  shakeTarget?: Container;
  /** 場景寬高（找中心） */
  width: number;
  height: number;
  /** 自訂顏色（不指定則用金 + teal 配色） */
  primaryColor?: number;
  secondaryColor?: number;
  /** 多語言金額／倍率前後綴 */
  multiplierLabel?: string; // '×' default
  amountLabel?: string;     // 'WIN' default
}

const DEFAULT_PRIMARY = 0xF3D67D;   // 金
const DEFAULT_SECONDARY = 0x5EE0FF; // 冰藍 highlight
const CONFETTI_COLORS = [0xF3D67D, 0xC9A247, 0xE8D48A, 0x5EE0FF, 0x9CFFA9, 0xFFA8E8, 0xFFD27D];

/**
 * L4 共用「中獎大慶祝」— 一次呼叫，按 tier 自動：
 *  - 倍率彈字（中央）
 *  - 金幣 / 火花粒子灑落
 *  - 中心 glow burst
 *  - big+ 加邊緣光暈
 *  - huge+ 加 radial ray burst
 *  - mega 加彩帶 confetti + 強震
 *
 * 不負責清理 parent；倍率文字、glow 等都是自我清理或結束時自移除。
 * particle pool 要外部管理 dispose（通常和 scene 同生命週期）。
 */
export class WinCelebration {
  private readonly app: Application;
  private readonly parent: Container;
  private readonly width: number;
  private readonly height: number;
  private readonly primary: number;
  private readonly secondary: number;
  private readonly multiplierLabel: string;
  private readonly amountLabel: string;

  private readonly fxLayer: Container;
  private readonly textLayer: Container;
  private readonly particlePool: ParticlePool;
  private readonly confettiPool: ParticlePool;
  private readonly shaker: ShakeController | null;

  private tickerFn: (() => void) | null = null;

  constructor(opts: WinCelebrationOptions) {
    this.app = opts.app;
    this.parent = opts.parent;
    this.width = opts.width;
    this.height = opts.height;
    this.primary = opts.primaryColor ?? DEFAULT_PRIMARY;
    this.secondary = opts.secondaryColor ?? DEFAULT_SECONDARY;
    this.multiplierLabel = opts.multiplierLabel ?? '×';
    this.amountLabel = opts.amountLabel ?? 'WIN';

    this.fxLayer = new Container();
    this.fxLayer.eventMode = 'none';
    this.parent.addChild(this.fxLayer);

    this.textLayer = new Container();
    this.textLayer.eventMode = 'none';
    this.parent.addChild(this.textLayer);

    this.particlePool = new ParticlePool(this.fxLayer, 220);
    this.confettiPool = new ParticlePool(this.fxLayer, 160);

    this.shaker = opts.shakeTarget ? new ShakeController(opts.shakeTarget, opts.app) : null;

    this.tickerFn = (): void => {
      this.particlePool.update(this.app.ticker);
      this.confettiPool.update(this.app.ticker);
    };
    this.app.ticker.add(this.tickerFn);
  }

  /**
   * 中獎慶祝主入口。
   * @param multiplier 該局倍率（決定 tier）
   * @param won 是否中獎（false 直接 return）
   */
  celebrate(multiplier: number, won: boolean): void {
    const tier = classifyWinTier(multiplier, won);
    if (tier === 'none') return;
    this.celebrateAtTier(tier, multiplier);
  }

  /** 給已知 tier 直接觸發（少數遊戲想跳過 multiplier 換算） */
  celebrateAtTier(tier: WinTier, multiplier: number): void {
    if (tier === 'none') return;
    const cfg = TIER_CONFIG[tier];
    const cx = this.width / 2;
    const cy = this.height / 2;

    // 0) 對應 tier 的勝利音效
    if (tier === 'mega') Sfx.winMega();
    else if (tier === 'huge') Sfx.winHuge();
    else if (tier === 'big') Sfx.winBig();
    else Sfx.winSmall();

    // 1) shake
    if (this.shaker && cfg.shakeAmp > 0) {
      this.shaker.shake(cfg.shakeAmp, cfg.shakeDuration);
    }

    // 2) 中心 glow burst（必有）
    emitGlowBurst(this.fxLayer, cx, cy, this.primary, {
      radius: 70 + cfg.particles * 0.6,
      peakBlur: 18 + (tier === 'mega' ? 14 : tier === 'huge' ? 8 : 0),
      durationSec: 0.55 + (tier === 'mega' ? 0.6 : tier === 'huge' ? 0.3 : 0),
    });

    // 3) edge glow (big+)
    if (cfg.edgeGlowMs > 0 && (tier === 'big' || tier === 'huge' || tier === 'mega')) {
      emitEdgeGlow(this.fxLayer, this.width, this.height, this.primary, cfg.edgeGlowMs / 1000);
    }

    // 4) ray burst (huge+)
    if (cfg.rayBurst) {
      emitRayBurst(this.fxLayer, this.app, cx, cy, this.primary, tier === 'mega' ? 1.6 : 1.1);
    }

    // 5) particles — 金幣/火花從中心向外發散
    this.particlePool.emit({
      x: cx,
      y: cy,
      count: cfg.particles,
      colors: [this.primary, this.secondary, 0xFFFFFF],
      speedMin: 4,
      speedMax: tier === 'mega' ? 16 : tier === 'huge' ? 13 : 10,
      sizeMin: 3,
      sizeMax: tier === 'mega' ? 11 : 8,
      lifeMin: 50,
      lifeMax: 110,
      gravity: 0.16,
      spreadRad: Math.PI * 2,
      shape: 'mixed',
    });

    // 6) confetti (mega only) — 彩色紙片從上方灑落
    if (cfg.confetti) {
      this.confettiPool.emit({
        x: cx,
        y: -20,
        count: 90,
        colors: CONFETTI_COLORS,
        speedMin: 1.5,
        speedMax: 4,
        sizeMin: 4,
        sizeMax: 8,
        lifeMin: 110,
        lifeMax: 200,
        gravity: 0.06,
        spreadRad: Math.PI * 1.4,
        angleRad: Math.PI / 2,
        shape: 'square',
      });
    }

    // 7) 倍率彈字
    this.spawnMultiplierPop(cx, cy, multiplier, tier);
  }

  private spawnMultiplierPop(cx: number, cy: number, multiplier: number, tier: WinTier): void {
    const fontSize = tier === 'mega' ? 96 : tier === 'huge' ? 76 : tier === 'big' ? 60 : 46;
    const subSize = Math.round(fontSize * 0.28);

    const group = new Container();
    group.x = cx;
    group.y = cy;
    group.alpha = 0;
    group.scale.set(0.5);
    this.textLayer.addChild(group);

    // 主倍率
    const main = new Text({
      text: `${multiplier.toFixed(2)}${this.multiplierLabel}`,
      style: {
        fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
        fontSize,
        fontWeight: '900',
        fill: this.primary,
        stroke: { color: 0x1A1206, width: Math.max(3, fontSize * 0.06) },
        dropShadow: {
          color: 0x000000,
          blur: 18,
          distance: 0,
          alpha: 0.65,
        },
      },
    });
    main.anchor.set(0.5);
    main.y = -fontSize * 0.18;

    // 副標 WIN
    const sub = new Text({
      text: this.amountLabel,
      style: {
        fontFamily: '"Inter", "Noto Sans TC", system-ui, sans-serif',
        fontSize: subSize,
        fontWeight: '700',
        letterSpacing: 6,
        fill: 0xFFFFFF,
        stroke: { color: 0x1A1206, width: 2 },
      },
    });
    sub.anchor.set(0.5);
    sub.y = fontSize * 0.55;
    sub.alpha = 0.85;

    // 背景光暈條
    const bg = new Graphics();
    const padX = fontSize * 0.9;
    const padY = fontSize * 0.4;
    const w = main.width + padX;
    const h = fontSize + subSize + padY * 1.4;
    bg.roundRect(-w / 2, -h / 2, w, h, h * 0.32)
      .fill({ color: 0x0F172A, alpha: 0.55 })
      .roundRect(-w / 2, -h / 2, w, h, h * 0.32)
      .stroke({ width: 2, color: this.primary, alpha: 0.55 });
    bg.alpha = 0.0;

    group.addChild(bg, main, sub);

    // 彈跳進場（back overshoot）
    gsap.to(group, { alpha: 1, duration: 0.18, ease: EASE.out });
    gsap.to(group.scale, {
      x: 1,
      y: 1,
      duration: 0.55,
      ease: EASE.back,
    });
    gsap.to(bg, {
      alpha: 1,
      duration: 0.3,
      delay: 0.05,
      ease: EASE.out,
    });

    // 主數字輕微脈動
    const holdDur = tier === 'mega' ? 1.6 : tier === 'huge' ? 1.2 : tier === 'big' ? 0.85 : 0.65;
    gsap.to(main.scale, {
      x: 1.06,
      y: 1.06,
      duration: 0.42,
      yoyo: true,
      repeat: 2,
      ease: EASE.sineInOut,
    });

    // 退場
    gsap.to(group, {
      alpha: 0,
      duration: 0.42,
      delay: holdDur,
      ease: EASE.in,
    });
    gsap.to(group.scale, {
      x: 1.18,
      y: 1.18,
      duration: 0.42,
      delay: holdDur,
      ease: EASE.in,
      onComplete: () => {
        this.textLayer.removeChild(group);
        group.destroy({ children: true });
      },
    });
  }

  dispose(): void {
    if (this.tickerFn) {
      this.app.ticker.remove(this.tickerFn);
      this.tickerFn = null;
    }
    this.shaker?.dispose();
    this.particlePool.dispose();
    this.confettiPool.dispose();
    if (this.fxLayer.parent) this.fxLayer.parent.removeChild(this.fxLayer);
    this.fxLayer.destroy({ children: true });
    if (this.textLayer.parent) this.textLayer.parent.removeChild(this.textLayer);
    this.textLayer.destroy({ children: true });
  }
}
