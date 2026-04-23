import { Application, Container, Graphics, Text, TextStyle, Ticker, BlurFilter } from 'pixi.js';
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

const COLOR_BG = 0xFBF9F4;
const COLOR_TILE = 0xffffff;
const COLOR_TILE_STROKE = 0xD1AD5A;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x86B49C;
const COLOR_AMBER = 0xC9A24C;
const COLOR_INK = 0x0A0806;

export type MinesCellState = 'hidden' | 'gem' | 'mine';

export interface MinesCellClick {
  index: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class MinesScene {
  private app: Application | null = null;
  private cells: MinesCell[] = [];
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private floatingTexts: Container | null = null;
  private onCellClick: ((e: MinesCellClick) => void) | null = null;
  private clickDisabled = false;

  private particleList: Particle[] = [];
  private particleTicker: ((tk: Ticker) => void) | null = null;
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private gridContainer: Container | null = null;
  private width = 0;
  private height = 0;

  // L4
  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;


  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    onCellClick: (e: MinesCellClick) => void,
  ): Promise<void> {
    this.width = width;
    this.height = height;
    this.onCellClick = onCellClick;
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

    // Grid container
    this.gridContainer = new Container();
    app.stage.addChild(this.gridContainer);

    const padding = 24;
    const gap = 8;
    const gridSize = Math.min(width, height) - padding * 2;
    const cellSize = (gridSize - gap * 4) / 5;
    this.gridContainer.x = (width - gridSize) / 2;
    this.gridContainer.y = (height - gridSize) / 2;

    for (let i = 0; i < 25; i += 1) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const cell = new MinesCell(i, cellSize);
      cell.container.x = col * (cellSize + gap) + cellSize / 2;
      cell.container.y = row * (cellSize + gap) + cellSize / 2;
      cell.container.eventMode = 'static';
      cell.container.cursor = 'pointer';
      cell.container.on('pointertap', () => {
        if (this.clickDisabled || cell.state !== 'hidden') return;
        this.onCellClick?.({ index: i });
      });
      cell.container.on('pointerover', () => {
        if (cell.state === 'hidden' && !this.clickDisabled) {
          cell.onHoverIn();
        }
      });
      cell.container.on('pointerout', () => {
        cell.onHoverOut();
      });
      this.cells.push(cell);
      this.gridContainer.addChild(cell.container);
    }

