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
} from '@bg/game-engine';
import { HOTLINE_SYMBOLS, getHotlineSymbolMeta } from '@/lib/hotlineSymbols';
import { getSlotTheme, type SlotThemeConfig } from '@/lib/slotThemes';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0x0F172A;
const COLOR_TILE_BG = 0xFFFFFF;
const COLOR_TILE_STROKE = 0xC9A247;
const COLOR_ACID = 0xF3D67D;
const COLOR_VIOLET = 0xE8D48A;
const COLOR_EMBER = 0xD4574A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_AMBER = 0xF3D67D;
const COLOR_ICE = 0x266F85;
const COLOR_INK = 0x0A0806;
const COLOR_WHITE = 0xFFFFFF;
const SYMBOL_COUNT = HOTLINE_SYMBOLS.length;
const DEFAULT_REELS = 5;
const ROWS = 3;
const REEL_STRIP_LEN = 12; // reel 內部轉動用的延伸符號

function fitSpriteCover(sprite: Sprite, width: number, height: number): void {
  const textureWidth = sprite.texture.width || width;
  const textureHeight = sprite.texture.height || height;
  const scale = Math.max(width / textureWidth, height / textureHeight);
  sprite.scale.set(scale);
  sprite.x = (width - textureWidth * scale) / 2;
  sprite.y = (height - textureHeight * scale) / 2;
}

interface HotlineLine {
  lineId?: string;
  path?: number[];
  startReel?: number;
  direction?: 'ltr' | 'rtl';
  row: number;
  symbol: number;
  count: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

interface ReelData {
  container: Container;
  symbols: Container[];
  cellSize: number;
  strip: number[]; // 滾動用 symbol index 陣列
  stripOffset: number; // 當前偏移
}

export class HotlineScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private theme: SlotThemeConfig = getSlotTheme('cyber');
  private reelCount = DEFAULT_REELS;
  private backgroundTexture: Texture | null = null;
  private symbolSheetTexture: Texture | null = null;
  private symbolTextures: Texture[] = [];

  private reels: ReelData[] = [];
  private reelsContainer: Container | null = null;
  private winLinesLayer: Graphics | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private flashOverlay: Graphics | null = null;

  private cellSize = 0;
  private reelGap = 8;
  private reelX0 = 0;
  private reelY0 = 0;

  private particleList: Particle[] = [];
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;
  private lineFxTimers: number[] = [];


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

    await this.preloadThemeAssets();
    this.createBackground();

    // 計算 reel 尺寸
    const padding = 24;
    const availableW = width - padding * 2;
    this.cellSize = Math.min(
      (availableW - this.reelGap * (this.reelCount - 1)) / this.reelCount,
      (height - padding * 2) / ROWS,
    );
    const reelsWidth = this.cellSize * this.reelCount + this.reelGap * (this.reelCount - 1);
    const reelsHeight = this.cellSize * ROWS;
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

