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

const COLOR_BG = 0xFBF9F4;
const COLOR_TILE = 0xffffff;
const COLOR_TILE_STROKE = 0xD1AD5A;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_AMBER = 0xC9A24C;
const COLOR_ICE = 0x86B49C;
const COLOR_INK = 0x0A0806;

interface CellHandle {
  container: Container;
  tile: Graphics;
  label: Text;
  row: number;
  col: number;
  state: 'hidden' | 'safe' | 'trap' | 'picked';
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export type TowerCellClick = (level: number, col: number) => void;

export class TowerScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;

  private cameraContainer: Container | null = null;
  private levelsContainer: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private currentLevelLabel: Text | null = null;
  private multiplierLabel: Text | null = null;

  private cells: Map<string, CellHandle> = new Map();
  private particleList: Particle[] = [];
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;

  private totalLevels = 9;
  private cols = 3;
  private currentLevel = 0;
  private levelHeight = 58;
  private baseLevelY = 0;
  private onClick: TowerCellClick | null = null;
  private winFx: WinCelebration | null = null;


  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    onClick: TowerCellClick,
  ): Promise<void> {
    this.width = width;
    this.height = height;
    this.onClick = onClick;

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

    // 相機（可整體平移）
    this.cameraContainer = new Container();
    app.stage.addChild(this.cameraContainer);

    // 層級容器
    this.levelsContainer = new Container();
    this.cameraContainer.addChild(this.levelsContainer);

    // 粒子 + shockwave（在 camera 層裡）
    this.particles = new Container();
    this.cameraContainer.addChild(this.particles);
    this.shockwaves = new Container();
    this.cameraContainer.addChild(this.shockwaves);

    // L4 pool 與 shaker
    this.particlePool = new ParticlePool(this.cameraContainer, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    // 頂部平視 UI（不隨相機）
    this.createTopUI();

    this.startTickers();
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });
    this.app.stage.addChild(bg);

    // 徑向紫色光暈
    const glow = new Graphics()
      .circle(this.width / 2, this.height * 0.3, this.width * 0.5)
      .fill({ color: COLOR_ACID, alpha: 0.1 });
    glow.filters = [new BlurFilter({ strength: 60 })];
    this.app.stage.addChild(glow);

    // 底部光條（地面）
    const ground = new Graphics();
    ground
      .moveTo(0, this.height - 30)
      .lineTo(this.width, this.height - 30)
      .stroke({ color: COLOR_ACID, width: 1, alpha: 0.3 });

    for (let x = 20; x < this.width - 20; x += 10) {
      ground.moveTo(x, this.height - 30).lineTo(x + 5, this.height - 30).stroke({
        color: COLOR_ACID,
        width: 2,
        alpha: 0.4,
      });
    }
    this.app.stage.addChild(ground);
  }

  private createTopUI(): void {
    if (!this.app) return;
    // 頂部：當前層顯示
    const levelStyle = new TextStyle({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 12,
      fill: COLOR_INK,
      fontWeight: '600',
      letterSpacing: 4,
    });
    const levelLabel = new Text({ text: 'LEVEL 0 / 9', style: levelStyle });
    levelLabel.anchor.set(0.5, 0);
    levelLabel.x = this.width / 2;
    levelLabel.y = 16;
    levelLabel.alpha = 0.7;
    this.currentLevelLabel = levelLabel;
    this.app.stage.addChild(levelLabel);

    // 倍率大字
    const multStyle = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize: 40,
      fill: COLOR_ACID,
      fontWeight: '700',
    });
    const multLabel = new Text({ text: '1.00×', style: multStyle });
    multLabel.anchor.set(0.5, 0);
    multLabel.x = this.width / 2;
    multLabel.y = 34;
    this.multiplierLabel = multLabel;
    this.app.stage.addChild(multLabel);
  }

  private startTickers(): void {
    if (!this.app) return;
    this.ambientTicker = (_tk: Ticker) => {
      // empty — placeholder for future effects
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
   * 設定塔的形狀
   */
  setup(totalLevels: number, cols: number): void {
    this.totalLevels = totalLevels;
    this.cols = cols;
    this.currentLevel = 0;

    if (this.levelsContainer) {
      this.levelsContainer.removeChildren();
      this.cells.clear();
    }

    // 底層位置
    this.baseLevelY = this.height - 80;

    // 建立所有層（從 0 到 totalLevels-1，0 是最底）
    for (let level = 0; level < totalLevels; level += 1) {
      this.createLevel(level);
    }

    // 初始相機：對準 level 0
    this.focusOnLevel(0, false);
  }

  private createLevel(level: number): void {
    if (!this.levelsContainer) return;
    const y = this.baseLevelY - level * this.levelHeight;

    // 層容器
    const levelContainer = new Container();
    levelContainer.x = this.width / 2;
    levelContainer.y = y;
    levelContainer.sortableChildren = true;
    this.levelsContainer.addChild(levelContainer);

    // 層地板陰影
    const floorShadow = new Graphics()
      .roundRect(-(this.width / 2 - 40), -4, this.width - 80, 8, 4)
      .fill({ color: COLOR_INK, alpha: 0.05 });
    levelContainer.addChild(floorShadow);

    // 層級標籤（左側）
    const style = new TextStyle({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 11,
      fill: COLOR_INK,
      fontWeight: '600',
      letterSpacing: 2,
    });
    const lvText = new Text({ text: `L${level + 1}`, style });
    lvText.anchor.set(0, 0.5);
    lvText.x = -this.width / 2 + 28;
    lvText.alpha = 0.45;
    levelContainer.addChild(lvText);

    // 格子
    const cellGap = 6;
    const availW = this.width - 130; // 左邊保留 labels, 右邊 padding
    const cellW = (availW - cellGap * (this.cols - 1)) / this.cols;
    const cellH = this.levelHeight - 14;
    const startX = -availW / 2 + cellW / 2 + 12;

    for (let c = 0; c < this.cols; c += 1) {
      const cx = startX + c * (cellW + cellGap);
      const cell = this.createCell(level, c, cellW, cellH);
      cell.container.x = cx;
      cell.container.y = 0;
      levelContainer.addChild(cell.container);
      this.cells.set(`${level}:${c}`, cell);
    }
  }

  private createCell(level: number, col: number, w: number, h: number): CellHandle {
    const c = new Container();
    c.eventMode = 'static';
    c.cursor = 'default';

    const tile = new Graphics();
    this.drawCellTile(tile, w, h, 'hidden');
    c.addChild(tile);

    // 標籤
    const style = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize: h * 0.6,
      fill: COLOR_INK,
      fontWeight: '700',
    });
    const label = new Text({ text: '·', style });
    label.anchor.set(0.5);
    label.alpha = 0.3;
    c.addChild(label);

    const handle: CellHandle = {
      container: c,
      tile,
      label,
      row: level,
      col,
      state: 'hidden',
    };

    c.on('pointertap', () => {
      if (handle.state !== 'hidden') return;
      if (level !== this.currentLevel) return;
      this.onClick?.(level, col);
    });
    c.on('pointerover', () => {
      if (handle.state === 'hidden' && level === this.currentLevel) {
        gsap.to(c.scale, { x: 1.06, y: 1.06, duration: 0.2, ease: 'power2.out' });
      }
    });
    c.on('pointerout', () => {
      gsap.to(c.scale, { x: 1, y: 1, duration: 0.2, ease: 'power2.out' });
    });

    return handle;
  }

  private drawCellTile(
    g: Graphics,
    w: number,
    h: number,
    state: 'hidden' | 'active' | 'safe' | 'trap' | 'picked' | 'past',
  ): void {
    g.clear();
    const radius = 10;
    // 陰影
    g.roundRect(-w / 2 + 2, -h / 2 + 3, w, h, radius).fill({ color: COLOR_INK, alpha: 0.08 });

    switch (state) {
      case 'active':
        g.roundRect(-w / 2, -h / 2, w, h, radius).fill({ color: COLOR_TILE });
        g.roundRect(-w / 2, -h / 2, w, h, radius).stroke({ color: COLOR_ACID, width: 2.5 });
        // 內襯
        g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 8).stroke({
          color: COLOR_VIOLET,
          width: 1,
          alpha: 0.3,
        });
        break;
      case 'safe':
      case 'picked':
        g.roundRect(-w / 2, -h / 2, w, h, radius).fill({ color: COLOR_TOXIC, alpha: 0.15 });
        g.roundRect(-w / 2, -h / 2, w, h, radius).stroke({ color: COLOR_TOXIC, width: 2 });
        break;
      case 'trap':
        g.roundRect(-w / 2, -h / 2, w, h, radius).fill({ color: COLOR_EMBER, alpha: 0.18 });
        g.roundRect(-w / 2, -h / 2, w, h, radius).stroke({ color: COLOR_EMBER, width: 2 });
        break;
      case 'past':
        g.roundRect(-w / 2, -h / 2, w, h, radius).fill({ color: COLOR_TILE, alpha: 0.5 });
        g.roundRect(-w / 2, -h / 2, w, h, radius).stroke({ color: COLOR_TILE_STROKE, width: 1 });
        break;
      case 'hidden':
      default:
        g.roundRect(-w / 2, -h / 2, w, h, radius).fill({ color: COLOR_TILE, alpha: 0.4 });
        g.roundRect(-w / 2, -h / 2, w, h, radius).stroke({
          color: COLOR_TILE_STROKE,
          width: 1,
        });
        break;
    }
  }

  /**
   * 計算 cell 尺寸（供外部操作時重繪）
   */
  private cellDims(): { w: number; h: number } {
    const cellGap = 6;
    const availW = this.width - 130;
    const w = (availW - cellGap * (this.cols - 1)) / this.cols;
    const h = this.levelHeight - 14;
    return { w, h };
  }

  /**
   * 對焦至某一層（相機平移）
   */
  focusOnLevel(level: number, animate = true): void {
    if (!this.cameraContainer) return;
    this.currentLevel = level;

    // 標註當前層格子為 active
    for (let c = 0; c < this.cols; c += 1) {
      const cell = this.cells.get(`${level}:${c}`);
      if (cell && cell.state === 'hidden') {
        const dims = this.cellDims();
        this.drawCellTile(cell.tile, dims.w, dims.h, 'active');
        cell.label.text = '?';
        cell.label.alpha = 0.5;
      }
    }

    // 更新 UI
    if (this.currentLevelLabel) {
      this.currentLevelLabel.text = `LEVEL ${level} / ${this.totalLevels}`;
    }

    // 相機垂直位移：讓當前層位於畫面中間偏下
    const targetY = level * this.levelHeight - this.height * 0.25;
    if (animate) {
      gsap.to(this.cameraContainer, {
        y: targetY,
        duration: 0.6,
        ease: 'power2.out',
      });
    } else {
      this.cameraContainer.y = targetY;
    }
  }

  setMultiplier(mult: string): void {
    if (!this.multiplierLabel) return;
    this.multiplierLabel.text = `${mult}×`;
    gsap.fromTo(
      this.multiplierLabel.scale,
      { x: 1.25, y: 1.25 },
      { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.5)' },
    );
  }

  /** 樂觀動畫：點格立刻讓該格脈動 */
  markPending(level: number, col: number): void {
    const cell = this.cells.get(`${level}:${col}`);
    if (!cell) return;
    gsap.killTweensOf(cell.container.scale);
    gsap.to(cell.container.scale, {
      x: 1.08,
      y: 1.08,
      duration: 0.3,
      ease: 'sine.inOut',
      yoyo: true,
      repeat: -1,
    });
  }

  /**
   * 玩家選了一格 — 根據 safe/trap 顯示結果
   */
  pick(level: number, col: number, isSafe: boolean): void {
    const cell = this.cells.get(`${level}:${col}`);
    if (!cell) return;
    // 清 pending pulse
    gsap.killTweensOf(cell.container.scale);
    cell.container.scale.set(1);
    const dims = this.cellDims();

    if (isSafe) {
      cell.state = 'picked';
      this.drawCellTile(cell.tile, dims.w, dims.h, 'picked');
      cell.label.text = '◆';
      cell.label.alpha = 1;
      cell.label.style.fill = COLOR_TOXIC;

      // 縮放彈跳
      gsap.fromTo(
        cell.container.scale,
        { x: 0.6, y: 0.6 },
        { x: 1.1, y: 1.1, duration: 0.25, ease: 'back.out(2)', yoyo: true, repeat: 1 },
      );

      // L4 pool 粒子（安全 picked）
      const pContainer = cell.container.parent;
      if (pContainer) {
        const cx = pContainer.x + cell.container.x;
        const cy = pContainer.y + cell.container.y;
        this.particlePool?.emit({
          x: cx,
          y: cy,
          count: 20,
          colors: [COLOR_TOXIC, COLOR_ICE, 0xffffff],
          speedMin: 2,
          speedMax: 7,
          angleRad: -Math.PI / 2,
          spreadRad: Math.PI,
        });
        this.emitShockwave(cx, cy, COLOR_TOXIC, dims.w * 1.3);
      }

      // 讓舊層變 past
      for (let c = 0; c < this.cols; c += 1) {
        const pastCell = this.cells.get(`${level}:${c}`);
        if (!pastCell) continue;
        if (pastCell === cell) continue;
        this.drawCellTile(pastCell.tile, dims.w, dims.h, 'past');
        pastCell.label.alpha = 0.2;
      }

      // 爬升到下一層
      setTimeout(() => {
        if (level + 1 < this.totalLevels) {
          this.focusOnLevel(level + 1, true);
        }
      }, 350);
    } else {
      cell.state = 'trap';
      this.drawCellTile(cell.tile, dims.w, dims.h, 'trap');
      cell.label.text = '✕';
      cell.label.alpha = 1;
      cell.label.style.fill = COLOR_EMBER;

      // 大爆炸 — L4 用 pool + shake + edge glow
      const pContainer = cell.container.parent;
      if (pContainer) {
        const cx = pContainer.x + cell.container.x;
        const cy = pContainer.y + cell.container.y;
        this.emitShockwave(cx, cy, COLOR_EMBER, dims.w * 2.5);
        this.emitShockwave(cx, cy, COLOR_AMBER, dims.w * 3.5, 0.15);
        this.particlePool?.emit({
          x: cx,
          y: cy,
          count: 55,
          colors: [COLOR_EMBER, COLOR_AMBER, COLOR_VIOLET],
          speedMin: 3,
          speedMax: 12,
          gravity: 0.25,
        });
        this.shaker?.shake(10, 0.5);
        if (this.app) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_EMBER, 0.4);
      }

      gsap.to(cell.container.scale, {
        x: 1.25,
        y: 1.25,
        duration: 0.2,
        yoyo: true,
        repeat: 1,
      });
    }
  }

  /**
   * 揭露全部 safeLayout 中的安全格（踩雷或 cashout 後呼叫）
   */
  revealAll(safeLayout: number[][]): void {
    const dims = this.cellDims();
    for (let lv = 0; lv < safeLayout.length; lv += 1) {
      const safeCols = safeLayout[lv] ?? [];
      for (let c = 0; c < this.cols; c += 1) {
        const cell = this.cells.get(`${lv}:${c}`);
        if (!cell || cell.state !== 'hidden') continue;
        const isSafe = safeCols.includes(c);
        if (isSafe) {
          cell.state = 'safe';
          this.drawCellTile(cell.tile, dims.w, dims.h, 'safe');
          cell.label.text = '◆';
          cell.label.alpha = 0.6;
          cell.label.style.fill = COLOR_TOXIC;
        } else {
          cell.state = 'trap';
          this.drawCellTile(cell.tile, dims.w, dims.h, 'trap');
          cell.label.text = '✕';
          cell.label.alpha = 0.6;
          cell.label.style.fill = COLOR_EMBER;
        }
      }
    }
  }

  /**
   * 成功 cashout — L4 tier-based
   */
  celebrate(multiplier = 1): void {
    const tier = classifyWinTier(multiplier, true);
    const cfg = TIER_CONFIG[tier];
    const cx = this.width / 2;
    const cy = this.height / 2;
    this.emitShockwave(cx, cy, COLOR_TOXIC, this.width * 0.5);
    this.particlePool?.emit({
      x: cx,
      y: cy,
      count: cfg.particles || 40,
      colors: [COLOR_TOXIC, COLOR_ICE, COLOR_AMBER, COLOR_VIOLET, 0xffffff],
      speedMin: 3,
      speedMax: 11,
    });
    if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
    if (this.app && cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_TOXIC, cfg.edgeGlowMs / 1000);
    if (this.app && cfg.rayBurst) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_TOXIC, 1.3);
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
        gravity: 0.2,
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
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.winFx?.dispose();
    this.winFx = null;
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.cells.clear();
    this.particleList = [];
    this.cameraContainer = null;
    this.levelsContainer = null;
    this.particles = null;
    this.shockwaves = null;
    this.currentLevelLabel = null;
    this.multiplierLabel = null;
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
