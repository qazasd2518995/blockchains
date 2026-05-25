import {
  Application,
  Assets,
  Container,
  Graphics,
  Rectangle,
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
  prefersReducedMotion,
  GAME_FONT_NUM,
  Sfx,
} from '@bg/game-engine';
import { getHotlineSymbolMeta } from '@/lib/hotlineSymbols';
import { getSlotTheme, type SlotThemeConfig } from '@/lib/slotThemes';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0x0f172a;
const COLOR_TILE_STROKE = 0xc9a247;
const COLOR_ACID = 0xf3d67d;
const COLOR_VIOLET = 0xe8d48a;
const COLOR_EMBER = 0xd4574a;
const COLOR_TOXIC = 0x1e7a4f;
const COLOR_AMBER = 0xf3d67d;
const COLOR_ICE = 0x266f85;
const COLOR_INK = 0x0a0806;
const COLOR_WHITE = 0xffffff;
const DEFAULT_REELS = 5;
const ROWS = 3;
const MEGA_ROWS = 5;
const REEL_STRIP_LEN = 18; // reel 內部轉動用的延伸符號，控制物件量避免手機卡頓
const FINAL_STOP_ROW = 2;
const CLASSIC_RENDER_DPR = 1.6;
const MEGA_RENDER_DPR = 2;
const CLASSIC_PARTICLE_POOL_SIZE = 180;
const MEGA_PARTICLE_POOL_SIZE = 120;
const MEGA_MAX_CELL_ASPECT = 1.26;

function fitSpriteCover(sprite: Sprite, width: number, height: number): void {
  const textureWidth = sprite.texture.width || width;
  const textureHeight = sprite.texture.height || height;
  const scale = Math.max(width / textureWidth, height / textureHeight);
  sprite.scale.set(scale);
  sprite.x = (width - textureWidth * scale) / 2;
  sprite.y = (height - textureHeight * scale) / 2;
}

function themeSymbolImage(theme: SlotThemeConfig, symbolIdx: number): string {
  return theme.symbolSheet.replace(/symbols\.png$/, `symbol-${symbolIdx}.png`);
}

function themeSpecialImage(theme: SlotThemeConfig, type: HotlineSpecialSymbol['type']): string {
  return theme.symbolSheet.replace(/symbols\.png$/, `${type}.png`);
}

