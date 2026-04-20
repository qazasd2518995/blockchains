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

const COLOR_BG = 0xf7f9ff;
const COLOR_ACID = 0x5b4df8;
const COLOR_VIOLET = 0x9b6cff;
const COLOR_EMBER = 0xff3b7f;
const COLOR_TOXIC = 0x00d68f;
const COLOR_AMBER = 0xffb020;
const COLOR_ICE = 0x00b8e6;
const COLOR_INK = 0x0b0f1e;
const COLOR_WHITE = 0xffffff;
const COLOR_GRAY = 0xdde4f3;

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class WheelScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;
  private radius = 0;
  private cx = 0;
  private cy = 0;

  private wheelContainer: Container | null = null;
  private wheelGraphics: Graphics | null = null;
  private pointerContainer: Container | null = null;
  private centerHub: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;

  private multipliers: number[] = [];
  private particleList: Particle[] = [];

  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;

  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;
    this.cx = width / 2;
    this.cy = height / 2;
    this.radius = Math.min(width, height) * 0.4;

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

    this.createBackground();

    this.wheelContainer = new Container();
    this.wheelContainer.x = this.cx;
    this.wheelContainer.y = this.cy;
    app.stage.addChild(this.wheelContainer);

    this.wheelGraphics = new Graphics();
    this.wheelContainer.addChild(this.wheelGraphics);

    // 中心 hub
    this.centerHub = new Container();
    this.centerHub.x = this.cx;
    this.centerHub.y = this.cy;
    app.stage.addChild(this.centerHub);
    this.drawCenterHub();

    // 指針（在輪盤上方，但不隨輪盤旋轉）
    this.pointerContainer = new Container();
    this.pointerContainer.x = this.cx;
    this.pointerContainer.y = this.cy - this.radius - 2;
    app.stage.addChild(this.pointerContainer);
    this.drawPointer();

    // 粒子 + shockwave
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

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });
    this.app.stage.addChild(bg);

    const glow = new Graphics()
      .circle(this.cx, this.cy, this.radius * 1.3)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 外圈裝飾光環
    const ring = new Graphics()
      .circle(this.cx, this.cy, this.radius + 20)
      .stroke({ color: COLOR_ACID, width: 2, alpha: 0.2 });
    this.app.stage.addChild(ring);

    // 小裝飾點（圍繞輪盤外圍）
    for (let i = 0; i < 12; i += 1) {
      const a = (i / 12) * Math.PI * 2;
      const px = this.cx + Math.cos(a) * (this.radius + 36);
      const py = this.cy + Math.sin(a) * (this.radius + 36);
      const dot = new Graphics().circle(px, py, 3).fill({ color: COLOR_ACID, alpha: 0.4 });
      this.app.stage.addChild(dot);
    }
  }

  private drawCenterHub(): void {
    if (!this.centerHub) return;
    const outer = new Graphics()
      .circle(0, 0, 45)
      .fill({ color: COLOR_INK })
      .stroke({ color: COLOR_ACID, width: 3 });
    const inner = new Graphics()
      .circle(0, 0, 36)
      .fill({ color: COLOR_ACID })
      .stroke({ color: COLOR_WHITE, width: 1, alpha: 0.5 });
    // 中心星
    const starStyle = new TextStyle({
      fontFamily: 'Orbitron, Chakra Petch, sans-serif',
      fontSize: 36,
      fill: COLOR_WHITE,
      fontWeight: '700',
    });
    const star = new Text({ text: '✦', style: starStyle });
    star.anchor.set(0.5);
    this.centerHub.addChild(outer);
    this.centerHub.addChild(inner);
    this.centerHub.addChild(star);
  }

  private drawPointer(): void {
    if (!this.pointerContainer) return;
    // 指針朝下（指向輪盤外圈的 0 度位置，也就是正上方）
    const shadow = new Graphics()
      .poly([-14, -2, 14, -2, 0, 26])
      .fill({ color: COLOR_INK, alpha: 0.3 });
    shadow.x = 2;
    shadow.y = 3;
    const body = new Graphics()
      .poly([-12, 0, 12, 0, 0, 24])
      .fill({ color: COLOR_EMBER })
      .stroke({ color: COLOR_INK, width: 2 });
    // 頂部圓
    const cap = new Graphics()
      .circle(0, -2, 8)
      .fill({ color: COLOR_EMBER })
      .stroke({ color: COLOR_INK, width: 2 });
    this.pointerContainer.addChild(shadow);
    this.pointerContainer.addChild(body);
    this.pointerContainer.addChild(cap);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      // 中心 hub 微微旋轉
      if (this.centerHub) {
        const star = this.centerHub.children[this.centerHub.children.length - 1];
        if (star) star.rotation += 0.005;
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
   * 設定輪盤的區段倍率表（段數 = multipliers.length）
   */
  setSegments(multipliers: number[]): void {
    this.multipliers = multipliers;
    this.drawWheel();
  }

  private drawWheel(): void {
    if (!this.wheelGraphics) return;
    const g = this.wheelGraphics;
    g.clear();
    const n = this.multipliers.length;
    if (n === 0) return;
    const segAngle = (Math.PI * 2) / n;

    // 繪製扇形
    for (let i = 0; i < n; i += 1) {
      const m = this.multipliers[i]!;
      // 顏色依倍率
      let color = COLOR_GRAY;
      if (m === 0) color = COLOR_GRAY;
      else if (m < 2) color = COLOR_TOXIC;
      else if (m < 5) color = COLOR_AMBER;
      else color = COLOR_EMBER;

      // 起始從 -PI/2（正上方）開始
      const startA = -Math.PI / 2 + i * segAngle;
      const endA = startA + segAngle;

      g.moveTo(0, 0);
      g.arc(0, 0, this.radius, startA, endA);
      g.closePath();
      g.fill({ color });

      // 邊界線
      const x1 = Math.cos(startA) * this.radius;
      const y1 = Math.sin(startA) * this.radius;
      g.moveTo(0, 0).lineTo(x1, y1).stroke({ color: COLOR_INK, width: 2 });
    }

    // 外圈
    g.circle(0, 0, this.radius).stroke({ color: COLOR_INK, width: 3 });
    g.circle(0, 0, this.radius - 3).stroke({ color: COLOR_WHITE, width: 1, alpha: 0.4 });

    // 倍率文字（只在較大段且非 0 時顯示）
    if (n <= 20) {
      for (let i = 0; i < n; i += 1) {
        const m = this.multipliers[i]!;
        if (m === 0) continue;
        const midA = -Math.PI / 2 + (i + 0.5) * segAngle;
        const tx = Math.cos(midA) * this.radius * 0.7;
        const ty = Math.sin(midA) * this.radius * 0.7;
        const style = new TextStyle({
          fontFamily: 'Orbitron, Chakra Petch, sans-serif',
          fontSize: 18,
          fill: COLOR_INK,
          fontWeight: '700',
        });
        const txt = new Text({ text: `${m}×`, style });
        txt.anchor.set(0.5);
        txt.x = tx;
        txt.y = ty;
        txt.rotation = midA + Math.PI / 2;
        this.wheelContainer?.addChild(txt);
      }
    }
  }

  /**
   * 播放旋轉動畫
   * segmentIndex = 最終落在哪段（0-based, 從正上方順時針）
   * multiplier = 該段倍率
   */
  /**
   * 樂觀動畫：按下 SPIN 立刻呼叫 — 輪盤開始高速旋轉（無結果）。
   * API 回來呼叫 playSpin(...) 無縫接續到目標段減速。
   */
  startAnticipation(): void {
    if (!this.wheelContainer) return;
    // 高速持續旋轉直到 playSpin 接手
    gsap.to(this.wheelContainer, {
      rotation: `+=${Math.PI * 4}`,
      duration: 1.4,
      ease: 'none',
      repeat: -1,
    });
  }

  async playSpin(segmentIndex: number, multiplier: number): Promise<void> {
    if (!this.wheelContainer) return;
    // 清除 anticipation 的無限旋轉
    gsap.killTweensOf(this.wheelContainer);
    const n = this.multipliers.length;
    const segAngle = (Math.PI * 2) / n;

    // 讓 segmentIndex 轉到正上方（指針位置）
    // 因為 drawWheel 中 segment i 的中心在 -PI/2 + (i+0.5)*segAngle
    // 要讓該段中心對齊 -PI/2（正上方），輪盤旋轉角度 theta 使得
    // -PI/2 + (i+0.5)*segAngle + theta === -PI/2 (mod 2π)
    // => theta = -(i+0.5)*segAngle
    const targetBase = -((segmentIndex + 0.5) * segAngle);
    // 加上 4 圈（8π）旋轉
    const spins = 4 + Math.random() * 2;
    const startRot = this.wheelContainer.rotation % (Math.PI * 2);
    // 計算最終角度：確保是順時針轉
    let target = targetBase;
    // 正規化：target 在 [startRot + spins*2π - 2π, startRot + spins*2π]
    target = startRot + spins * Math.PI * 2 + (targetBase - (startRot % (Math.PI * 2)));

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          this.onLand(segmentIndex, multiplier);
          resolve();
        },
      });

      tl.to(this.wheelContainer, {
        rotation: target,
        duration: 4,
        ease: 'power3.out',
      });

      // 指針彈跳：每轉過一段就彈一下
      // 為簡化：在最後 0.8 秒每 0.15 秒彈一次
      const bounceStart = 3.0;
      for (let i = 0; i < 6; i += 1) {
        tl.to(
          this.pointerContainer?.rotation ? this.pointerContainer : {},
          {
            rotation: 0.2,
            duration: 0.05,
            ease: 'power2.out',
            yoyo: true,
            repeat: 1,
          },
          bounceStart + i * 0.15,
        );
      }
    });
  }

  private onLand(segmentIndex: number, multiplier: number): void {
    // 落點位置（世界座標）
    const n = this.multipliers.length;
    const segAngle = (Math.PI * 2) / n;
    // 落點在輪盤 -PI/2 方向（正上方），經過旋轉後仍是世界座標上方
    const landX = this.cx;
    const landY = this.cy - this.radius + 20;

    if (multiplier > 0) {
      // L4 tier-based
      let color = COLOR_TOXIC;
      if (multiplier >= 5) color = COLOR_EMBER;
      else if (multiplier >= 2) color = COLOR_AMBER;
      const tier = classifyWinTier(multiplier, true);
      const cfg = TIER_CONFIG[tier];

      this.emitShockwave(landX, landY, color, 150);
      this.emitShockwave(this.cx, this.cy, color, this.radius * 1.5, 0.1);
      this.particlePool?.emit({
        x: landX,
        y: landY,
        count: cfg.particles || 25,
        colors: [color, COLOR_WHITE, COLOR_ICE],
        speedMin: 3,
        speedMax: 10,
        angleRad: -Math.PI / 2,
        spreadRad: Math.PI,
      });
      if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
      if (this.app && cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, color, cfg.edgeGlowMs / 1000);
      if (this.app && cfg.rayBurst) emitRayBurst(this.app.stage, this.app, this.cx, this.cy, color, 1.2);
    } else {
      // 0 倍：安靜
      this.emitShockwave(landX, landY, COLOR_GRAY, 70);
    }

    // 指針輕微彈一下
    if (this.pointerContainer) {
      gsap.fromTo(
        this.pointerContainer,
        { rotation: 0.3 },
        { rotation: 0, duration: 0.6, ease: 'elastic.out(1, 0.5)' },
      );
    }

    // unused var
    void segmentIndex;
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 8, alpha: 0.85 };
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
      const speed = 3 + Math.random() * 10;
      const size = 2 + Math.random() * 4;
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
        life: 40 + Math.random() * 30,
        maxLife: 70,
        gravity: 0.15,
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
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.wheelContainer = null;
    this.wheelGraphics = null;
    this.pointerContainer = null;
    this.centerHub = null;
    this.particles = null;
    this.shockwaves = null;
    this.particleList = [];
  }
}
