import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
  BlurFilter,
} from 'pixi.js';
import { gsap } from 'gsap';
import {
  ParticlePool,
  ShakeController,
  classifyWinTier,
  TIER_CONFIG,
  EASE,
  emitEdgeGlow,
  emitRayBurst,
  prewarmShaders,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG_A = 0x0C4632;
const COLOR_BG_B = 0x0A0806;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x86B49C;
const COLOR_AMBER = 0xC9A24C;
const COLOR_WHITE = 0xffffff;

export type CrashVariant = 'rocket' | 'aviator' | 'balloon' | 'jet' | 'fleet' | 'default';

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  fadeStart: number;
}

interface Star {
  g: Graphics;
  speed: number;
  baseAlpha: number;
}

export class CrashScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private variant: CrashVariant = 'rocket';

  // Layers
  private starfield: Container | null = null;
  private curveLayer: Graphics | null = null;
  private craftContainer: Container | null = null;
  private craft: Container | null = null;
  private trail: Container | null = null;
  private particles: Container | null = null;
  private overlayGlow: Graphics | null = null;
  private flashOverlay: Graphics | null = null;

  // Text
  private multiplierLabel: Text | null = null;
  private statusLabel: Text | null = null;

  // State
  private stars: Star[] = [];
  private particleList: Particle[] = [];
  private trailDots: Particle[] = [];
  private curvePoints: { x: number; y: number }[] = [];
  private currentMultiplier = 1.0;
  private maxMultiplier = 2.0;
  private phase: 'idle' | 'betting' | 'running' | 'crashed' = 'idle';
  private countdownSeconds = 0;

  // Tickers
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;
  private craftTicker: ((tk: Ticker) => void) | null = null;

  // L4
  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private vignette: Graphics | null = null;
  private tensionStart = 0;
  private winFx: WinCelebration | null = null;


  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    variant: CrashVariant = 'rocket',
  ): Promise<void> {
    this.width = width;
    this.height = height;
    this.variant = variant;

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

    this.createBackground();
    this.starfield = new Container();
    app.stage.addChild(this.starfield);
    this.createStars();
    this.createAxisLabels();

    this.curveLayer = new Graphics();
    app.stage.addChild(this.curveLayer);

    this.trail = new Container();
    app.stage.addChild(this.trail);

    this.particles = new Container();
    app.stage.addChild(this.particles);

    this.craftContainer = new Container();
    app.stage.addChild(this.craftContainer);
    this.createCraft();

    // Flash overlay for crash
    this.flashOverlay = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: COLOR_EMBER, alpha: 0 });
    app.stage.addChild(this.flashOverlay);

    this.overlayGlow = new Graphics();
    app.stage.addChild(this.overlayGlow);

    // L4 tension vignette：越高倍率越暗、越聚焦中心
    this.vignette = new Graphics();
    this.vignette.rect(0, 0, width, height).fill({ color: 0x000000, alpha: 0 });
    app.stage.addChild(this.vignette);

    // L4 pool + shaker
    this.particlePool = new ParticlePool(app.stage, 250);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.createLabels();
    this.startTickers();
  }

  private createBackground(): void {
    if (!this.app) return;
    // Dark gradient background (crash 需要深色襯托 neon)
    const bg = new Graphics();
    // 用多層圓同心模擬漸層
    const steps = 10;
    for (let i = 0; i < steps; i += 1) {
      const alpha = (i / steps) * 0.4;
      const w = this.width - i * 8;
      const h = this.height - i * 8;
      bg.rect((this.width - w) / 2, (this.height - h) / 2, w, h).fill({
        color: COLOR_BG_A,
        alpha: alpha * 0.15,
      });
    }
    bg.rect(0, 0, this.width, this.height).fill({ color: COLOR_BG_B, alpha: 0.85 });
    this.app.stage.addChild(bg);

    // 徑向光暈（紫色核心）
    const glow = new Graphics()
      .circle(this.width * 0.5, this.height * 0.5, this.width * 0.5)
      .fill({ color: COLOR_ACID, alpha: 0.15 });
    glow.filters = [new BlurFilter({ strength: 60 })];
    this.app.stage.addChild(glow);

    // 底部光帶
    const bottomBar = new Graphics()
      .rect(0, this.height - 2, this.width, 2)
      .fill({ color: COLOR_ACID, alpha: 0.4 });
    this.app.stage.addChild(bottomBar);

    // 網格（座標系）
    const grid = new Graphics();
    const cols = 8;
    const rows = 5;
    for (let i = 0; i <= cols; i += 1) {
      const x = (this.width / cols) * i;
      grid.moveTo(x, 0).lineTo(x, this.height).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.05,
      });
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = (this.height / rows) * i;
      grid.moveTo(0, y).lineTo(this.width, y).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.05,
      });
    }
    this.app.stage.addChild(grid);
  }

  private createStars(): void {
    if (!this.starfield) return;
    // 3 層視差星空
    for (let layer = 0; layer < 3; layer += 1) {
      const count = layer === 0 ? 60 : layer === 1 ? 30 : 15;
      const baseSpeed = layer === 0 ? 0.3 : layer === 1 ? 0.6 : 1.2;
      for (let i = 0; i < count; i += 1) {
        const size = (layer === 2 ? 1.5 : layer === 1 ? 1 : 0.6) + Math.random() * 0.8;
        const baseAlpha = 0.3 + Math.random() * 0.5;
        const colors = [COLOR_WHITE, COLOR_ICE, COLOR_VIOLET];
        const color = colors[Math.floor(Math.random() * colors.length)]!;
        const g = new Graphics().circle(0, 0, size).fill({ color, alpha: baseAlpha });
        g.x = Math.random() * this.width;
        g.y = Math.random() * this.height;
        this.starfield.addChild(g);
        this.stars.push({ g, speed: baseSpeed, baseAlpha });
      }
    }
  }

  private createAxisLabels(): void {
    if (!this.app) return;
    // 多個倍率參考線（水平虛線）
    const labels = [
      { m: 1.5, y: this.height * 0.75 },
      { m: 2.0, y: this.height * 0.55 },
      { m: 5.0, y: this.height * 0.3 },
      { m: 10.0, y: this.height * 0.12 },
    ];
    for (const l of labels) {
      const line = new Graphics();
      for (let x = 20; x < this.width - 20; x += 10) {
        line.moveTo(x, l.y).lineTo(x + 5, l.y).stroke({
          color: COLOR_ACID,
          width: 1,
          alpha: 0.15,
        });
      }
      this.app.stage.addChild(line);

      const style = new TextStyle({
        fontFamily: 'IBM Plex Mono, monospace',
        fontSize: 11,
        fill: COLOR_ACID,
        fontWeight: '500',
      });
      const txt = new Text({ text: `${l.m.toFixed(1)}×`, style });
      txt.alpha = 0.4;
      txt.x = this.width - 40;
      txt.y = l.y - 14;
      this.app.stage.addChild(txt);
    }
  }

  private createCraft(): void {
    if (!this.craftContainer) return;
    const craft = new Container();
    craft.x = 60;
    craft.y = this.height - 60;
    this.craft = craft;
    this.craftContainer.addChild(craft);

    this.drawCraftShape(craft);
  }

  private drawCraftShape(craft: Container): void {
    craft.removeChildren();
    const g = new Graphics();
    const size = 34;

    switch (this.variant) {
      case 'rocket':
        // 火箭主體
        g.poly([
          0, -size * 1.2,
          size * 0.5, 0,
          size * 0.35, size * 0.6,
          -size * 0.35, size * 0.6,
          -size * 0.5, 0,
        ]).fill({ color: COLOR_WHITE });
        // 機身條紋
        g.rect(-size * 0.35, -size * 0.1, size * 0.7, size * 0.15).fill({ color: COLOR_ACID });
        // 窗戶
        g.circle(0, -size * 0.5, size * 0.18).fill({ color: COLOR_ICE });
        g.circle(0, -size * 0.5, size * 0.12).fill({ color: COLOR_BG_B });
        // 尾翼
        g.poly([-size * 0.5, 0, -size * 0.75, size * 0.5, -size * 0.35, size * 0.3]).fill({
          color: COLOR_EMBER,
        });
        g.poly([size * 0.5, 0, size * 0.75, size * 0.5, size * 0.35, size * 0.3]).fill({
          color: COLOR_EMBER,
        });
        // 尖端
        g.circle(0, -size * 1.2, 3).fill({ color: COLOR_AMBER });
        break;

      case 'aviator':
        // 飛機俯視
        g.ellipse(0, 0, size * 0.25, size * 0.9).fill({ color: COLOR_EMBER });
        g.rect(-size * 0.8, -size * 0.1, size * 1.6, size * 0.15).fill({ color: COLOR_WHITE });
        g.rect(-size * 0.3, size * 0.5, size * 0.6, size * 0.1).fill({ color: COLOR_WHITE });
        g.circle(0, -size * 0.5, size * 0.08).fill({ color: COLOR_ICE });
        break;

      case 'balloon':
        // 氣球
        g.circle(0, -size * 0.2, size * 0.6).fill({ color: COLOR_EMBER });
        g.ellipse(size * 0.2, -size * 0.4, size * 0.15, size * 0.1).fill({
          color: COLOR_WHITE,
          alpha: 0.5,
        });
        // 繩子
        g.moveTo(0, size * 0.4).lineTo(0, size * 0.8).stroke({
          color: COLOR_WHITE,
          width: 1,
        });
        // 吊籃
        g.rect(-size * 0.2, size * 0.8, size * 0.4, size * 0.2).fill({ color: COLOR_AMBER });
        break;

      case 'jet':
        // 噴射機
        g.poly([
          0, -size * 1.0,
          size * 0.2, -size * 0.3,
          size * 0.8, size * 0.2,
          size * 0.15, size * 0.1,
          size * 0.3, size * 0.7,
          0, size * 0.5,
          -size * 0.3, size * 0.7,
          -size * 0.15, size * 0.1,
          -size * 0.8, size * 0.2,
          -size * 0.2, -size * 0.3,
        ]).fill({ color: COLOR_ACID });
        // 駕駛艙
        g.ellipse(0, -size * 0.4, size * 0.12, size * 0.25).fill({ color: COLOR_ICE });
        break;

      case 'fleet':
        // 太空戰艦（三角形）
        g.poly([
          0, -size * 1.1,
          size * 0.8, size * 0.5,
          0, size * 0.3,
          -size * 0.8, size * 0.5,
        ]).fill({ color: COLOR_ACID });
        g.poly([
          0, -size * 0.7,
          size * 0.4, size * 0.2,
          -size * 0.4, size * 0.2,
        ]).fill({ color: COLOR_ICE });
        // 引擎光核
        g.circle(0, size * 0.1, size * 0.12).fill({ color: COLOR_AMBER });
        break;

      default:
        // Fallback：發光球體
        g.circle(0, 0, size * 0.5).fill({ color: COLOR_ACID });
        g.circle(0, 0, size * 0.3).fill({ color: COLOR_ICE });
        break;
    }

    craft.addChild(g);
  }

  private createLabels(): void {
    if (!this.app) return;
    // 主倍率數字
    const style = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize: Math.round(this.height * 0.32),
      fontWeight: '400',
      fill: COLOR_WHITE,
      align: 'center',
      letterSpacing: -4,
    });
    const label = new Text({ text: '1.00×', style });
    label.anchor.set(0.5);
    label.x = this.width / 2;
    label.y = this.height / 2;
    label.alpha = 0.95;
    this.multiplierLabel = label;
    this.app.stage.addChild(label);

    // 狀態 / 倒數文字
    const statusStyle = new TextStyle({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: Math.round(this.height * 0.05),
      fontWeight: '600',
      fill: COLOR_ACID,
      align: 'center',
      letterSpacing: 6,
    });
    const statusLabel = new Text({ text: 'WAITING…', style: statusStyle });
    statusLabel.anchor.set(0.5);
    statusLabel.x = this.width / 2;
    statusLabel.y = this.height * 0.82;
    statusLabel.alpha = 0.7;
    this.statusLabel = statusLabel;
    this.app.stage.addChild(statusLabel);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;

    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // 視差星空
      for (const star of this.stars) {
        star.g.x -= star.speed * tk.deltaTime * 0.5;
        if (star.g.x < -5) {
          star.g.x = this.width + 5;
          star.g.y = Math.random() * this.height;
        }
        star.g.alpha = star.baseAlpha * (0.6 + Math.sin(tick * 0.05 + star.speed) * 0.4);
      }

      // Idle / Betting：craft 懸停
      if (this.phase === 'idle' || this.phase === 'betting') {
        if (this.craft) {
          this.craft.y = this.height - 60 + Math.sin(tick * 0.04) * 8;
          this.craft.rotation = Math.sin(tick * 0.03) * 0.05;
        }
      }
    };
    this.app.ticker.add(this.ambientTicker);

    // 粒子更新
    this.particleTicker = (tk: Ticker) => {
      for (let i = this.particleList.length - 1; i >= 0; i -= 1) {
        const p = this.particleList[i]!;
        p.g.x += p.vx * tk.deltaTime;
        p.g.y += p.vy * tk.deltaTime;
        p.vy += p.gravity * tk.deltaTime;
        p.vx *= 0.99;
        p.life -= tk.deltaTime;
        const t = p.life / p.maxLife;
        p.g.alpha = t < p.fadeStart ? (t / p.fadeStart) * 0.9 : 0.9;
        p.g.scale.set(Math.max(0.1, t));
        if (p.life <= 0) {
          this.particles?.removeChild(p.g);
          p.g.destroy();
          this.particleList.splice(i, 1);
        }
      }

      // Trail 點
      for (let i = this.trailDots.length - 1; i >= 0; i -= 1) {
        const p = this.trailDots[i]!;
        p.life -= tk.deltaTime;
        const t = p.life / p.maxLife;
        p.g.alpha = Math.max(0, t * 0.8);
        p.g.scale.set(Math.max(0.1, t));
        if (p.life <= 0) {
          this.trail?.removeChild(p.g);
          p.g.destroy();
          this.trailDots.splice(i, 1);
        }
      }
    };
    this.app.ticker.add(this.particleTicker);

    // 飛行狀態 — 持續更新 craft 位置 + 吐粒子
    let trailTick = 0;
    this.craftTicker = (tk: Ticker) => {
      if (this.phase !== 'running') return;
      trailTick += tk.deltaTime;

      // 計算 craft 位置
      const pos = this.multiplierToPosition(this.currentMultiplier);
      if (this.craft && this.craftContainer) {
        this.craft.x = pos.x;
        this.craft.y = pos.y;
        // 依加速度微旋轉
        const ratio = Math.min(1, (this.currentMultiplier - 1) / (this.maxMultiplier - 1));
        this.craft.rotation = -0.3 - ratio * 0.6; // 越飛越斜
        // 更換引擎粒子
        if (trailTick > 1) {
          trailTick = 0;
          this.emitTrail(pos.x, pos.y);
        }
      }

      // 更新曲線
      this.drawCurve();
    };
    this.app.ticker.add(this.craftTicker);
  }

  /**
   * 把 multiplier 映射到畫布座標。
   * 起點：左下 (60, height - 60)
   * 終點：右上 (width - 80, 80)
   * 曲線：指數爬升
   */
  private multiplierToPosition(m: number): { x: number; y: number } {
    const startX = 60;
    const startY = this.height - 60;
    const endX = this.width - 80;
    const topY = 80;

    // 以 log(m) 為 progress，映射 1→0, maxMultiplier→1
    const logMax = Math.log(this.maxMultiplier);
    const progress = logMax > 0 ? Math.min(1, Math.log(Math.max(1, m)) / logMax) : 0;

    const x = startX + (endX - startX) * progress;
    // y 使用 ease-out 曲線（起點平、後段陡）
    const yProgress = Math.pow(progress, 1.6);
    const y = startY - (startY - topY) * yProgress;

    return { x, y };
  }

  private drawCurve(): void {
    if (!this.curveLayer) return;
    const curve = this.curveLayer;
    curve.clear();

    if (this.currentMultiplier <= 1.0) return;

    // 收集曲線點
    const points: { x: number; y: number }[] = [];
    const steps = 40;
    for (let i = 0; i <= steps; i += 1) {
      const t = i / steps;
      const m = 1 + (this.currentMultiplier - 1) * t;
      points.push(this.multiplierToPosition(m));
    }
    this.curvePoints = points;

    // 外發光粗線
    const p0 = points[0]!;
    curve.moveTo(p0.x, p0.y);
    for (const p of points) curve.lineTo(p.x, p.y);
    const color = this.phase === 'crashed' ? COLOR_EMBER : COLOR_ACID;
    curve.stroke({ color, width: 10, alpha: 0.2 });

    // 中層
    curve.moveTo(p0.x, p0.y);
    for (const p of points) curve.lineTo(p.x, p.y);
    curve.stroke({ color, width: 5, alpha: 0.5 });

    // 核心亮線
    curve.moveTo(p0.x, p0.y);
    for (const p of points) curve.lineTo(p.x, p.y);
    curve.stroke({ color: COLOR_WHITE, width: 2, alpha: 0.95 });

    // 填充漸層區域（曲線下方）
    curve.moveTo(p0.x, p0.y);
    for (const p of points) curve.lineTo(p.x, p.y);
    const last = points[points.length - 1]!;
    curve.lineTo(last.x, this.height - 60);
    curve.lineTo(p0.x, this.height - 60);
    curve.closePath();
    curve.fill({ color, alpha: 0.1 });
  }

  private emitTrail(x: number, y: number): void {
    if (!this.trail) return;
    for (let i = 0; i < 3; i += 1) {
      const size = 3 + Math.random() * 4;
      const colors = [COLOR_AMBER, COLOR_EMBER, COLOR_WHITE];
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      const g = new Graphics().circle(0, 0, size).fill({ color });
      g.x = x + (Math.random() - 0.5) * 16;
      g.y = y + 15 + Math.random() * 10;
      this.trail.addChild(g);
      this.trailDots.push({
        g,
        vx: (Math.random() - 0.5) * 2,
        vy: 2 + Math.random() * 3,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        gravity: 0.1,
        fadeStart: 0.8,
      });
    }
  }

  // === 公開 API ===

  startBetting(seconds: number): void {
    this.phase = 'betting';
    this.countdownSeconds = seconds;
    this.currentMultiplier = 1.0;
    this.curveLayer?.clear();
    this.curvePoints = [];

    // 清空 trail
    if (this.trail) {
      this.trail.removeChildren();
      this.trailDots = [];
    }

    if (this.craft) {
      gsap.to(this.craft, {
        x: 60,
        y: this.height - 60,
        rotation: 0,
        duration: 0.6,
        ease: 'power2.out',
      });
    }

    if (this.multiplierLabel) {
      this.multiplierLabel.text = `${seconds}`;
      this.multiplierLabel.style.fill = COLOR_ACID;
      this.multiplierLabel.alpha = 1;
      gsap.fromTo(
        this.multiplierLabel.scale,
        { x: 1.4, y: 1.4 },
        { x: 1, y: 1, duration: 0.5, ease: 'back.out(1.8)' },
      );
    }
    if (this.statusLabel) {
      this.statusLabel.text = 'BETTING WINDOW';
      this.statusLabel.style.fill = COLOR_ACID;
    }
  }

  setCountdown(s: number): void {
    if (this.phase !== 'betting') return;
    this.countdownSeconds = s;
    if (this.multiplierLabel && s !== Number.parseInt(this.multiplierLabel.text, 10)) {
      this.multiplierLabel.text = `${s}`;
      gsap.fromTo(
        this.multiplierLabel.scale,
        { x: 1.25, y: 1.25 },
        { x: 1, y: 1, duration: 0.3, ease: 'back.out(1.8)' },
      );
    }
  }

  startRunning(): void {
    this.phase = 'running';
    this.currentMultiplier = 1.0;
    this.maxMultiplier = 2.0;
    this.tensionStart = performance.now() / 1000;
    if (this.statusLabel) {
      this.statusLabel.text = `PROVABLE ${Math.random().toString(16).slice(2, 10).toUpperCase()}`;
      this.statusLabel.style.fill = COLOR_TOXIC;
    }
    if (this.multiplierLabel) {
      this.multiplierLabel.text = '1.00×';
      this.multiplierLabel.style.fill = COLOR_WHITE;
      this.multiplierLabel.scale.set(1);
    }
    // reset vignette
    if (this.vignette) this.vignette.alpha = 0;
  }

  setMultiplier(m: number): void {
    const prevInt = Math.floor(this.currentMultiplier);
    this.currentMultiplier = m;
    // 動態擴展 max
    this.maxMultiplier = Math.max(this.maxMultiplier, m * 1.2, 2);

    if (this.multiplierLabel) {
      this.multiplierLabel.text = `${m.toFixed(2)}×`;
      const newInt = Math.floor(m);
      if (newInt > prevInt && newInt >= 2) {
        // L4 tension：倍率每過整數 punch scale + 色階更新
        gsap.fromTo(
          this.multiplierLabel.scale,
          { x: 1.12, y: 1.12 },
          { x: 1, y: 1, duration: 0.28, ease: EASE.back },
        );
        if (m >= 10) {
          this.multiplierLabel.style.fill = COLOR_AMBER;
        } else if (m >= 5) {
          this.multiplierLabel.style.fill = COLOR_EMBER;
        } else if (m >= 2) {
          this.multiplierLabel.style.fill = COLOR_TOXIC;
        }
      }
    }

    // L4 tension ramp：倍率越高 vignette 越暗（最多 0.4 alpha）
    if (this.vignette) {
      const target = Math.min(0.4, (m - 1) * 0.04);
      // 平滑插值避免跳動
      this.vignette.alpha += (target - this.vignette.alpha) * 0.08;
    }
  }

  crash(finalMultiplier: number): void {
    this.phase = 'crashed';
    this.currentMultiplier = finalMultiplier;

    // 全螢幕紅閃
    if (this.flashOverlay) {
      gsap.fromTo(
        this.flashOverlay,
        { alpha: 0.6 },
        { alpha: 0, duration: 0.8, ease: 'power2.out' },
      );
    }

    // 倍率數字變紅
    if (this.multiplierLabel) {
      this.multiplierLabel.text = `${finalMultiplier.toFixed(2)}×`;
      this.multiplierLabel.style.fill = COLOR_EMBER;
      gsap.fromTo(
        this.multiplierLabel.scale,
        { x: 1.3, y: 1.3 },
        { x: 1, y: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)' },
      );
    }

    if (this.statusLabel) {
      this.statusLabel.text = `CRASHED @ ${finalMultiplier.toFixed(2)}×`;
      this.statusLabel.style.fill = COLOR_EMBER;
    }

    // Craft 爆炸
    if (this.craft) {
      const cx = this.craft.x;
      const cy = this.craft.y;
      gsap.to(this.craft, {
        alpha: 0,
        duration: 0.3,
        ease: 'power2.in',
      });
      gsap.to(this.craft.scale, {
        x: 1.8,
        y: 1.8,
        duration: 0.3,
        ease: 'power2.out',
      });
      // 爆炸粒子
      this.emitExplosion(cx, cy);
    }

    // L4 camera shake — 崩盤震動強度隨倍率（越高越猛）
    const shakeAmp = Math.min(20, 10 + finalMultiplier * 0.5);
    this.shaker?.shake(shakeAmp, 0.7);

    // L4 邊緣紅 glow（崩盤 negative flourish）
    if (this.app) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_EMBER, 0.45);

    // 曲線變紅
    this.drawCurve();

    // L4 tension vignette 淡出（3s 後才恢復 betting）
    if (this.vignette) {
      gsap.to(this.vignette, { alpha: 0, duration: 2, ease: EASE.out });
    }
  }

  /** L4：玩家 cashout 成功時呼叫，依倍率觸發 tier 慶祝 */
  celebrateCashout(payoutMultiplier: number): void {
    if (!this.app) return;
    const tier = classifyWinTier(payoutMultiplier, true);
    const cfg = TIER_CONFIG[tier];
    const cx = this.width / 2;
    const cy = this.height / 2;
    if (cfg.particles > 0) {
      this.particlePool?.emit({
        x: cx,
        y: cy,
        count: cfg.particles,
        colors: [COLOR_TOXIC, COLOR_ICE, COLOR_ACID, 0xffffff],
        speedMin: 3,
        speedMax: 12,
      });
    }
    if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
    if (cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_TOXIC, cfg.edgeGlowMs / 1000);
    if (cfg.rayBurst) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_TOXIC, 1.2);
  }

  private emitExplosion(x: number, y: number): void {
    // L4 用 pool 取代 new
    this.particlePool?.emit({
      x,
      y,
      count: 80,
      colors: [COLOR_EMBER, COLOR_AMBER, COLOR_WHITE, COLOR_VIOLET],
      speedMin: 4,
      speedMax: 20,
      sizeMin: 2,
      sizeMax: 5,
      lifeMin: 50,
      lifeMax: 80,
      gravity: 0.3,
    });

    // 衝擊波
    this.emitShockwave(x, y, COLOR_EMBER, Math.max(this.width, this.height) * 0.4);
    this.emitShockwave(x, y, COLOR_AMBER, Math.max(this.width, this.height) * 0.55, 0.12);
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.overlayGlow) return;
    const ring = new Graphics();
    this.app?.stage.addChild(ring);
    const state = { r: 10, alpha: 0.8 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: 1.0,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        ring.clear().circle(x, y, state.r).stroke({ color, width: 6, alpha: state.alpha });
      },
      onComplete: () => {
        this.app?.stage.removeChild(ring);
        ring.destroy();
      },
    });
  }

  playWinCashout(cashoutMultiplier: number): void {
    // 玩家自己領取時播快閃綠色特效
    if (!this.craft) return;
    const cx = this.craft.x;
    const cy = this.craft.y;
    this.emitShockwave(cx, cy, COLOR_TOXIC, 200);
    if (!this.particles) return;
    for (let i = 0; i < 30; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 10;
      const size = 2 + Math.random() * 3;
      const g = new Graphics()
        .circle(0, 0, size)
        .fill({ color: Math.random() > 0.5 ? COLOR_TOXIC : COLOR_ICE });
      g.x = cx;
      g.y = cy;
      this.particles.addChild(g);
      this.particleList.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 2,
        life: 40,
        maxLife: 40,
        gravity: 0.15,
        fadeStart: 0.6,
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
        const decay = 1 - state.t;
        stage.x = origX + (Math.random() - 0.5) * intensity * 2 * decay;
        stage.y = origY + (Math.random() - 0.5) * intensity * 2 * decay;
      },
      onComplete: () => {
        stage.x = origX;
        stage.y = origY;
      },
    });
  }

  dispose(): void {
    if (this.ambientTicker && this.app) this.app.ticker.remove(this.ambientTicker);
    if (this.particleTicker && this.app) this.app.ticker.remove(this.particleTicker);
    if (this.craftTicker && this.app) this.app.ticker.remove(this.craftTicker);
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.vignette = null;
    this.winFx?.dispose();
    this.winFx = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.starfield = null;
    this.curveLayer = null;
    this.craftContainer = null;
    this.craft = null;
    this.trail = null;
    this.particles = null;
    this.overlayGlow = null;
    this.flashOverlay = null;
    this.multiplierLabel = null;
    this.statusLabel = null;
    this.stars = [];
    this.particleList = [];
    this.trailDots = [];
    this.curvePoints = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
