import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';

export type MinesCellState = 'hidden' | 'gem' | 'mine';

export interface MinesCellClick {
  index: number;
}

export class MinesScene {
  private app: Application | null = null;
  private cells: MinesCell[] = [];
  private overlay: Container | null = null;
  private onCellClick: ((e: MinesCellClick) => void) | null = null;
  private clickDisabled = false;

  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    onCellClick: (e: MinesCellClick) => void,
  ): Promise<void> {
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

    const bg = new Graphics()
      .rect(0, 0, width, height)
      .fill({ color: 0x0a0c14, alpha: 0.4 });
    app.stage.addChild(bg);

    // Grid dots 背景
    const gridDots = new Graphics();
    const dotStep = 24;
    for (let x = 0; x < width; x += dotStep) {
      for (let y = 0; y < height; y += dotStep) {
        gridDots.circle(x, y, 0.8).fill({ color: 0xd4ff3a, alpha: 0.06 });
      }
    }
    app.stage.addChild(gridDots);

    const grid = new Container();
    app.stage.addChild(grid);

    const padding = 20;
    const gap = 8;
    const cellSize = (Math.min(width, height) - padding * 2 - gap * 4) / 5;
    const gridSize = cellSize * 5 + gap * 4;
    grid.x = (width - gridSize) / 2;
    grid.y = (height - gridSize) / 2;

    for (let i = 0; i < 25; i += 1) {
      const row = Math.floor(i / 5);
      const col = i % 5;
      const cell = new MinesCell(i, cellSize);
      cell.container.x = col * (cellSize + gap);
      cell.container.y = row * (cellSize + gap);
      cell.container.eventMode = 'static';
      cell.container.cursor = 'pointer';
      cell.container.on('pointertap', () => {
        if (this.clickDisabled) return;
        this.onCellClick?.({ index: i });
      });
      cell.container.on('pointerover', () => {
        if (cell.state === 'hidden' && !this.clickDisabled) {
          gsap.to(cell.container.scale, { x: 1.05, y: 1.05, duration: 0.15 });
        }
      });
      cell.container.on('pointerout', () => {
        gsap.to(cell.container.scale, { x: 1, y: 1, duration: 0.15 });
      });
      this.cells.push(cell);
      grid.addChild(cell.container);
    }

    this.overlay = new Container();
    app.stage.addChild(this.overlay);
  }

  setClickable(enabled: boolean): void {
    this.clickDisabled = !enabled;
  }

  revealGem(index: number): void {
    const cell = this.cells[index];
    if (!cell) return;
    cell.setState('gem');
    this.sparkle(cell.container.x + cell.size / 2, cell.container.y + cell.size / 2);
  }

  revealMine(index: number, big: boolean): void {
    const cell = this.cells[index];
    if (!cell) return;
    cell.setState('mine', big);
    if (big) this.explode(cell.container.x + cell.size / 2, cell.container.y + cell.size / 2);
  }

  revealAllMines(positions: number[]): void {
    for (const idx of positions) {
      const cell = this.cells[idx];
      if (!cell || cell.state === 'mine') continue;
      cell.setState('mine', false);
    }
  }

  reset(): void {
    for (const cell of this.cells) cell.reset();
    this.clickDisabled = false;
  }

  private sparkle(x: number, y: number): void {
    if (!this.app) return;
    for (let i = 0; i < 14; i += 1) {
      const size = 2 + Math.random() * 2;
      const particle = new Graphics()
        .rect(-size / 2, -size / 2, size, size)
        .fill({ color: 0xd4ff3a });
      particle.x = x;
      particle.y = y;
      this.app.stage.addChild(particle);
      const angle = Math.random() * Math.PI * 2;
      const distance = 25 + Math.random() * 35;
      gsap.to(particle, {
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 0.5 + Math.random() * 0.3,
        ease: 'power2.out',
        onComplete: () => particle.destroy(),
      });
    }
  }

  private explode(x: number, y: number): void {
    if (!this.app) return;
    const shockwave = new Graphics().circle(x, y, 10).stroke({ color: 0xff4e50, width: 2, alpha: 0.9 });
    this.app.stage.addChild(shockwave);
    gsap.to(shockwave, {
      alpha: 0,
      duration: 0.9,
      ease: 'power2.out',
      onUpdate: () => {
        const progress = 1 - (shockwave.alpha || 0);
        shockwave
          .clear()
          .circle(x, y, 10 + progress * 100)
          .stroke({ color: 0xff4e50, width: 2, alpha: shockwave.alpha });
      },
      onComplete: () => shockwave.destroy(),
    });

    // 第二波冲击波
    const shockwave2 = new Graphics().circle(x, y, 5).stroke({ color: 0xffb547, width: 1, alpha: 0.7 });
    this.app.stage.addChild(shockwave2);
    gsap.to(shockwave2, {
      alpha: 0,
      duration: 1.1,
      ease: 'power3.out',
      delay: 0.1,
      onUpdate: () => {
        const progress = 1 - (shockwave2.alpha || 0);
        shockwave2
          .clear()
          .circle(x, y, 5 + progress * 140)
          .stroke({ color: 0xffb547, width: 1, alpha: shockwave2.alpha });
      },
      onComplete: () => shockwave2.destroy(),
    });

    for (let i = 0; i < 36; i += 1) {
      const size = 2 + Math.random() * 3;
      const particle = new Graphics()
        .rect(-size / 2, -size / 2, size, size)
        .fill({ color: i % 3 === 0 ? 0xffb547 : 0xff4e50 });
      particle.x = x;
      particle.y = y;
      this.app.stage.addChild(particle);
      const angle = Math.random() * Math.PI * 2;
      const distance = 60 + Math.random() * 80;
      gsap.to(particle, {
        x: x + Math.cos(angle) * distance,
        y: y + Math.sin(angle) * distance,
        alpha: 0,
        duration: 0.8 + Math.random() * 0.4,
        ease: 'power2.out',
        onComplete: () => particle.destroy(),
      });
    }
  }

  dispose(): void {
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.cells = [];
    this.overlay = null;
    this.onCellClick = null;
  }
}

