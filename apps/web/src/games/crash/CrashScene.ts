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

const COLOR_BG_A = 0x111c2e;
const COLOR_BG_B = 0x0b1322;
const COLOR_ACID = 0xf3d67d;
const COLOR_VIOLET = 0xe8d48a;
const COLOR_EMBER = 0xd4574a;
const COLOR_TOXIC = 0x1e7a4f;
const COLOR_ICE = 0x266f85;
const COLOR_AMBER = 0xf3d67d;
const COLOR_WHITE = 0xffffff;
const COMPACT_STAGE_WIDTH = 700;
const SOLO_SCENE_GROWTH_RATE = 0.00072;

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

function formatCrashMultiplier(value: number): string {
  return `${value.toFixed(1)}×`;
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

export class CrashScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private variant: CrashVariant = 'rocket';

  // Layers
  private backgroundLayer: Container | null = null;
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
  private backgroundTileWidth = 0;
  private backgroundTileHeight = 0;
  private cameraOffsetX = 0;
  private cameraOffsetY = 0;

  // Text
  private multiplierLabel: Text | null = null;
  private statusLabel: Text | null = null;

  // State
  private stars: Star[] = [];
  private particleList: Particle[] = [];
  private trailDots: Particle[] = [];
  private curvePoints: { x: number; y: number }[] = [];
  private currentMultiplier = 1.0;
  private targetMultiplier = 1.0;
  private crashLimit: number | null = null;
  private preflightMultiplierCap: number | null = null;
  private lastEffectMultiplier = 1.0;
  private lastCurveRenderMultiplier = 0;
  private lastCurveCameraX = 0;
  private lastCurveCameraY = 0;
  private runningStartedAtMs = 0;
  private maxMultiplier = 2.0;
  private phase: 'idle' | 'betting' | 'running' | 'crashed' = 'idle';
  private countdownSeconds = 0;
  private reducedMotion = false;

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
    this.reducedMotion = prefersReducedMotion();

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

    const backgroundLayer = new Container();
    this.backgroundLayer = backgroundLayer;
    this.app.stage.addChild(backgroundLayer);

    if (this.backgroundTexture) {
      const bgSprite = new Sprite(this.backgroundTexture);
      fitSpriteCover(bgSprite, this.width, this.height);
      bgSprite.alpha = 0.92;
      const tileWidth = Math.max(this.width, bgSprite.width || this.width);
      const tileHeight = Math.max(this.height, bgSprite.height || this.height);
      this.backgroundTileWidth = tileWidth;
      this.backgroundTileHeight = tileHeight;
      for (let xIndex = -1; xIndex <= 2; xIndex += 1) {
        for (let yIndex = -1; yIndex <= 2; yIndex += 1) {
          const tile = xIndex === 0 && yIndex === 0 ? bgSprite : new Sprite(this.backgroundTexture);
          if (xIndex !== 0 || yIndex !== 0) fitSpriteCover(tile, this.width, this.height);
          tile.alpha = 0.92;
          tile.x += xIndex * tileWidth;
          tile.y += yIndex * tileHeight;
          backgroundLayer.addChild(tile);
        }
      }
    } else {
      this.backgroundTileWidth = this.width;
      this.backgroundTileHeight = this.height;
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
      backgroundLayer.addChild(fallback);
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
    const gridTileWidth = this.backgroundTileWidth || this.width;
    const gridTileHeight = this.backgroundTileHeight || this.height;
    const gridStartX = -gridTileWidth;
    const gridEndX = gridTileWidth * 3;
    const gridStartY = -gridTileHeight;
    const gridEndY = gridTileHeight * 3;
    for (let x = gridStartX; x <= gridEndX; x += this.width / cols) {
      grid.moveTo(x, gridStartY).lineTo(x, gridEndY).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.035,
      });
    }
    for (let y = gridStartY; y <= gridEndY; y += this.height / rows) {
      grid.moveTo(gridStartX, y).lineTo(gridEndX, y).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.035,
      });
    }
    backgroundLayer.addChild(grid);
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
        line
          .moveTo(x, l.y)
          .lineTo(x + 5, l.y)
          .stroke({
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
          0,
          -size * 1.2,
          size * 0.5,
          0,
          size * 0.35,
          size * 0.6,
          -size * 0.35,
          size * 0.6,
          -size * 0.5,
          0,
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
        g.moveTo(0, size * 0.4)
          .lineTo(0, size * 0.8)
          .stroke({
            color: COLOR_WHITE,
            width: 1,
          });
        // 吊籃
        g.rect(-size * 0.2, size * 0.8, size * 0.4, size * 0.2).fill({ color: COLOR_AMBER });
        break;

      case 'jet':
        // 噴射機
        g.poly([
          0,
          -size * 1.0,
          size * 0.2,
          -size * 0.3,
          size * 0.8,
          size * 0.2,
          size * 0.15,
          size * 0.1,
          size * 0.3,
          size * 0.7,
          0,
          size * 0.5,
          -size * 0.3,
          size * 0.7,
          -size * 0.15,
          size * 0.1,
          -size * 0.8,
          size * 0.2,
          -size * 0.2,
          -size * 0.3,
        ]).fill({ color: COLOR_ACID });
        // 駕駛艙
        g.ellipse(0, -size * 0.4, size * 0.12, size * 0.25).fill({ color: COLOR_ICE });
        break;

      case 'fleet':
        // 太空戰艦（三角形）
        g.poly([
          0,
          -size * 1.1,
          size * 0.8,
          size * 0.5,
          0,
          size * 0.3,
          -size * 0.8,
          size * 0.5,
        ]).fill({ color: COLOR_ACID });
        g.poly([0, -size * 0.7, size * 0.4, size * 0.2, -size * 0.4, size * 0.2]).fill({
          color: COLOR_ICE,
        });
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
    const compact = this.isCompactStage();
    // 主倍率數字
    const style = new TextStyle({
      fontFamily: GAME_FONT,
      fontSize: Math.round(this.height * (compact ? 0.25 : 0.3)),
      fontWeight: '400',
      fill: COLOR_WHITE,
      align: 'center',
      letterSpacing: compact ? -2 : -4,
    });
    const label = new Text({ text: formatCrashMultiplier(1), style });
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

      this.advanceRunningMultiplier(tk.deltaTime);

      // 計算 craft 位置
      this.updateCameraForMultiplier(this.currentMultiplier, tk.deltaTime);
      const pos = this.multiplierToPosition(this.currentMultiplier);
      if (this.craft && this.craftContainer) {
        const flightAngle = this.flightTangentAngle(this.currentMultiplier);
        const intensity = this.reducedMotion
          ? 0
          : 0.7 + Math.min(1.8, Math.max(0, this.currentMultiplier - 1) * 0.18);
        const lateralShake = (Math.sin(tick * 0.58) + Math.sin(tick * 1.07) * 0.45) * intensity;
        const thrustShake = Math.sin(tick * 0.83) * intensity * 0.8;
        const perp = flightAngle + Math.PI / 2;

        this.craft.x = pos.x + Math.cos(flightAngle) * thrustShake + Math.cos(perp) * lateralShake;
        this.craft.y = pos.y + Math.sin(flightAngle) * thrustShake + Math.sin(perp) * lateralShake;
        this.craft.rotation = this.getCraftRotation(this.currentMultiplier, tick, true);
        this.animateCraftSprite(tick, true);
        // 更換引擎粒子
        if (trailTick > (this.isCompactStage() ? 2.2 : 1.4)) {
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
   * 一般飛行館統一由左下往右上，熱氣球則保持中線垂直上升。
   */
  private multiplierToPosition(m: number): { x: number; y: number } {
    const world = this.multiplierToWorldPosition(m);
    return {
      x: world.x - this.cameraOffsetX,
      y: world.y + this.cameraOffsetY,
    };
  }

  private multiplierToWorldPosition(m: number): FlightPoint {
    return this.positionAtProgress(this.flightProgress(m));
  }

  private updateCameraForMultiplier(m: number, deltaTime: number): void {
    const world = this.multiplierToWorldPosition(m);
    const followAnchor = this.width * (this.width < 520 ? 0.66 : 0.7);
    const followAnchorY = this.height * (this.height < 360 ? 0.36 : 0.32);
    const desiredX = Math.max(0, world.x - followAnchor);
    const desiredY = Math.max(0, followAnchorY - world.y);
    const easedDesiredX = this.reducedMotion ? desiredX * 0.45 : desiredX;
    const easedDesiredY = this.reducedMotion ? desiredY * 0.45 : desiredY;
    const ease = Math.min(1, (this.reducedMotion ? 0.08 : 0.18) * deltaTime);
    const nextX = this.cameraOffsetX + (easedDesiredX - this.cameraOffsetX) * ease;
    const nextY = this.cameraOffsetY + (easedDesiredY - this.cameraOffsetY) * ease;
    const cameraDeltaX = nextX - this.cameraOffsetX;
    const cameraDeltaY = nextY - this.cameraOffsetY;
    this.cameraOffsetX = nextX;
    this.cameraOffsetY = nextY;
    this.applyCameraScroll(cameraDeltaX, cameraDeltaY);
  }

  private resetCamera(): void {
    this.cameraOffsetX = 0;
    this.cameraOffsetY = 0;
    this.applyCameraScroll(0, 0);
  }

  private applyCameraScroll(cameraDeltaX: number, cameraDeltaY: number): void {
    const tileWidth = this.backgroundTileWidth || this.width || 1;
    const tileHeight = this.backgroundTileHeight || this.height || 1;
    if (this.backgroundLayer) {
      const scrollX = (((this.cameraOffsetX * 0.58) % tileWidth) + tileWidth) % tileWidth;
      const scrollY = (((this.cameraOffsetY * 0.42) % tileHeight) + tileHeight) % tileHeight;
      this.backgroundLayer.x = -scrollX;
      this.backgroundLayer.y = scrollY;
    }

    if (
      (Math.abs(cameraDeltaX) < 0.001 && Math.abs(cameraDeltaY) < 0.001) ||
      this.phase !== 'running'
    )
      return;

    for (const star of this.stars) {
      const parallax = 0.08 + star.speed * 0.08;
      star.g.x -= cameraDeltaX * parallax;
      star.g.y += cameraDeltaY * parallax;
      if (star.g.x < -8) {
        star.g.x = this.width + 8;
        star.g.y = Math.random() * this.height;
      } else if (star.g.x > this.width + 8) {
        star.g.x = -8;
        star.g.y = Math.random() * this.height;
      }
      if (star.g.y < -8) {
        star.g.y = this.height + 8;
        star.g.x = Math.random() * this.width;
      } else if (star.g.y > this.height + 8) {
        star.g.y = -8;
        star.g.x = Math.random() * this.width;
      }
    }

    for (const dot of this.trailDots) {
      dot.g.x -= cameraDeltaX;
      dot.g.y += cameraDeltaY;
    }
    for (const particle of this.particleList) {
      particle.g.x -= cameraDeltaX;
      particle.g.y += cameraDeltaY;
    }
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
    const low = this.isCompactStage()
      ? h - Math.max(112, h * 0.27)
      : h - Math.max(46, h * 0.16);
    const high = Math.max(54, h * 0.16);

    if (ASSET_VARIANT[this.variant] === 'balloon') {
      return {
        x: w * 0.5,
        y: low - (low - high) * Math.pow(t, 0.98),
      };
    }

    const x = edge + (w - edge * 2) * easeOutCubic(t);
    const y = low - (low - high) * Math.pow(t, 1.08);
    return { x, y };
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

  private isCompactStage(): boolean {
    return this.width <= COMPACT_STAGE_WIDTH;
  }

  private flightTangentAngle(m: number): number {
    const delta = Math.max(0.016, m * 0.012);
    const a = this.multiplierToWorldPosition(Math.max(1, m - delta));
    const b = this.multiplierToWorldPosition(m + delta);
    return Math.atan2(b.y - a.y, b.x - a.x);
  }

  private advanceRunningMultiplier(deltaTime: number): void {
    if (this.runningStartedAtMs > 0) {
      const elapsedMs = Math.max(0, performance.now() - this.runningStartedAtMs);
      const clockMultiplier = Math.exp(SOLO_SCENE_GROWTH_RATE * elapsedMs);
      const nextTarget =
        this.preflightMultiplierCap !== null && this.crashLimit === null
          ? Math.min(Math.max(this.targetMultiplier, clockMultiplier), this.preflightMultiplierCap)
          : Math.max(this.targetMultiplier, clockMultiplier);
      this.targetMultiplier = nextTarget;
    }

    const target = this.clampToCrashLimit(Math.max(1, this.targetMultiplier));
    this.maxMultiplier = Math.max(this.maxMultiplier, target * 1.2, 2);
    const diff = target - this.currentMultiplier;
    if (diff > 0.0001) {
      const catchup = diff > 0.12 ? 0.36 : 0.18;
      const alpha = Math.min(1, catchup * deltaTime);
      this.currentMultiplier += diff * alpha;
      if (target - this.currentMultiplier < 0.002) this.currentMultiplier = target;
    } else if (this.currentMultiplier > target) {
      this.currentMultiplier = target;
    }

    this.renderMultiplier(this.currentMultiplier);
  }

  private getCraftRotation(m: number, tick: number, running: boolean): number {
    const assetVariant = ASSET_VARIANT[this.variant];
    if (assetVariant === 'balloon') {
      return this.reducedMotion ? 0 : Math.sin(tick * 0.045) * (running ? 0.018 : 0.03);
    }

    const forwardAngle = this.craftSprite ? CRAFT_SPRITE_FORWARD_ANGLE[assetVariant] : -Math.PI / 2;
    const flightAngle = this.flightTangentAngle(m);
    const engineWobble = this.reducedMotion
      ? 0
      : Math.sin(tick * 0.21) * 0.018 + Math.sin(tick * 0.63) * (running ? 0.026 : 0.012);
    return flightAngle - forwardAngle + engineWobble;
  }

  private animateCraftSprite(tick: number, running: boolean): void {
    if (!this.craftSprite) return;
    const throttle = running ? Math.min(1, Math.max(0, this.currentMultiplier - 1) / 4) : 0;
    const pulse = this.reducedMotion
      ? 1
      : 1 + Math.sin(tick * 0.72) * (running ? 0.018 : 0.01) + throttle * 0.018;
    this.craftSprite.scale.set(this.craftBaseScale * pulse);
    this.craftSprite.x = this.reducedMotion
      ? 0
      : Math.sin(tick * 0.46) * (running ? 1.8 + throttle * 1.5 : 0.7);
    this.craftSprite.y = this.reducedMotion
      ? 0
      : Math.sin(tick * 0.67) * (running ? 1.2 + throttle : 0.6);
  }

  private drawCurve(): void {
    if (!this.curveLayer) return;
    const curve = this.curveLayer;

    if (this.currentMultiplier <= 1.0) {
      curve.clear();
      this.lastCurveRenderMultiplier = 0;
      this.lastCurveCameraX = this.cameraOffsetX;
      this.lastCurveCameraY = this.cameraOffsetY;
      return;
    }

    const multiplierDelta = Math.abs(this.currentMultiplier - this.lastCurveRenderMultiplier);
    const cameraDelta =
      Math.abs(this.cameraOffsetX - this.lastCurveCameraX) +
      Math.abs(this.cameraOffsetY - this.lastCurveCameraY);
    const redrawThreshold = this.isCompactStage() ? 0.012 : 0.006;
    if (this.phase === 'running' && multiplierDelta < redrawThreshold && cameraDelta < 1.2) return;

    curve.clear();

    // 收集曲線點
    const points: { x: number; y: number }[] = [];
    const steps = this.isCompactStage() ? 22 : 32;
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

    this.lastCurveRenderMultiplier = this.currentMultiplier;
    this.lastCurveCameraX = this.cameraOffsetX;
    this.lastCurveCameraY = this.cameraOffsetY;
  }

  private emitTrail(x: number, y: number, flightAngle: number): void {
    if (!this.trail) return;
    const tailOffset = Math.min(54, Math.max(32, this.height * 0.12));
    const tailX = x - Math.cos(flightAngle) * tailOffset;
    const tailY = y - Math.sin(flightAngle) * tailOffset;
    const perp = flightAngle + Math.PI / 2;
    const count = this.isCompactStage() ? 1 : 2;
    for (let i = 0; i < count; i += 1) {
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
    this.targetMultiplier = 1.0;
    this.crashLimit = null;
    this.preflightMultiplierCap = null;
    this.lastEffectMultiplier = 1.0;
    this.runningStartedAtMs = 0;
    this.curveLayer?.clear();
    this.curvePoints = [];
    this.lastCurveRenderMultiplier = 0;
    this.lastCurveCameraX = 0;
    this.lastCurveCameraY = 0;
    this.resetCamera();

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
      this.multiplierLabel.text = seconds > 0 ? `${seconds}` : formatCrashMultiplier(1);
      this.multiplierLabel.style.fill = COLOR_ACID;
      this.multiplierLabel.alpha = 1;
      gsap.fromTo(
        this.multiplierLabel.scale,
        { x: 1.4, y: 1.4 },
        { x: 1, y: 1, duration: 0.5, ease: 'back.out(1.8)' },
      );
    }
    if (this.statusLabel) {
      this.statusLabel.text = seconds > 0 ? 'BETTING WINDOW' : 'READY';
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
    if (this.phase === 'running') return;

    this.phase = 'running';
    this.currentMultiplier = 1.0;
    this.targetMultiplier = 1.0;
    this.crashLimit = null;
    this.preflightMultiplierCap = null;
    this.lastEffectMultiplier = 1.0;
    this.runningStartedAtMs = performance.now();
    this.maxMultiplier = 2.0;
    this.tensionStart = performance.now() / 1000;
    this.curveLayer?.clear();
    this.curvePoints = [];
    this.lastCurveRenderMultiplier = 0;
    this.lastCurveCameraX = 0;
    this.lastCurveCameraY = 0;
    this.resetCamera();
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
      this.multiplierLabel.text = formatCrashMultiplier(1);
      this.multiplierLabel.style.fill = COLOR_WHITE;
      this.multiplierLabel.scale.set(1);
    }
    // reset vignette
    if (this.vignette) this.vignette.alpha = 0;
  }

  setMultiplier(m: number, elapsedMs?: number): void {
    if (!Number.isFinite(m)) return;
    const nextMultiplier = this.clampToCrashLimit(Math.max(1, m));

    if (this.phase === 'running') {
      if (Number.isFinite(elapsedMs)) {
        this.preflightMultiplierCap = null;
        const serverStartedAt = performance.now() - Math.max(0, elapsedMs ?? 0);
        this.runningStartedAtMs =
          this.runningStartedAtMs > 0
            ? this.runningStartedAtMs * 0.85 + serverStartedAt * 0.15
            : serverStartedAt;
      }
      this.targetMultiplier = Math.max(this.targetMultiplier, nextMultiplier);
      this.maxMultiplier = Math.max(this.maxMultiplier, nextMultiplier * 1.2, 2);
      return;
    }

    this.currentMultiplier = nextMultiplier;
    this.targetMultiplier = nextMultiplier;
    // 動態擴展 max
    this.maxMultiplier = Math.max(this.maxMultiplier, nextMultiplier * 1.2, 2);
    this.renderMultiplier(nextMultiplier);
  }

  setCrashLimit(limit: number | null): void {
    this.crashLimit = Number.isFinite(limit) && limit !== null && limit >= 1 ? limit : null;
    if (this.crashLimit === null) return;
    this.preflightMultiplierCap = null;
    this.targetMultiplier = Math.min(this.targetMultiplier, this.crashLimit);
    this.currentMultiplier = Math.min(this.currentMultiplier, this.crashLimit);
    this.maxMultiplier = Math.max(this.maxMultiplier, this.crashLimit * 1.2, 2);
  }

  setPreflightMultiplierCap(limit: number | null): void {
    this.preflightMultiplierCap =
      Number.isFinite(limit) && limit !== null && limit >= 1 ? limit : null;
    if (this.preflightMultiplierCap === null) return;
    this.targetMultiplier = Math.min(this.targetMultiplier, this.preflightMultiplierCap);
    this.currentMultiplier = Math.min(this.currentMultiplier, this.preflightMultiplierCap);
  }

  private clampToCrashLimit(m: number): number {
    return this.crashLimit === null ? m : Math.min(m, this.crashLimit);
  }

  private renderMultiplier(m: number): void {
    const prevInt = Math.floor(this.lastEffectMultiplier);

    if (this.multiplierLabel) {
      this.multiplierLabel.text = formatCrashMultiplier(m);
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
        if (this.craft && this.app && !this.reducedMotion) {
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
    this.lastEffectMultiplier = Math.max(this.lastEffectMultiplier, m);
  }

  crash(finalMultiplier: number): void {
    this.phase = 'crashed';
    this.crashLimit = finalMultiplier;
    this.preflightMultiplierCap = null;
    this.currentMultiplier = finalMultiplier;
    this.targetMultiplier = finalMultiplier;
    this.maxMultiplier = Math.max(this.maxMultiplier, finalMultiplier * 1.2, 2);
    this.runningStartedAtMs = 0;

    if (this.craft) {
      const finalPos = this.multiplierToPosition(finalMultiplier);
      this.craft.x = finalPos.x;
      this.craft.y = finalPos.y;
      this.craft.rotation = this.getCraftRotation(finalMultiplier, 0, true);
    }

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
      this.multiplierLabel.text = formatCrashMultiplier(finalMultiplier);
      this.multiplierLabel.style.fill = COLOR_EMBER;
      gsap.fromTo(
        this.multiplierLabel.scale,
        { x: 1.3, y: 1.3 },
        { x: 1, y: 1, duration: 0.8, ease: 'elastic.out(1, 0.5)' },
      );
    }

    if (this.statusLabel) {
      this.statusLabel.text = `CRASHED @ ${formatCrashMultiplier(finalMultiplier)}`;
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
    if (this.statusLabel && !this.reducedMotion) {
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
    if (cfg.edgeGlowMs > 0)
      emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_TOXIC, cfg.edgeGlowMs / 1000);
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
    this.backgroundLayer = null;
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
    this.backgroundTileWidth = 0;
    this.cameraOffsetX = 0;
    this.preflightMultiplierCap = null;
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
