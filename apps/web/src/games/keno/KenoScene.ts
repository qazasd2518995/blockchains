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
  emitGlowBurst,
  emitRayBurst,
  prewarmShaders,
  prefersReducedMotion,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0xFBF9F4;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x86B49C;
const COLOR_AMBER = 0xC9A24C;
const COLOR_INK = 0x0A0806;
const COLOR_WHITE = 0xffffff;

interface Ball {
  container: Container;
  number: number;
  isHit: boolean;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class KenoScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private ballRadius = 0;

  private ballsContainer: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private statusLabel: Text | null = null;

  private balls: Ball[] = [];
  private particleList: Particle[] = [];
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;


  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;
    this.ballRadius = Math.min(width / 24, 28);

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

    this.ballsContainer = new Container();
    app.stage.addChild(this.ballsContainer);

    this.particles = new Container();
    app.stage.addChild(this.particles);

    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    this.particlePool = new ParticlePool(app.stage, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.createStatusLabel();

    this.startTickers();
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });
    this.app.stage.addChild(bg);

    const glow = new Graphics()
      .circle(this.width / 2, this.height / 2, this.width * 0.45)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 底部機台光板
    const base = new Graphics()
      .roundRect(this.width * 0.1, this.height * 0.72, this.width * 0.8, this.height * 0.2, 16)
      .fill({ color: COLOR_ACID, alpha: 0.04 })
      .stroke({ color: COLOR_ACID, width: 1, alpha: 0.2 });
    this.app.stage.addChild(base);

    // 水平虛線（開獎區域分隔）
    const line = new Graphics();
    for (let x = 20; x < this.width - 20; x += 8) {
      line.moveTo(x, this.height * 0.68).lineTo(x + 4, this.height * 0.68).stroke({
        color: COLOR_ACID,
        width: 1,
        alpha: 0.2,
      });
    }
    this.app.stage.addChild(line);
  }

  private createStatusLabel(): void {
    if (!this.app) return;
    const style = new TextStyle({
      fontFamily: 'IBM Plex Mono, monospace',
      fontSize: 14,
      fill: COLOR_INK,
      fontWeight: '600',
      letterSpacing: 4,
    });
    const label = new Text({ text: 'READY · 按下開始開獎', style });
    label.anchor.set(0.5);
    label.x = this.width / 2;
    label.y = 30;
    label.alpha = 0.6;
    this.statusLabel = label;
    this.app.stage.addChild(label);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // 球微浮動
      for (let i = 0; i < this.balls.length; i += 1) {
        const ball = this.balls[i]!;
        ball.container.y += Math.sin(tick * 0.04 + i * 0.3) * 0.1;
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
   * 建立一個號碼球圖形
   */
  private createBall(n: number, color: number): Container {
    const c = new Container();
    const r = this.ballRadius;

    // 陰影
    const shadow = new Graphics().circle(2, 4, r).fill({ color: COLOR_INK, alpha: 0.2 });
    c.addChild(shadow);

    // 主球
    const main = new Graphics()
      .circle(0, 0, r)
      .fill({ color })
      .stroke({ color: COLOR_WHITE, width: 2 });
    c.addChild(main);

    // 上半部高光
    const hl = new Graphics()
      .ellipse(-r * 0.3, -r * 0.35, r * 0.45, r * 0.28)
      .fill({ color: COLOR_WHITE, alpha: 0.5 });
    c.addChild(hl);

    // 內圈裝飾
    const ring = new Graphics()
      .circle(0, 0, r * 0.72)
      .stroke({ color: COLOR_WHITE, width: 1, alpha: 0.4 });
    c.addChild(ring);

    // 號碼
    const fontSize = r * 0.85;
    const style = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize,
      fill: COLOR_WHITE,
      fontWeight: '700',
      letterSpacing: 1,
    });
    const txt = new Text({ text: `${n}`, style });
    txt.anchor.set(0.5);
    txt.y = 2;
    c.addChild(txt);

    return c;
  }

  /**
   * 重置（清除舊球）
   */
  reset(): void {
    if (this.ballsContainer) {
      this.ballsContainer.removeChildren();
      this.balls = [];
    }
    if (this.statusLabel) {
      this.statusLabel.text = 'READY · 按下開始開獎';
      this.statusLabel.style.fill = COLOR_INK;
    }
  }

  /**
   * 播放開獎動畫
   * drawn: 開出的 10 個號碼
   * selected: 玩家選的號碼
   * hits: 命中號碼
   */
  async playDraw(drawn: number[], selected: number[], hits: number[]): Promise<void> {
    this.reset();
    const hitSet = new Set(hits);
    const selectedSet = new Set(selected);

    if (this.statusLabel) {
      this.statusLabel.text = 'DRAWING…';
      this.statusLabel.style.fill = COLOR_ACID;
    }

    const ballsPerRow = 5;
    const rows = Math.ceil(drawn.length / ballsPerRow);
    const gap = this.ballRadius * 2.4;
    const totalW = gap * ballsPerRow;
    const startX = (this.width - totalW) / 2 + gap / 2;
    const totalH = rows * gap;
    const startY = (this.height - totalH) / 2 + gap / 2 - 20;

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          if (this.statusLabel) {
            const count = hits.length;
            if (count > 0) {
              this.statusLabel.text = `命中 ${count}/${selected.length}`;
              this.statusLabel.style.fill = COLOR_TOXIC;
            } else {
              this.statusLabel.text = '未命中';
              this.statusLabel.style.fill = COLOR_EMBER;
            }
          }
          resolve();
        },
      });

      drawn.forEach((n, i) => {
        const row = Math.floor(i / ballsPerRow);
        const col = i % ballsPerRow;
        const targetX = startX + col * gap;
        const targetY = startY + row * gap;

        const isHit = hitSet.has(n);
        const isSelected = selectedSet.has(n);

        // 選球顏色
        let color = COLOR_ACID;
        if (isHit) color = COLOR_AMBER; // 金色 = 命中
        else if (isSelected) color = COLOR_EMBER; // 紅色 = 選了但沒中
        // 一般 = 紫色

        const ball = this.createBall(n, color);
        ball.x = this.width / 2;
        ball.y = -this.ballRadius - 20;
        ball.alpha = 0;
        ball.scale.set(0.3);
        this.ballsContainer?.addChild(ball);
        this.balls.push({ container: ball, number: n, isHit });

        tl.to(
          ball,
          {
            alpha: 1,
            x: targetX,
            y: targetY,
            duration: 0.5,
            ease: 'back.out(1.4)',
          },
          `>-0.35`,
        );
        tl.to(
          ball.scale,
          {
            x: 1,
            y: 1,
            duration: 0.5,
            ease: 'back.out(1.6)',
          },
          '<',
        );

        // 落地彈一下
        tl.to(
          ball.scale,
          {
            y: 0.85,
            duration: 0.08,
            ease: 'power2.out',
            yoyo: true,
            repeat: 1,
          },
          '>-0.05',
        );

        // 命中特效
        if (isHit) {
          tl.call(() => {
            this.emitShockwave(targetX, targetY, COLOR_AMBER, this.ballRadius * 3);
            // L4 pool
            this.particlePool?.emit({
              x: targetX,
              y: targetY,
              count: 20,
              colors: [COLOR_AMBER, COLOR_TOXIC, COLOR_WHITE],
              speedMin: 2,
              speedMax: 7,
            });
            gsap.to(ball.scale, {
              x: 1.25,
              y: 1.25,
              duration: 0.2,
              yoyo: true,
              repeat: 1,
              ease: EASE.out,
            });
          });
        }
      });

      // 結尾大特效 — tier-based
      if (hits.length >= 5) {
        tl.call(() => {
          const cx = this.width / 2;
          const cy = this.height / 2;
          // 將命中數對應粗略倍率 tier（5→big / 7→huge / 9+→mega）
          const approxMult = hits.length >= 9 ? 1000 : hits.length >= 7 ? 100 : 10;
          const cfg = TIER_CONFIG[classifyWinTier(approxMult, true)];
          this.emitShockwave(cx, cy, COLOR_AMBER, this.width * 0.5);
          this.particlePool?.emit({
            x: cx,
            y: cy,
            count: cfg.particles,
            colors: [COLOR_AMBER, COLOR_TOXIC, COLOR_ICE, 0xffffff],
            speedMin: 3,
            speedMax: 11,
          });
          if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
          if (this.app && cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_AMBER, cfg.edgeGlowMs / 1000);
          if (this.app && cfg.rayBurst) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_AMBER, 1.2);
          // L4 強化：高命中數時加中央 glow burst
          if (this.app && !prefersReducedMotion()) {
            emitGlowBurst(this.app.stage, cx, cy, COLOR_AMBER, {
              radius: 90 + hits.length * 8,
              peakBlur: 20,
              durationSec: 0.7,
            });
          }
        });
      }
    });
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 5, alpha: 0.85 };
    gsap.to(state, {
      r: maxR,
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

  private emitParticles(x: number, y: number, count: number, colors: number[]): void {
    if (!this.particles) return;
    for (let i = 0; i < count; i += 1) {
      const angle = Math.random() * Math.PI * 2;
      const speed = 2 + Math.random() * 8;
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
        vy: Math.sin(angle) * speed - 1,
        life: 40 + Math.random() * 25,
        maxLife: 65,
        gravity: 0.12,
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
    this.ballsContainer = null;
    this.particles = null;
    this.shockwaves = null;
    this.statusLabel = null;
    this.balls = [];
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