class MinesCell {
  public state: MinesCellState = 'hidden';
  public readonly container: Container;
  private readonly tile: Graphics;
  private content: Container;

  constructor(_index: number, public readonly size: number) {
    this.container = new Container();
    this.container.pivot.set(size / 2, size / 2);
    this.container.x = 0;
    this.container.y = 0;

    this.tile = new Graphics()
      .rect(0, 0, size, size)
      .fill({ color: 0x111420 })
      .stroke({ color: 0x252b3f, width: 1 });
    // Inner nested rectangle for depth
    this.tile
      .rect(size * 0.15, size * 0.15, size * 0.7, size * 0.7)
      .stroke({ color: 0x1a1e2e, width: 1 });
    this.container.addChild(this.tile);

    this.content = new Container();
    this.container.addChild(this.content);

    this.container.position.set(0, 0);
  }

  setState(state: MinesCellState, big = false): void {
    if (this.state !== 'hidden') return;
    this.state = state;
    this.container.eventMode = 'none';
    this.content.removeChildren();

    if (state === 'gem') {
      this.tile
        .clear()
        .rect(0, 0, this.size, this.size)
        .fill({ color: 0xd4ff3a, alpha: 0.08 })
        .stroke({ color: 0xd4ff3a, width: 1 });
      // Diamond shape
      const s = this.size;
      const gem = new Graphics()
        .poly([s * 0.5, s * 0.2, s * 0.8, s * 0.5, s * 0.5, s * 0.8, s * 0.2, s * 0.5])
        .fill({ color: 0xd4ff3a });
      // Inner facet
      const inner = new Graphics()
        .poly([
          s * 0.5,
          s * 0.3,
          s * 0.7,
          s * 0.5,
          s * 0.5,
          s * 0.7,
          s * 0.3,
          s * 0.5,
        ])
        .stroke({ color: 0x05060a, width: 2, alpha: 0.6 });
      this.content.addChild(gem);
      this.content.addChild(inner);
      gsap.from(gem.scale, { x: 0, y: 0, duration: 0.35, ease: 'back.out(2.5)' });
    } else {
      this.tile
        .clear()
        .rect(0, 0, this.size, this.size)
        .fill({ color: big ? 0xff4e50 : 0x1a1e2e, alpha: big ? 0.15 : 1 })
        .stroke({ color: 0xff4e50, width: big ? 2 : 1 });
      // X mark (brutalist, not a round bomb)
      const s = this.size;
      const m = s * 0.28;
      const x = new Graphics()
        .moveTo(m, m)
        .lineTo(s - m, s - m)
        .moveTo(s - m, m)
        .lineTo(m, s - m)
        .stroke({ color: 0xff4e50, width: big ? 4 : 2 });
      // Center dot
      const dot = new Graphics()
        .rect(s * 0.45, s * 0.45, s * 0.1, s * 0.1)
        .fill({ color: 0xff4e50 });
      this.content.addChild(x);
      this.content.addChild(dot);
      if (big) {
        gsap.from(x.scale, { x: 0, y: 0, duration: 0.4, ease: 'back.out(3)' });
        gsap.from(dot.scale, { x: 0, y: 0, duration: 0.5, ease: 'back.out(3)' });
      }
    }
  }

  reset(): void {
    this.state = 'hidden';
    this.content.removeChildren();
    this.tile
      .clear()
      .rect(0, 0, this.size, this.size)
      .fill({ color: 0x111420 })
      .stroke({ color: 0x252b3f, width: 1 })
      .rect(this.size * 0.15, this.size * 0.15, this.size * 0.7, this.size * 0.7)
      .stroke({ color: 0x1a1e2e, width: 1 });
    this.container.eventMode = 'static';
    this.container.scale.set(1);
  }
}