    // 粒子 / 衝擊波 / 浮動文字
    this.particles = new Container();
    app.stage.addChild(this.particles);
    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);
    this.floatingTexts = new Container();
    app.stage.addChild(this.floatingTexts);

    // L4 pool + shaker
    this.particlePool = new ParticlePool(app.stage, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.startTickers();
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });
    this.app.stage.addChild(bg);

    const glow = new Graphics()
      .circle(this.width / 2, this.height / 2, this.width * 0.5)
      .fill({ color: COLOR_ACID, alpha: 0.06 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    const grid = new Graphics();
    const step = 32;
    for (let x = 0; x < this.width; x += step) {
      for (let y = 0; y < this.height; y += step) {
        grid.circle(x, y, 1).fill({ color: COLOR_ACID, alpha: 0.08 });
      }
    }
    this.app.stage.addChild(grid);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // 隱藏格子微微呼吸
      for (const cell of this.cells) {
        if (cell.state === 'hidden' && !cell.hovered) {
          const breath = Math.sin(tick * 0.03 + cell.index * 0.3) * 0.015;
          cell.container.scale.set(1 + breath);
        }
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
        p.g.scale.set(Math.max(0.1, t) * 1.2);
        if (p.life <= 0) {
          this.particles?.removeChild(p.g);
          p.g.destroy();
          this.particleList.splice(i, 1);
        }
      }
    };
    this.app.ticker.add(this.particleTicker);
  }

  setClickable(enabled: boolean): void {
    this.clickDisabled = !enabled;
  }

  /** 樂觀動畫：點格立刻顯示「準備中」脈動 */
  markPending(index: number): void {
    const cell = this.cells[index];
    if (!cell) return;
    cell.startPendingPulse();
  }

  revealGem(index: number): void {
    const cell = this.cells[index];
    if (!cell) return;
    cell.stopPendingPulse();
    cell.flipToGem();
    // L4 sparkle：粒子用 pool，向上噴（自然重力）
    const gx = (this.gridContainer?.x ?? 0) + cell.container.x;
    const gy = (this.gridContainer?.y ?? 0) + cell.container.y;
    this.particlePool?.emit({
      x: gx,
      y: gy,
      count: 18,
      colors: [COLOR_TOXIC, COLOR_ICE, 0xffffff],
      speedMin: 2,
      speedMax: 6,
      sizeMin: 1.5,
      sizeMax: 3,
      lifeMin: 30,
      lifeMax: 50,
      angleRad: -Math.PI / 2,
      spreadRad: Math.PI * 1.2,
    });
    this.emitShockwave(gx, gy, COLOR_TOXIC, cell.size * 1.1, 0);
    this.showFloatingText(gx, gy, '✓', COLOR_TOXIC);
  }

  revealMine(index: number, big: boolean): void {
    const cell = this.cells[index];
    if (!cell) return;
    cell.stopPendingPulse();
    cell.flipToMine(big);
    if (big) {
      // L4 炸彈：雙層 shockwave + 大量 pool 粒子 + 螢幕震（big bomb 是負面事件，但玩家期待「戲劇化」，保持 shake）
      const gx = (this.gridContainer?.x ?? 0) + cell.container.x;
      const gy = (this.gridContainer?.y ?? 0) + cell.container.y;
      this.emitShockwave(gx, gy, COLOR_EMBER, cell.size * 3, 0);
      this.emitShockwave(gx, gy, COLOR_AMBER, cell.size * 4, 0.15);
      this.particlePool?.emit({
        x: gx,
        y: gy,
        count: 70,
        colors: [COLOR_EMBER, COLOR_AMBER, COLOR_VIOLET],
        speedMin: 4,
        speedMax: 14,
        sizeMin: 2,
        sizeMax: 5,
        lifeMin: 40,
        lifeMax: 80,
        gravity: 0.3,
      });
      this.showFloatingText(gx, gy, '✕', COLOR_EMBER);
      this.shaker?.shake(10, 0.5);
      // 邊緣紅 glow
      if (this.app) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_EMBER, 0.4);
    }
  }

  /** L4: Cash out 成功時呼叫，依 multiplier 決定慶祝強度 */
  celebrateCashout(multiplier: number): void {
    if (!this.app) return;
    const tier = classifyWinTier(multiplier, true);
    const tierCfg = TIER_CONFIG[tier];
    const cx = this.width / 2;
    const cy = this.height / 2;
    if (tierCfg.particles > 0) {
      this.particlePool?.emit({
        x: cx,
        y: cy,
        count: tierCfg.particles,
        colors: [COLOR_TOXIC, COLOR_ICE, COLOR_ACID, 0xffffff],
        speedMin: 3,
        speedMax: 11,
      });
    }
    if (tierCfg.shakeAmp > 0) this.shaker?.shake(tierCfg.shakeAmp, tierCfg.shakeDuration);
    if (tierCfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_TOXIC, tierCfg.edgeGlowMs / 1000);
    if (tierCfg.rayBurst) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_TOXIC, 1.2);
  }

  revealAllMines(positions: number[]): void {
    // 波浪式依序揭露所有雷
    positions.forEach((idx, i) => {
      gsap.delayedCall(0.15 + i * 0.08, () => {
        const cell = this.cells[idx];
        if (!cell || cell.state === 'mine') return;
        cell.flipToMine(false);
        const gx = (this.gridContainer?.x ?? 0) + cell.container.x;
        const gy = (this.gridContainer?.y ?? 0) + cell.container.y;
        this.emitParticles(gx, gy, 6, [COLOR_EMBER], 2, 5, 0.2);
      });
    });
  }

  reset(): void {
    for (const cell of this.cells) cell.reset();
    this.clickDisabled = false;
  }

  private emitShockwave(
    x: number,
    y: number,
    color: number,
    maxRadius: number,
    delay: number,
  ): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 5, alpha: 0.9 };
    gsap.to(state, {
      r: maxRadius,
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

  private emitParticles(
    x: number,
    y: number,
    count: number,
    colors: number[],
    minSpeed: number,
    maxSpeed: number,
    gravity: number,
  ): void {
    if (!this.particles) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = minSpeed + Math.random() * (maxSpeed - minSpeed);
      const size = 2 + Math.random() * 4;
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      const g = new Graphics();
      if (Math.random() > 0.5) {
        g.rect(-size / 2, -size / 2, size, size).fill({ color });
      } else {
        g.circle(0, 0, size).fill({ color });
      }
      g.x = x;
      g.y = y;
      this.particles.addChild(g);
      this.particleList.push({
        g,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 1,
        life: 50 + Math.random() * 30,
        maxLife: 80,
        gravity,
      });
    }
  }

  private showFloatingText(x: number, y: number, content: string, color: number): void {
    if (!this.floatingTexts) return;
    const style = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize: 40,
      fontWeight: '700',
      fill: color,
      align: 'center',
    });
    const text = new Text({ text: content, style });
    text.anchor.set(0.5);
    text.x = x;
    text.y = y;
    this.floatingTexts.addChild(text);
    gsap.fromTo(
      text,
      { alpha: 0, y: y + 10 },
      {
        alpha: 1,
        y: y - 30,
        duration: 0.4,
        ease: 'back.out(2)',
        onComplete: () => {
          gsap.to(text, {
            alpha: 0,
            y: y - 50,
            duration: 0.4,
            delay: 0.3,
            ease: 'power2.in',
            onComplete: () => {
              this.floatingTexts?.removeChild(text);
              text.destroy();
            },
          });
        },
      },
    );
    gsap.fromTo(
      text.scale,
      { x: 0.3, y: 0.3 },
      { x: 1.2, y: 1.2, duration: 0.3, ease: 'back.out(2.5)' },
    );
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
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.winFx?.dispose();
    this.winFx = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.cells = [];
    this.particles = null;
    this.shockwaves = null;
    this.floatingTexts = null;
    this.gridContainer = null;
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}

