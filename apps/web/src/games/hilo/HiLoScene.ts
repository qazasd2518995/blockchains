import {
  Application,
  Assets,
  Container,
  Graphics,
  Sprite,
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
const COLOR_INK = 0x0A0806;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x86B49C;

const CARD_FILE_RANKS = ['ace', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'jack', 'queen', 'king'] as const;
const CARD_FILE_SUITS = ['spades', 'hearts', 'diamonds', 'clubs'] as const;

export interface HiLoCard {
  rank: number;
  suit: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
}

export class HiLoScene {
  private app: Application | null = null;
  private width = 0;
  private height = 0;

  private cardContainer: Container | null = null;
  private mainCard: Container | null = null;
  private mainFace: Container | null = null;
  private mainBack: Graphics | null = null;
  private historyLayer: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;

  private currentCard: HiLoCard | null = null;
  private cardW = 0;
  private cardH = 0;

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

    // 牌大小
    this.cardW = Math.min(width * 0.22, 160);
    this.cardH = this.cardW * 1.5;

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

    await this.preloadCardAssets();

    this.createBackground();

    // History cards 層（舊牌左側排列）
    this.historyLayer = new Container();
    app.stage.addChild(this.historyLayer);

    // Main card 層
    this.cardContainer = new Container();
    app.stage.addChild(this.cardContainer);

    // 粒子 + shockwave
    this.particles = new Container();
    app.stage.addChild(this.particles);
    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    this.particlePool = new ParticlePool(app.stage, 180);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.startTickers();

    if (this.currentCard) {
      this.setCurrentCard(this.currentCard);
    }
  }

  private async preloadCardAssets(): Promise<void> {
    const urls = CARD_FILE_RANKS.flatMap((rank) =>
      CARD_FILE_SUITS.map((suit) => `/cards/${rank}_of_${suit}.svg`),
    );

    await Promise.all(urls.map((url) => Assets.load(url).catch(() => null)));
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });
    this.app.stage.addChild(bg);

    const glow = new Graphics()
      .circle(this.width / 2, this.height / 2, this.width * 0.4)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow.filters = [new BlurFilter({ strength: 50 })];
    this.app.stage.addChild(glow);

    // 點陣網格
    const grid = new Graphics();
    for (let x = 0; x < this.width; x += 28) {
      for (let y = 0; y < this.height; y += 28) {
        grid.circle(x, y, 0.8).fill({ color: COLOR_ACID, alpha: 0.08 });
      }
    }
    this.app.stage.addChild(grid);
  }

  private startTickers(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      if (this.mainCard) {
        this.mainCard.y = this.height / 2 + Math.sin(tick * 0.03) * 6;
        this.mainCard.rotation = Math.sin(tick * 0.02) * 0.02;
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

  private getCardAssetPath(card: HiLoCard): string | null {
    const rank = CARD_FILE_RANKS[card.rank - 1];
    const suit = CARD_FILE_SUITS[card.suit];
    if (!rank || !suit) return null;
    return `/cards/${rank}_of_${suit}.svg`;
  }

  private drawCardFaceFallback(container: Container, card: HiLoCard, w: number, h: number): void {
    container.removeChildren();

    // 陰影
    const shadow = new Graphics()
      .roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 14)
      .fill({ color: COLOR_INK, alpha: 0.18 });
    container.addChild(shadow);

    // 牌面
    const face = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 14)
      .fill({ color: 0xffffff })
      .stroke({ color: COLOR_INK, width: 2 });
    container.addChild(face);
  }

  /**
   * 畫一張牌（正面）
   */
  private drawCardFace(container: Container, card: HiLoCard, w: number, h: number): void {
    container.removeChildren();

    const shadow = new Graphics()
      .roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 14)
      .fill({ color: COLOR_INK, alpha: 0.18 });
    container.addChild(shadow);

    const cardPath = this.getCardAssetPath(card);
    if (!cardPath) {
      this.drawCardFaceFallback(container, card, w, h);
      return;
    }

    const sprite = Sprite.from(cardPath);
    sprite.anchor.set(0.5);
    sprite.width = w;
    sprite.height = h;
    container.addChild(sprite);

    const frame = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 14)
      .stroke({ color: COLOR_INK, width: 1.5, alpha: 0.22 });
    container.addChild(frame);
  }

  /**
   * 畫牌背面（紫色花紋）
   */
  private drawCardBack(face: Graphics, w: number, h: number): void {
    face
      .clear()
      .roundRect(-w / 2 + 3, -h / 2 + 6, w, h, 14)
      .fill({ color: COLOR_INK, alpha: 0.18 })
      .roundRect(-w / 2, -h / 2, w, h, 14)
      .fill({ color: COLOR_ACID })
      .stroke({ color: COLOR_INK, width: 2 });

    // 紋樣：內框 + 對角斜紋
    face
      .roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h - 12, 10)
      .stroke({ color: COLOR_VIOLET, width: 1, alpha: 0.6 });

    // 中心菱形
    face
      .poly([0, -h * 0.25, w * 0.2, 0, 0, h * 0.25, -w * 0.2, 0])
      .fill({ color: COLOR_VIOLET, alpha: 0.5 })
      .stroke({ color: COLOR_ICE, width: 1.5, alpha: 0.6 });

    // 斜紋
    for (let i = -5; i < 5; i += 1) {
      const y = i * 12;
      face
        .moveTo(-w / 2 + 10, y)
        .lineTo(w / 2 - 10, y + 30)
        .stroke({ color: COLOR_VIOLET, width: 1, alpha: 0.2 });
    }
  }

  /**
   * 設定目前主牌（無動畫，初始用）
   */
  setCurrentCard(card: HiLoCard): void {
    this.currentCard = card;
    if (!this.cardContainer) return;
    // 清除主牌
    if (this.mainCard) {
      this.cardContainer.removeChild(this.mainCard);
      this.mainCard.destroy({ children: true });
    }

    const card_ = new Container();
    card_.x = this.width / 2;
    card_.y = this.height / 2;
    this.mainCard = card_;
    this.cardContainer.addChild(card_);

    const face = new Container();
    this.drawCardFace(face, card, this.cardW, this.cardH);
    this.mainFace = face;
    card_.addChild(face);

    // 背面（初始 alpha 0）
    const back = new Graphics();
    this.drawCardBack(back, this.cardW, this.cardH);
    back.alpha = 0;
    this.mainBack = back;
    card_.addChild(back);
  }

  /**
   * 播發下一張牌的動畫 — 當前牌飛到左邊 history，然後新牌從右飛入 + 翻面
   */
  async playDraw(newCard: HiLoCard, correct: boolean | null): Promise<void> {
    if (!this.cardContainer || !this.mainCard) {
      this.setCurrentCard(newCard);
      return;
    }
    const oldCard = this.mainCard;
    const oldRef = this.currentCard;

    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          resolve();
        },
      });

      // 1. 當前牌縮小向左飛走
      const targetX = 60 + (this.historyLayer?.children.length ?? 0) * 22;
      const targetY = this.height - 60;
      tl.to(oldCard, {
        x: targetX,
        y: targetY,
        duration: 0.5,
        ease: 'power2.inOut',
      });
      tl.to(
        oldCard.scale,
        { x: 0.35, y: 0.35, duration: 0.5, ease: 'power2.inOut' },
        '<',
      );
      tl.to(
        oldCard,
        { rotation: (Math.random() - 0.5) * 0.4, duration: 0.5 },
        '<',
      );

      // 將 oldCard 移到 history 層
      tl.call(() => {
        if (oldCard && this.historyLayer && this.cardContainer) {
          this.cardContainer.removeChild(oldCard);
          this.historyLayer.addChild(oldCard);
          oldCard.alpha = 0.6;
        }
      });

      // 2. 新牌從右邊飛入（背面朝上）
      tl.call(() => {
        if (!this.cardContainer) return;
        const newC = new Container();
        newC.x = this.width + this.cardW;
        newC.y = this.height / 2;
        this.mainCard = newC;
        this.cardContainer.addChild(newC);

        const face = new Container();
        this.drawCardFace(face, newCard, this.cardW, this.cardH);
        face.scale.x = 0; // 背對
        this.mainFace = face;
        newC.addChild(face);

        const back = new Graphics();
        this.drawCardBack(back, this.cardW, this.cardH);
        this.mainBack = back;
        newC.addChild(back);
      });

      // 3. 飛入 + 微旋轉
      tl.to({}, { duration: 0.01 }); // spacer
      tl.call(() => {
        const newC = this.mainCard;
        if (!newC) return;
        gsap.to(newC, {
          x: this.width / 2,
          duration: 0.55,
          ease: 'back.out(1.4)',
        });
        gsap.fromTo(
          newC,
          { rotation: 0.2 },
          { rotation: 0, duration: 0.55, ease: 'back.out(1.4)' },
        );
      });

      // 4. 翻牌（在飛入期間）
      tl.to({}, { duration: 0.3 });
      tl.call(() => {
        const face = this.mainFace;
        const back = this.mainBack;
        if (!face || !back) return;
        // 背到正翻轉：back 0→0 (收)，face 0→1 (展)
        gsap.to(back.scale, { x: 0, duration: 0.18, ease: 'power2.in' });
        gsap.to(back, { alpha: 0, duration: 0.18 });
        gsap.to(face.scale, {
          x: 1,
          duration: 0.28,
          ease: 'back.out(1.8)',
          delay: 0.15,
        });
      });

      // 5. 結果特效
      tl.to({}, { duration: 0.6 });
      tl.call(() => {
        this.currentCard = newCard;
        const cx = this.width / 2;
        const cy = this.height / 2;
        if (correct === true) {
          this.emitShockwave(cx, cy, COLOR_TOXIC, this.cardW * 2);
          // L4 pool：勝利向上扇形噴
          this.particlePool?.emit({
            x: cx,
            y: cy,
            count: 40,
            colors: [COLOR_TOXIC, COLOR_ICE, 0xffffff],
            speedMin: 3,
            speedMax: 9,
            angleRad: -Math.PI / 2,
            spreadRad: Math.PI,
          });
          if (this.app && !prefersReducedMotion()) {
            emitGlowBurst(this.app.stage, cx, cy, COLOR_TOXIC, {
              radius: this.cardW * 1.1,
              peakBlur: 18,
              durationSec: 0.55,
            });
          }
        } else if (correct === false) {
          this.emitShockwave(cx, cy, COLOR_EMBER, this.cardW * 2);
          // L4 輸家刻意安靜：少量、慢、不 shake；但加一個短紅邊緣 glow 提示局結束
          this.particlePool?.emit({
            x: cx,
            y: cy,
            count: 14,
            colors: [COLOR_EMBER, COLOR_ACID],
            speedMin: 2,
            speedMax: 4,
            lifeMin: 25,
            lifeMax: 40,
          });
          if (this.app && !prefersReducedMotion()) {
            emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_EMBER, 0.32);
          }
        }
        // 牌微脈動
        if (this.mainCard) {
          gsap.fromTo(
            this.mainCard.scale,
            { x: 1.08, y: 1.08 },
            { x: 1, y: 1, duration: 0.4, ease: 'elastic.out(1, 0.5)' },
          );
        }
      });

      tl.to({}, { duration: 0.3 });

      // suppress unused
      void oldRef;
    });
  }

  private emitShockwave(x: number, y: number, color: number, maxR: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 10, alpha: 0.85 };
    gsap.to(state, {
      r: maxR,
      alpha: 0,
      duration: 0.8,
      delay,
      ease: 'power2.out',
      onUpdate: () => {
        ring.clear().circle(x, y, state.r).stroke({ color, width: 4, alpha: state.alpha });
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

  reset(): void {
    if (this.historyLayer) {
      this.historyLayer.removeChildren();
    }
  }

  /** L4：cashout 依 multiplier tier 慶祝 */
  celebrateCashout(multiplier: number): void {
    if (!this.app) return;
    const tier = classifyWinTier(multiplier, true);
    const cfg = TIER_CONFIG[tier];
    const cx = this.width / 2;
    const cy = this.height / 2;
    if (cfg.particles > 0) {
      this.particlePool?.emit({
        x: cx,
        y: cy,
        count: cfg.particles,
        colors: [COLOR_TOXIC, COLOR_ICE, 0xffffff],
        speedMin: 3,
        speedMax: 11,
      });
    }
    if (cfg.shakeAmp > 0) this.shaker?.shake(cfg.shakeAmp, cfg.shakeDuration);
    if (cfg.edgeGlowMs > 0) emitEdgeGlow(this.app.stage, this.width, this.height, COLOR_TOXIC, cfg.edgeGlowMs / 1000);
    if (cfg.rayBurst) emitRayBurst(this.app.stage, this.app, cx, cy, COLOR_TOXIC, 1.2);
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
    this.cardContainer = null;
    this.mainCard = null;
    this.mainFace = null;
    this.mainBack = null;
    this.historyLayer = null;
    this.particles = null;
    this.shockwaves = null;
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
