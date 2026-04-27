import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
  Text,
  TextStyle,
  Texture,
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
  emitGlowBurst,
  emitRayBurst,
  prewarmShaders,
  motionScale,
  prefersReducedMotion,
  GAME_FONT,
  GAME_FONT_NUM,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG_A = 0x111C2E;
const COLOR_BG_B = 0x0B1322;
const COLOR_ACID = 0xF3D67D;
const COLOR_VIOLET = 0xE8D48A;
const COLOR_EMBER = 0xD4574A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x266F85;
const COLOR_AMBER = 0xF3D67D;
const COLOR_WHITE = 0xFFFFFF;

export type CrashVariant =
  | 'rocket'
  | 'aviator'
  | 'balloon'
  | 'jet'
  | 'fleet'
  | 'jet3'
  | 'double'
  | 'plinko'
  | 'default';

const ASSET_VARIANT: Record<CrashVariant, Exclude<CrashVariant, 'default'>> = {
  rocket: 'rocket',
  aviator: 'aviator',
  balloon: 'balloon',
  jet: 'jet',
  fleet: 'fleet',
  jet3: 'jet3',
  double: 'double',
  plinko: 'plinko',
  default: 'rocket',
};

const BACKGROUND_ASSETS: Record<Exclude<CrashVariant, 'default'>, string> = {
  rocket: '/crash/backgrounds/rocket.jpg',
  aviator: '/crash/backgrounds/aviator.jpg',
  balloon: '/crash/backgrounds/balloon.jpg',
  jet: '/crash/backgrounds/jet.jpg',
  fleet: '/crash/backgrounds/fleet.jpg',
  jet3: '/crash/backgrounds/jet3.jpg',
  double: '/crash/backgrounds/double.jpg',
  plinko: '/crash/backgrounds/plinko.jpg',
};

const CRAFT_ASSETS: Record<Exclude<CrashVariant, 'default'>, string> = {
  rocket: '/crash/craft/rocket.png',
  aviator: '/crash/craft/aviator.png',
  balloon: '/crash/craft/balloon.png',
  jet: '/crash/craft/jet.png',
  fleet: '/crash/craft/fleet.png',
  jet3: '/crash/craft/jet3.png',
  double: '/crash/craft/double.png',
  plinko: '/crash/craft/plinko.png',
};

const CRAFT_SPRITE_FORWARD_ANGLE: Record<Exclude<CrashVariant, 'default'>, number> = {
  rocket: -0.95,
  aviator: -0.18,
  balloon: -Math.PI / 2,
  jet: -0.62,
  fleet: -0.72,
  jet3: -0.62,
  double: -0.65,
  plinko: -0.55,
};

function fitSpriteCover(sprite: Sprite, width: number, height: number): void {
  const textureWidth = sprite.texture.width || width;
  const textureHeight = sprite.texture.height || height;
  const scale = Math.max(width / textureWidth, height / textureHeight);
  sprite.scale.set(scale);
  sprite.x = (width - textureWidth * scale) / 2;
  sprite.y = (height - textureHeight * scale) / 2;
}

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

interface FlightPoint {
  x: number;
  y: number;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
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
  private backgroundTexture: Texture | null = null;
  private craftTexture: Texture | null = null;
  private craftSprite: Sprite | null = null;
  private craftBaseScale = 1;

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

    await this.preloadVariantAssets();
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

  private async preloadVariantAssets(): Promise<void> {
    const assetVariant = ASSET_VARIANT[this.variant];
    const [backgroundTexture, craftTexture] = await Promise.all([
      Assets.load<Texture>(BACKGROUND_ASSETS[assetVariant]).catch(() => null),
      Assets.load<Texture>(CRAFT_ASSETS[assetVariant]).catch(() => null),
    ]);
    this.backgroundTexture = backgroundTexture;
    this.craftTexture = craftTexture;
  }