class MinesCell {
  public state: MinesCellState = 'hidden';
  public hovered = false;
  public readonly container: Container;
  private readonly tile: Graphics;
  private readonly content: Container;
  private readonly glow: Graphics;

  constructor(
    public readonly index: number,
    public readonly size: number,
  ) {
    this.container = new Container();

    // Glow 在最底
    this.glow = new Graphics();
    this.container.addChild(this.glow);

    this.tile = new Graphics();
    this.drawHidden();
    this.container.addChild(this.tile);

    this.content = new Container();
    this.container.addChild(this.content);
  }

  private drawHidden(): void {
    const s = this.size;
    this.tile
      .clear()
      // 陰影
      .roundRect(-s / 2 + 2, -s / 2 + 4, s, s, 14)
      .fill({ color: COLOR_INK, alpha: 0.08 })
      // 本體
      .roundRect(-s / 2, -s / 2, s, s, 14)
      .fill({ color: COLOR_TILE })
      .stroke({ color: COLOR_TILE_STROKE, width: 1.5 })
      // 頂部高光
      .roundRect(-s / 2 + 3, -s / 2 + 3, s - 6, (s - 6) * 0.35, 10)
      .fill({ color: COLOR_ACID, alpha: 0.04 })
      // 中心紫色 accent dot
      .circle(0, 0, s * 0.06)
      .fill({ color: COLOR_ACID, alpha: 0.25 });
  }