function optimizedPublicImage(src: string, width: 480 | 960 | 1600): string {
  if (!src || src.startsWith('data:') || src.startsWith('blob:') || /^https?:\/\//i.test(src)) {
    return src;
  }
  if (!/\.(avif|jpe?g|png|webp)$/i.test(src)) return src;
  const normalized = src.replace(/^\//, '');
  const extensionIndex = normalized.lastIndexOf('.');
  const withoutExtension = extensionIndex > -1 ? normalized.slice(0, extensionIndex) : normalized;
  return `/_optimized/${withoutExtension}@${width}.webp`;
}

function specialKey(special?: HotlineSpecialSymbol): string {
  if (!special) return '';
  return `${special.type}:${special.value ?? ''}`;
}

interface HotlineLine {
  lineId?: string;
  path?: number[];
  positions?: HotlineWinPosition[];
  startReel?: number;
  direction?: 'ltr' | 'rtl';
  row: number;
  symbol: number;
  count: number;
  payout: number;
  ways?: number;
}

interface HotlineWinPosition {
  reel: number;
  row: number;
}

interface HotlineSpecialSymbol extends HotlineWinPosition {
  type: 'scatter' | 'multiplier';
  value?: number;
}

interface HotlineCascadeStep {
  index: number;
  grid: number[][];
  lines: HotlineLine[];
  multiplier: number;
  removed: HotlineWinPosition[];
}

interface HotlineCascadeWinPop {
  amount?: string;
  label?: string;
  meta?: string;
}

interface HotlineCascadePlaybackOptions {
  onStepWin?: (step: HotlineCascadeStep) => HotlineCascadeWinPop | void;
  fast?: boolean;
  specialSymbols?: HotlineSpecialSymbol[];
  finalSpecialSymbols?: HotlineSpecialSymbol[];
  payoutAmount?: number;
}

interface HotlineSpecialHighlightOptions {
  fast?: boolean;
  type?: HotlineSpecialSymbol['type'];
  label?: string;
  multiplierTotal?: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

type ReelSymbol = Container & { symbolIndex: number; specialKey?: string };

interface ReelData {
  container: Container;
  symbols: ReelSymbol[];
  cellSize: number;
  cellWidth: number;
  strip: number[]; // 滾動用 symbol index 陣列
  stripOffset: number; // 當前偏移
}

export class HotlineScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private theme: SlotThemeConfig = getSlotTheme('cyber');
  private reelCount = DEFAULT_REELS;
  private rowCount = ROWS;
  private backgroundTexture: Texture | null = null;
  private symbolSheetTexture: Texture | null = null;
  private symbolTextures: Array<Texture | null> = [];
  private scatterTexture: Texture | null = null;
  private multiplierTexture: Texture | null = null;

  private reels: ReelData[] = [];
  private reelsContainer: Container | null = null;
  private winLinesLayer: Graphics | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private flashOverlay: Graphics | null = null;

  private cellSize = 0;
  private cellWidth = 0;
  private reelGap = 8;
  private reelX0 = 0;
  private reelY0 = 0;

  private particleList: Particle[] = [];
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;
  private anticipationTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;
  private lineFxTimers: number[] = [];
  private playbackFast = false;

  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    theme: SlotThemeConfig = getSlotTheme('cyber'),
  ): Promise<void> {
    this.width = width;
    this.height = height;
    this.theme = theme;
    this.reelCount = theme.reels;
    this.rowCount = theme.rows ?? ROWS;

    const app = new Application();
    const rendererResolution = this.getRendererResolution();
    await app.init({
      canvas,
      width,
      height,
      backgroundAlpha: 0,
      resolution: rendererResolution,
      autoDensity: true,
      antialias: this.rowCount <= ROWS && rendererResolution <= CLASSIC_RENDER_DPR,
    });
    this.app = app;
    app.stage.eventMode = 'none';
    this.winFx = new WinCelebration({
      app,
      parent: app.stage,
      shakeTarget: app.stage,
      width: this.width,
      height: this.height,
    });

    await this.preloadThemeAssets();
    this.createBackground();

    // Mega 盤面在手機橫向高度很有限，內距要跟著縮小，否則 6x5 符號會被壓得太小。
    const isMegaLayout = this.rowCount > ROWS;
    const shortSide = Math.min(width, height);
    const padding = isMegaLayout ? Math.max(8, Math.min(16, Math.round(shortSide * 0.035))) : 24;
    this.reelGap = isMegaLayout ? Math.max(4, Math.min(8, Math.round(shortSide * 0.016))) : 8;

    // 計算 reel 尺寸。Mega 盤面限制寬高比，避免寬螢幕把符號拉成扁格。
    const availableW = width - padding * 2;
    const availableH = height - padding * 2;
    if (isMegaLayout) {
      this.cellSize = availableH / this.rowCount;
      const naturalCellWidth = (availableW - this.reelGap * (this.reelCount - 1)) / this.reelCount;
      this.cellWidth = Math.min(naturalCellWidth, this.cellSize * MEGA_MAX_CELL_ASPECT);
    } else {
      this.cellSize = Math.min(
        (availableW - this.reelGap * (this.reelCount - 1)) / this.reelCount,
        availableH / this.rowCount,
      );
      this.cellWidth = this.cellSize;
    }
    const reelsWidth = this.cellWidth * this.reelCount + this.reelGap * (this.reelCount - 1);
    const reelsHeight = this.cellSize * this.rowCount;
    this.reelX0 = (width - reelsWidth) / 2;
    this.reelY0 = (height - reelsHeight) / 2;

    // 背景面板
    const panel = new Graphics()
      .roundRect(this.reelX0 - 12, this.reelY0 - 12, reelsWidth + 24, reelsHeight + 24, 20)
      .fill({ color: COLOR_INK, alpha: 0.05 })
      .stroke({ color: COLOR_ACID, width: 1, alpha: 0.2 });
    app.stage.addChild(panel);

    // Reels 容器
    this.reelsContainer = new Container();
    app.stage.addChild(this.reelsContainer);

    // 建立主題指定的轉軸數量
    for (let r = 0; r < this.reelCount; r += 1) {
      this.createReel(r);
    }

    // 中獎連線層
    this.winLinesLayer = new Graphics();
    app.stage.addChild(this.winLinesLayer);

    // 粒子 + shockwave
    this.particles = new Container();
    app.stage.addChild(this.particles);
    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    this.particlePool = new ParticlePool(
      app.stage,
      this.rowCount > ROWS ? MEGA_PARTICLE_POOL_SIZE : CLASSIC_PARTICLE_POOL_SIZE,
    );
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);
    Sfx.preloadSlotMachine();

    // 全螢幕閃光（JACKPOT 用）
    this.flashOverlay = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: COLOR_AMBER, alpha: 0 });
    app.stage.addChild(this.flashOverlay);

    this.startTickers();
  }

  private async preloadThemeAssets(): Promise<void> {
    const [backgroundTexture, symbolSheetTexture, symbolTextures] = await Promise.all([
      this.loadTexture(this.theme.background, this.rowCount > ROWS ? 960 : 960),
      this.loadTexture(this.theme.symbolSheet, this.rowCount > ROWS ? 480 : 960),
      Promise.all(
        this.theme.symbols.map((_symbol, symbolIdx) =>
          this.loadTexture(themeSymbolImage(this.theme, symbolIdx), 960),
        ),
      ),
    ]);
    this.backgroundTexture = backgroundTexture;
    this.symbolSheetTexture = symbolSheetTexture;
    this.symbolTextures = symbolTextures;
    if (this.rowCount > ROWS) {
      const [scatterTexture, multiplierTexture] = await Promise.all([
        this.loadTexture(themeSpecialImage(this.theme, 'scatter'), 960),
        this.loadTexture(themeSpecialImage(this.theme, 'multiplier'), 960),
      ]);
      this.scatterTexture = scatterTexture;
      this.multiplierTexture = multiplierTexture;
    }
  }

  private async loadTexture(src: string, width: 480 | 960 | 1600): Promise<Texture | null> {
    const optimizedSrc = optimizedPublicImage(src, width);
    if (optimizedSrc !== src) {
      const optimized = await Assets.load<Texture>(optimizedSrc).catch(() => null);
      if (optimized) return optimized;
    }
    return Assets.load<Texture>(src).catch(() => null);
  }

  private getRendererResolution(): number {
    const deviceResolution =
      typeof window === 'undefined' ? 1 : Math.max(1, window.devicePixelRatio || 1);
    return Math.min(deviceResolution, this.rowCount > ROWS ? MEGA_RENDER_DPR : CLASSIC_RENDER_DPR);
  }

  private createSymbolTextures(sheet: Texture | null, count: number): Texture[] {
    if (!sheet) return [];
    const frameCount = Math.min(6, count);
    const cellW = sheet.width / 3;
    const cellH = sheet.height / 2;
    return Array.from({ length: frameCount }, (_, symbolIdx) => {
      const col = symbolIdx % 3;
      const row = Math.floor(symbolIdx / 3);
      return new Texture({
        source: sheet.source,
        frame: new Rectangle(col * cellW, row * cellH, cellW, cellH),
      });
    });
  }

  private createBackground(): void {
    if (!this.app) return;
    const isMegaLayout = this.rowCount > ROWS;
    const bg = new Graphics()
      .rect(0, 0, this.width, this.height)
      .fill({ color: COLOR_BG, alpha: isMegaLayout ? 0.18 : 0.92 });
    this.app.stage.addChild(bg);

    if (this.backgroundTexture) {
      const background = new Sprite(this.backgroundTexture);
      fitSpriteCover(background, this.width, this.height);
      background.alpha = isMegaLayout ? 1 : 0.92;
      this.app.stage.addChild(background);
    }

    const stageShade = new Graphics()
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x020817, alpha: isMegaLayout ? 0.06 : 0.22 });
    this.app.stage.addChild(stageShade);

    const glow = new Graphics()
      .circle(this.width / 2, this.height / 2, this.width * 0.4)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 頂部/底部光條
    const topBar = new Graphics().rect(0, 0, this.width, 2).fill({ color: COLOR_ACID, alpha: 0.4 });
    const bottomBar = new Graphics()
      .rect(0, this.height - 2, this.width, 2)
      .fill({ color: COLOR_ACID, alpha: 0.4 });
    this.app.stage.addChild(topBar);
    this.app.stage.addChild(bottomBar);
  }

  private createReel(reelIndex: number): void {
    if (!this.reelsContainer) return;

    const reelX = this.reelX0 + reelIndex * (this.cellWidth + this.reelGap);
    const reelY = this.reelY0;

    // 遮罩（防止符號溢出）
    const mask = new Graphics()
      .rect(reelX, reelY, this.cellWidth, this.cellSize * this.rowCount)
      .fill({ color: 0xffffff });
    this.reelsContainer.addChild(mask);

    const reelContainer = new Container();
    reelContainer.x = reelX;
    reelContainer.y = reelY;
    reelContainer.mask = mask;
    this.reelsContainer.addChild(reelContainer);

    // 隨機填充 strip（REEL_STRIP_LEN 個符號，會滾動）
    const strip: number[] = [];
    for (let i = 0; i < REEL_STRIP_LEN; i += 1) {
      strip.push(this.randomSymbolIndex());
    }

    const symbols: ReelSymbol[] = [];
    for (let i = 0; i < REEL_STRIP_LEN; i += 1) {
      const sym = this.createSymbolTile(strip[i]!);
      sym.x = this.cellWidth / 2;
      sym.y = i * this.cellSize + this.cellSize / 2;
      reelContainer.addChild(sym);
      symbols.push(sym);
    }

    this.reels.push({
      container: reelContainer,
      symbols,
      cellSize: this.cellSize,
      cellWidth: this.cellWidth,
      strip,
      stripOffset: 0,
    });

    // Reel 邊框
    const frame = new Graphics()
      .roundRect(reelX - 2, reelY - 2, this.cellWidth + 4, this.cellSize * this.rowCount + 4, 8)
      .stroke({ color: COLOR_TILE_STROKE, width: 2 });
    this.reelsContainer.addChild(frame);
  }

  private createSymbolTile(symbolIdx: number): ReelSymbol {
    const c = new Container() as ReelSymbol;
    c.eventMode = 'none';
    c.symbolIndex = -1;
    this.renderSymbolTile(c, symbolIdx);
    return c;
  }

  private renderSymbolTile(c: ReelSymbol, symbolIdx: number, special?: HotlineSpecialSymbol): void {
    const nextSpecialKey = specialKey(special);
    if (c.symbolIndex === symbolIdx && c.specialKey === nextSpecialKey && c.children.length > 0) {
      return;
    }
    c.symbolIndex = symbolIdx;
    c.specialKey = nextSpecialKey;
    const oldChildren = c.removeChildren();
    for (const child of oldChildren) child.destroy({ children: true });

    const width = this.cellWidth;
    const height = this.cellSize;
    const size = Math.min(width, height);
    const meta = getHotlineSymbolMeta(symbolIdx);
    const themeSymbol = this.theme.symbols[symbolIdx] ?? this.theme.symbols[0];
    const color = themeSymbol?.accentValue ?? meta.accentValue;

    if (special) {
      this.renderSpecialSymbolTile(c, special, color);
      return;
    }

    // tile 陰影
    const shadow = new Graphics()
      .roundRect(-width / 2 + 5, -height / 2 + 6, width - 8, height - 8, 12)
      .fill({ color: COLOR_INK, alpha: 0.22 });
    c.addChild(shadow);

    const tile = new Graphics()
      .roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 12)
      .fill({ color: COLOR_INK, alpha: 0.84 })
      .stroke({ color, width: 2, alpha: 0.46 });
    c.addChild(tile);

    const tileGlow = new Graphics()
      .roundRect(-width / 2 + 7, -height / 2 + 7, width - 14, height - 14, 10)
      .fill({ color, alpha: 0.08 });
    c.addChild(tileGlow);

    const symbolTexture = this.symbolTextures[symbolIdx];
    if (symbolTexture) {
      const render = themeSymbol?.render;
      const sprite = new Sprite(symbolTexture);
      sprite.eventMode = 'none';
      sprite.anchor.set(0.5);
      const fitScale = render?.scale ?? 1;
      const targetW = (width - 8) * fitScale;
      const targetH = (height - 8) * fitScale;
      const scale = Math.min(targetW / symbolTexture.width, targetH / symbolTexture.height);
      sprite.scale.set(scale);
      sprite.x = (render?.offsetX ?? 0) * width;
      sprite.y = (render?.offsetY ?? 0) * height;
      sprite.alpha = 0.98;
      c.addChild(sprite);

      const frame = new Graphics()
        .roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 12)
        .stroke({ color, width: 2, alpha: 0.6 });
      c.addChild(frame);

      const shine = new Graphics()
        .roundRect(-width / 2 + 7, -height / 2 + 7, width - 14, (height - 14) * 0.34, 10)
        .fill({ color: COLOR_WHITE, alpha: 0.08 });
      c.addChild(shine);
      return;
    }

    // tile 頂部高光
    const hl = new Graphics()
      .roundRect(-width / 2 + 8, -height / 2 + 8, width - 16, (height - 16) * 0.3, 8)
      .fill({ color, alpha: 0.08 });
    c.addChild(hl);

    // Symbol 幾何 icon
    const glow = new Graphics().circle(0, -2, size * 0.18).fill({ color, alpha: 0.08 });
    c.addChild(glow);
    c.addChild(this.createSymbolGlyphGraphic(symbolIdx, size * 0.52));

    // Symbol 標籤（小字）
    const labelStyle = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: 8,
      fill: color,
      fontWeight: '600',
      letterSpacing: 1,
    });
    const label = new Text({ text: meta.label, style: labelStyle });
    label.anchor.set(0.5);
    label.y = size * 0.3;
    label.alpha = 0.7;
    c.addChild(label);
  }

  private renderSpecialSymbolTile(
    c: ReelSymbol,
    special: HotlineSpecialSymbol,
    fallbackColor: number,
  ): void {
    const width = this.cellWidth;
    const height = this.cellSize;
    const size = Math.min(width, height);
    const isScatter = special.type === 'scatter';
    const color = isScatter ? COLOR_ACID : COLOR_ICE;
    const texture = special.type === 'scatter' ? this.scatterTexture : this.multiplierTexture;
    const fillColor = isScatter ? 0x24120d : COLOR_INK;
    const strokeColor = isScatter ? COLOR_AMBER : COLOR_ICE;

    const shadow = new Graphics()
      .roundRect(-width / 2 + 5, -height / 2 + 6, width - 8, height - 8, 12)
      .fill({ color: COLOR_INK, alpha: 0.18 });
    c.addChild(shadow);

    const tile = new Graphics()
      .roundRect(-width / 2 + 3, -height / 2 + 3, width - 6, height - 6, 12)
      .fill({ color: fillColor, alpha: isScatter ? 0.92 : 0.72 })
      .stroke({
        color: strokeColor,
        width: isScatter ? 3 : 2,
        alpha: isScatter ? 0.9 : 0.68,
      });
    c.addChild(tile);

    if (isScatter) {
      const bonusPlate = new Graphics()
        .roundRect(-width / 2 + 9, -height / 2 + 9, width - 18, height - 18, 10)
        .fill({ color: 0x5c2241, alpha: 0.34 })
        .stroke({ color: fallbackColor, width: 1, alpha: 0.56 });
      c.addChild(bonusPlate);
      const halo = new Graphics()
        .circle(0, 0, size * 0.34)
        .fill({ color: COLOR_AMBER, alpha: 0.1 })
        .stroke({ color: COLOR_AMBER, width: 2, alpha: 0.42 });
      c.addChild(halo);
    }

    if (texture) {
      const sprite = new Sprite(texture);
      sprite.eventMode = 'none';
      sprite.anchor.set(0.5);
      const targetW = width - (isScatter ? 12 : 8);
      const targetH = height - (isScatter ? 12 : 8);
      const scale = Math.min(targetW / texture.width, targetH / texture.height);
      sprite.scale.set(scale);
      sprite.alpha = 0.98;
      c.addChild(sprite);
    } else {
      c.addChild(this.createSymbolGlyphGraphic(special.type === 'scatter' ? 5 : 4, size * 0.52));
    }

    if (special.type === 'multiplier') {
      const valueStyle = new TextStyle({
        fontFamily: GAME_FONT_NUM,
        fontSize: Math.max(26, size * 0.42),
        fill: 0xffffff,
        fontWeight: '900',
        stroke: { color: COLOR_INK, width: 6 },
        dropShadow: {
          alpha: 0.78,
          angle: Math.PI / 2,
          blur: 6,
          color: COLOR_INK,
          distance: 2,
        },
      });
      const value = new Text({ text: `${special.value ?? 2}×`, style: valueStyle });
      value.anchor.set(0.5);
      value.y = size * 0.02;
      const badge = new Graphics()
        .roundRect(
          -value.width / 2 - 9,
          value.y - value.height / 2 - 5,
          value.width + 18,
          value.height + 10,
          999,
        )
        .fill({ color: 0x03131f, alpha: 0.78 })
        .stroke({ color: COLOR_ICE, width: 2, alpha: 0.72 });
      c.addChild(badge);
      c.addChild(value);
    }

    if (isScatter) {
      const labelStyle = new TextStyle({
        fontFamily: GAME_FONT_NUM,
        fontSize: Math.max(14, size * 0.2),
        fill: COLOR_AMBER,
        fontWeight: '900',
        letterSpacing: 2.4,
        stroke: { color: COLOR_INK, width: 5 },
        dropShadow: {
          alpha: 0.72,
          angle: Math.PI / 2,
          blur: 5,
          color: COLOR_INK,
          distance: 2,
        },
      });
      const label = new Text({ text: 'BONUS', style: labelStyle });
      label.anchor.set(0.5);
      label.y = height * 0.31;
      const plate = new Graphics()
        .roundRect(
          -label.width / 2 - 8,
          label.y - label.height / 2 - 4,
          label.width + 16,
          label.height + 8,
          999,
        )
        .fill({ color: 0x2c1608, alpha: 0.72 })
        .stroke({ color: COLOR_AMBER, width: 1.5, alpha: 0.72 });
      c.addChild(plate);
      c.addChild(label);
    }

    const shine = new Graphics()
      .roundRect(-width / 2 + 7, -height / 2 + 7, width - 14, (height - 14) * 0.28, 10)
      .fill({ color, alpha: 0.09 });
    c.addChild(shine);
  }

  private createSymbolGlyphGraphic(symbolIdx: number, size: number): Container {
    const meta = getHotlineSymbolMeta(symbolIdx);
    const color = meta.accentValue;
    const icon = new Container();
    const u = size;

    if (meta.key.includes('gem') || meta.key === 'diamond') {
      icon.addChild(
        new Graphics()
          .poly([
            0,
            -u * 0.38,
            u * 0.32,
            -u * 0.04,
            u * 0.2,
            u * 0.38,
            -u * 0.2,
            u * 0.38,
            -u * 0.32,
            -u * 0.04,
          ])
          .fill({ color, alpha: 0.14 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .moveTo(-u * 0.32, -u * 0.04)
          .lineTo(0, u * 0.38)
          .lineTo(u * 0.32, -u * 0.04)
          .stroke({ color, width: 1.5, alpha: 0.62 }),
      );
      icon.addChild(
        new Graphics()
          .moveTo(-u * 0.19, -u * 0.04)
          .lineTo(0, -u * 0.38)
          .lineTo(u * 0.19, -u * 0.04)
          .stroke({ color, width: 1.5, alpha: 0.62 }),
      );
      icon.addChild(
        new Graphics()
          .moveTo(-u * 0.32, -u * 0.04)
          .lineTo(u * 0.32, -u * 0.04)
          .stroke({ color, width: 1.5, alpha: 0.62 }),
      );
      return icon;
    }

    if (meta.key === 'star') {
      icon.addChild(
        new Graphics()
          .poly([
            0,
            -u * 0.4,
            u * 0.1,
            -u * 0.12,
            u * 0.38,
            -u * 0.12,
            u * 0.16,
            u * 0.06,
            u * 0.25,
            u * 0.36,
            0,
            u * 0.17,
            -u * 0.25,
            u * 0.36,
            -u * 0.16,
            u * 0.06,
            -u * 0.38,
            -u * 0.12,
            -u * 0.1,
            -u * 0.12,
          ])
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      return icon;
    }

    if (meta.key === 'jackpot') {
      icon.addChild(
        new Graphics()
          .circle(0, 0, u * 0.34)
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .circle(0, 0, u * 0.21)
          .fill({ color, alpha: 0.1 })
          .stroke({ color, width: 2 }),
      );
      for (let i = 0; i < 8; i += 1) {
        const angle = (Math.PI * 2 * i) / 8;
        icon.addChild(
          new Graphics()
            .circle(Math.cos(angle) * u * 0.29, Math.sin(angle) * u * 0.29, u * 0.025)
            .fill({ color }),
        );
      }
      return icon;
    }

    if (meta.key === 'crown') {
      icon.addChild(
        new Graphics()
          .poly([
            -u * 0.34,
            u * 0.26,
            -u * 0.28,
            -u * 0.1,
            -u * 0.12,
            u * 0.06,
            0,
            -u * 0.24,
            u * 0.12,
            u * 0.06,
            u * 0.28,
            -u * 0.1,
            u * 0.34,
            u * 0.26,
          ])
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .roundRect(-u * 0.34, u * 0.2, u * 0.68, u * 0.1, 6)
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(new Graphics().circle(-u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
      icon.addChild(new Graphics().circle(0, -u * 0.32, u * 0.04).fill({ color }));
      icon.addChild(new Graphics().circle(u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
      return icon;
    }

    icon.addChild(
      new Graphics()
        .poly([
          -u * 0.34,
          u * 0.26,
          -u * 0.28,
          -u * 0.1,
          -u * 0.12,
          u * 0.06,
          0,
          -u * 0.24,
          u * 0.12,
          u * 0.06,
          u * 0.28,
          -u * 0.1,
          u * 0.34,
          u * 0.26,
        ])
        .fill({ color, alpha: 0.12 })
        .stroke({ color, width: 2 }),
    );
    icon.addChild(
      new Graphics()
        .roundRect(-u * 0.34, u * 0.2, u * 0.68, u * 0.1, 6)
        .fill({ color, alpha: 0.12 })
        .stroke({ color, width: 2 }),
    );
    icon.addChild(new Graphics().circle(-u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
    icon.addChild(new Graphics().circle(0, -u * 0.32, u * 0.04).fill({ color }));
    icon.addChild(new Graphics().circle(u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
    return icon;
  }

  private startTickers(): void {
    if (!this.app) return;
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
   * 播放開轉動畫
   * finalGrid: [reel][row] = symbol index — 後端傳回的最終結果
   * lines: 中獎連線
   */
  /**
   * 樂觀動畫：按下 SPIN 立刻讓轉軸開始連續滾動（無結果）。
   * API 回來呼叫 playSpin(...) 接手停到最終 grid。
   */
  private anticipating = false;
  startAnticipation(fast = false): void {
    if (this.anticipating || !this.app) return;
    this.anticipating = true;
    Sfx.slotSpinStart();
    for (const reel of this.reels) {
      for (const sym of reel.symbols) {
        gsap.killTweensOf(sym);
        gsap.killTweensOf(sym.scale);
      }
    }
    const speeds = this.reels.map((reel, reelIndex) => {
      const base = fast ? 0.46 : 0.24;
      return reel.cellSize * base * (1 + reelIndex * 0.035);
    });
    this.anticipationTicker = (tk: Ticker) => {
      const delta = Math.min(2.5, Math.max(0.25, tk.deltaTime));
      for (let reelIndex = 0; reelIndex < this.reels.length; reelIndex += 1) {
        const reel = this.reels[reelIndex]!;
        const speed = speeds[reelIndex] ?? reel.cellSize * 0.24;
        const totalH = REEL_STRIP_LEN * reel.cellSize;
        const maxY = totalH + reel.cellSize / 2;
        for (const sym of reel.symbols) {
          sym.y += speed * delta;
          while (sym.y >= maxY) {
            sym.y -= totalH;
            this.renderSymbolTile(sym, this.randomSymbolIndex());
          }
        }
      }
    };
    this.app.ticker.add(this.anticipationTicker);
  }

  stopAnticipation(normalize = true, stopSound = true): void {
    if (!this.anticipating) {
      this.clearAnticipationTicker();
      if (stopSound) Sfx.slotSpinStop();
      return;
    }
    this.clearAnticipationTicker();
    for (const reel of this.reels) {
      gsap.killTweensOf(reel.container);
      gsap.killTweensOf(reel.container.scale);
      for (const sym of reel.symbols) gsap.killTweensOf(sym);
      if (normalize) this.normalizeReel(reel);
      else this.captureReelOrder(reel);
    }
    this.anticipating = false;
    if (stopSound) Sfx.slotSpinStop();
  }

  private clearAnticipationTicker(): void {
    if (this.anticipationTicker && this.app) {
      this.app.ticker.remove(this.anticipationTicker);
    }
    this.anticipationTicker = null;
  }

  async playSpin(
    finalGrid: number[][],
    lines: HotlineLine[],
    options: HotlineCascadePlaybackOptions = {},
  ): Promise<void> {
    this.playbackFast = Boolean(options.fast);
    this.stopAnticipation(false, false);
    this.resetWinLines();
    const specialByCell = this.createSpecialSymbolMap(options.specialSymbols);

    const duration = this.playbackFast ? 0.48 : 1.45;
    const reelDurationGap = this.playbackFast ? 0.045 : 0.16;
    const reelDelayGap = this.playbackFast ? 0.012 : 0.06;
    const reelPromises = this.reels.map((reel, reelIdx) =>
      this.spinReel(
        reel,
        reelIdx,
        finalGrid[reelIdx]!,
        this.getSpecialColumn(specialByCell, reelIdx),
        duration + reelIdx * reelDurationGap,
        reelIdx * reelDelayGap,
      ),
    );

    try {
      await Promise.all(reelPromises);
    } finally {
      Sfx.slotSpinStop();
    }

    // 全部停完 → 顯示中獎連線
    if (lines.length > 0) {
      await this.sleep(this.scaleMs(200));
      this.showWinLines(lines, options.payoutAmount);
    }
  }

  async playCascadeSpin(
    cascades: HotlineCascadeStep[],
    finalGrid: number[][],
    options: HotlineCascadePlaybackOptions = {},
  ): Promise<void> {
    this.playbackFast = Boolean(options.fast);
    const finalSpecialSymbols = options.finalSpecialSymbols ?? options.specialSymbols ?? [];
    if (cascades.length === 0) {
      await this.playSpin(finalGrid, [], {
        fast: this.playbackFast,
        specialSymbols: finalSpecialSymbols,
        payoutAmount: options.payoutAmount,
      });
      return;
    }

    const first = cascades[0]!;
    await this.playSpin(first.grid, first.lines, {
      fast: this.playbackFast,
      specialSymbols: options.specialSymbols,
      payoutAmount: options.payoutAmount,
    });
    this.showCascadeStepWinPop(first, options.onStepWin?.(first), options.payoutAmount);
    const specialByCell = this.createSpecialSymbolMap(options.specialSymbols);
    const finalSpecialByCell = this.createSpecialSymbolMap(finalSpecialSymbols);

    let previous = first;
    for (let i = 1; i < cascades.length; i += 1) {
      const step = cascades[i]!;
      await this.sleep(this.scaleMs(720));
      await this.animateCascadeToGrid(step.grid, previous.removed, specialByCell);
      this.showWinLines(step.lines, options.payoutAmount);
      this.showCascadeStepWinPop(step, options.onStepWin?.(step), options.payoutAmount);
      previous = step;
    }

    await this.sleep(this.scaleMs(720));
    await this.animateCascadeToGrid(finalGrid, previous.removed, finalSpecialByCell);
  }

  async highlightSpecialSymbols(
    specialSymbols: HotlineSpecialSymbol[],
    options: HotlineSpecialHighlightOptions = {},
  ): Promise<void> {
    const previousFast = this.playbackFast;
    this.playbackFast = Boolean(options.fast ?? this.playbackFast);
    const filtered = specialSymbols.filter(
      (symbol) => !options.type || symbol.type === options.type,
    );
    if (filtered.length === 0) {
      this.playbackFast = previousFast;
      return;
    }

    const kind = options.type ?? filtered[0]?.type ?? 'scatter';
    const color = kind === 'scatter' ? COLOR_AMBER : COLOR_ICE;
    const label = options.label ?? (kind === 'scatter' ? 'BONUS SCATTER' : '倍數啟動');
    Sfx.slotWin(kind === 'scatter' || filtered.length >= 3 ? 'medium' : 'small');

    const bannerPromise = this.showSpecialBanner(label, color);
    const pulsePromises = filtered.map((special, index) =>
      this.pulseSpecialSymbol(special, color, index),
    );

    await Promise.all([bannerPromise, ...pulsePromises]);
    this.playbackFast = previousFast;
  }

  private showSpecialBanner(label: string, color: number): Promise<void> {
    if (!this.app) return this.sleep(this.scaleMs(420));
    const style = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: Math.max(18, Math.min(42, this.cellSize * 0.34)),
      fill: COLOR_WHITE,
      fontWeight: '900',
      letterSpacing: 1,
      stroke: { color: COLOR_INK, width: 6 },
      dropShadow: {
        color,
        alpha: 0.8,
        blur: 12,
        distance: 0,
      },
    });
    const banner = new Text({ text: label, style });
    banner.anchor.set(0.5);
    banner.x = this.width / 2;
    banner.y = this.reelY0 + this.cellSize * this.rowCount * 0.5;
    banner.alpha = 0;
    banner.scale.set(0.86);
    this.app.stage.addChild(banner);

    return new Promise((resolve) => {
      gsap.to(banner, {
        alpha: 1,
        duration: this.scaleSec(0.16),
        ease: 'power2.out',
      });
      gsap.to(banner.scale, {
        x: 1,
        y: 1,
        duration: this.scaleSec(0.2),
        ease: 'back.out(1.8)',
      });
      gsap.to(banner, {
        alpha: 0,
        y: banner.y - this.cellSize * 0.18,
        duration: this.scaleSec(0.28),
        delay: this.scaleSec(0.55),
        ease: 'power2.in',
        onComplete: () => {
          this.app?.stage.removeChild(banner);
          banner.destroy();
          resolve();
        },
      });
    });
  }

  private pulseSpecialSymbol(
    special: HotlineSpecialSymbol,
    color: number,
    index: number,
  ): Promise<void> {
    const reel = this.reels[special.reel];
    const sym = reel?.symbols[special.row];
    const x = this.reelX0 + special.reel * (this.cellWidth + this.reelGap) + this.cellWidth / 2;
    const y = this.reelY0 + special.row * this.cellSize + this.cellSize / 2;
    const delay = this.scaleSec(index * 0.06);

    if (!reel || !sym) return this.sleep(this.scaleMs(420));

    const ring = new Graphics();
    ring.roundRect(
      -this.cellSize * 0.48,
      -this.cellSize * 0.48,
      this.cellSize * 0.96,
      this.cellSize * 0.96,
      this.cellSize * 0.16,
    );
    ring.stroke({ color, width: 4, alpha: 0.94 });
    ring.x = x;
    ring.y = y;
    ring.alpha = 0;
    this.winLinesLayer?.addChild(ring);

    gsap.killTweensOf(sym.scale);
    gsap.to(sym.scale, {
      x: 1.18,
      y: 1.18,
      duration: this.scaleSec(0.18),
      delay,
      ease: 'power2.out',
      yoyo: true,
      repeat: 3,
    });

    const timer = window.setTimeout(
      () => {
        this.emitShockwave(x, y, color, this.cellSize * 0.78);
        this.particlePool?.emit({
          x,
          y,
          count: 18,
          colors: [color, COLOR_WHITE],
          speedMin: 2,
          speedMax: 6,
        });
      },
      this.scaleMs(index * 60),
    );
    this.lineFxTimers.push(timer);

    return new Promise((resolve) => {
      gsap.to(ring, {
        alpha: 1,
        duration: this.scaleSec(0.14),
        delay,
        ease: 'power2.out',
      });
      gsap.to(ring.scale, {
        x: 1.16,
        y: 1.16,
        duration: this.scaleSec(0.42),
        delay,
        ease: 'power2.out',
      });
      gsap.to(ring, {
        alpha: 0,
        duration: this.scaleSec(0.28),
        delay: delay + this.scaleSec(0.55),
        ease: 'power2.in',
        onComplete: () => {
          this.winLinesLayer?.removeChild(ring);
          ring.destroy();
          resolve();
        },
      });
    });
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private scaleSec(seconds: number): number {
    if (!this.playbackFast) return seconds;
    return Math.max(0.035, seconds * 0.34);
  }

  private scaleMs(ms: number): number {
    if (!this.playbackFast) return ms;
    return Math.max(30, Math.round(ms * 0.34));
  }

  private spinReel(
    reel: ReelData,
    reelIndex: number,
    finalColumn: number[],
    finalSpecials: Array<HotlineSpecialSymbol | undefined>,
    duration: number,
    delay: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const { container } = reel;
      const cellSize = reel.cellSize;
      const startRow = Math.max(
        FINAL_STOP_ROW + this.rowCount + 1,
        REEL_STRIP_LEN - this.rowCount - 2 - reelIndex,
      );
      const currentPhase = this.getReelScrollPhase(reel);
      const landingStrip = this.buildLandingStrip(reel, finalColumn, startRow);
      const landingSpecials = new Map<number, HotlineSpecialSymbol>();
      finalSpecials.forEach((special, row) => {
        if (special) landingSpecials.set(FINAL_STOP_ROW + row, special);
      });

      this.renderReelStrip(reel, landingStrip, landingSpecials);
      container.y = this.reelY0 - startRow * cellSize + currentPhase;
      container.scale.set(1);

      const state = { y: container.y };
      gsap.to(state, {
        y: this.reelY0 - FINAL_STOP_ROW * cellSize,
        duration,
        delay,
        ease: 'power4.out',
        onUpdate: () => {
          container.y = state.y;
        },
        onComplete: () => {
          this.snapReelToFinal(reel, finalColumn, finalSpecials);
          this.playReelStopBounce(container, resolve);
        },
      });
    });
  }

  private buildLandingStrip(reel: ReelData, finalColumn: number[], startRow: number): number[] {
    const currentVisible = this.getVisibleSymbols(reel);
    const strip = Array.from({ length: REEL_STRIP_LEN }, () => this.randomSymbolIndex());

    for (let i = 0; i < this.rowCount; i += 1) {
      strip[FINAL_STOP_ROW + i] = finalColumn[i] ?? 0;
      strip[startRow + i] = currentVisible[i] ?? strip[startRow + i] ?? 0;
    }

    return strip;
  }

  private renderReelStrip(
    reel: ReelData,
    strip: number[],
    specialByStripIndex: Map<number, HotlineSpecialSymbol> = new Map(),
  ): void {
    reel.strip = strip;
    for (let i = 0; i < reel.symbols.length; i += 1) {
      const symbol = reel.symbols[i]!;
      const special = specialByStripIndex.get(i);
      gsap.killTweensOf(symbol);
      gsap.killTweensOf(symbol.scale);
      symbol.scale.set(1);
      symbol.alpha = 1;
      symbol.x = reel.cellWidth / 2;
      symbol.y = i * reel.cellSize + reel.cellSize / 2;
      const nextSymbol = strip[i] ?? 0;
      const nextSpecialKey = specialKey(special);
      if (symbol.symbolIndex !== nextSymbol || symbol.specialKey !== nextSpecialKey) {
        this.renderSymbolTile(symbol, nextSymbol, special);
      } else {
        symbol.symbolIndex = nextSymbol;
        symbol.specialKey = nextSpecialKey;
      }
    }
  }

  private getVisibleSymbols(reel: ReelData): number[] {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    return ordered.slice(0, this.rowCount).map((symbol) => symbol.symbolIndex);
  }

  private getReelScrollPhase(reel: ReelData): number {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    const first = ordered[0];
    if (!first) return 0;
    const phase = first.y - reel.cellSize / 2;
    return Math.max(0, Math.min(reel.cellSize * 0.92, phase));
  }

  private createSpecialSymbolMap(
    specialSymbols: HotlineSpecialSymbol[] = [],
  ): Map<string, HotlineSpecialSymbol> {
    const map = new Map<string, HotlineSpecialSymbol>();
    for (const special of specialSymbols) {
      if (!Number.isInteger(special.reel) || !Number.isInteger(special.row)) continue;
      if (special.reel < 0 || special.reel >= this.reelCount) continue;
      if (special.row < 0 || special.row >= this.rowCount) continue;
      map.set(`${special.reel}:${special.row}`, special);
    }
    return map;
  }

  private getSpecialColumn(
    specialByCell: Map<string, HotlineSpecialSymbol>,
    reelIndex: number,
  ): Array<HotlineSpecialSymbol | undefined> {
    return Array.from({ length: this.rowCount }, (_unused, row) =>
      specialByCell.get(`${reelIndex}:${row}`),
    );
  }

  private playReelStopBounce(container: Container, resolve: () => void): void {
    Sfx.slotReelStop();
    gsap.fromTo(
      container.scale,
      { y: 1 },
      {
        y: 0.965,
        duration: this.scaleSec(0.07),
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
        onComplete: () => resolve(),
      },
    );
  }

  private async animateCascadeToGrid(
    nextGrid: number[][],
    removed: HotlineWinPosition[],
    specialByCell: Map<string, HotlineSpecialSymbol> = new Map(),
  ): Promise<void> {
    this.resetWinLines();
    const removalTweens: Promise<void>[] = [];

    for (const pos of removed) {
      const reel = this.reels[pos.reel];
      const sym = reel?.symbols[pos.row];
      if (!reel || !sym) continue;
      gsap.killTweensOf(sym);
      gsap.killTweensOf(sym.scale);
      const x = this.reelX0 + pos.reel * (this.cellWidth + this.reelGap) + this.cellWidth / 2;
      const y = this.reelY0 + pos.row * this.cellSize + this.cellSize / 2;
      this.emitShockwave(
        x,
        y,
        this.theme.symbols[sym.symbolIndex]?.accentValue ?? COLOR_ACID,
        this.cellSize * 0.56,
      );
      this.particlePool?.emit({
        x,
        y,
        count: 9,
        colors: [this.theme.symbols[sym.symbolIndex]?.accentValue ?? COLOR_ACID, 0xffffff],
        speedMin: 1.5,
        speedMax: 5,
      });

      gsap.to(sym.scale, {
        x: 0.18,
        y: 0.18,
        duration: this.scaleSec(0.22),
        ease: 'back.in(1.8)',
      });
      removalTweens.push(
        new Promise((resolve) => {
          gsap.to(sym, {
            alpha: 0,
            duration: this.scaleSec(0.22),
            ease: 'power2.in',
            onComplete: resolve,
          });
        }),
      );
    }

    if (removalTweens.length > 0) {
      Sfx.slotWin(removed.length >= 8 ? 'medium' : 'small');
      await Promise.all(removalTweens);
    }

    await this.dropGridIntoPlace(nextGrid, removed, specialByCell);
  }

  private dropGridIntoPlace(
    nextGrid: number[][],
    removed: HotlineWinPosition[],
    specialByCell: Map<string, HotlineSpecialSymbol> = new Map(),
  ): Promise<void> {
    const tweens: Promise<void>[] = [];
    const removedByReel = new Map<number, Set<number>>();
    for (const pos of removed) {
      const rows = removedByReel.get(pos.reel) ?? new Set<number>();
      rows.add(pos.row);
      removedByReel.set(pos.reel, rows);
    }

    for (let reelIdx = 0; reelIdx < this.reels.length; reelIdx += 1) {
      const reel = this.reels[reelIdx]!;
      const removedRows = removedByReel.get(reelIdx);
      const finalColumn = nextGrid[reelIdx] ?? [];
      if (!removedRows || removedRows.size === 0) {
        let hasAnimatedArrival = false;
        for (let row = 0; row < this.rowCount; row += 1) {
          const sym = reel.symbols[row];
          const nextSymbol = finalColumn[row] ?? sym?.symbolIndex ?? 0;
          const special = specialByCell.get(`${reelIdx}:${row}`);
          const nextSpecialKey = specialKey(special);
          const isSpecialArrival = Boolean(special && sym?.specialKey !== nextSpecialKey);
          if (sym && (sym.symbolIndex !== nextSymbol || sym.specialKey !== specialKey(special))) {
            this.renderSymbolTile(sym, nextSymbol, special);
          }
          if (sym && isSpecialArrival) {
            hasAnimatedArrival = true;
            const targetY = row * reel.cellSize + reel.cellSize / 2;
            gsap.killTweensOf(sym);
            gsap.killTweensOf(sym.scale);
            sym.x = reel.cellWidth / 2;
            sym.y = targetY - reel.cellSize * (1.3 + row * 0.08);
            sym.alpha = 0;
            sym.scale.set(0.9);
            tweens.push(
              new Promise((resolve) => {
                gsap.to(sym, {
                  y: targetY,
                  alpha: 1,
                  duration: this.scaleSec(0.36),
                  delay: this.scaleSec(reelIdx * 0.025 + row * 0.02),
                  ease: 'back.out(1.45)',
                  onComplete: resolve,
                });
                gsap.to(sym.scale, {
                  x: 1,
                  y: 1,
                  duration: this.scaleSec(0.28),
                  delay: this.scaleSec(reelIdx * 0.025 + row * 0.02),
                  ease: 'power2.out',
                });
              }),
            );
          }
        }
        if (!hasAnimatedArrival) this.captureReelOrder(reel);
        continue;
      }

      const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
      const visible = ordered.slice(0, this.rowCount);
      const offscreen = ordered.slice(this.rowCount);
      const survivors = visible.filter((_symbol, row) => !removedRows.has(row));
      const enteringCount = Math.max(0, this.rowCount - survivors.length);
      const entering = visible
        .filter((_symbol, row) => removedRows.has(row))
        .slice(0, enteringCount);
      const finalOrder = [...entering, ...survivors].slice(0, this.rowCount);

      while (finalOrder.length < this.rowCount) {
        const fallback = offscreen.shift();
        if (!fallback) break;
        finalOrder.push(fallback);
      }

      reel.symbols = [...finalOrder, ...offscreen];
      reel.container.y = this.reelY0;

      for (let i = 0; i < offscreen.length; i += 1) {
        const sym = offscreen[i]!;
        gsap.killTweensOf(sym);
        gsap.killTweensOf(sym.scale);
        sym.x = reel.cellWidth / 2;
        sym.y = (this.rowCount + i) * reel.cellSize + reel.cellSize / 2;
        sym.alpha = 1;
        sym.scale.set(1);
      }

      for (let row = 0; row < this.rowCount; row += 1) {
        const sym = finalOrder[row];
        if (!sym) continue;
        const targetY = row * reel.cellSize + reel.cellSize / 2;
        const delay = this.scaleSec(reelIdx * 0.025 + row * 0.02);
        gsap.killTweensOf(sym);
        gsap.killTweensOf(sym.scale);
        const nextSymbol = finalColumn[row] ?? 0;
        const special = specialByCell.get(`${reelIdx}:${row}`);
        const nextSpecialKey = specialKey(special);
        const isSpecialArrival = Boolean(special && sym.specialKey !== nextSpecialKey);
        if (sym.symbolIndex !== nextSymbol || sym.specialKey !== nextSpecialKey) {
          this.renderSymbolTile(sym, nextSymbol, special);
        }
        const isEntering = row < enteringCount || isSpecialArrival;
        sym.alpha = isEntering ? 0 : 1;
        sym.scale.set(isEntering ? 0.92 : 1);
        if (isEntering) {
          sym.y = targetY - reel.cellSize * (Math.max(enteringCount, 1) + 0.62);
        }
        tweens.push(
          new Promise((resolve) => {
            gsap.to(sym, {
              y: targetY,
              alpha: 1,
              duration: this.scaleSec(isEntering ? 0.36 : 0.42),
              delay,
              ease: isEntering ? 'back.out(1.45)' : 'power3.out',
              onComplete: resolve,
            });
            gsap.to(sym.scale, {
              x: 1,
              y: 1,
              duration: this.scaleSec(0.28),
              delay,
              ease: 'power2.out',
            });
          }),
        );
      }
      reel.strip = reel.symbols.map((symbol) => symbol.symbolIndex);
    }

    if (tweens.length > 0) {
      this.shaker?.shake(2.2, 0.18);
      Sfx.slotReelStop();
    }
    return Promise.all(tweens).then(() => {
      for (const reel of this.reels) this.normalizeReel(reel);
    });
  }

  private snapReelToFinal(
    reel: ReelData,
    finalColumn: number[],
    finalSpecials: Array<HotlineSpecialSymbol | undefined> = [],
  ): void {
    const newStrip: number[] = [];
    for (let i = 0; i < this.rowCount; i += 1) newStrip.push(finalColumn[i] ?? 0);
    for (let i = this.rowCount; i < REEL_STRIP_LEN; i += 1) {
      newStrip.push(this.randomSymbolIndex());
    }
    reel.container.y = this.reelY0;
    const specialByStripIndex = new Map<number, HotlineSpecialSymbol>();
    finalSpecials.forEach((special, row) => {
      if (special) specialByStripIndex.set(row, special);
    });
    this.renderReelStrip(reel, newStrip, specialByStripIndex);
  }

  private captureReelOrder(reel: ReelData): void {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    reel.symbols = ordered;
    reel.strip = ordered.map((symbol) => symbol.symbolIndex);
  }

  private normalizeReel(reel: ReelData): void {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    reel.container.y = this.reelY0;
    for (let i = 0; i < ordered.length; i += 1) {
      const symbol = ordered[i]!;
      symbol.x = reel.cellWidth / 2;
      symbol.y = i * reel.cellSize + reel.cellSize / 2;
    }
    reel.symbols = ordered;
    reel.strip = ordered.map((symbol) => symbol.symbolIndex);
  }

  private randomSymbolIndex(): number {
    return Math.floor(Math.random() * Math.max(1, this.theme.symbols.length));
  }

  private showWinLines(lines: HotlineLine[], payoutAmount?: number): void {
    if (!this.winLinesLayer) return;
    const jackpot = lines.find((l) => l.count === 5);
    Sfx.slotWin(jackpot ? 'big' : lines.length >= 2 ? 'medium' : 'small');
    for (const line of lines) {
      if (line.positions && line.positions.length > 0) {
        this.showClusterWin(line, payoutAmount);
        continue;
      }
      const path = this.normalizeLinePath(line);
      const startReel = this.clampLineStart(line.startReel);
      const visibleCount = Math.min(
        Math.max(line.count, 0),
        this.reelCount - startReel,
        path.length - startReel,
      );
      if (visibleCount < 3) continue;

      const points = Array.from({ length: visibleCount }, (_, offset) => {
        const reelIdx = startReel + offset;
        return {
          reelIdx,
          x: this.reelX0 + reelIdx * (this.cellWidth + this.reelGap) + this.cellWidth / 2,
          y: this.reelY0 + path[reelIdx]! * this.cellSize + this.cellSize / 2,
        };
      });
      const color =
        this.theme.symbols[line.symbol]?.accentValue ??
        getHotlineSymbolMeta(line.symbol).accentValue;

      // 發光連線（3 層）
      const g = new Graphics();
      for (const stroke of [
        { width: 18, alpha: 0.2 },
        { width: 8, alpha: 0.4 },
        { width: 3, alpha: 0.9 },
      ]) {
        g.moveTo(points[0]!.x, points[0]!.y);
        for (let i = 1; i < points.length; i += 1) {
          g.lineTo(points[i]!.x, points[i]!.y);
        }
        g.stroke({ color, width: stroke.width, alpha: stroke.alpha });
      }
      g.alpha = 0;
      this.winLinesLayer.addChild(g);

      gsap.fromTo(g, { alpha: 0 }, { alpha: 1, duration: this.scaleSec(0.3), ease: 'power2.out' });

      // 每個中獎符號脈動 + 粒子
      for (let offset = 0; offset < visibleCount; offset += 1) {
        const reelIdx = startReel + offset;
        const reel = this.reels[reelIdx];
        if (!reel) continue;
        const row = path[reelIdx]!;
        const sym = reel.symbols[row];
        if (!sym) continue;

        gsap.to(sym.scale, {
          x: 1.2,
          y: 1.2,
          duration: this.scaleSec(0.25),
          ease: 'power2.out',
          yoyo: true,
          repeat: 3,
          delay: this.scaleSec(offset * 0.1),
        });

        const { x: wx, y: wy } = points[offset]!;
        const timer = window.setTimeout(
          () => {
            this.emitShockwave(wx, wy, color, this.cellSize * 0.8);
            this.particlePool?.emit({
              x: wx,
              y: wy,
              count: 15,
              colors: [color, 0xffffff],
              speedMin: 2,
              speedMax: 6,
            });
            if (this.app && !prefersReducedMotion()) {
              emitGlowBurst(this.app.stage, wx, wy, color, {
                radius: this.cellSize * 0.55,
                peakBlur: 14,
                durationSec: 0.45,
              });
            }
          },
          this.scaleMs(offset * 100),
        );
        this.lineFxTimers.push(timer);
      }

      const payoutPoint = points[Math.floor(points.length / 2)] ?? points[0];
      if (payoutPoint) {
        this.emitWinAmountLabel(
          payoutPoint.x + this.cellSize * 0.16,
          payoutPoint.y - this.cellSize * 0.18,
          line.payout,
          payoutAmount,
          color,
          this.scaleMs(180),
        );
      }
    }

    if (jackpot) {
      const timer = window.setTimeout(() => {
        if (this.flashOverlay) {
          gsap.fromTo(
            this.flashOverlay,
            { alpha: 0.4 },
            { alpha: 0, duration: this.scaleSec(0.8), ease: 'power2.out' },
          );
        }
        const cx = this.width / 2;
        const cy = this.height / 2;
        this.emitShockwave(cx, cy, COLOR_AMBER, this.width * 0.4);
        this.emitShockwave(cx, cy, COLOR_EMBER, this.width * 0.5, this.scaleSec(0.15));
        // L4 mega tier
        const cfg = TIER_CONFIG.mega;
        this.particlePool?.emit({
          x: cx,
          y: cy,
          count: cfg.particles,
          colors: [COLOR_AMBER, COLOR_EMBER, COLOR_VIOLET, 0xffffff],
          speedMin: 3,
          speedMax: 12,
        });
        this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
        if (this.app)
          emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_AMBER, cfg.edgeGlowMs / 1000);
        if (this.app) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_AMBER, 1.5);
      }, this.scaleMs(500));
      this.lineFxTimers.push(timer);
    } else if (lines.length >= 2) {
      const timer = window.setTimeout(
        () => this.shaker?.shake(5, this.scaleSec(0.35)),
        this.scaleMs(300),
      );
      this.lineFxTimers.push(timer);
    }
  }

  private showClusterWin(line: HotlineLine, payoutAmount?: number): void {
    const positions = line.positions ?? [];
    if (positions.length === 0 || !this.winLinesLayer) return;
    const color =
      this.theme.symbols[line.symbol]?.accentValue ?? getHotlineSymbolMeta(line.symbol).accentValue;

    for (const pos of positions) {
      const reel = this.reels[pos.reel];
      const sym = reel?.symbols[pos.row];
      if (!reel || !sym) continue;
      const x = this.reelX0 + pos.reel * (this.cellWidth + this.reelGap) + this.cellWidth / 2;
      const y = this.reelY0 + pos.row * this.cellSize + this.cellSize / 2;
      const ring = new Graphics();
      ring.roundRect(
        x - this.cellSize * 0.45,
        y - this.cellSize * 0.45,
        this.cellSize * 0.9,
        this.cellSize * 0.9,
        this.cellSize * 0.16,
      );
      ring.stroke({ color, width: 3, alpha: 0.78 });
      ring.alpha = 0;
      this.winLinesLayer.addChild(ring);
      gsap.fromTo(
        ring,
        { alpha: 0 },
        { alpha: 1, duration: this.scaleSec(0.22), ease: 'power2.out' },
      );
      gsap.to(ring, {
        alpha: 0.18,
        duration: this.scaleSec(0.34),
        delay: this.scaleSec(0.52),
        ease: 'power2.in',
      });
      gsap.to(sym.scale, {
        x: 1.14,
        y: 1.14,
        duration: this.scaleSec(0.2),
        ease: 'power2.out',
        yoyo: true,
        repeat: 3,
      });
      this.particlePool?.emit({
        x,
        y,
        count: positions.length >= 10 ? 5 : 3,
        colors: [color, 0xffffff],
        speedMin: 1,
        speedMax: 3.6,
      });
    }

    const anchor = positions[Math.floor(positions.length / 2)] ?? positions[0];
    if (anchor) {
      const x = this.reelX0 + anchor.reel * (this.cellWidth + this.reelGap) + this.cellWidth / 2;
      const y = this.reelY0 + anchor.row * this.cellSize + this.cellSize / 2;
      this.emitWinAmountLabel(
        x + this.cellSize * 0.16,
        y - this.cellSize * 0.18,
        line.payout,
        payoutAmount,
        color,
        this.scaleMs(160),
      );
    }
  }

  private showCascadeStepWinPop(
    step: HotlineCascadeStep,
    winPop: HotlineCascadeWinPop | void,
    payoutAmount?: number,
  ): void {
    if (!this.winLinesLayer || step.removed.length === 0 || step.multiplier <= 0) return;

    const centroid = step.removed.reduce(
      (sum, position) => ({
        reel: sum.reel + position.reel,
        row: sum.row + position.row,
      }),
      { reel: 0, row: 0 },
    );
    const reel = centroid.reel / step.removed.length;
    const row = centroid.row / step.removed.length;
    const x = this.reelX0 + reel * (this.cellWidth + this.reelGap) + this.cellWidth / 2;
    const y = this.reelY0 + row * this.cellSize + this.cellSize / 2;
    const value =
      typeof payoutAmount === 'number' && Number.isFinite(payoutAmount) && payoutAmount > 0
        ? step.multiplier * payoutAmount
        : step.multiplier;
    const fallbackText =
      typeof payoutAmount === 'number' && Number.isFinite(payoutAmount) && payoutAmount > 0
        ? `+${this.formatWinAmount(value)}`
        : `+${this.formatWinAmount(value)}×`;
    const text = winPop?.amount ?? fallbackText;
    const color =
      this.theme.symbols[step.lines[0]?.symbol ?? 0]?.accentValue ??
      getHotlineSymbolMeta(step.lines[0]?.symbol ?? 0).accentValue;

    const container = new Container();
    container.x = Math.max(
      this.reelX0 + this.cellWidth * 0.45,
      Math.min(x, this.width - this.cellWidth * 0.7),
    );
    container.y = Math.max(
      this.reelY0 + this.cellSize * 0.45,
      Math.min(y, this.height - this.cellSize * 0.75),
    );
    container.alpha = 0;
    container.scale.set(0.78);

    const style = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: Math.max(18, Math.min(42, this.cellSize * 0.34)),
      fill: COLOR_WHITE,
      fontWeight: '900',
      letterSpacing: 0.2,
      stroke: { color: COLOR_INK, width: 6 },
      dropShadow: {
        color,
        alpha: 0.95,
        blur: 14,
        distance: 0,
      },
    });
    const label = new Text({ text, style });
    label.anchor.set(0.5);
    const boundsWidth = Math.max(this.cellWidth * 1.6, label.width + this.cellWidth * 0.34);
    const boundsHeight = Math.max(this.cellSize * 0.46, label.height + this.cellSize * 0.16);
    const plate = new Graphics()
      .roundRect(-boundsWidth / 2, -boundsHeight / 2, boundsWidth, boundsHeight, boundsHeight * 0.32)
      .fill({ color: COLOR_INK, alpha: 0.72 })
      .stroke({ color, width: 2.4, alpha: 0.72 });
    container.addChild(plate);
    container.addChild(label);
    this.winLinesLayer.addChild(container);

    gsap.to(container, {
      alpha: 1,
      duration: this.scaleSec(0.14),
      ease: 'power2.out',
    });
    gsap.to(container.scale, {
      x: 1,
      y: 1,
      duration: this.scaleSec(0.22),
      ease: 'back.out(1.8)',
    });
    gsap.to(container, {
      y: container.y - this.cellSize * 0.38,
      alpha: 0,
      duration: this.scaleSec(0.58),
      delay: this.scaleSec(0.78),
      ease: 'power2.in',
      onComplete: () => {
        this.winLinesLayer?.removeChild(container);
        container.destroy({ children: true });
      },
    });
  }

  private emitWinAmountLabel(
    x: number,
    y: number,
    multiplier: number,
    payoutAmount: number | undefined,
    color: number,
    delayMs = 0,
  ): void {
    if (!this.winLinesLayer || multiplier <= 0) return;
    const value =
      typeof payoutAmount === 'number' && Number.isFinite(payoutAmount) && payoutAmount > 0
        ? multiplier * payoutAmount
        : multiplier;
    const suffix =
      typeof payoutAmount === 'number' && Number.isFinite(payoutAmount) && payoutAmount > 0
        ? ''
        : '×';
    const style = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: Math.max(14, Math.min(32, this.cellSize * 0.24)),
      fill: COLOR_WHITE,
      fontWeight: '900',
      letterSpacing: 0.4,
      stroke: { color: COLOR_INK, width: 5 },
      dropShadow: {
        color,
        alpha: 0.8,
        blur: 10,
        distance: 0,
      },
    });
    const label = new Text({ text: `+${this.formatWinAmount(value)}${suffix}`, style });
    label.anchor.set(0.5);
    label.x = x;
    label.y = y;
    label.alpha = 0;
    label.scale.set(0.82);
    this.winLinesLayer.addChild(label);

    const delay = delayMs / 1000;
    gsap.to(label, {
      alpha: 1,
      duration: this.scaleSec(0.14),
      delay,
      ease: 'power2.out',
    });
    gsap.to(label.scale, {
      x: 1,
      y: 1,
      duration: this.scaleSec(0.18),
      delay,
      ease: 'back.out(1.9)',
    });
    gsap.to(label, {
      alpha: 0,
      y: y - this.cellSize * 0.3,
      duration: this.scaleSec(0.4),
      delay: delay + this.scaleSec(0.64),
      ease: 'power2.in',
      onComplete: () => {
        this.winLinesLayer?.removeChild(label);
        label.destroy();
      },
    });
  }

  private formatWinAmount(value: number): string {
    if (!Number.isFinite(value)) return '0';
    const rounded = Number(value.toFixed(2));
    return rounded.toLocaleString('en-US', {
      minimumFractionDigits: rounded % 1 === 0 ? 0 : 2,
      maximumFractionDigits: 2,
    });
  }

  private normalizeLinePath(line: HotlineLine): number[] {
    const fallbackRow = this.clampLineRow(line.row);
    const fallback = Array.from({ length: this.reelCount }, () => fallbackRow);
    if (!Array.isArray(line.path) || line.path.length < this.reelCount) return fallback;
    return line.path.slice(0, this.reelCount).map((row) => this.clampLineRow(row));
  }

  private clampLineRow(row: number): number {
    if (!Number.isFinite(row)) return 0;
    const maxRow = Math.max(0, Math.min(MEGA_ROWS, this.rowCount) - 1);
    return Math.max(0, Math.min(maxRow, Math.trunc(row)));
  }

  private clampLineStart(startReel?: number): number {
    if (typeof startReel !== 'number' || !Number.isFinite(startReel)) return 0;
    return Math.max(0, Math.min(this.reelCount - 1, Math.trunc(startReel)));
  }

  /**
   * 重置中獎連線（下一局前呼叫）
   */
  resetWinLines(): void {
    for (const timer of this.lineFxTimers) window.clearTimeout(timer);
    this.lineFxTimers = [];

    if (this.winLinesLayer) {
      this.winLinesLayer.clear();
      this.destroyLayerChildren(this.winLinesLayer);
    }
    if (this.flashOverlay) {
      gsap.killTweensOf(this.flashOverlay);
      this.flashOverlay.alpha = 0;
    }
    if (this.shockwaves) {
      this.destroyLayerChildren(this.shockwaves);
    }
    if (this.particles) {
      this.destroyLayerChildren(this.particles);
    }
    this.particleList = [];
    for (const reel of this.reels) {
      for (const sym of reel.symbols) {
        gsap.killTweensOf(sym.scale);
        sym.scale.set(1);
        sym.alpha = 1;
      }
    }
  }

  private destroyLayerChildren(layer: Container): void {
    const children = layer.removeChildren();
    for (const child of children) {
      gsap.killTweensOf(child);
      const scale = (child as { scale?: unknown }).scale;
      if (scale) gsap.killTweensOf(scale);
      if (!(child as { destroyed?: boolean }).destroyed) child.destroy({ children: true });
    }
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 5, alpha: 0.8 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: this.scaleSec(0.7),
      delay: this.scaleSec(delay),
      ease: 'power2.out',
      onUpdate: () => {
        if (ring.destroyed) return;
        ring.clear().circle(x, y, state.r).stroke({ color, width: 3, alpha: state.alpha });
      },
      onComplete: () => {
        if (ring.destroyed) return;
        this.shockwaves?.removeChild(ring);
        ring.destroy();
      },
    });
  }

  private emitParticles(x: number, y: number, count: number, colors: number[]): void {
    if (!this.particles) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 3 + Math.random() * 9;
      const size = 2 + Math.random() * 3;
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
        life: 40 + Math.random() * 25,
        maxLife: 65,
        gravity: 0.18,
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
    Sfx.slotSpinStop();
    this.stopAnticipation();
    this.resetWinLines();
    if (this.ambientTicker && this.app) this.app.ticker.remove(this.ambientTicker);
    if (this.particleTicker && this.app) this.app.ticker.remove(this.particleTicker);
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.winFx?.dispose();
    this.winFx = null;
    this.app?.destroy(false, { children: true });
    this.app = null;
    this.reels = [];
    this.reelsContainer = null;
    this.winLinesLayer = null;
    this.particles = null;
    this.shockwaves = null;
    this.flashOverlay = null;
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
