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
  emitEdgeGlow,
  emitGlowBurst,
  emitRayBurst,
  prewarmShaders,
  prefersReducedMotion,
  GAME_FONT,
  GAME_FONT_NUM,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0x0F172A;
const COLOR_TILE_STROKE = 0xC9A247;
const COLOR_ACID = 0xF3D67D;
const COLOR_VIOLET = 0xE8D48A;
const COLOR_EMBER = 0xD4574A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_AMBER = 0xF3D67D;
const COLOR_ICE = 0x266F85;
const COLOR_INK = 0x0A0806;
const COLOR_BLUEPRINT = 0x5CBED6;
const COLOR_BLOCK = 0x344152;
const COLOR_BLOCK_DARK = 0x182233;
const COLOR_MORTAR = 0xEEF2F6;
const COLOR_SAFE_EDGE = 0x7BD68F;

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
  private towerBackdrop: Graphics | null = null;

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
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.92 });
    this.app.stage.addChild(bg);

    // 中央施工藍圖光暈
    const glow = new Graphics()
      .circle(this.width / 2, this.height * 0.35, this.width * 0.48)
      .fill({ color: COLOR_BLUEPRINT, alpha: 0.12 });
    glow.filters = [new BlurFilter({ strength: 60 })];
    this.app.stage.addChild(glow);

    const blueprint = new Graphics();
    const towerW = Math.min(this.width * 0.58, 280);
    const left = this.width / 2 - towerW / 2;
    const right = this.width / 2 + towerW / 2;
    for (let x = left; x <= right + 1; x += towerW / 4) {
      blueprint.moveTo(x, 34).lineTo(x, this.height - 48);
    }
    for (let y = 64; y < this.height - 52; y += 44) {
      blueprint.moveTo(left - 20, y).lineTo(right + 20, y);
    }
    blueprint.stroke({ color: COLOR_BLUEPRINT, width: 1, alpha: 0.08 });

    const scaffoldLeft = left - 34;
    const scaffoldRight = right + 34;
    blueprint
      .moveTo(scaffoldLeft, this.height - 44)
      .lineTo(scaffoldLeft + 26, 58)
      .moveTo(scaffoldRight, this.height - 44)
      .lineTo(scaffoldRight - 26, 58)
      .moveTo(scaffoldLeft, this.height - 44)
      .lineTo(scaffoldRight, this.height - 44)
      .stroke({ color: COLOR_AMBER, width: 1.4, alpha: 0.12 });
    this.app.stage.addChild(blueprint);

    // 底部地基
    const ground = new Graphics();
    ground
      .roundRect(26, this.height - 42, this.width - 52, 18, 9)
      .fill({ color: COLOR_BLOCK_DARK, alpha: 0.75 })
      .stroke({ color: COLOR_ACID, width: 1, alpha: 0.2 });
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
    const plate = new Graphics()
      .roundRect(this.width / 2 - 118, 12, 236, 34, 12)
      .fill({ color: COLOR_BLOCK_DARK, alpha: 0.58 })
      .stroke({ color: COLOR_AMBER, width: 1, alpha: 0.14 });
    this.app.stage.addChild(plate);

    // 頂部：當前施工層顯示，放在中央上方，不遮塔身。
    const levelStyle = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: 11,
      fill: 0xD8E6F4,
      fontWeight: '600',
      letterSpacing: 3,
    });
    const levelLabel = new Text({ text: 'LEVEL 1 / 9', style: levelStyle });
    levelLabel.anchor.set(0.5);
    levelLabel.x = this.width / 2;
    levelLabel.y = 29;
    levelLabel.alpha = 0.76;
    this.currentLevelLabel = levelLabel;
    this.app.stage.addChild(levelLabel);

    // 倍率放在塔底地基上方，避免與樓層重疊。
    const multStyle = new TextStyle({
      fontFamily: GAME_FONT,
      fontSize: 34,
      fill: COLOR_ACID,
      fontWeight: '700',
    });
    const multLabel = new Text({ text: '1.00×', style: multStyle });
    multLabel.anchor.set(0.5);
    multLabel.x = this.width / 2;
    multLabel.y = this.height - 34;
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

    // 預覽時要一次看見完整塔身，避免上緣裁切；正式遊戲仍可用相機聚焦當前層。
    this.levelHeight = Math.max(42, Math.min(58, (this.height - 132) / 9.15));
    this.baseLevelY = this.height - 112;

    this.drawTowerBackdrop();

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
    const dims = this.cellDims();

    // 層容器
    const levelContainer = new Container();
    levelContainer.x = this.width / 2;
    levelContainer.y = y;
    levelContainer.sortableChildren = true;
    this.levelsContainer.addChild(levelContainer);

    // 樓層梁與左右立柱，讓選格像是在蓋塔。
    const floorFrame = new Graphics();
    const frameW = dims.span + 42;
    const beamY = dims.h / 2 + 6;
    floorFrame
      .roundRect(-frameW / 2, beamY, frameW, 10, 5)
      .fill({ color: COLOR_BLOCK_DARK, alpha: 0.86 })
      .stroke({ color: COLOR_AMBER, width: 1, alpha: 0.28 });
    floorFrame
      .rect(-frameW / 2 + 12, beamY + 3, frameW - 24, 1)
      .fill({ color: COLOR_AMBER, alpha: 0.18 });
    floorFrame
      .roundRect(-frameW / 2 - 7, -dims.h / 2 + 4, 8, dims.h + 18, 4)
      .fill({ color: COLOR_BLOCK_DARK, alpha: 0.5 });
    floorFrame
      .roundRect(frameW / 2 - 1, -dims.h / 2 + 4, 8, dims.h + 18, 4)
      .fill({ color: COLOR_BLOCK_DARK, alpha: 0.5 });
    levelContainer.addChild(floorFrame);

    // 層級標籤（左側）
    const style = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: 11,
      fill: 0xC9D5E3,
      fontWeight: '600',
      letterSpacing: 2,
    });
    const lvText = new Text({ text: `L${level + 1}`, style });
    lvText.anchor.set(1, 0.5);
    lvText.x = -frameW / 2 - 14;
    lvText.alpha = 0.62;
    levelContainer.addChild(lvText);

    // 格子
    const startX = -dims.span / 2 + dims.w / 2;

    for (let c = 0; c < this.cols; c += 1) {
      const cx = startX + c * (dims.w + dims.gap);
      const cell = this.createCell(level, c, dims.w, dims.h);
      cell.container.x = cx;
      cell.container.y = 0;
      levelContainer.addChild(cell.container);
      this.cells.set(`${level}:${c}`, cell);
    }
  }

  private drawTowerBackdrop(): void {
    if (!this.levelsContainer) return;
    if (this.towerBackdrop) {
      this.towerBackdrop.destroy();
      this.towerBackdrop = null;
    }
    const dims = this.cellDims();
    const frameW = dims.span + 56;
    const topY = this.baseLevelY - (this.totalLevels - 1) * this.levelHeight - dims.h / 2 - 14;
    const bottomY = this.baseLevelY + dims.h / 2 + 26;
    const g = new Graphics();
    g.roundRect(
      this.width / 2 - frameW / 2,
      topY,
      frameW,
      bottomY - topY,
      18,
    )
      .fill({ color: 0x102236, alpha: 0.54 })
      .stroke({ color: COLOR_BLUEPRINT, width: 1, alpha: 0.16 });
    g.moveTo(this.width / 2 - frameW / 2 + 18, bottomY - 26)
      .lineTo(this.width / 2 + frameW / 2 - 18, bottomY - 26)
      .stroke({ color: COLOR_AMBER, width: 1, alpha: 0.24 });
    this.towerBackdrop = g;
    this.levelsContainer.addChildAt(g, 0);
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
      fontFamily: GAME_FONT,
      fontSize: h * 0.6,
      fill: COLOR_MORTAR,
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
    const radius = 9;
    const drawMasonry = (lineColor: number, alpha: number) => {
      g.moveTo(-w / 2 + 10, -1).lineTo(w / 2 - 10, -1);
      g.moveTo(-w * 0.17, -h / 2 + 7).lineTo(-w * 0.17, -4);
      g.moveTo(w * 0.2, 3).lineTo(w * 0.2, h / 2 - 8);
      g.stroke({ color: lineColor, width: 1, alpha });
      g.circle(-w * 0.24, -h * 0.12, 1.8).fill({ color: lineColor, alpha: alpha * 0.8 });
      g.circle(w * 0.24, h * 0.12, 1.8).fill({ color: lineColor, alpha: alpha * 0.8 });
    };

    const drawBlock = (
      fill: number,
      stroke: number,
      strokeWidth: number,
      fillAlpha = 1,
      highlightAlpha = 0.18,
    ) => {
      g.roundRect(-w / 2 + 4, -h / 2 + 6, w, h, radius).fill({
        color: COLOR_INK,
        alpha: 0.28,
      });
      g.roundRect(-w / 2, -h / 2, w, h, radius)
        .fill({ color: fill, alpha: fillAlpha })
        .stroke({ color: stroke, width: strokeWidth, alpha: 0.95 });
      g.roundRect(-w / 2 + 4, -h / 2 + 4, w - 8, h * 0.32, 6).fill({
        color: COLOR_MORTAR,
        alpha: highlightAlpha,
      });
    };

    switch (state) {
      case 'active':
        drawBlock(COLOR_MORTAR, COLOR_ACID, 3, 0.98, 0.42);
        g.roundRect(-w / 2 + 3, -h / 2 + 3, w - 6, h - 6, 8).stroke({
          color: COLOR_VIOLET,
          width: 1.2,
          alpha: 0.45,
        });
        drawMasonry(COLOR_INK, 0.18);
        break;
      case 'safe':
        drawBlock(COLOR_TOXIC, COLOR_SAFE_EDGE, 2, 0.65, 0.2);
        drawMasonry(COLOR_SAFE_EDGE, 0.36);
        break;
      case 'picked':
        drawBlock(COLOR_AMBER, COLOR_ACID, 2.5, 0.92, 0.35);
        g.roundRect(-w / 2 + 6, h / 2 - 9, w - 12, 4, 2).fill({
          color: COLOR_TOXIC,
          alpha: 0.7,
        });
        drawMasonry(COLOR_INK, 0.2);
        break;
      case 'trap':
        drawBlock(COLOR_EMBER, COLOR_EMBER, 2.4, 0.52, 0.16);
        g.moveTo(-w / 2 + 12, -h / 2 + 11).lineTo(w / 2 - 14, h / 2 - 10);
        g.moveTo(w / 2 - 18, -h / 2 + 12).lineTo(-w / 2 + 16, h / 2 - 8);
        g.stroke({ color: COLOR_AMBER, width: 2, alpha: 0.52 });
        break;
      case 'past':
        drawBlock(COLOR_BLOCK, COLOR_TILE_STROKE, 1, 0.58, 0.09);
        drawMasonry(COLOR_MORTAR, 0.12);
        break;
      case 'hidden':
      default:
        drawBlock(COLOR_BLOCK, COLOR_TILE_STROKE, 1, 0.7, 0.1);
        drawMasonry(COLOR_MORTAR, 0.16);
        break;
    }
  }

  /**
   * 計算 cell 尺寸（供外部操作時重繪）
   */
  private cellDims(): { w: number; h: number; gap: number; span: number } {
    const gap = 7;
    const towerW = Math.min(this.width - 152, 286);
    const availW = Math.max(180, towerW - 24);
    const rawW = (availW - gap * (this.cols - 1)) / this.cols;
    const w = Math.min(118, Math.max(58, rawW));
    const h = Math.min(44, Math.max(34, this.levelHeight - 12));
    const span = w * this.cols + gap * (this.cols - 1);
    return { w, h, gap, span };
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
        cell.label.style.fill = COLOR_INK;
        cell.label.alpha = 0.72;
      }
    }

    // 更新 UI
    if (this.currentLevelLabel) {
      this.currentLevelLabel.text = `LEVEL ${Math.min(level + 1, this.totalLevels)} / ${this.totalLevels}`;
    }

    // 相機垂直位移：低樓層顯示完整塔身；越高才逐步跟隨，避免預覽被切到。
    const targetY = level <= 1 ? 0 : Math.min(level * this.levelHeight - this.height * 0.36, 190);
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
      cell.label.text = '✓';
      cell.label.alpha = 1;
      cell.label.style.fill = COLOR_INK;

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
        // L4 強化：安全格 emit glow burst，每選對一格儀式感更強
        if (this.app && !prefersReducedMotion()) {
          emitGlowBurst(this.app.stage, cx, cy, COLOR_TOXIC, {
            radius: dims.w * 0.85,
            peakBlur: 16,
            durationSec: 0.5,
          });
        }
      }

      // 讓舊層變 past
      for (let c = 0; c < this.cols; c += 1) {
        const pastCell = this.cells.get(`${level}:${c}`);
        if (!pastCell) continue;
        if (pastCell === cell) continue;
        this.drawCellTile(pastCell.tile, dims.w, dims.h, 'past');
        pastCell.label.text = '';
        pastCell.label.alpha = 0;
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
          cell.label.text = '✓';
          cell.label.alpha = 0.6;
          cell.label.style.fill = COLOR_SAFE_EDGE;
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