  onHoverIn(): void {
    this.hovered = true;
    gsap.to(this.container.scale, { x: 1.06, y: 1.06, duration: 0.2, ease: 'power2.out' });
    gsap.to(this.container, { y: this.container.y - 2, duration: 0.2, ease: 'power2.out' });
    // glow
    const s = this.size;
    this.glow
      .clear()
      .roundRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, 16)
      .fill({ color: COLOR_ACID, alpha: 0.2 });
    this.glow.filters = [new BlurFilter({ strength: 8 })];
    gsap.fromTo(this.glow, { alpha: 0 }, { alpha: 1, duration: 0.2 });
  }

  /** 樂觀動畫：點格後立刻顯示「準備中」金色脈動，至 reveal 時停止 */
  startPendingPulse(): void {
    const s = this.size;
    this.glow
      .clear()
      .roundRect(-s / 2 - 4, -s / 2 - 4, s + 8, s + 8, 16)
      .fill({ color: 0xC9A24C, alpha: 0.35 });
    this.glow.filters = [new BlurFilter({ strength: 10 })];
    gsap.killTweensOf(this.glow);
    gsap.fromTo(this.glow, { alpha: 0.2 }, { alpha: 0.9, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
    gsap.to(this.container.scale, { x: 1.03, y: 1.03, duration: 0.3, ease: 'sine.inOut', yoyo: true, repeat: -1 });
  }

  stopPendingPulse(): void {
    gsap.killTweensOf(this.glow);
    gsap.killTweensOf(this.container.scale);
    this.glow.clear();
    this.container.scale.set(1);
  }

  onHoverOut(): void {
    this.hovered = false;
    gsap.to(this.container.scale, { x: 1, y: 1, duration: 0.25, ease: 'power2.out' });
    const origY = this.container.y + 2;
    gsap.to(this.container, { y: origY - 2, duration: 0.25, ease: 'power2.out' });
    gsap.to(this.glow, {
      alpha: 0,
      duration: 0.25,
      onComplete: () => this.glow.clear(),
    });
  }

  flipToGem(): void {
    if (this.state !== 'hidden') return;
    this.state = 'gem';
    this.container.eventMode = 'none';
    this.container.cursor = 'default';
    this.glow.clear();
    this.hovered = false;

    // 翻轉動畫：scale.x 0→1
    const tl = gsap.timeline();
    tl.to(this.container.scale, {
      x: 0,
      duration: 0.18,
      ease: 'power2.in',
      onComplete: () => {
        this.drawGem();
      },
    });
    tl.to(this.container.scale, {
      x: 1,
      duration: 0.25,
      ease: 'back.out(1.6)',
    });

    // 內容旋轉進場
    gsap.from(this.content, {
      rotation: -Math.PI,
      duration: 0.4,
      ease: 'back.out(1.5)',
    });

    // 暫時放大再縮回（衝擊感）
    gsap.to(this.container.scale, {
      y: 1.15,
      duration: 0.2,
      delay: 0.2,
      ease: 'power2.out',
      yoyo: true,
      repeat: 1,
    });
  }

  flipToMine(big: boolean): void {
    if (this.state !== 'hidden') return;
    this.state = 'mine';
    this.container.eventMode = 'none';
    this.container.cursor = 'default';
    this.glow.clear();
    this.hovered = false;

    const tl = gsap.timeline();
    tl.to(this.container.scale, {
      x: 0,
      duration: big ? 0.18 : 0.12,
      ease: 'power2.in',
      onComplete: () => {
        this.drawMine(big);
      },
    });
    tl.to(this.container.scale, {
      x: 1,
      duration: big ? 0.3 : 0.2,
      ease: big ? 'back.out(2)' : 'power2.out',
    });

    if (big) {
      // 大爆發縮放
      gsap.to(this.container.scale, {
        x: 1.25,
        y: 1.25,
        duration: 0.15,
        delay: 0.3,
        ease: 'power2.out',
        yoyo: true,
        repeat: 1,
      });
    }
  }

  private drawGem(): void {
    const s = this.size;
    // 更新 tile 為綠色
    this.tile
      .clear()
      .roundRect(-s / 2 + 2, -s / 2 + 4, s, s, 14)
      .fill({ color: COLOR_INK, alpha: 0.1 })
      .roundRect(-s / 2, -s / 2, s, s, 14)
      .fill({ color: COLOR_TILE })
      .stroke({ color: COLOR_TOXIC, width: 2 })
      // 內襯綠色光
      .roundRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 10)
      .fill({ color: COLOR_TOXIC, alpha: 0.1 });

    // 鑽石菱形幾何
    this.content.removeChildren();
    const gem = new Graphics();
    const gemSize = s * 0.28;
    gem
      // 菱形陰影
      .poly([0, -gemSize + 3, gemSize + 3, 3, 0, gemSize + 3, -gemSize + 3, 3])
      .fill({ color: COLOR_INK, alpha: 0.15 })
      // 菱形主體
      .poly([0, -gemSize, gemSize, 0, 0, gemSize, -gemSize, 0])
      .fill({ color: COLOR_TOXIC })
      // 內部切面
      .poly([0, -gemSize, gemSize * 0.5, 0, 0, gemSize, -gemSize * 0.5, 0])
      .fill({ color: COLOR_ICE, alpha: 0.6 })
      // 高光三角
      .poly([0, -gemSize, gemSize * 0.3, -gemSize * 0.3, -gemSize * 0.3, -gemSize * 0.3])
      .fill({ color: 0xffffff, alpha: 0.7 });

    this.content.addChild(gem);
  }

  private drawMine(big: boolean): void {
    const s = this.size;
    this.tile
      .clear()
      .roundRect(-s / 2 + 2, -s / 2 + 4, s, s, 14)
      .fill({ color: COLOR_INK, alpha: 0.12 })
      .roundRect(-s / 2, -s / 2, s, s, 14)
      .fill({ color: big ? COLOR_EMBER : COLOR_TILE, alpha: big ? 0.2 : 1 })
      .stroke({ color: COLOR_EMBER, width: big ? 3 : 1.8 });

    if (big) {
      this.tile
        .roundRect(-s / 2 + 3, -s / 2 + 3, s - 6, s - 6, 10)
        .fill({ color: COLOR_EMBER, alpha: 0.15 });
    }

    this.content.removeChildren();
    // X 型爆炸
    const m = s * 0.28;
    const x = new Graphics()
      .moveTo(-m, -m)
      .lineTo(m, m)
      .moveTo(m, -m)
      .lineTo(-m, m)
      .stroke({ color: COLOR_EMBER, width: big ? 5 : 3 });
    // 中心核
    const core = new Graphics()
      .circle(0, 0, s * 0.08)
      .fill({ color: COLOR_AMBER });

    this.content.addChild(x);
    this.content.addChild(core);
  }

  reset(): void {
    this.state = 'hidden';
    this.hovered = false;
    this.content.removeChildren();
    this.glow.clear();
    this.drawHidden();
    this.container.eventMode = 'static';
    this.container.cursor = 'pointer';
    this.container.scale.set(1);
    this.content.rotation = 0;
  }
}
