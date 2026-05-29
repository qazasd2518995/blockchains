import {
  Application,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Ticker,
  BlurFilter,
  Texture,
} from 'pixi.js';
import { gsap } from 'gsap';
import { addCoverSprite, loadTextureOrNull } from '../shared/pixiAssets';
import {
  ParticlePool,
  ShakeController,
  classifyWinTier,
  TIER_CONFIG,
  EASE,
  emitEdgeGlow,
  emitGlowBurst,
  emitRayBurst,
  prewarmShaders,
  prefersReducedMotion,
  GAME_FONT,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0x0F172A;
const COLOR_EMBER = 0xD4574A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_AMBER = 0xF3D67D;
const COLOR_ICE = 0x266F85;
const COLOR_INK = 0x0A0806;
const COLOR_WHITE = 0xFFFFFF;
const COLOR_GRAY = 0xC9A247;
const WHEEL_BACKGROUND_ASSET = '/game-art/wheel/background-v2.png';
const TAU = Math.PI * 2;

const WHEEL_THEME = {
  veilAlpha: 0.34,
  glow: 0x39D5E8,
  rim: 0xF3D67D,
  rimDark: 0x07131F,
  pointer: 0xF3D67D,
  bulb: 0xFFE39B,
  zero: 0x26364A,
  low: 0x139D84,
  medium: 0xF3D67D,
  high: 0xD4574A,
  jackpot: 0x7C4DFF,
};

function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function positiveAngleDelta(from: number, to: number): number {
  return (to - from + TAU) % TAU;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class WheelScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private radius = 0;
  private cx = 0;
  private cy = 0;

  private wheelContainer: Container | null = null;
  private wheelGraphics: Graphics | null = null;
  private pointerContainer: Container | null = null;
  private centerHub: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;

  private multipliers: number[] = [];
  private particleList: Particle[] = [];
  private backgroundTexture: Texture | null = null;

  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;
  private spinning = false;


  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.radius = Math.min(width, height) * 0.455;

    const app = new Application();
    await app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      resolution: window.devicePixelRatio ?? 1,
      autoDensity: true,
      antialias: true,
    });
    this.app = app;
    this.winFx = new WinCelebration({
      app,
      parent: app.stage,
      shakeTarget: app.stage,
      width: this.width,
      height: this.height,
    });

    await this.preloadAssets();
    this.createBackground();

    this.wheelContainer = new Container();
    this.wheelContainer.x = this.cx;
    this.wheelContainer.y = this.cy;
    app.stage.addChild(this.wheelContainer);

    this.wheelGraphics = new Graphics();
    this.wheelContainer.addChild(this.wheelGraphics);

    // 中心 hub
    this.centerHub = new Container();
    this.centerHub.x = this.cx;
    this.centerHub.y = this.cy;
    app.stage.addChild(this.centerHub);
    this.drawCenterHub();

    // 指針（在輪盤上方，但不隨輪盤旋轉）
    this.pointerContainer = new Container();
    this.pointerContainer.x = this.cx;
    this.pointerContainer.y = this.cy - this.radius - 2;
    app.stage.addChild(this.pointerContainer);
    this.drawPointer();

    // 粒子 + shockwave
    this.particles = new Container();
    app.stage.addChild(this.particles);
    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    this.particlePool = new ParticlePool(app.stage, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.startTickers();
  }

  private async preloadAssets(): Promise<void> {
    this.backgroundTexture = await loadTextureOrNull(WHEEL_BACKGROUND_ASSET);
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 1 });
    this.app.stage.addChild(bg);

    const artwork = addCoverSprite(this.app.stage, this.backgroundTexture, this.width, this.height, 0.9);
    if (artwork) {
      const veil = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: WHEEL_THEME.veilAlpha });
      this.app.stage.addChild(veil);
    }

    const glow = new Graphics()
      .circle(this.cx, this.cy, this.radius * 1.3)
      .fill({ color: WHEEL_THEME.glow, alpha: artwork ? 0.08 : 0.1 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 外圈裝飾光環
    const ring = new Graphics()
      .circle(this.cx, this.cy, this.radius + 20)
      .stroke({ color: WHEEL_THEME.rim, width: 2, alpha: artwork ? 0.24 : 0.3 });
    this.app.stage.addChild(ring);

    // 小裝飾點（圍繞輪盤外圍）
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const px = this.cx + Math.cos(a) * (this.radius + 36);
      const py = this.cy + Math.sin(a) * (this.radius + 36);
      const dot = new Graphics().circle(px, py, 3).fill({ color: WHEEL_THEME.bulb, alpha: 0.45 });
      this.app.stage.addChild(dot);
    }
  }

  private drawCenterHub(): void {
    if (!this.centerHub) return;
    this.centerHub.removeChildren();
    const outerRadius = Math.max(38, this.radius * 0.17);
    const innerRadius = outerRadius * 0.8;
    const starSize = Math.max(30, outerRadius * 0.78);
    const shadow = new Graphics().circle(0, outerRadius * 0.08, outerRadius * 1.16).fill({
      color: COLOR_INK,
      alpha: 0.36,
    });
    const outer = new Graphics()
      .circle(0, 0, outerRadius)
      .fill({ color: WHEEL_THEME.rimDark })
      .stroke({ color: WHEEL_THEME.rim, width: Math.max(3, outerRadius * 0.08) });
    const trim = new Graphics()
      .circle(0, 0, outerRadius * 0.9)
      .stroke({ color: COLOR_WHITE, width: 1, alpha: 0.18 });
    const inner = new Graphics()
      .circle(0, 0, innerRadius)
      .fill({ color: WHEEL_THEME.rim })
      .stroke({ color: COLOR_WHITE, width: 1, alpha: 0.5 });
    // 中心星
    const starStyle = new TextStyle({
      fontFamily: GAME_FONT,
      fontSize: starSize,
      fill: COLOR_WHITE,
      fontWeight: '700',
    });
    const star = new Text({ text: '✦', style: starStyle });
    star.anchor.set(0.5);
    this.centerHub.addChild(shadow);
    this.centerHub.addChild(outer);
    this.centerHub.addChild(trim);
    this.centerHub.addChild(inner);
    this.centerHub.addChild(star);
  }

  private drawPointer(): void {
    if (!this.pointerContainer) return;
    this.pointerContainer.removeChildren();
    const w = Math.max(24, this.radius * 0.12);
    const h = Math.max(28, this.radius * 0.15);
    const capRadius = Math.max(8, this.radius * 0.04);
    // 指針朝下（指向輪盤外圈的 0 度位置，也就是正上方）
    const glow = new Graphics()
      .circle(0, h * 0.46, w * 0.78)
      .fill({ color: WHEEL_THEME.pointer, alpha: 0.22 });
    glow.filters = [new BlurFilter({ strength: 12 })];
    const shadow = new Graphics()
      .poly([-w / 2 - 2, -2, w / 2 + 2, -2, 0, h + 2])
      .fill({ color: COLOR_INK, alpha: 0.3 });
    shadow.x = 2;
    shadow.y = 3;
    const body = new Graphics()
      .poly([-w / 2, 0, w / 2, 0, 0, h])
      .fill({ color: WHEEL_THEME.pointer })
      .stroke({ color: COLOR_INK, width: 2 });
    // 頂部圓
    const cap = new Graphics()
      .circle(0, -2, capRadius)
      .fill({ color: WHEEL_THEME.pointer })
      .stroke({ color: COLOR_INK, width: 2 });
    this.pointerContainer.addChild(glow);
    this.pointerContainer.addChild(shadow);
    this.pointerContainer.addChild(body);
    this.pointerContainer.addChild(cap);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // 中心 hub 微微旋轉
      if (this.centerHub) {
        const star = this.centerHub.children[this.centerHub.children.length - 1];
        if (star) star.rotation += 0.005;
      }
    };
    this.app.ticker.add(this.ambientTicker);

    this.particleTicker = (tk: Ticker) => {
      for (let i = this.particleList.length - 1; i >= 0; i -= 1) {
        const p = this.particleList[i]!;
        p.g.x += p.vx * tk.deltaTime;
        p.g.y += p.vy * tk.deltaTime;
        p.vy += p.gravity * tk.deltaTime;
        p.vx *= 0.98;
        p.life -= tk.deltaTime;
        const t = p.life / p.maxLife;
        p.g.alpha = Math.max(0, t);
        p.g.scale.set(Math.max(0.1, t));
        if (p.life <= 0) {
          this.particles?.removeChild(p.g);
          p.g.destroy();
          this.particleList.splice(i, 1);
        }
      }
    };
    this.app.ticker.add(this.particleTicker);
  }

  /**
   * 設定輪盤的區段倍率表（段數 = multipliers.length）
   */
  setSegments(multipliers: number[]): void {
    if (this.spinning) return;
    this.multipliers = multipliers;
    this.drawWheel();
  }

  private getSegmentPaint(multiplier: number): { color: number; textColor: number } {
    if (multiplier <= 0) return { color: WHEEL_THEME.zero, textColor: COLOR_GRAY };
    if (multiplier < 1) return { color: 0x364B62, textColor: COLOR_WHITE };
    if (multiplier < 2) return { color: WHEEL_THEME.low, textColor: COLOR_WHITE };
    if (multiplier < 5) return { color: WHEEL_THEME.medium, textColor: COLOR_INK };
    if (multiplier < 20) return { color: WHEEL_THEME.high, textColor: COLOR_WHITE };
    return { color: WHEEL_THEME.jackpot, textColor: COLOR_WHITE };
  }

  private drawWheel(): void {
    if (!this.wheelGraphics) return;
    const g = this.wheelGraphics;
    g.clear();
    // 移除舊的倍率 Text，避免每次 setSegments 都疊一層造成「數字疊字」
    if (this.wheelContainer) {
      const kids = [...this.wheelContainer.children];
      for (const k of kids) {
        if (k !== this.wheelGraphics) {
          this.wheelContainer.removeChild(k);
          k.destroy();
        }
      }
    }
    const n = this.multipliers.length;
    if (n === 0) return;
    const segAngle = TAU / n;
    const segmentRadius = this.radius - Math.max(9, this.radius * 0.028);
    const innerBandRadius = this.radius * 0.32;

    g.circle(0, this.radius * 0.04, this.radius + 20).fill({
      color: COLOR_INK,
      alpha: 0.42,
    });
    g.circle(0, 0, this.radius + 16).fill({ color: WHEEL_THEME.rimDark, alpha: 0.98 });
    g.circle(0, 0, this.radius + 10).stroke({
      color: WHEEL_THEME.rim,
      width: Math.max(5, this.radius * 0.032),
      alpha: 0.96,
    });
    g.circle(0, 0, this.radius + 2).stroke({ color: COLOR_WHITE, width: 1, alpha: 0.16 });
    g.circle(0, 0, this.radius - 2).fill({ color: WHEEL_THEME.rimDark, alpha: 0.9 });

    // 繪製扇形
    for (let i = 0; i < n; i += 1) {
      const m = this.multipliers[i]!;
      const paint = this.getSegmentPaint(m);

      // 起始從 -PI/2（正上方）開始
      const startA = -Math.PI / 2 + i * segAngle;
      const endA = startA + segAngle;

      g.moveTo(0, 0);
      g.arc(0, 0, segmentRadius, startA, endA);
      g.closePath();
      g.fill({ color: paint.color });

      g.moveTo(0, 0);
      g.arc(0, 0, segmentRadius * 0.97, startA + segAngle * 0.04, endA - segAngle * 0.04);
      g.closePath();
      g.fill({ color: COLOR_WHITE, alpha: m >= 2 ? 0.065 : 0.04 });

      // 邊界線
      const x1 = Math.cos(startA) * segmentRadius;
      const y1 = Math.sin(startA) * segmentRadius;
      g.moveTo(0, 0).lineTo(x1, y1).stroke({
        color: WHEEL_THEME.rimDark,
        width: Math.max(1.4, this.radius * 0.008),
        alpha: 0.82,
      });
    }

    // 外圈
    g.circle(0, 0, this.radius).stroke({
      color: WHEEL_THEME.rim,
      width: Math.max(2, this.radius * 0.016),
      alpha: 0.9,
    });
    g.circle(0, 0, this.radius - 8).stroke({ color: COLOR_WHITE, width: 1, alpha: 0.26 });
    g.circle(0, 0, innerBandRadius).fill({ color: WHEEL_THEME.rimDark, alpha: 0.72 });
    g.circle(0, 0, innerBandRadius).stroke({
      color: WHEEL_THEME.rim,
      width: Math.max(2, this.radius * 0.012),
      alpha: 0.8,
    });
    g.circle(0, 0, innerBandRadius * 0.78).stroke({ color: COLOR_WHITE, width: 1, alpha: 0.16 });

    for (let i = 0; i < n; i += 1) {
      const midA = -Math.PI / 2 + (i + 0.5) * segAngle;
      const px = Math.cos(midA) * (this.radius + 4);
      const py = Math.sin(midA) * (this.radius + 4);
      const bulbRadius = Math.max(2.2, Math.min(5, this.radius * 0.015));
      g.circle(px, py, bulbRadius).fill({ color: WHEEL_THEME.bulb, alpha: n > 30 ? 0.55 : 0.78 });
    }

    // 倍率文字：先畫成一張 canvas texture，再掛到輪盤容器，避免大量旋轉 Text 造成 WebGL 字形碎片。
    const labelFontSize =
      n <= 20
        ? Math.max(15, Math.min(28, this.radius * 0.105))
        : n <= 30
          ? Math.max(10, Math.min(16, this.radius * 0.062))
          : n <= 40
            ? Math.max(8.5, Math.min(13, this.radius * 0.052))
            : Math.max(7.5, Math.min(11, this.radius * 0.046));
    const labelRadius = this.radius * (n <= 20 ? 0.7 : n <= 30 ? 0.74 : 0.77);
    const labelPadding = 26;
    const labelSize = Math.ceil((this.radius + labelPadding) * 2);
    const labelScale = Math.min(2, Math.max(1, globalThis.devicePixelRatio || 1));
    const labelCanvas = document.createElement('canvas');
    labelCanvas.width = Math.ceil(labelSize * labelScale);
    labelCanvas.height = Math.ceil(labelSize * labelScale);
    const ctx = labelCanvas.getContext('2d');
    if (!ctx) return;
    ctx.scale(labelScale, labelScale);
    ctx.translate(labelSize / 2, labelSize / 2);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${labelFontSize}px ${GAME_FONT}`;
    for (let i = 0; i < n; i += 1) {
      const m = this.multipliers[i]!;
      const paint = this.getSegmentPaint(m);
      const midA = -Math.PI / 2 + (i + 0.5) * segAngle;
      const tx = Math.cos(midA) * labelRadius;
      const ty = Math.sin(midA) * labelRadius;
      ctx.save();
      ctx.translate(tx, ty);
      ctx.rotate(midA + Math.PI / 2);
      ctx.globalAlpha = n > 30 && m <= 0 ? 0.78 : 0.94;
      ctx.fillStyle = `#${paint.textColor.toString(16).padStart(6, '0')}`;
      ctx.fillText(this.formatMultiplierLabel(m), 0, 0);
      ctx.restore();
    }
    const labelSprite = new Sprite(Texture.from(labelCanvas));
    labelSprite.anchor.set(0.5);
    labelSprite.width = labelSize;
    labelSprite.height = labelSize;
    this.wheelContainer?.addChild(labelSprite);
  }

  private formatMultiplierLabel(multiplier: number): string {
    if (multiplier <= 0) return '0×';
    if (multiplier >= 10) return `${multiplier.toFixed(1).replace(/\.0$/, '')}×`;
    return `${multiplier.toFixed(2).replace(/\.?0+$/, '')}×`;
  }

  /**
   * 播放旋轉動畫
   * segmentIndex = 最終落在哪段（0-based, 從正上方順時針）
   * multiplier = 該段倍率
   */
  /**
   * 樂觀動畫：按下 SPIN 立刻呼叫 — 輪盤開始高速旋轉（無結果）。
   * API 回來呼叫 playSpin(...) 無縫接續到目標段減速。
   */
  startAnticipation(): void {
    if (!this.wheelContainer) return;
    this.spinning = true;
    gsap.killTweensOf(this.wheelContainer);
    gsap.to(this.wheelContainer, {
      rotation: `+=${Math.PI * 4}`,
      duration: 1.4,
      ease: 'none',
      repeat: -1,
    });
  }

  stopAnticipation(): void {
    if (!this.wheelContainer) return;
    gsap.killTweensOf(this.wheelContainer);
    const stopTarget = this.wheelContainer.rotation + TAU * 0.35;
    gsap.to(this.wheelContainer, {
      rotation: stopTarget,
      duration: 0.55,
      ease: 'power3.out',
      onComplete: () => {
        this.spinning = false;
      },
    });
  }

  async playSpin(segmentIndex: number, multiplier: number): Promise<void> {
    if (!this.wheelContainer) return;
    // 清除 anticipation 的無限旋轉
    gsap.killTweensOf(this.wheelContainer);
    const n = this.multipliers.length;
    const segAngle = TAU / n;

    // 讓 segmentIndex 轉到正上方（指針位置）
    // 因為 drawWheel 中 segment i 的中心在 -PI/2 + (i+0.5)*segAngle
    // 要讓該段中心對齊 -PI/2（正上方），輪盤旋轉角度 theta 使得
    // -PI/2 + (i+0.5)*segAngle + theta === -PI/2 (mod 2π)
    // => theta = -(i+0.5)*segAngle
    const targetBase = normalizeAngle(-((segmentIndex + 0.5) * segAngle));
    const spins = 5 + Math.floor(Math.random() * 2);
    const startRot = this.wheelContainer.rotation;
    const target =
      startRot +
      spins * TAU +
      positiveAngleDelta(normalizeAngle(startRot), targetBase);

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          if (this.wheelContainer) this.wheelContainer.rotation = targetBase;
          this.spinning = false;
          this.onLand(segmentIndex, multiplier);
          resolve();
        },
      });

      tl.to(this.wheelContainer, {
        rotation: target,
        duration: 4.8,
        ease: 'power4.out',
      });

      // 指針彈跳：每轉過一段就彈一下
      // 為簡化：在最後 0.8 秒每 0.15 秒彈一次
      const bounceStart = 3.65;
      for (let i = 0; i < 6; i += 1) {
        if (this.pointerContainer) {
          tl.to(
            this.pointerContainer,
            {
              rotation: 0.2,
              duration: 0.05,
              ease: 'power2.out',
              yoyo: true,
              repeat: 1,
            },
            bounceStart + i * 0.15,
          );
        }
      }
    });
  }

  private onLand(segmentIndex: number, multiplier: number): void {
    // 落點位置（世界座標）
    const n = this.multipliers.length;
    const segAngle = (Math.PI * 2) / n;
    // 落點在輪盤 -PI/2 方向（正上方），經過旋轉後仍是世界座標上方
    const landX = this.cx;
    const landY = this.cy - this.radius + 20;

    if (multiplier > 0) {
      // L4 tier-based
      let color = COLOR_TOXIC;
      if (multiplier >= 5) color = COLOR_EMBER;
      else if (multiplier >= 2) color = COLOR_AMBER;
      const tier = classifyWinTier(multiplier, true);
      const cfg = TIER_CONFIG[tier];

      this.emitShockwave(landX, landY, color, 150);
      this.emitShockwave(this.cx, this.cy, color, this.radius * 1.5, 0.1);
      this.particlePool?.emit({
        x: landX,
        y: landY,
        count: cfg.particles || 25,
        colors: [color, COLOR_WHITE, COLOR_ICE],
        speedMin: 3,
        speedMax: 10,
        angleRad: -Math.PI / 2,
        spreadRad: Math.PI,
      });
      if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
      if (this.app && cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, color, cfg.edgeGlowMs / 1000);
      if (this.app && cfg.rayBurst) emitRayBurst(this.app.stage, this.app, this.cx, this.cy, color, 1.2);
      // L4 強化：落點 emit glow burst 強化儀式感
      if (this.app && !prefersReducedMotion()) {
        emitGlowBurst(this.app.stage, landX, landY, color, {
          radius: 60 + Math.min(80, multiplier * 6),
          peakBlur: 18,
          durationSec: 0.5,
        });
      }
    } else {
      // 0 倍：安靜
      this.emitShockwave(landX, landY, COLOR_GRAY, 70);
    }

    // 指針輕微彈一下
    if (this.pointerContainer) {
      gsap.fromTo(
        this.pointerContainer,
        { rotation: 0.3 },
        { rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' },
      );
    }

    // unused var
    void segmentIndex;
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 8, alpha: 0.85 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: 0.8,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        ring.clear().circle(x, y, state.r).stroke({ color, width: 3, alpha: state.alpha });
      },
      onComplete: () => {
        this.shockwaves?.removeChild(ring);
        ring.destroy();
      },
    });
  }

  private emitParticles(x: number, y: number, count: number, colors: number[]): void {
    if (!this.particles) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      const size = 2 + Math.random() * 4;
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      const g = new Graphics();
      if (Math.random() > 0.5) g.rect(-size / 2, -size / 2, size, size).fill({ color });
      else g.circle(0, 0, size).fill({ color });
      g.x = x;
      g.y = y;
      this.particles.addChild(g);
      this.particleList.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 40 + Math.random() * 30,
        maxLife: 70,
        gravity: 0.15,
      });
    }
  }

  private cameraShake(intensity: number, duration: number): void {
    if (!this.app) return;
    const stage = this.app.stage;
    const origX = stage.x;
    const origY = stage.y;
    const state = { t: 0 };
    gsap.to(state, {
      t: 1,
      duration,
      ease: 'power2.out',
      onUpdate: () => {
        if (!this.app) return;
        const decay = 1 - state.t;
        stage.x = origX + (Math.random() - 0.5) * intensity * 2 * decay;
        stage.y = origY + (Math.random() - 0.5) * intensity * 2 * decay;
      },
      onComplete: () => {
        if (!this.app) return;
        stage.x = origX;
        stage.y = origY;
      },
    });
  }

  dispose(): void {
    if (this.ambientTicker && this.app) this.app.ticker.remove(this.ambientTicker);
    if (this.particleTicker && this.app) this.app.ticker.remove(this.particleTicker);
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.winFx?.dispose();
    this.winFx = null;
    if (this.wheelContainer) gsap.killTweensOf(this.wheelContainer);
    if (this.pointerContainer) gsap.killTweensOf(this.pointerContainer);
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.wheelContainer = null;
    this.wheelGraphics = null;
    this.pointerContainer = null;
    this.centerHub = null;
    this.particles = null;
    this.shockwaves = null;
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
