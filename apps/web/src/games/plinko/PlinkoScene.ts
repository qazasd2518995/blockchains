import {
  Application,
  Container,
  Graphics,
  Text,
  TextStyle,
  Ticker,
  BlurFilter,
  type Texture,
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

const COLOR_BG = 0x0f172a;
const COLOR_ACID = 0xf3d67d;
const COLOR_VIOLET = 0xe8d48a;
const COLOR_EMBER = 0xd4574a;
const COLOR_TOXIC = 0x1e7a4f;
const COLOR_AMBER = 0xf3d67d;
const COLOR_ICE = 0x266f85;
const COLOR_INK = 0x0a0806;
const COLOR_BUCKET_BG = 0x07131f;
const COLOR_WHITE = 0xffffff;
const PLINKO_BACKGROUND_ASSET = '/game-art/plinko/background.png';

interface Ball {
  g: Graphics;
  x: number;
  y: number;
  vx: number;
  vy: number;
  row: number; // 目前該去哪一排的判定點
  targetCol: number; // 最終應該落到的 col
  path: ('left' | 'right')[]; // 預定路徑
  targetBucket: number;
  multiplier: number;
  onDone: (bucket: number, multiplier: number) => void;
  bouncedRows: Set<number>; // 已經過的排，避免重複碰撞判定
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

function formatMultiplierLabel(value: number): string {
  return value < 1 ? value.toFixed(1) : value < 10 ? value.toFixed(1) : value.toFixed(0);
}

function formatPotentialPayout(value: number): string {
  if (!Number.isFinite(value) || value <= 0) return '';
  const rounded = Math.floor(value * 100) / 100;
  if (rounded >= 1_000_000) return `${trimFixed(rounded / 1_000_000)}M`;
  if (rounded >= 1_000) return `${trimFixed(rounded / 1_000)}K`;
  if (rounded >= 100) return rounded.toFixed(0);
  return trimFixed(rounded);
}

function trimFixed(value: number): string {
  const decimals = value >= 10 ? 0 : 1;
  return value.toFixed(decimals).replace(/\.0$/, '');
}

export class PlinkoScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;

  private pegsContainer: Container | null = null;
  private bucketsContainer: Container | null = null;
  private ballsContainer: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;

  private rows = 12;
  private multipliers: number[] = [];
  private pegRadius = 4;
  private ballRadius = 8;
  private pegSpacing = 0;
  private rowSpacing = 0;
  private boardTop = 50;
  private boardBottom = 0;
  private boardLeft = 0;
  private boardRight = 0;
  private betAmount = 0;

  private balls: Ball[] = [];
  private anticipationBalls: Graphics[] = [];
  private particleList: Particle[] = [];
  private backgroundTexture: Texture | null = null;

  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private ballTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  // L4
  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;

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

    this.pegsContainer = new Container();
    app.stage.addChild(this.pegsContainer);

    this.bucketsContainer = new Container();
    app.stage.addChild(this.bucketsContainer);

    this.ballsContainer = new Container();
    app.stage.addChild(this.ballsContainer);

    this.particles = new Container();
    app.stage.addChild(this.particles);

    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    // L4 pool + shaker
    this.particlePool = new ParticlePool(app.stage, 300); // Plinko 粒子量大（多 peg 彈），加到 300
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.startTickers();
  }

  private async preloadAssets(): Promise<void> {
    this.backgroundTexture = await loadTextureOrNull(PLINKO_BACKGROUND_ASSET);
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics()
      .rect(0, 0, this.width, this.height)
      .fill({ color: COLOR_BG, alpha: 1 });
    this.app.stage.addChild(bg);

    const artwork = addCoverSprite(
      this.app.stage,
      this.backgroundTexture,
      this.width,
      this.height,
      0.92,
    );
    if (artwork) {
      const veil = new Graphics()
        .rect(0, 0, this.width, this.height)
        .fill({ color: COLOR_BG, alpha: 0.42 });
      this.app.stage.addChild(veil);
    }

    // glow1：用多層同心圓替代 BlurFilter（避免 Pixi v8 BlurFilter 干擾 Text batching）
    const glow1 = new Graphics();
    const cx1 = this.width / 2;
    const cy1 = this.height * 0.3;
    const rBase1 = this.width * 0.4;
    for (let i = 0; i < 6; i += 1) {
      const r = rBase1 * (0.4 + i * 0.12);
      const a = (artwork ? 0.012 : 0.02) * (6 - i);
      glow1.circle(cx1, cy1, r).fill({ color: COLOR_ACID, alpha: a });
    }
    this.app.stage.addChild(glow1);

    // glow2：同樣用多層圓替代
    const glow2 = new Graphics();
    const cx2 = this.width / 2;
    const cy2 = this.height * 0.9;
    const rBase2 = this.width * 0.35;
    for (let i = 0; i < 6; i += 1) {
      const r = rBase2 * (0.4 + i * 0.12);
      const a = (artwork ? 0.009 : 0.015) * (6 - i);
      glow2.circle(cx2, cy2, r).fill({ color: COLOR_EMBER, alpha: a });
    }
    this.app.stage.addChild(glow2);
  }

  /**
   * 設定板面（行數 + 倍率表）
   */
  setBoard(rows: number, multipliers: number[]): void {
    this.rows = rows;
    this.multipliers = multipliers;

    const sidePadding = Math.max(24, Math.min(54, this.width * 0.075));
    const bucketCount = Math.max(1, multipliers.length);
    this.boardTop = Math.max(42, Math.min(62, this.height * 0.105));
    this.boardLeft = sidePadding;
    this.boardRight = this.width - sidePadding;
    this.pegSpacing = (this.boardRight - this.boardLeft) / bucketCount;
    this.pegRadius = rows >= 12 ? 3.2 : 3.8;
    this.ballRadius = rows >= 12 ? 7 : 8;
    this.rowSpacing = (this.height - this.boardTop - this.bucketHeight() - 34) / (rows + 1);
    this.boardBottom = this.boardTop + this.rowSpacing * (rows + 1);

    this.drawPegs();
    this.drawBuckets();
  }

  setBetAmount(amount: number): void {
    this.betAmount = Number.isFinite(amount) && amount > 0 ? amount : 0;
    this.drawBuckets();
  }

  private bucketHeight(): number {
    return Math.max(30, Math.min(38, this.height * 0.07));
  }

  private bucketLayout(): {
    left: number;
    bucketW: number;
    bucketH: number;
    y: number;
    count: number;
  } {
    const count = Math.max(1, this.multipliers.length);
    const bucketW = (this.boardRight - this.boardLeft) / count;
    return {
      left: this.boardLeft,
      bucketW,
      bucketH: this.bucketHeight(),
      y: this.boardBottom - 8,
      count,
    };
  }

  private bucketCenterX(bucket: number): number {
    const layout = this.bucketLayout();
    const clamped = Math.max(0, Math.min(layout.count - 1, bucket));
    return layout.left + clamped * layout.bucketW + layout.bucketW / 2;
  }

  private pathStartX(): number {
    return (this.bucketCenterX(0) + this.bucketCenterX(this.rows)) / 2;
  }

  private pathXAfterSteps(path: ('left' | 'right')[], steps: number): number {
    const clampedSteps = Math.max(0, Math.min(this.rows, steps));
    let rights = 0;
    for (let i = 0; i < clampedSteps; i += 1) {
      if (path[i] === 'right') rights += 1;
    }
    return this.pathStartX() + (rights * 2 - clampedSteps) * (this.pegSpacing / 2);
  }

  private drawPegs(): void {
    if (!this.pegsContainer) return;
    this.pegsContainer.removeChildren();
    const g = new Graphics();
    for (let r = 0; r < this.rows; r += 1) {
      const pegsInRow = r + 2;
      const rowWidth = (pegsInRow - 1) * this.pegSpacing;
      const startX = (this.width - rowWidth) / 2;
      const y = this.boardTop + (r + 1) * this.rowSpacing;
      for (let i = 0; i < pegsInRow; i += 1) {
        const x = startX + i * this.pegSpacing;
        // 陰影
        g.circle(x + 1, y + 2, this.pegRadius).fill({ color: COLOR_INK, alpha: 0.25 });
        // 主釘
        g.circle(x, y, this.pegRadius).fill({ color: COLOR_ACID });
        // 高光
        g.circle(x - this.pegRadius * 0.4, y - this.pegRadius * 0.4, this.pegRadius * 0.4).fill({
          color: COLOR_WHITE,
          alpha: 0.6,
        });
      }
    }
    this.pegsContainer.addChild(g);
  }

  private drawBuckets(): void {
    if (!this.bucketsContainer) return;
    this.bucketsContainer.removeChildren();
    const { bucketW, bucketH, left, y } = this.bucketLayout();

    for (let i = 0; i < this.multipliers.length; i += 1) {
      const mRaw = this.multipliers[i];
      const m: number = mRaw === undefined || mRaw === null || Number.isNaN(mRaw) ? 0 : mRaw;
      const x = left + i * bucketW;

      // 顏色依倍率
      let color = 0xdcd0b3;
      if (m >= 10) color = COLOR_EMBER;
      else if (m >= 3) color = COLOR_AMBER;
      else if (m >= 1.1) color = COLOR_TOXIC;
      else if (m < 1) color = 0xdcd0b3;

      const c = new Container();
      c.x = x;
      c.y = y;

      const cardW = Math.max(8, bucketW - 4);
      const strokeWidth = this.width < 520 ? 1.5 : 2;
      const box = new Graphics();
      box.roundRect(2, 0, cardW, bucketH, 5).fill({ color: COLOR_BUCKET_BG, alpha: 0.92 });
      box.roundRect(2, 0, cardW, bucketH, 5).fill({ color, alpha: 0.12 });
      box.roundRect(4, 2, Math.max(4, cardW - 4), Math.max(7, bucketH * 0.36), 4).fill({
        color: COLOR_WHITE,
        alpha: 0.05,
      });
      box.roundRect(2, 0, cardW, bucketH, 5).stroke({
        color,
        width: strokeWidth,
        alpha: 0.95,
      });
      c.addChild(box);

      // 倍率文字
      const fmt = formatMultiplierLabel(m);
      const hasPayout = this.betAmount > 0;
      const autoSize = Math.max(8, Math.min(bucketW * 0.32, hasPayout ? 13 : 15));
      const fillStr = `#${color.toString(16).padStart(6, '0')}`;
      const label = new Text({
        text: `${fmt}×`,
        style: new TextStyle({
          fontFamily: GAME_FONT,
          fontSize: autoSize,
          fill: fillStr,
          fontWeight: '700',
          align: 'center',
          stroke: { color: COLOR_INK, width: 2 },
        }),
        resolution: 2,
      });
      label.anchor.set(0.5);
      label.x = bucketW / 2;
      label.y = hasPayout ? bucketH * 0.35 : bucketH / 2;
      c.addChild(label);

      if (hasPayout) {
        const payout = formatPotentialPayout(this.betAmount * m);
        const payoutSize = Math.max(7, Math.min(bucketW * 0.25, 10));
        const payoutLabel = new Text({
          text: payout,
          style: new TextStyle({
            fontFamily: GAME_FONT,
            fontSize: payoutSize,
            fill: COLOR_WHITE,
            fontWeight: '700',
            align: 'center',
            stroke: { color: COLOR_INK, width: 2 },
          }),
          resolution: 2,
        });
        payoutLabel.anchor.set(0.5);
        payoutLabel.x = bucketW / 2;
        payoutLabel.y = bucketH * 0.72;
        c.addChild(payoutLabel);
      }

      this.bucketsContainer.addChild(c);
    }
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;

    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
    };
    this.app.ticker.add(this.ambientTicker);

    this.ballTicker = (tk: Ticker) => {
      for (let i = this.balls.length - 1; i >= 0; i -= 1) {
        const b = this.balls[i]!;
        // Deterministic 物理：球以恆定 vy 下落，垂直不受水平影響；
        // 每碰到一排釘子，依 path[row] 精確橫移半格到新位置。
        // 保證視覺軌跡與最終 bucket 完全吻合。
        const gravity = 0.42;
        b.vy += gravity * tk.deltaTime;
        // 水平位置由 GSAP tween 控制（碰釘時觸發），不再用 vx 累加
        b.y += b.vy * tk.deltaTime;

        // 檢測是否碰到某一排釘子（依 path 決定方向）
        const nextRow = b.row;
        if (nextRow < this.rows) {
          const rowY = this.boardTop + (nextRow + 1) * this.rowSpacing;
          if (b.y >= rowY && !b.bouncedRows.has(nextRow)) {
            b.bouncedRows.add(nextRow);
            const toX = this.pathXAfterSteps(b.path, nextRow + 1);
            const sparkX = (b.x + toX) / 2;
            gsap.to(b, {
              x: toX,
              duration: 0.18,
              ease: 'power1.out',
              onUpdate: () => {
                b.g.x = b.x;
              },
            });
            b.vy = Math.max(2.1, b.vy * 0.56 + 1.05); // 彈一下
            b.row += 1;

            // 碰撞火花
            this.emitPegSparks(sparkX, rowY);
          }
        }

        // 應用球位置（x 由上面 tween 控制，這裡只 sync 到 Graphics）
        b.g.x = b.x;
        b.g.y = b.y;
        b.g.rotation += 0.04 * tk.deltaTime;

        // 落底判定
        if (b.y >= this.boardBottom + 10) {
          const layout = this.bucketLayout();
          const targetX = this.bucketCenterX(b.targetBucket);
          const targetY = layout.y + layout.bucketH * 0.42;

          this.balls.splice(i, 1);
          // 短 tween 校正最後 1-2px 浮點誤差（不再有大位移 snap）
          gsap.to(b, {
            x: targetX,
            y: targetY,
            duration: 0.16,
            ease: 'power2.out',
            onUpdate: () => {
              b.g.x = b.x;
              b.g.y = b.y;
            },
            onComplete: () => {
              this.onLand(b);
            },
          });
        }
      }
    };
    this.app.ticker.add(this.ballTicker);

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
   * 樂觀動畫：按下 DROP 立刻呼叫，讓球先落到第一排釘子前等待 API 回應。
   * API 回來時呼叫 dropBall(...) 真正釋放。
   */
  startAnticipation(): Graphics | null {
    if (!this.ballsContainer) return null;
    const g = new Graphics();
    g.circle(0, 0, this.ballRadius)
      .fill({ color: COLOR_AMBER })
      .stroke({ color: COLOR_INK, width: 1.5 });
    const pendingIndex = this.anticipationBalls.length;
    const pendingOffset = (pendingIndex % 5) - 2;
    const firstPegY = this.boardTop + this.rowSpacing;
    const holdY = Math.max(this.boardTop - 2, firstPegY - this.ballRadius * 2.15);
    g.x = this.pathStartX() + pendingOffset * Math.max(2, this.ballRadius * 0.42);
    g.y = Math.max(8, this.boardTop - this.rowSpacing * 0.82);
    g.alpha = 0;
    g.scale.set(0.6);
    this.ballsContainer.addChild(g);
    this.anticipationBalls.push(g);
    const delay = Math.min(0.16, pendingIndex * 0.025);
    gsap.to(g, { alpha: 1, duration: 0.12, delay, ease: 'power2.out' });
    gsap.to(g.scale, {
      x: 1,
      y: 1,
      duration: 0.14,
      delay,
      ease: 'back.out(1.8)',
    });
    gsap.to(g, {
      x: this.pathStartX() + pendingOffset * Math.max(1.5, this.ballRadius * 0.24),
      y: holdY,
      duration: 0.34,
      delay,
      ease: 'power1.in',
      onComplete: () => {
        // API 還沒回來時，停在第一排釘子前做輕微脈動。
        gsap.to(g.scale, {
          x: 1.12,
          y: 1.12,
          duration: 0.38,
          ease: 'sine.inOut',
          yoyo: true,
          repeat: -1,
        });
      },
    });
    return g;
  }

  cancelAnticipation(ball: Graphics | null | undefined): void {
    this.stopAnticipation(ball);
  }

  private claimAnticipation(ball: Graphics | null | undefined): Graphics | null {
    if (!ball) return null;
    const index = this.anticipationBalls.indexOf(ball);
    if (index < 0) return null;
    this.anticipationBalls.splice(index, 1);
    gsap.killTweensOf(ball);
    gsap.killTweensOf(ball.scale);
    return ball;
  }

  private stopAnticipation(ball?: Graphics | null): void {
    const targets = ball ? [ball] : this.anticipationBalls.slice();
    for (const target of targets) {
      const index = this.anticipationBalls.indexOf(target);
      if (index >= 0) this.anticipationBalls.splice(index, 1);
      gsap.killTweensOf(target);
      gsap.killTweensOf(target.scale);
      this.ballsContainer?.removeChild(target);
      target.destroy();
    }
  }

  /**
   * 丟一顆球
   */
  async dropBall(
    path: ('left' | 'right')[],
    bucket: number,
    multiplier: number,
    anticipationBall?: Graphics | null,
  ): Promise<void> {
    if (!this.ballsContainer) return;

    return new Promise<void>((resolve) => {
      const claimedBall = this.claimAnticipation(anticipationBall);
      const g = claimedBall ?? new Graphics();
      const firstPegY = this.boardTop + this.rowSpacing;
      const startY = claimedBall
        ? Math.min(Math.max(g.y, this.boardTop - 10), firstPegY - this.ballRadius * 1.25)
        : this.boardTop - 10;
      g.clear();
      // 球
      g.circle(0, 0, this.ballRadius)
        .fill({ color: COLOR_AMBER })
        .stroke({ color: COLOR_INK, width: 1.5 });
      g.circle(-this.ballRadius * 0.3, -this.ballRadius * 0.3, this.ballRadius * 0.4).fill({
        color: COLOR_WHITE,
        alpha: 0.7,
      });
      g.x = this.pathStartX();
      g.y = startY;
      g.alpha = 1;
      g.scale.set(1);
      if (!g.parent) this.ballsContainer?.addChild(g);

      this.balls.push({
        g,
        x: g.x,
        y: g.y,
        vx: 0,
        vy: 2,
        row: 0,
        targetCol: 0,
        path,
        targetBucket: bucket,
        multiplier,
        bouncedRows: new Set(),
        onDone: (_b, m) => {
          void m;
          resolve();
        },
      });
    });
  }

  private onLand(b: Ball): void {
    if (b.multiplier > 1) this.playWinFx(b.multiplier, true);

    // Bucket 亮起
    if (this.bucketsContainer) {
      const bucket = this.bucketsContainer.children[b.targetBucket];
      if (bucket) {
        gsap.fromTo(
          bucket.scale,
          { x: 1, y: 1 },
          {
            x: 1.15,
            y: 1.3,
            duration: 0.18,
            yoyo: true,
            repeat: 1,
            ease: 'power2.out',
          },
        );
      }
    }

    // 落點特效 — L4 tier-based
    let color = COLOR_TOXIC;
    if (b.multiplier >= 10) color = COLOR_EMBER;
    else if (b.multiplier >= 3) color = COLOR_AMBER;
    else if (b.multiplier < 1) color = 0xdcd0b3;

    const layout = this.bucketLayout();
    const targetX = this.bucketCenterX(b.targetBucket);
    const targetY = layout.y + layout.bucketH * 0.35;

    const won = b.multiplier >= 1;
    const tier = classifyWinTier(b.multiplier, won);
    const tierCfg = TIER_CONFIG[tier];

    // 震波大小隨 tier
    const shockRadius = tier === 'mega' ? 180 : tier === 'huge' ? 140 : tier === 'big' ? 100 : 70;
    this.emitShockwave(targetX, targetY, color, shockRadius);
    if (tier === 'huge' || tier === 'mega') {
      // 大獎疊第二層震波
      this.emitShockwave(targetX, targetY, color, shockRadius * 1.5);
    }

    // 粒子用 pool（向上扇形噴）
    if (tierCfg.particles > 0) {
      this.particlePool?.emit({
        x: targetX,
        y: targetY,
        count: won ? tierCfg.particles : 10,
        colors: won ? [color, COLOR_WHITE, COLOR_ICE] : [0xdcd0b3, COLOR_INK],
        speedMin: 3,
        speedMax: won ? 11 : 4,
        angleRad: -Math.PI / 2,
        spreadRad: Math.PI,
      });
    }

    if (won && tierCfg.shakeAmp > 0 && this.shaker) {
      this.shaker.shake(tierCfg.shakeAmp, tierCfg.shakeDuration);
    }
    if (this.app && won && tierCfg.edgeGlowMs > 0) {
      emitEdgeGlow(this.app.stage, this.width, this.height, color, tierCfg.edgeGlowMs / 1000);
    }
    if (this.app && tierCfg.rayBurst) {
      emitRayBurst(this.app.stage, this.app, targetX, targetY, color, 1.2);
    }
    // L4 強化：落點 emit glow burst（讓「彈珠落定」感更強烈）
    if (this.app && won && !prefersReducedMotion()) {
      emitGlowBurst(this.app.stage, targetX, targetY, color, {
        radius: 60 + Math.min(80, b.multiplier * 6),
        peakBlur: 18 + Math.min(10, b.multiplier),
        durationSec: 0.55,
      });
    }

    // 球消失
    gsap.to(b.g, {
      alpha: 0,
      duration: 0.4,
      delay: 0.3,
      onComplete: () => {
        this.ballsContainer?.removeChild(b.g);
        b.g.destroy();
        b.onDone(b.targetBucket, b.multiplier);
      },
    });
  }

  private emitPegSparks(x: number, y: number): void {
    // L4: 熱路徑（每球彈數次），用 pool 避免 new Graphics
    this.particlePool?.emit({
      x,
      y,
      count: 3,
      colors: [COLOR_WHITE, COLOR_ICE],
      speedMin: 1,
      speedMax: 3,
      sizeMin: 1.2,
      sizeMax: 2,
      lifeMin: 12,
      lifeMax: 18,
      gravity: 0.1,
      shape: 'circle',
    });
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 5, alpha: 0.8 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: 0.7,
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
      const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
      const speed = 3 + Math.random() * 8;
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
        vy: Math.sin(angle) * speed,
        life: 40 + Math.random() * 25,
        maxLife: 65,
        gravity: 0.25,
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
    if (this.ballTicker && this.app) this.app.ticker.remove(this.ballTicker);
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
    this.pegsContainer = null;
    this.bucketsContainer = null;
    this.ballsContainer = null;
    this.anticipationBalls = [];
    this.particles = null;
    this.shockwaves = null;
    this.balls = [];
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
