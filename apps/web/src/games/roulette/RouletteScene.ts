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
  GAME_FONT_NUM,
} from '@bg/game-engine';
import { WinCelebration } from '@bg/game-engine';

const COLOR_BG = 0x0F172A;
const COLOR_ACID = 0xF3D67D;
const COLOR_VIOLET = 0xE8D48A;
const COLOR_EMBER = 0xD4574A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_AMBER = 0xF3D67D;
const COLOR_ICE = 0x266F85;
const COLOR_INK = 0x0A0806;
const COLOR_RED = 0xD4574A;
const COLOR_WHITE = 0xFFFFFF;

const SLOTS = 13; // 0 + 1-12
const TAU = Math.PI * 2;
const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12]);
const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11]);
export type RouletteSkin = 'mini-roulette' | 'carnival';

const ROULETTE_BACKGROUND_ASSETS: Record<RouletteSkin, string> = {
  'mini-roulette': '/game-art/mini-roulette/background.png',
  carnival: '/game-art/carnival/background.png',
};

function normalizeAngle(angle: number): number {
  return ((angle % TAU) + TAU) % TAU;
}

function positiveAngleDelta(from: number, to: number): number {
  return (to - from + TAU) % TAU;
}

function negativeAngleDelta(from: number, to: number): number {
  return -((from - to + TAU) % TAU);
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class RouletteScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private cx = 0;
  private cy = 0;
  private outerRadius = 0;
  private ballOrbitRadius = 0;

  private wheelContainer: Container | null = null;
  private wheelGraphics: Graphics | null = null;
  private numbersContainer: Container | null = null;
  private ballContainer: Container | null = null;
  private ball: Graphics | null = null;
  private centerHub: Container | null = null;
  private pointerContainer: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;
  private statusLabel: Text | null = null;

  private ballAngle = 0;
  private wheelAngle = 0;
  private spinning = false;

  private particleList: Particle[] = [];
  private skin: RouletteSkin = 'mini-roulette';
  private backgroundTexture: Texture | null = null;
  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;

  private statusText = 'PLACE YOUR BETS';
  private winFx: WinCelebration | null = null;


  async init(
    canvas: HTMLCanvasElement,
    width: number,
    height: number,
    opts?: { statusText?: string; skin?: RouletteSkin },
  ): Promise<void> {
    if (opts?.statusText) this.statusText = opts.statusText;
    if (opts?.skin) this.skin = opts.skin;
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.outerRadius = Math.min(width, height) * 0.42;
    this.ballOrbitRadius = this.outerRadius - 14;

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

    // 輪盤主體容器（會旋轉）
    this.wheelContainer = new Container();
    this.wheelContainer.x = this.cx;
    this.wheelContainer.y = this.cy;
    app.stage.addChild(this.wheelContainer);

    this.wheelGraphics = new Graphics();
    this.wheelContainer.addChild(this.wheelGraphics);

    this.numbersContainer = new Container();
    this.wheelContainer.addChild(this.numbersContainer);

    this.drawWheel();

    // 中心 hub（不隨輪盤旋轉，也不動）
    this.centerHub = new Container();
    this.centerHub.x = this.cx;
    this.centerHub.y = this.cy;
    app.stage.addChild(this.centerHub);
    this.drawCenterHub();

    // 珠子軌道（獨立容器，不隨輪盤）
    this.ballContainer = new Container();
    this.ballContainer.x = this.cx;
    this.ballContainer.y = this.cy;
    app.stage.addChild(this.ballContainer);
    this.createBall();

    // 指針（頂部）
    this.pointerContainer = new Container();
    this.pointerContainer.x = this.cx;
    this.pointerContainer.y = this.cy - this.outerRadius - 2;
    app.stage.addChild(this.pointerContainer);
    this.drawPointer();

    // 狀態文字（底部）
    this.createStatusLabel();

    // 粒子層
    this.particles = new Container();
    app.stage.addChild(this.particles);
    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    this.particlePool = new ParticlePool(app.stage, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.startTickers();
  }

  private async preloadAssets(): Promise<void> {
    this.backgroundTexture = await loadTextureOrNull(ROULETTE_BACKGROUND_ASSETS[this.skin]);
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 1 });
    this.app.stage.addChild(bg);

    const artwork = addCoverSprite(this.app.stage, this.backgroundTexture, this.width, this.height, 0.92);
    if (artwork) {
      const veil = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: this.skin === 'carnival' ? 0.46 : 0.5 });
      this.app.stage.addChild(veil);
    }

    const glow = new Graphics()
      .circle(this.cx, this.cy, this.outerRadius * 1.4)
      .fill({ color: this.skin === 'carnival' ? COLOR_EMBER : COLOR_ACID, alpha: artwork ? 0.045 : 0.08 });
    glow.filters = [new BlurFilter({ strength: 60 })];
    this.app.stage.addChild(glow);

    // 外圈裝飾
    const deco = new Graphics()
      .circle(this.cx, this.cy, this.outerRadius + 24)
      .stroke({ color: COLOR_ACID, width: 2, alpha: artwork ? 0.14 : 0.2 });
    this.app.stage.addChild(deco);
    for (let i = 0; i < 16; i += 1) {
      const a = (i / 16) * Math.PI * 2;
      const px = this.cx + Math.cos(a) * (this.outerRadius + 42);
      const py = this.cy + Math.sin(a) * (this.outerRadius + 42);
      const dot = new Graphics().circle(px, py, 3).fill({ color: COLOR_ACID, alpha: artwork ? 0.2 : 0.35 });
      this.app.stage.addChild(dot);
    }
  }

  private drawWheel(): void {
    if (!this.wheelGraphics || !this.numbersContainer) return;
    const g = this.wheelGraphics;
    const segAngle = TAU / SLOTS;
    g.clear();
    this.numbersContainer.removeChildren();

    // 外圈
    g.circle(0, 0, this.outerRadius + 3)
      .fill({ color: COLOR_INK })
      .circle(0, 0, this.outerRadius)
      .fill({ color: COLOR_INK });

    for (let i = 0; i < SLOTS; i += 1) {
      const startA = -Math.PI / 2 + i * segAngle;
      const endA = startA + segAngle;

      // 顏色
      let color = COLOR_INK;
      if (i === 0) color = 0x1E7A4F; // 綠色 0
      else if (RED_NUMBERS.has(i)) color = COLOR_RED;
      else if (BLACK_NUMBERS.has(i)) color = 0x0A0806;

      g.moveTo(0, 0);
      g.arc(0, 0, this.outerRadius - 4, startA, endA);
      g.closePath();
      g.fill({ color });

      // 分隔線
      const x1 = Math.cos(startA) * (this.outerRadius - 4);
      const y1 = Math.sin(startA) * (this.outerRadius - 4);
      g.moveTo(0, 0).lineTo(x1, y1).stroke({ color: COLOR_AMBER, width: 1.5, alpha: 0.6 });

      // 號碼文字
      const midA = startA + segAngle / 2;
      const tx = Math.cos(midA) * (this.outerRadius - 30);
      const ty = Math.sin(midA) * (this.outerRadius - 30);
      const style = new TextStyle({
        fontFamily: GAME_FONT,
        fontSize: 24,
        fill: COLOR_WHITE,
        fontWeight: '700',
      });
      const txt = new Text({ text: `${i}`, style });
      txt.anchor.set(0.5);
      txt.x = tx;
      txt.y = ty;
      txt.rotation = midA + Math.PI / 2;
      this.numbersContainer.addChild(txt);
    }

    // 內圈金環
    g.circle(0, 0, this.outerRadius - 4).stroke({
      color: COLOR_AMBER,
      width: 2,
      alpha: 0.7,
    });
  }

  private drawCenterHub(): void {
    if (!this.centerHub) return;
    const r = this.outerRadius * 0.35;
    // 外圈
    const outer = new Graphics()
      .circle(0, 0, r)
      .fill({ color: COLOR_INK })
      .stroke({ color: COLOR_AMBER, width: 2 });
    // 內圈
    const inner = new Graphics()
      .circle(0, 0, r * 0.7)
      .fill({ color: COLOR_ACID })
      .stroke({ color: COLOR_WHITE, width: 1, alpha: 0.4 });
    // 十字
    const cross = new Graphics();
    cross
      .moveTo(-r * 0.5, 0)
      .lineTo(r * 0.5, 0)
      .stroke({ color: COLOR_AMBER, width: 2 });
    cross
      .moveTo(0, -r * 0.5)
      .lineTo(0, r * 0.5)
      .stroke({ color: COLOR_AMBER, width: 2 });
    // 中心星
    const starStyle = new TextStyle({
      fontFamily: GAME_FONT,
      fontSize: r * 0.8,
      fill: COLOR_WHITE,
      fontWeight: '700',
    });
    const star = new Text({ text: '✦', style: starStyle });
    star.anchor.set(0.5);
    this.centerHub.addChild(outer);
    this.centerHub.addChild(inner);
    this.centerHub.addChild(cross);
    this.centerHub.addChild(star);
  }

  private createBall(): void {
    if (!this.ballContainer) return;
    this.ball = new Graphics();
    this.ball
      .circle(0, 0, 7)
      .fill({ color: COLOR_WHITE })
      .stroke({ color: COLOR_INK, width: 1 });
    this.ball
      .circle(-2, -2, 2.5)
      .fill({ color: COLOR_WHITE, alpha: 0.8 });
    // 初始位置（上方）
    const a = -Math.PI / 2;
    this.ball.x = Math.cos(a) * this.ballOrbitRadius;
    this.ball.y = Math.sin(a) * this.ballOrbitRadius;
    this.ballAngle = a;
    this.ballContainer.addChild(this.ball);
  }

  private drawPointer(): void {
    if (!this.pointerContainer) return;
    const shadow = new Graphics()
      .poly([-14, -2, 14, -2, 0, 26])
      .fill({ color: COLOR_INK, alpha: 0.3 });
    shadow.x = 2;
    shadow.y = 3;
    const body = new Graphics()
      .poly([-12, 0, 12, 0, 0, 24])
      .fill({ color: COLOR_AMBER })
      .stroke({ color: COLOR_INK, width: 2 });
    const cap = new Graphics()
      .circle(0, -2, 8)
      .fill({ color: COLOR_AMBER })
      .stroke({ color: COLOR_INK, width: 2 });
    this.pointerContainer.addChild(shadow);
    this.pointerContainer.addChild(body);
    this.pointerContainer.addChild(cap);
  }

  private createStatusLabel(): void {
    if (!this.app) return;
    const style = new TextStyle({
      fontFamily: GAME_FONT_NUM,
      fontSize: 14,
      fill: COLOR_WHITE,
      fontWeight: '600',
      letterSpacing: 4,
    });
    const label = new Text({ text: this.statusText, style });
    label.anchor.set(0.5);
    label.x = this.cx;
    label.y = this.cy + this.outerRadius + 60;
    label.alpha = 0.72;
    this.statusLabel = label;
    this.app.stage.addChild(label);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // Idle 不再讓輪盤自轉 — 結算後輪盤必須維持 slot 對齊指針，
      // 任何漂移都會讓玩家以為「結果與停止位置不同」。
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
   * 樂觀動畫：按下 SPIN 立刻轉輪盤（無結果）+ 珠子開始繞軌道。
   * API 回來呼叫 playSpin(...) 停到正確 slot。
   */
  startAnticipation(): void {
    if (this.wheelContainer) {
      gsap.to(this.wheelContainer, {
        rotation: `+=${Math.PI * 4}`,
        duration: 1.4,
        ease: 'none',
        repeat: -1,
      });
    }
    if (this.ballContainer) {
      gsap.to(this.ballContainer, {
        rotation: `-=${Math.PI * 5}`,
        duration: 1.2,
        ease: 'none',
        repeat: -1,
      });
    }
  }

  /**
   * 播放旋轉動畫
   * slot = 最終落在哪個號碼 (0-12)
   */
  async playSpin(slot: number): Promise<void> {
    if (!this.wheelContainer || !this.ball) return;
    // 清 anticipation 無限旋轉
    if (this.wheelContainer) gsap.killTweensOf(this.wheelContainer);
    if (this.ballContainer) {
      gsap.killTweensOf(this.ballContainer);
      // 重置 ballContainer.rotation — 否則 anticipation 殘留會讓
      // 球的世界座標 = ballContainer.rotation 應用 + ball 局部位置，
      // 導致最終球停的位置偏離指針。
      this.ballContainer.rotation = 0;
    }
    this.spinning = true;

    const segAngle = (Math.PI * 2) / SLOTS;

    // 1. 輪盤加速旋轉，然後減速
    // 2. 珠子反方向繞外圈，逐漸減速落下到對應格

    // 最終輪盤停的角度：使 slot 對應正上方（指針位置 = -PI/2）
    // 號碼 i 的中心在 startA + segAngle/2 = -PI/2 + (i+0.5)*segAngle
    // 加上輪盤 rotation θ，要讓 -PI/2 + (i+0.5)*segAngle + θ ≡ -PI/2 (mod 2π)
    // => θ = -(i+0.5)*segAngle  (mod 2π)
    const wheelFinalBase = normalizeAngle(-((slot + 0.5) * segAngle));
    const wheelSpins = 4 + Math.floor(Math.random() * 2);
    const wheelStart = this.wheelContainer.rotation;
    const wheelTarget =
      wheelStart +
      wheelSpins * TAU +
      positiveAngleDelta(normalizeAngle(wheelStart), wheelFinalBase);

    // 珠子最終停在指針位置（相對世界座標 -PI/2）
    const ballFinalAngle = -Math.PI / 2;
    const ballFinalBase = normalizeAngle(ballFinalAngle);
    const ballSpins = 6 + Math.floor(Math.random() * 2);
    const ballStart = this.ballAngle;
    // 珠子反方向繞行，但結束角度必須精準回到指針位置。
    const ballTarget =
      ballStart -
      ballSpins * TAU +
      negativeAngleDelta(normalizeAngle(ballStart), ballFinalBase);
    // 將軌道半徑從外圈逐漸減到內圈（簡單處理：keep external）

    if (this.statusLabel) {
      this.statusLabel.text = 'SPINNING…';
      this.statusLabel.style.fill = COLOR_ACID;
    }

    return new Promise<void>((resolve) => {
      const duration = 4.5;

      // 輪盤旋轉
      gsap.to(this.wheelContainer!, {
        rotation: wheelTarget,
        duration,
        ease: 'power3.out',
      });

      // 珠子角度
      const state = { angle: ballStart, radius: this.ballOrbitRadius };
      gsap.to(state, {
        angle: ballTarget,
        duration,
        ease: 'power3.out',
        onUpdate: () => {
          this.ballAngle = state.angle;
          if (this.ball) {
            this.ball.x = Math.cos(state.angle) * state.radius;
            this.ball.y = Math.sin(state.angle) * state.radius;
          }
        },
        onComplete: () => {
          this.wheelContainer!.rotation = wheelFinalBase;
          state.angle = ballFinalAngle;
          this.ballAngle = ballFinalAngle;
          if (this.ball) {
            this.ball.x = Math.cos(ballFinalAngle) * state.radius;
            this.ball.y = Math.sin(ballFinalAngle) * state.radius;
          }
          this.spinning = false;
          this.onLand(slot);
          resolve();
        },
      });

      // 軌道半徑最後 1.5 秒從外圈滑向內圈（珠子掉進格子）
      gsap.to(state, {
        radius: this.outerRadius * 0.78,
        duration: 1.2,
        delay: duration - 1.2,
        ease: 'power2.in',
      });
    });
  }

  private onLand(slot: number): void {
    // 珠子停在指針下方：世界座標 (cx, cy - R*0.78)
    if (this.ball && this.ballContainer) {
      const bx = this.ballContainer.x + this.ball.x;
      const by = this.ballContainer.y + this.ball.y;

      // 依號碼類型決定特效
      let color = COLOR_TOXIC;
      if (slot === 0) {
        color = 0x1E7A4F;
      } else if (RED_NUMBERS.has(slot)) {
        color = COLOR_RED;
      } else {
        color = COLOR_AMBER;
      }

      this.emitShockwave(bx, by, color, 120);
      this.emitShockwave(this.cx, this.cy, COLOR_AMBER, this.outerRadius * 1.3, 0.1);

      // L4 pool 粒子（落格爆發）
      this.particlePool?.emit({
        x: bx,
        y: by,
        count: 35,
        colors: [color, COLOR_AMBER, COLOR_WHITE],
        speedMin: 3,
        speedMax: 9,
      });

      // 珠子彈跳
      gsap.fromTo(
        this.ball.scale,
        { x: 1.5, y: 1.5 },
        { x: 1, y: 1, duration: 0.5, ease: EASE.elastic },
      );

      // L4 shake 弱（落格不是大勝不需強震）
      this.shaker?.shake(5, 0.35);

      // L4 強化：球落定 emit glow burst（強化「球停下」儀式感）
      if (this.app && !prefersReducedMotion()) {
        emitGlowBurst(this.app.stage, bx, by, color, {
          radius: 70,
          peakBlur: 16,
          durationSec: 0.55,
        });
      }
    }

    if (this.statusLabel) {
      this.statusLabel.text = `RESULT: ${slot}`;
      this.statusLabel.style.fill = COLOR_WHITE;
    }
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
        vy: Math.sin(angle) * speed - 1,
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

  reset(): void {
    if (this.statusLabel) {
      this.statusLabel.text = this.statusText;
      this.statusLabel.style.fill = COLOR_INK;
    }
    // 珠子回到初始位置
    if (this.ball) {
      const a = -Math.PI / 2;
      this.ball.x = Math.cos(a) * this.ballOrbitRadius;
      this.ball.y = Math.sin(a) * this.ballOrbitRadius;
      this.ballAngle = a;
    }
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
    this.wheelContainer = null;
    this.wheelGraphics = null;
    this.numbersContainer = null;
    this.ballContainer = null;
    this.ball = null;
    this.centerHub = null;
    this.pointerContainer = null;
    this.particles = null;
    this.shockwaves = null;
    this.statusLabel = null;
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