  private createBackground(): void {
    if (!this.app) return;

    const base = new Graphics().rect(0, 0, this.width, this.height).fill({
      color: COLOR_BG_B,
      alpha: 0.96,
    });
    this.app.stage.addChild(base);

    if (this.backgroundTexture) {
      const bgSprite = new Sprite(this.backgroundTexture);
      fitSpriteCover(bgSprite, this.width, this.height);
      bgSprite.alpha = 0.92;
      this.app.stage.addChild(bgSprite);
    } else {
      const fallback = new Graphics();
      const steps = 10;
      for (let i = 0; i < steps; i += 1) {
        const alpha = (i / steps) * 0.4;
        const w = this.width - i * 8;
        const h = this.height - i * 8;
        fallback.rect((this.width - w) / 2, (this.height - h) / 2, w, h).fill({
          color: COLOR_BG_A,
          alpha: alpha * 0.15,
        });
      }
      this.app.stage.addChild(fallback);
    }

    const shade = new Graphics()
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x020817, alpha: 0.3 });
    this.app.stage.addChild(shade);

    const centerReadability = new Graphics()
      .ellipse(this.width * 0.5, this.height * 0.5, this.width * 0.32, this.height * 0.28)
      .fill({ color: 0x020817, alpha: 0.36 });
    centerReadability.filters = [new BlurFilter({ strength: 46 })];
    this.app.stage.addChild(centerReadability);

    const glow = new Graphics()
      .circle(this.width * 0.5, this.height * 0.5, this.width * 0.45)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
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
        alpha: 0.035,
      });
    }
    for (let i = 0; i <= rows; i += 1) {
      const y = (this.height / rows) * i;
      grid.moveTo(0, y).lineTo(this.width, y).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.035,
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
        fontFamily: GAME_FONT_NUM,
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

    if (this.craftTexture) {
      const sprite = new Sprite(this.craftTexture);
      sprite.anchor.set(0.5);
      const targetSize = Math.min(118, Math.max(74, this.height * 0.26));
      const baseSize = Math.max(sprite.texture.width, sprite.texture.height);
      this.craftBaseScale = targetSize / baseSize;
      sprite.scale.set(this.craftBaseScale);
      this.craftSprite = sprite;
      craft.addChild(sprite);
      craft.rotation = this.getCraftRotation(1.02, 0, false);
      return;
    }

    this.craftSprite = null;
    this.craftBaseScale = 1;
    this.drawCraftShape(craft);
    craft.rotation = this.getCraftRotation(1.02, 0, false);
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
      fontFamily: GAME_FONT,
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
      fontFamily: GAME_FONT_NUM,
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
          const idle = this.idlePosition(tick);
          this.craft.x = idle.x;
          this.craft.y = idle.y;
          this.craft.rotation = this.getCraftRotation(1.02, tick, false);
          this.animateCraftSprite(tick, false);
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
        const flightAngle = this.flightTangentAngle(this.currentMultiplier);
        const intensity = prefersReducedMotion()
          ? 0
          : 0.7 + Math.min(1.8, Math.max(0, this.currentMultiplier - 1) * 0.18);
        const lateralShake =
          (Math.sin(tick * 0.58) + Math.sin(tick * 1.07) * 0.45) * intensity;
        const thrustShake = Math.sin(tick * 0.83) * intensity * 0.8;
        const perp = flightAngle + Math.PI / 2;

        this.craft.x =
          pos.x + Math.cos(flightAngle) * thrustShake + Math.cos(perp) * lateralShake;
        this.craft.y =
          pos.y + Math.sin(flightAngle) * thrustShake + Math.sin(perp) * lateralShake;
        this.craft.rotation = this.getCraftRotation(this.currentMultiplier, tick, true);
        this.animateCraftSprite(tick, true);
        // 更換引擎粒子
        if (trailTick > 1) {
          trailTick = 0;
          this.emitTrail(this.craft.x, this.craft.y, flightAngle);
        }
      }

      // 更新曲線
      this.drawCurve();
    };
    this.app.ticker.add(this.craftTicker);
  }

  /**
   * 把 multiplier 映射到畫布座標。
   * 不同飛行館使用不同 flight profile，讓視覺節奏不再都從左下飛到右上。
   */
  private multiplierToPosition(m: number): { x: number; y: number } {
    return this.positionAtProgress(this.flightProgress(m));
  }

  private flightProgress(m: number): number {
    const logMax = Math.log(this.maxMultiplier);
    return logMax > 0 ? Math.min(1, Math.log(Math.max(1, m)) / logMax) : 0;
  }

  private positionAtProgress(progress: number): FlightPoint {
    const t = Math.max(0, Math.min(1, progress));
    const w = this.width;
    const h = this.height;
    const edge = Math.max(42, Math.min(72, w * 0.12));
    const low = h - Math.max(46, h * 0.16);
    const high = Math.max(54, h * 0.16);
    const midY = h * 0.55;

    switch (ASSET_VARIANT[this.variant]) {
      case 'rocket': {
        // Rocket：像發射台一樣由底部垂直升空，帶一點風切偏移。
        const y = low - (low - high) * Math.pow(t, 1.08);
        const x = w * 0.5 + Math.sin(t * Math.PI * 1.35) * w * 0.045;
        return { x, y };
      }
      case 'aviator': {
        // Aviator：先沿跑道低空滑行，再弧線離場。
        const climb = Math.pow(Math.max(0, (t - 0.16) / 0.84), 1.45);
        const x = edge + (w - edge * 1.35 - edge) * easeOutCubic(t);
        const y = low + h * 0.035 * Math.sin(t * Math.PI * 1.8) - (low - high) * climb;
        return { x, y };
      }
      case 'fleet': {
        // Fleet：反方向攔截，從右下切往左上。
        const x = w - edge - (w - edge * 2.2) * easeInOutSine(t);
        const y = low - (low - high) * Math.pow(t, 1.22) + Math.sin(t * Math.PI * 2.2) * h * 0.035;
        return { x, y };
      }
      case 'jet': {
        // JetX：低空高速橫移，後段急速拉升。
        const pull = Math.pow(Math.max(0, (t - 0.38) / 0.62), 1.35);
        const x = edge + (w - edge * 1.35 - edge) * t;
        const y = h * 0.7 - h * 0.04 * Math.sin(t * Math.PI * 2.2) - (h * 0.58) * pull;
        return { x, y };
      }
      case 'balloon': {
        // Balloon：不走直線，像熱氣球被風推著慢慢漂高。
        const x = w * 0.38 + Math.sin(t * Math.PI * 1.55) * w * 0.16;
        const y = low - (low - high * 1.12) * Math.pow(t, 0.92);
        return { x, y };
      }
      case 'jet3': {
        // JetX3：三段式 S 型爬升，像多機編隊穿越。
        const x = w * 0.5 + Math.sin((t - 0.1) * Math.PI * 1.55) * w * 0.25;
        const y = low - (low - high) * Math.pow(t, 1.02);
        return { x, y };
      }
      case 'double': {
        // Double X：雙倍軌跡感，左右衝刺時上下波動。
        const x = edge + (w - edge * 2) * easeInOutSine(t);
        const y = midY + Math.sin(t * Math.PI * 2.35) * h * 0.12 - h * 0.32 * t;
        return { x, y };
      }
      case 'plinko': {
        // Plinko X：彈珠彈射感，沿途有短促折返波。
        const x = edge + (w - edge * 2) * t;
        const y = h * 0.74 - h * 0.56 * t + Math.sin(t * Math.PI * 5.5) * h * 0.045;
        return { x, y };
      }
      default: {
        const x = edge + (w - edge * 2) * t;
        const y = low - (low - high) * Math.pow(t, 1.6);
        return { x, y };
      }
    }
  }

  private idlePosition(tick: number): FlightPoint {
    const base = this.positionAtProgress(0);
    const assetVariant = ASSET_VARIANT[this.variant];
    const bob = Math.sin(tick * 0.04) * (assetVariant === 'balloon' ? 9 : 5);
    const sway = Math.sin(tick * 0.028) * (assetVariant === 'rocket' ? 1.5 : 2.5);
    return {
      x: base.x + sway,
      y: base.y + bob,
    };
  }

  private flightTangentAngle(m: number): number {
    const progress = Math.max(0.01, this.flightProgress(m));
    const a = this.positionAtProgress(Math.max(0, progress - 0.012));
    const b = this.positionAtProgress(Math.min(1, progress + 0.012));
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private getCraftRotation(m: number, tick: number, running: boolean): number {
    const assetVariant = ASSET_VARIANT[this.variant];
    if (assetVariant === 'balloon') {
      const progress = this.flightProgress(m);
      const lean = running ? -0.16 - progress * 0.18 : -0.08;
      return lean + Math.sin(tick * 0.06) * 0.045;
    }

    const forwardAngle = this.craftSprite
      ? CRAFT_SPRITE_FORWARD_ANGLE[assetVariant]
      : -Math.PI / 2;
    const flightAngle = this.flightTangentAngle(m);
    const engineWobble = prefersReducedMotion()
      ? 0
      : Math.sin(tick * 0.21) * 0.018 + Math.sin(tick * 0.63) * (running ? 0.026 : 0.012);
    return flightAngle - forwardAngle + engineWobble;
  }

  private animateCraftSprite(tick: number, running: boolean): void {
    if (!this.craftSprite) return;
    const throttle = running ? Math.min(1, Math.max(0, this.currentMultiplier - 1) / 4) : 0;
    const pulse = prefersReducedMotion()
      ? 1
      : 1 + Math.sin(tick * 0.72) * (running ? 0.018 : 0.01) + throttle * 0.018;
    this.craftSprite.scale.set(this.craftBaseScale * pulse);
    this.craftSprite.x = prefersReducedMotion()
      ? 0
      : Math.sin(tick * 0.46) * (running ? 1.8 + throttle * 1.5 : 0.7);
    this.craftSprite.y = prefersReducedMotion()
      ? 0
      : Math.sin(tick * 0.67) * (running ? 1.2 + throttle : 0.6);
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

  private emitTrail(x: number, y: number, flightAngle: number): void {
    if (!this.trail) return;
    const tailOffset = Math.min(54, Math.max(32, this.height * 0.12));
    const tailX = x - Math.cos(flightAngle) * tailOffset;
    const tailY = y - Math.sin(flightAngle) * tailOffset;
    const perp = flightAngle + Math.PI / 2;
    for (let i = 0; i < 3; i += 1) {
      const size = 3 + Math.random() * 4;
      const colors = [COLOR_AMBER, COLOR_EMBER, COLOR_WHITE];
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      const g = new Graphics().circle(0, 0, size).fill({ color });
      const spread = (Math.random() - 0.5) * 18;
      g.x = tailX + Math.cos(perp) * spread;
      g.y = tailY + Math.sin(perp) * spread;
      this.trail.addChild(g);
      const exhaustSpeed = 2.5 + Math.random() * 3.5;
      const drift = (Math.random() - 0.5) * 1.2;
      this.trailDots.push({
        g,
        vx: -Math.cos(flightAngle) * exhaustSpeed + Math.cos(perp) * drift,
        vy: -Math.sin(flightAngle) * exhaustSpeed + Math.sin(perp) * drift,
        life: 25 + Math.random() * 15,
        maxLife: 40,
        gravity: 0.1,
        fadeStart: 0.8,
      });
    }
  }

  private clearTrail(): void {
    if (!this.trail) return;
    const children = this.trail.removeChildren();
    for (const child of children) child.destroy();
    this.trailDots = [];
  }

  private restoreCraftVisuals(): void {
    if (!this.craft) return;
    gsap.killTweensOf(this.craft);
    gsap.killTweensOf(this.craft.scale);
    this.craft.visible = true;
    this.craft.alpha = 1;
    this.craft.scale.set(1);

    if (this.craftSprite) {
      gsap.killTweensOf(this.craftSprite);
      gsap.killTweensOf(this.craftSprite.scale);
      this.craftSprite.visible = true;
      this.craftSprite.alpha = 1;
      this.craftSprite.x = 0;
      this.craftSprite.y = 0;
      this.craftSprite.scale.set(this.craftBaseScale);
    }
  }

  // === 公開 API ===

  startBetting(seconds: number): void {
    this.phase = 'betting';
    this.countdownSeconds = seconds;
    this.currentMultiplier = 1.0;
    this.curveLayer?.clear();
    this.curvePoints = [];

    this.clearTrail();
    this.restoreCraftVisuals();

    if (this.craft) {
      const pos = this.positionAtProgress(0);
      gsap.to(this.craft, {
        x: pos.x,
        y: pos.y,
        alpha: 1,
        rotation: this.getCraftRotation(1.02, 0, false),
        duration: 0.6,
        ease: 'power2.out',
      });
      gsap.to(this.craft.scale, {
        x: 1,
        y: 1,
        duration: 0.45,
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

      // 最後 3 秒緊張感：色階 amber → ember，statusLabel pulse
      if (s <= 3 && s > 0) {
        const tense = s === 1 ? COLOR_EMBER : COLOR_AMBER;
        this.multiplierLabel.style.fill = tense;
        if (this.statusLabel) {
          this.statusLabel.style.fill = tense;
          gsap.fromTo(
            this.statusLabel,
            { alpha: 0.55 },
            { alpha: 1, duration: 0.45, ease: EASE.sineInOut, yoyo: true, repeat: 1 },
          );
        }
      } else {
        this.multiplierLabel.style.fill = COLOR_ACID;
      }
    }
  }

  startRunning(): void {
    this.phase = 'running';
    this.currentMultiplier = 1.0;
    this.maxMultiplier = 2.0;
    this.tensionStart = performance.now() / 1000;
    this.curveLayer?.clear();
    this.curvePoints = [];
    this.clearTrail();
    this.restoreCraftVisuals();
    if (this.craft) {
      const pos = this.multiplierToPosition(1);
      this.craft.x = pos.x;
      this.craft.y = pos.y;
      this.craft.rotation = this.getCraftRotation(1.02, 0, true);
    }
    if (this.statusLabel) {
      this.statusLabel.text = '';
      this.statusLabel.style.fill = COLOR_WHITE;
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

        // 整數倍率穿越時：在 craft 位置噴一個小 glow burst
        if (this.craft && this.app && !prefersReducedMotion()) {
          const color = m >= 10 ? COLOR_AMBER : m >= 5 ? COLOR_EMBER : COLOR_TOXIC;
          emitGlowBurst(this.app.stage, this.craft.x, this.craft.y, color, {
            radius: 36 + Math.min(60, m * 1.5),
            peakBlur: 14,
            durationSec: 0.42,
          });
          // 5x+ 同步噴 sparkle 粒子（追加 trail 之外的）
          if (m >= 5) {
            this.particlePool?.emit({
              x: this.craft.x,
              y: this.craft.y,
              count: Math.round(motionScale(8 + Math.min(20, m), 0.4)),
              colors: [color, COLOR_WHITE, COLOR_AMBER],
              speedMin: 2,
              speedMax: 6,
              sizeMin: 1.5,
              sizeMax: 3.5,
              lifeMin: 30,
              lifeMax: 60,
              gravity: 0.05,
              spreadRad: Math.PI * 1.4,
              angleRad: -Math.PI / 2,
              shape: 'mixed',
            });
          }
        }
      }
    }

    // L4 tension ramp：倍率越高 vignette 越暗（最多 0.5 alpha）
    if (this.vignette) {
      const target = Math.min(0.5, (m - 1) * 0.05);
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

    // L4 tension vignette → 紅色慢呼吸後再淡出
    if (this.vignette) {
      gsap.killTweensOf(this.vignette);
      gsap.to(this.vignette, { alpha: 0.35, duration: 0.18, ease: EASE.out });
      gsap.to(this.vignette, {
        alpha: 0.18,
        duration: 0.7,
        delay: 0.18,
        ease: EASE.sineInOut,
        yoyo: true,
        repeat: 1,
      });
      gsap.to(this.vignette, {
        alpha: 0,
        duration: 1.4,
        delay: 1.78,
        ease: EASE.out,
      });
    }

    // 失敗 statusLabel 呼吸提示
    if (this.statusLabel && !prefersReducedMotion()) {
      gsap.fromTo(
        this.statusLabel,
        { alpha: 0.6 },
        { alpha: 1, duration: 0.55, ease: EASE.sineInOut, yoyo: true, repeat: 3 },
      );
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
    this.app?.destroy(false, { children: true });
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