    this.particlePool = new ParticlePool(app.stage, 250);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    // 全螢幕閃光（JACKPOT 用）
    this.flashOverlay = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: COLOR_AMBER, alpha: 0 });
    app.stage.addChild(this.flashOverlay);

    this.startTickers();
  }

  private async preloadThemeAssets(): Promise<void> {
    const [backgroundTexture, symbolSheetTexture] = await Promise.all([
      Assets.load<Texture>(this.theme.background).catch(() => null),
      Assets.load<Texture>(this.theme.symbolSheet).catch(() => null),
    ]);
    this.backgroundTexture = backgroundTexture;
    this.symbolSheetTexture = symbolSheetTexture;
    this.symbolTextures = this.createSymbolTextures(symbolSheetTexture);
  }

  private createSymbolTextures(sheet: Texture | null): Texture[] {
    if (!sheet) return [];
    const cellW = sheet.width / 3;
    const cellH = sheet.height / 2;
    return Array.from({ length: SYMBOL_COUNT }, (_, symbolIdx) => {
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
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.92 });
    this.app.stage.addChild(bg);

    if (this.backgroundTexture) {
      const background = new Sprite(this.backgroundTexture);
      fitSpriteCover(background, this.width, this.height);
      background.alpha = 0.92;
      this.app.stage.addChild(background);
    }

    const stageShade = new Graphics()
      .rect(0, 0, this.width, this.height)
      .fill({ color: 0x020817, alpha: 0.22 });
    this.app.stage.addChild(stageShade);

    const glow = new Graphics()
      .circle(this.width / 2, this.height / 2, this.width * 0.4)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 頂部/底部光條
    const topBar = new Graphics()
      .rect(0, 0, this.width, 2)
      .fill({ color: COLOR_ACID, alpha: 0.4 });
    const bottomBar = new Graphics()
      .rect(0, this.height - 2, this.width, 2)
      .fill({ color: COLOR_ACID, alpha: 0.4 });
    this.app.stage.addChild(topBar);
    this.app.stage.addChild(bottomBar);
  }

  private createReel(reelIndex: number): void {
    if (!this.reelsContainer) return;

    const reelX = this.reelX0 + reelIndex * (this.cellSize + this.reelGap);
    const reelY = this.reelY0;

    // 遮罩（防止符號溢出）
    const mask = new Graphics()
      .rect(reelX, reelY, this.cellSize, this.cellSize * ROWS)
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
      strip.push(Math.floor(Math.random() * SYMBOL_COUNT));
    }

    const symbols: Container[] = [];
    for (let i = 0; i < REEL_STRIP_LEN; i += 1) {
      const sym = this.createSymbolTile(strip[i]!);
      sym.x = this.cellSize / 2;
      sym.y = i * this.cellSize + this.cellSize / 2;
      reelContainer.addChild(sym);
      symbols.push(sym);
    }

    this.reels.push({
      container: reelContainer,
      symbols,
      cellSize: this.cellSize,
      strip,
      stripOffset: 0,
    });

    // Reel 邊框
    const frame = new Graphics()
      .roundRect(reelX - 2, reelY - 2, this.cellSize + 4, this.cellSize * ROWS + 4, 8)
      .stroke({ color: COLOR_TILE_STROKE, width: 2 });
    this.reelsContainer.addChild(frame);
  }

  private createSymbolTile(symbolIdx: number): Container {
    const c = new Container();
    this.renderSymbolTile(c, symbolIdx);
    return c;
  }

  private renderSymbolTile(c: Container, symbolIdx: number): void {
    const oldChildren = c.removeChildren();
    for (const child of oldChildren) child.destroy({ children: true });

    const size = this.cellSize;
    const meta = getHotlineSymbolMeta(symbolIdx);
    const themeSymbol = this.theme.symbols[symbolIdx] ?? this.theme.symbols[0];
    const color = themeSymbol?.accentValue ?? meta.accentValue;

    // tile 陰影
    const shadow = new Graphics()
      .roundRect(-size / 2 + 4 + 1, -size / 2 + 4 + 2, size - 8, size - 8, 12)
      .fill({ color: COLOR_INK, alpha: 0.1 });
    c.addChild(shadow);

    const symbolTexture = this.symbolTextures[symbolIdx];
    if (symbolTexture) {
      const sprite = new Sprite(symbolTexture);
      sprite.anchor.set(0.5);
      const target = size - 8;
      const scale = Math.max(target / symbolTexture.width, target / symbolTexture.height);
      sprite.scale.set(scale);
      sprite.alpha = 0.98;
      c.addChild(sprite);

      const frame = new Graphics()
        .roundRect(-size / 2 + 3, -size / 2 + 3, size - 6, size - 6, 12)
        .stroke({ color, width: 2, alpha: 0.52 });
      c.addChild(frame);

      const shine = new Graphics()
        .roundRect(-size / 2 + 7, -size / 2 + 7, size - 14, (size - 14) * 0.34, 10)
        .fill({ color: COLOR_WHITE, alpha: 0.08 });
      c.addChild(shine);
      return;
    }

    // tile 主體
    const tile = new Graphics()
      .roundRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 12)
      .fill({ color: COLOR_TILE_BG })
      .stroke({ color, width: 2, alpha: 0.35 });
    c.addChild(tile);

    // tile 頂部高光
    const hl = new Graphics()
      .roundRect(-size / 2 + 8, -size / 2 + 8, size - 16, (size - 16) * 0.3, 8)
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

  private createSymbolGlyphGraphic(symbolIdx: number, size: number): Container {
    const meta = getHotlineSymbolMeta(symbolIdx);
    const color = meta.accentValue;
    const icon = new Container();
    const u = size;

    if (meta.key === 'cherry') {
      icon.addChild(
        new Graphics().circle(-u * 0.2, u * 0.12, u * 0.16).fill({ color, alpha: 0.14 }).stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics().circle(u * 0.18, u * 0.12, u * 0.16).fill({ color, alpha: 0.14 }).stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .moveTo(-u * 0.08, -u * 0.02)
          .lineTo(u * 0.02, -u * 0.26)
          .lineTo(u * 0.16, -u * 0.38)
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .moveTo(u * 0.08, -u * 0.02)
          .lineTo(-u * 0.02, -u * 0.26)
          .lineTo(-u * 0.16, -u * 0.38)
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics()
          .poly([u * 0.06, -u * 0.44, u * 0.27, -u * 0.39, u * 0.2, -u * 0.22, u * 0.02, -u * 0.28])
          .fill({ color, alpha: 0.14 })
          .stroke({ color, width: 2 }),
      );
      return icon;
    }

    if (meta.key === 'bell') {
      icon.addChild(
        new Graphics()
          .poly([
            -u * 0.24, -u * 0.08,
            -u * 0.28, u * 0.16,
            -u * 0.18, u * 0.34,
            u * 0.18, u * 0.34,
            u * 0.28, u * 0.16,
            u * 0.24, -u * 0.08,
          ])
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(
        new Graphics().roundRect(-u * 0.09, -u * 0.34, u * 0.18, u * 0.08, 6).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 }),
      );
      icon.addChild(new Graphics().circle(0, u * 0.25, u * 0.05).fill({ color }).stroke({ color, width: 1.5 }));
      icon.addChild(
        new Graphics().moveTo(-u * 0.12, u * 0.4).lineTo(u * 0.12, u * 0.4).stroke({ color, width: 2 }),
      );
      return icon;
    }

    if (meta.key === 'seven') {
      icon.addChild(
        new Graphics()
          .poly([
            -u * 0.3, -u * 0.36,
            u * 0.3, -u * 0.36,
            u * 0.24, -u * 0.16,
            u * 0.06, -u * 0.16,
            -u * 0.08, u * 0.18,
            u * 0.12, u * 0.18,
            u * 0.02, u * 0.4,
            -u * 0.2, u * 0.4,
            -u * 0.02, -u * 0.04,
            -u * 0.34, -u * 0.04,
          ])
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      return icon;
    }

    if (meta.key === 'bar') {
      icon.addChild(
        new Graphics().roundRect(-u * 0.32, -u * 0.26, u * 0.64, u * 0.52, 12).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 }),
      );
      for (const y of [-u * 0.11, 0, u * 0.11]) {
        icon.addChild(
          new Graphics().roundRect(-u * 0.18, y - u * 0.025, u * 0.36, u * 0.05, 5).fill({ color }).stroke({ color, width: 1.2 }),
        );
      }
      return icon;
    }

    if (meta.key === 'diamond') {
      icon.addChild(
        new Graphics()
          .poly([0, -u * 0.36, u * 0.28, 0, 0, u * 0.36, -u * 0.28, 0])
          .fill({ color, alpha: 0.12 })
          .stroke({ color, width: 2 }),
      );
      icon.addChild(new Graphics().moveTo(0, -u * 0.36).lineTo(0, u * 0.36).stroke({ color, width: 1.5, alpha: 0.65 }));
      icon.addChild(new Graphics().moveTo(-u * 0.28, 0).lineTo(u * 0.28, 0).stroke({ color, width: 1.5, alpha: 0.65 }));
      return icon;
    }

    icon.addChild(
      new Graphics()
        .poly([
          -u * 0.34, u * 0.26,
          -u * 0.28, -u * 0.1,
          -u * 0.12, u * 0.06,
          0, -u * 0.24,
          u * 0.12, u * 0.06,
          u * 0.28, -u * 0.1,
          u * 0.34, u * 0.26,
        ])
        .fill({ color, alpha: 0.12 })
        .stroke({ color, width: 2 }),
    );
    icon.addChild(new Graphics().roundRect(-u * 0.34, u * 0.2, u * 0.68, u * 0.1, 6).fill({ color, alpha: 0.12 }).stroke({ color, width: 2 }));
    icon.addChild(new Graphics().circle(-u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
    icon.addChild(new Graphics().circle(0, -u * 0.32, u * 0.04).fill({ color }));
    icon.addChild(new Graphics().circle(u * 0.28, -u * 0.16, u * 0.04).fill({ color }));
    return icon;
  }

  private startTickers(): void {
    if (!this.app) return;
    this.ambientTicker = (_tk: Ticker) => {
      // 暫無 ambient 效果
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
   * 播放開轉動畫
   * finalGrid: [reel][row] = symbol index — 後端傳回的最終結果
   * lines: 中獎連線
   */
  /**
   * 樂觀動畫：按下 SPIN 立刻讓轉軸開始連續滾動（無結果）。
   * API 回來呼叫 playSpin(...) 接手停到最終 grid。
   */
  private anticipating = false;
  startAnticipation(): void {
    if (this.anticipating) return;
    this.anticipating = true;
    for (let reelIndex = 0; reelIndex < this.reels.length; reelIndex += 1) {
      const reel = this.reels[reelIndex]!;
      const totalH = REEL_STRIP_LEN * reel.cellSize;
      for (const sym of reel.symbols) {
        gsap.killTweensOf(sym);
        gsap.to(sym, {
          y: `+=${this.cellSize * 1.2}`,
          duration: 0.1 + reelIndex * 0.015,
          ease: 'none',
          repeat: -1,
          modifiers: {
            y: (yStr) => {
              const yN = Number.parseFloat(yStr);
              const wrapped = ((yN - reel.cellSize / 2) % totalH + totalH) % totalH + reel.cellSize / 2;
              return `${wrapped}`;
            },
          },
        });
      }
    }
  }

  stopAnticipation(): void {
    if (!this.anticipating) return;
    for (const reel of this.reels) {
      for (const sym of reel.symbols) gsap.killTweensOf(sym);
      this.normalizeReel(reel);
    }
    this.anticipating = false;
  }

  async playSpin(finalGrid: number[][], lines: HotlineLine[]): Promise<void> {
    this.stopAnticipation();
    this.resetWinLines();

    const duration = 1.15;
    const reelPromises = this.reels.map((reel, reelIdx) =>
      this.spinReel(reel, reelIdx, finalGrid[reelIdx]!, duration + reelIdx * 0.08, reelIdx * 0.04),
    );

    await Promise.all(reelPromises);

    // 全部停完 → 顯示中獎連線
    if (lines.length > 0) {
      await this.sleep(200);
      this.showWinLines(lines);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((r) => setTimeout(r, ms));
  }

  private spinReel(
    reel: ReelData,
    reelIndex: number,
    finalColumn: number[],
    duration: number,
    delay: number,
  ): Promise<void> {
    return new Promise<void>((resolve) => {
      const { container, symbols } = reel;
      const cellSize = reel.cellSize;

      // 目標：讓 finalColumn 對應到 reel 的前 ROWS 個位置
      // 策略：滾動 N 圈後，重繪符號並 snap 到起點
      const spinCycles = 3 + reelIndex * 0.5; // 後面的 reel 多轉一點
      const pixelsPerCycle = REEL_STRIP_LEN * cellSize;
      const totalScroll = spinCycles * pixelsPerCycle;

      // 存一個 offset 變數
      const state = { offset: 0 };
      const startOffsets = symbols.map((s) => s.y);

      gsap.to(state, {
        offset: totalScroll,
        duration,
        delay,
        ease: 'power3.out',
        onUpdate: () => {
          // 更新每個符號的 y
          for (let i = 0; i < symbols.length; i += 1) {
            const baseY = startOffsets[i]!;
            let newY = baseY + state.offset;
            // 循環：超過下方就從上方出現
            const totalH = REEL_STRIP_LEN * cellSize;
            newY = ((newY % totalH) + totalH) % totalH;
            symbols[i]!.y = newY;
          }
        },
        onComplete: () => {
          // 重繪 final 3 個位置
          // 把前 3 個 symbol 重新畫成 finalColumn
          // 其他保持原樣
          // 但符號的 y 位置需要從 state.offset 停止處推算
          // 最終把前 ROWS 個（y 從小到大）指定為 finalColumn
          // 簡單做法：重建整個 reel 的 strip，讓前 ROWS 個 = finalColumn
          this.snapReelToFinal(reel, finalColumn);
          // 反彈
          gsap.fromTo(
            container.scale,
            { y: 1 },
            {
              y: 0.94,
              duration: 0.08,
              ease: 'power2.out',
              yoyo: true,
              repeat: 1,
              onComplete: () => resolve(),
            },
          );
        },
      });
    });
  }

  private snapReelToFinal(reel: ReelData, finalColumn: number[]): void {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    const newStrip: number[] = [];
    for (let i = 0; i < ROWS; i += 1) newStrip.push(finalColumn[i]!);
    for (let i = ROWS; i < REEL_STRIP_LEN; i += 1) {
      newStrip.push(Math.floor(Math.random() * SYMBOL_COUNT));
    }
    reel.strip = newStrip;
    for (let i = 0; i < REEL_STRIP_LEN; i += 1) {
      const symbol = ordered[i]!;
      gsap.killTweensOf(symbol);
      gsap.killTweensOf(symbol.scale);
      symbol.scale.set(1);
      symbol.alpha = 1;
      symbol.x = reel.cellSize / 2;
      symbol.y = i * reel.cellSize + reel.cellSize / 2;
      this.renderSymbolTile(symbol, newStrip[i]!);
    }
    reel.symbols = ordered;
  }

  private normalizeReel(reel: ReelData): void {
    const ordered = [...reel.symbols].sort((a, b) => a.y - b.y);
    for (let i = 0; i < ordered.length; i += 1) {
      const symbol = ordered[i]!;
      symbol.x = reel.cellSize / 2;
      symbol.y = i * reel.cellSize + reel.cellSize / 2;
    }
    reel.symbols = ordered;
  }

  private showWinLines(lines: HotlineLine[]): void {
    if (!this.winLinesLayer) return;
    for (const line of lines) {
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
          x: this.reelX0 + reelIdx * (this.cellSize + this.reelGap) + this.cellSize / 2,
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

      gsap.fromTo(g, { alpha: 0 }, { alpha: 1, duration: 0.3, ease: 'power2.out' });

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
          duration: 0.25,
          ease: 'power2.out',
          yoyo: true,
          repeat: 3,
          delay: offset * 0.1,
        });

        const { x: wx, y: wy } = points[offset]!;
        const timer = window.setTimeout(() => {
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
        }, offset * 100);
        this.lineFxTimers.push(timer);
      }
    }

    const jackpot = lines.find((l) => l.count === 5);
    if (jackpot) {
      const timer = window.setTimeout(() => {
        if (this.flashOverlay) {
          gsap.fromTo(
            this.flashOverlay,
            { alpha: 0.4 },
            { alpha: 0, duration: 0.8, ease: 'power2.out' },
          );
        }
        const cx = this.width / 2;
        const cy = this.height / 2;
        this.emitShockwave(cx, cy, COLOR_AMBER, this.width * 0.4);
        this.emitShockwave(cx, cy, COLOR_EMBER, this.width * 0.5, 0.15);
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
        if (this.app) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_AMBER, cfg.edgeGlowMs / 1000);
        if (this.app) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_AMBER, 1.5);
      }, 500);
      this.lineFxTimers.push(timer);
    } else if (lines.length >= 2) {
      const timer = window.setTimeout(() => this.shaker?.shake(5, 0.35), 300);
      this.lineFxTimers.push(timer);
    }
  }

  private normalizeLinePath(line: HotlineLine): number[] {
    const fallbackRow = this.clampLineRow(line.row);
    const fallback = Array.from({ length: this.reelCount }, () => fallbackRow);
    if (!Array.isArray(line.path) || line.path.length < this.reelCount) return fallback;
    return line.path.slice(0, this.reelCount).map((row) => this.clampLineRow(row));
  }

  private clampLineRow(row: number): number {
    if (!Number.isFinite(row)) return 0;
    return Math.max(0, Math.min(ROWS - 1, Math.trunc(row)));
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
      const children = this.winLinesLayer.removeChildren();
      for (const child of children) child.destroy({ children: true });
    }
    if (this.flashOverlay) {
      gsap.killTweensOf(this.flashOverlay);
      this.flashOverlay.alpha = 0;
    }
    if (this.shockwaves) {
      const children = this.shockwaves.removeChildren();
      for (const child of children) child.destroy({ children: true });
    }
    if (this.particles) {
      const children = this.particles.removeChildren();
      for (const child of children) child.destroy({ children: true });
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

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 5, alpha: 0.8 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: 0.7,
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
    this.app?.destroy(true, { children: true });
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
