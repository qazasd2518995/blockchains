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
const COLOR_FACE = 0xffffff;
const COLOR_FACE_STROKE = 0x0A0806;
const COLOR_PIP = 0x0A0806;
const COLOR_ACID = 0xC9A24C;
const COLOR_VIOLET = 0xE0BF6E;
const COLOR_EMBER = 0x8B1A2A;
const COLOR_TOXIC = 0x1E7A4F;
const COLOR_ICE = 0x86B49C;

interface PipPos {
  x: number;
  y: number;
}

const PIP_LAYOUTS: Record<number, PipPos[]> = {
  1: [{ x: 0, y: 0 }],
  2: [
    { x: -1, y: -1 },
    { x: 1, y: 1 },
  ],
  3: [
    { x: -1, y: -1 },
    { x: 0, y: 0 },
    { x: 1, y: 1 },
  ],
  4: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ],
  5: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: 0, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ],
  6: [
    { x: -1, y: -1 },
    { x: 1, y: -1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: -1, y: 1 },
    { x: 1, y: 1 },
  ],
};

interface Star {
  g: Graphics;
  baseY: number;
  speed: number;
}

interface Particle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
}

export class DiceScene {
  private app: Application | null = null;
  private dice: Container | null = null;
  private diceFace: Graphics | null = null;
  private pipContainer: Container | null = null;
  private diceGlow: Graphics | null = null;
  private rollLabel: Text | null = null;
  private targetLabel: Text | null = null;
  private starfield: Container | null = null;
  private particles: Container | null = null;
  private shockwaves: Container | null = null;

  private stars: Star[] = [];
  private particleList: Particle[] = [];
  private diceSize = 0;
  private width = 0;
  private height = 0;

  private ambientTicker: ((tk: Ticker) => void) | null = null;
  private particleTicker: ((tk: Ticker) => void) | null = null;
  private shuffleTicker: ((tk: Ticker) => void) | null = null;
  private diceAmbientActive = true;

  // L4
  private particlePool: ParticlePool | null = null;
  private shaker: ShakeController | null = null;
  private poolTicker: ((tk: Ticker) => void) | null = null;
  private winFx: WinCelebration | null = null;


  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
    this.width = width;
    this.height = height;
    // 骰子大小：以較短邊為基準，但畫布扁時不會過小
    this.diceSize = Math.min(height * 0.7, width * 0.22);

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
    this.starfield = new Container();
    app.stage.addChild(this.starfield);
    this.createStars();
    this.createCornerBrackets();

    this.particles = new Container();
    app.stage.addChild(this.particles);

    this.shockwaves = new Container();
    app.stage.addChild(this.shockwaves);

    // L4: ParticlePool (預分配 200 個 sprite)
    this.particlePool = new ParticlePool(app.stage, 200);
    this.shaker = new ShakeController(app.stage, app);
    this.poolTicker = (tk) => this.particlePool?.update(tk);
    app.ticker.add(this.poolTicker);

    prewarmShaders(app);

    this.diceGlow = new Graphics();
    app.stage.addChild(this.diceGlow);

    this.createDice();
    this.createTargetLabel();
    this.createRollLabel();

    this.startAmbient();
  }

  private createBackground(): void {
    if (!this.app) return;
    const bg = new Graphics().rect(0, 0, this.width, this.height).fill({ color: COLOR_BG, alpha: 0.5 });

    const glowR1 = Math.min(this.width * 0.4, this.height * 0.9);
    const glowR2 = Math.min(this.width * 0.35, this.height * 0.8);
    const glow1 = new Graphics()
      .circle(this.width * 0.2, this.height * 0.1, glowR1)
      .fill({ color: COLOR_ACID, alpha: 0.08 });
    glow1.filters = [new BlurFilter({ strength: 40 })];

    const glow2 = new Graphics()
      .circle(this.width * 0.8, this.height * 0.9, glowR2)
      .fill({ color: COLOR_EMBER, alpha: 0.06 });
    glow2.filters = [new BlurFilter({ strength: 40 })];

    this.app.stage.addChild(bg);
    this.app.stage.addChild(glow1);
    this.app.stage.addChild(glow2);

    const grid = new Graphics();
    const step = 32;
    for (let x = 0; x < this.width; x += step) {
      for (let y = 0; y < this.height; y += step) {
        grid.circle(x, y, 1).fill({ color: COLOR_ACID, alpha: 0.1 });
      }
    }
    this.app.stage.addChild(grid);
  }

  private createStars(): void {
    if (!this.starfield) return;
    for (let i = 0; i < 36; i += 1) {
      const size = 0.8 + Math.random() * 1.8;
      const x = Math.random() * this.width;
      const y = Math.random() * this.height;
      const color = i % 3 === 0 ? COLOR_ACID : i % 3 === 1 ? COLOR_VIOLET : COLOR_ICE;
      const g = new Graphics().circle(0, 0, size).fill({ color, alpha: 0.4 + Math.random() * 0.4 });
      g.x = x;
      g.y = y;
      this.starfield.addChild(g);
      this.stars.push({ g, baseY: y, speed: 0.2 + Math.random() * 0.5 });
    }
  }

  private createCornerBrackets(): void {
    if (!this.app) return;
    const padding = 16;
    const length = 24;
    const brackets = new Graphics();
    brackets
      .moveTo(padding, padding + length)
      .lineTo(padding, padding)
      .lineTo(padding + length, padding)
      .stroke({ color: COLOR_ACID, width: 2, alpha: 0.4 });
    brackets
      .moveTo(this.width - padding - length, padding)
      .lineTo(this.width - padding, padding)
      .lineTo(this.width - padding, padding + length)
      .stroke({ color: COLOR_ACID, width: 2, alpha: 0.4 });
    brackets
      .moveTo(padding, this.height - padding - length)
      .lineTo(padding, this.height - padding)
      .lineTo(padding + length, this.height - padding)
      .stroke({ color: COLOR_ACID, width: 2, alpha: 0.4 });
    brackets
      .moveTo(this.width - padding - length, this.height - padding)
      .lineTo(this.width - padding, this.height - padding)
      .lineTo(this.width - padding, this.height - padding - length)
      .stroke({ color: COLOR_ACID, width: 2, alpha: 0.4 });
    this.app.stage.addChild(brackets);
  }

  private createDice(): void {
    if (!this.app) return;
    const dice = new Container();
    dice.x = this.width / 2;
    dice.y = this.height / 2;
    this.dice = dice;

    const face = new Graphics();
    this.drawFace(face, COLOR_ACID);
    this.diceFace = face;
    dice.addChild(face);

    const pipContainer = new Container();
    this.pipContainer = pipContainer;
    dice.addChild(pipContainer);
    this.drawPips(3);

    this.app.stage.addChild(dice);
  }

  private drawFace(face: Graphics, strokeColor: number): void {
    const size = this.diceSize;
    face
      .clear()
      .roundRect(-size / 2 + 4, -size / 2 + 6, size, size, 16)
      .fill({ color: COLOR_FACE_STROKE, alpha: 0.15 })
      .roundRect(-size / 2, -size / 2, size, size, 16)
      .fill({ color: COLOR_FACE })
      .stroke({ color: strokeColor, width: 2.5 })
      .roundRect(-size / 2 + 4, -size / 2 + 4, size - 8, size - 8, 12)
      .stroke({ color: strokeColor, width: 1, alpha: 0.35 });
  }

  private drawPips(value: number): void {
    if (!this.pipContainer) return;
    this.pipContainer.removeChildren();
    const layout = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1]!;
    const pipRadius = this.diceSize * 0.07;
    const offset = this.diceSize * 0.26;

    for (const pip of layout) {
      const shadow = new Graphics()
        .circle(pip.x * offset, pip.y * offset + 2, pipRadius)
        .fill({ color: COLOR_FACE_STROKE, alpha: 0.15 });
      this.pipContainer.addChild(shadow);

      const dot = new Graphics()
        .circle(pip.x * offset, pip.y * offset, pipRadius)
        .fill({ color: COLOR_PIP });
      this.pipContainer.addChild(dot);

      const hl = new Graphics()
        .circle(pip.x * offset - pipRadius * 0.3, pip.y * offset - pipRadius * 0.3, pipRadius * 0.25)
        .fill({ color: COLOR_FACE, alpha: 0.5 });
      this.pipContainer.addChild(hl);
    }
  }

  private createTargetLabel(): void {
    if (!this.app) return;
    const style = new TextStyle({
      fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
      fontSize: Math.round(this.height * 0.045),
      fontWeight: '600',
      fill: COLOR_ACID,
      align: 'center',
      letterSpacing: 4,
    });
    const label = new Text({ text: '', style });
    label.anchor.set(0.5);
    label.x = this.width / 2;
    label.y = this.height * 0.14;
    this.targetLabel = label;
    this.app.stage.addChild(label);
  }

  private createRollLabel(): void {
    if (!this.app) return;
    const style = new TextStyle({
      fontFamily: 'Bodoni Moda, Didot, serif',
      fontSize: Math.round(this.height * 0.22),
      fontWeight: '400',
      fill: COLOR_FACE_STROKE,
      align: 'center',
      letterSpacing: 4,
    });
    const label = new Text({ text: '—', style });
    label.anchor.set(0.5);
    label.x = this.width / 2;
    label.y = this.height * 0.85;
    label.alpha = 0.15;
    this.rollLabel = label;
    this.app.stage.addChild(label);
  }

  private startAmbient(): void {
    if (!this.app) return;
    let tick = 0;
    this.ambientTicker = (tk: Ticker) => {
      tick += tk.deltaTime;
      if (this.dice && this.diceAmbientActive) {
        this.dice.y = this.height / 2 + Math.sin(tick * 0.02) * 6;
        this.dice.rotation += 0.001;
      }
      for (const star of this.stars) {
        star.g.x -= star.speed * tk.deltaTime * 0.3;
        if (star.g.x < -5) star.g.x = this.width + 5;
        star.g.alpha = 0.4 + Math.sin(tick * 0.03 + star.baseY) * 0.3;
      }
    };
    this.app.ticker.add(this.ambientTicker);

    this.particleTicker = (tk: Ticker) => {
      for (let i = this.particleList.length - 1; i >= 0; i -= 1) {
        const p = this.particleList[i]!;
        p.g.x += p.vx * tk.deltaTime;
        p.g.y += p.vy * tk.deltaTime;
        p.vy += 0.15 * tk.deltaTime;
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

  setTargetLabel(target: number, direction: 'under' | 'over'): void {
    if (!this.targetLabel) return;
    this.targetLabel.text =
      direction === 'under'
        ? `◂ TARGET  ${target.toFixed(2)}`
        : `${target.toFixed(2)}  TARGET ▸`;
  }

  /**
   * 樂觀動畫：按下按鈕立刻呼叫，API 仍在飛時先播「旋轉+ shuffle」過場。
   * API 回來時呼叫 playRoll(...) 無縫接續結果。
   */
  startAnticipation(): void {
    if (!this.dice) return;
    const dice = this.dice;
    // 暫停 ambient 避免與 GSAP 競爭改 rotation / y
    this.diceAmbientActive = false;
    dice.y = this.height / 2;
    // scale punch 進入
    gsap.to(dice.scale, { x: 0.88, y: 0.88, duration: 0.12, ease: EASE.in });
    // anticipation: 在骰子腳下打一道金色光暈呼吸（增加抽起來的儀式感）
    if (this.diceGlow) {
      const glow = this.diceGlow;
      glow.clear()
        .circle(dice.x, dice.y + this.diceSize * 0.4, this.diceSize * 0.7)
        .fill({ color: COLOR_ACID, alpha: 0.32 });
      glow.filters = [new BlurFilter({ strength: 18 })];
      gsap.killTweensOf(glow);
      gsap.fromTo(
        glow,
        { alpha: 0 },
        { alpha: 0.85, duration: 0.4, ease: EASE.out },
      );
    }
    // 持續緩慢旋轉直到 playRoll 接手
    gsap.to(dice, {
      rotation: `+=${Math.PI * 2}`,
      duration: 1.2,
      ease: 'none',
      repeat: -1,
    });
    // shuffle pips
    if (!this.shuffleTicker && this.app) {
      let shuffleTick = 0;
      this.shuffleTicker = (tk: Ticker) => {
        shuffleTick += tk.deltaTime;
        if (shuffleTick > 3) {
          shuffleTick = 0;
          this.drawPips(Math.floor(Math.random() * 6) + 1);
        }
      };
      this.app.ticker.add(this.shuffleTicker);
    }
  }

  async playRoll(roll: number, won: boolean, multiplier = 0): Promise<void> {
    if (!this.dice || !this.rollLabel || !this.diceFace) return;
    const dice = this.dice;
    const label = this.rollLabel;

    // 清掉 anticipation 的無限旋轉（若有）+ 暫停 ambient
    this.diceAmbientActive = false;
    dice.y = this.height / 2;
    gsap.killTweensOf(dice);
    gsap.killTweensOf(dice.scale);

    const winColor = won ? COLOR_TOXIC : COLOR_EMBER;
    const tier = classifyWinTier(multiplier, won);
    const tierCfg = TIER_CONFIG[tier];
    return new Promise<void>((resolve) => {
      const tl = gsap.timeline({
        onComplete: () => {
          // 恢復 ambient（呼吸/微旋）
          this.diceAmbientActive = true;
          resolve();
        },
      });

      tl.to(dice.scale, { x: 0.88, y: 0.88, duration: 0.12, ease: EASE.in });
      tl.to(
        dice,
        { rotation: dice.rotation + Math.PI * 4, duration: 1.3, ease: EASE.expoOut },
        0.12,
      );
      tl.to(dice.scale, { x: 1.25, y: 1.25, duration: 0.6, ease: EASE.backSoft }, 0.12);
      tl.to(dice.scale, { x: 1, y: 1, duration: 0.5, ease: EASE.out }, 0.72);

      // Shuffle pips（anticipation 若已在跑則會延續；否則此處啟動）
      if (!this.shuffleTicker && this.app) {
        let shuffleTick = 0;
        this.shuffleTicker = (tk: Ticker) => {
          shuffleTick += tk.deltaTime;
          if (shuffleTick > 3) {
            shuffleTick = 0;
            this.drawPips(Math.floor(Math.random() * 6) + 1);
          }
        };
        this.app.ticker.add(this.shuffleTicker);
      }
      gsap.delayedCall(1.2, () => {
        if (this.shuffleTicker && this.app) {
          this.app.ticker.remove(this.shuffleTicker);
          this.shuffleTicker = null;
        }
        const finalFace = Math.max(1, Math.min(6, Math.floor(roll / (100 / 6)) + 1));
        this.drawPips(finalFace);
      });

      // Roll label 計數動畫
      gsap.delayedCall(1.2, () => {
        const rollObj = { v: 0 };
        gsap.to(rollObj, {
          v: roll,
          duration: 0.8,
          ease: 'power3.out',
          onUpdate: () => {
            label.text = rollObj.v.toFixed(2);
            label.alpha = 0.5 + (rollObj.v / Math.max(0.01, roll)) * 0.5;
          },
          onComplete: () => {
            label.text = roll.toFixed(2);
            label.alpha = 1;
            gsap.fromTo(
              label.scale,
              { x: 1.4, y: 1.4 },
              { x: 1, y: 1, duration: 0.6, ease: 'elastic.out(1, 0.4)' },
            );
          },
        });
      });

      // 結算特效
      gsap.delayedCall(1.4, () => {
        if (this.diceFace) this.drawFace(this.diceFace, winColor);

        // 地面光暈
        if (this.diceGlow) {
          const glow = this.diceGlow;
          glow.clear().circle(dice.x, dice.y, this.diceSize * 0.8).fill({ color: winColor, alpha: 0.4 });
          glow.filters = [new BlurFilter({ strength: 30 })];
          gsap.fromTo(
            glow,
            { alpha: 0 },
            {
              alpha: 1,
              duration: 0.25,
              ease: 'power3.out',
              onComplete: () => {
                gsap.to(glow, { alpha: 0, duration: 1.5, ease: 'power2.inOut' });
              },
            },
          );
        }

        // 震波（贏時雙層、輸時單層弱）
        this.emitShockwave(dice.x, dice.y, winColor, this.diceSize * 1.2);
        if (won) this.emitShockwave(dice.x, dice.y, winColor, this.diceSize * 1.8, 0.15);

        if (won) {
          // 粒子用 pool
          this.particlePool?.emit({
            x: dice.x,
            y: dice.y,
            count: tierCfg.particles,
            colors: [COLOR_TOXIC, COLOR_ICE, COLOR_ACID],
            speedMin: 3,
            speedMax: 10,
          });
          // Tier 分級 shake（倍率 <10x 不 shake，避免影響 count-up 讀數）
          if (tierCfg.shakeAmp > 0 && this.shaker) {
            gsap.delayedCall(0.3, () => this.shaker?.shake(tierCfg.shakeAmp, tierCfg.shakeDuration));
          }
          // 邊緣 glow
          if (this.app && tierCfg.edgeGlowMs > 0) {
            emitEdgeGlow(this.app.stage, this.width, this.height, winColor, tierCfg.edgeGlowMs / 1000);
          }
          // 大獎 ray burst
          if (this.app && tierCfg.rayBurst) {
            emitRayBurst(this.app.stage, this.app, dice.x, dice.y, winColor, 1.2);
          }
        } else {
          // 輸家刻意安靜：不 shake、不大範圍粒子
          this.particlePool?.emit({
            x: dice.x,
            y: dice.y,
            count: 14,
            colors: [COLOR_EMBER, COLOR_FACE_STROKE],
            speedMin: 2,
            speedMax: 4,
            lifeMin: 30,
            lifeMax: 45,
          });
        }

        gsap.delayedCall(2.5, () => {
          if (this.diceFace) this.drawFace(this.diceFace, COLOR_ACID);
        });
      });
    });
  }

  private emitShockwave(x: number, y: number, color: number, maxRadius: number, delay = 0): void {
    if (!this.shockwaves) return;
    const ring = new Graphics();
    this.shockwaves.addChild(ring);
    const state = { r: 10, alpha: 0.9 };
    gsap.to(state, {
      r: maxRadius,
      alpha: 0,
      duration: 0.9,
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
      const speed = 4 + Math.random() * 12;
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
        vy: Math.sin(angle) * speed - 2,
        life: 40 + Math.random() * 40,
        maxLife: 80,
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

  resetIdle(): void {
    if (!this.rollLabel) return;
    this.rollLabel.text = '—';
    this.rollLabel.alpha = 0.15;
  }

  dispose(): void {
    if (this.ambientTicker && this.app) this.app.ticker.remove(this.ambientTicker);
    if (this.particleTicker && this.app) this.app.ticker.remove(this.particleTicker);
    if (this.shuffleTicker && this.app) this.app.ticker.remove(this.shuffleTicker);
    if (this.poolTicker && this.app) this.app.ticker.remove(this.poolTicker);
    this.shaker?.dispose();
    this.shaker = null;
    this.particlePool?.dispose();
    this.particlePool = null;
    this.winFx?.dispose();
    this.winFx = null;
    this.app?.destroy(true, { children: true, texture: false });
    this.app = null;
    this.dice = null;
    this.diceFace = null;
    this.pipContainer = null;
    this.diceGlow = null;
    this.rollLabel = null;
    this.targetLabel = null;
    this.starfield = null;
    this.particles = null;
    this.shockwaves = null;
    this.stars = [];
    this.particleList = [];
  }

  /** L4 共用大獎慶典 — GamePage 在拿到 result 後呼叫一次 */
  playWinFx(multiplier: number, won: boolean): void {
    this.winFx?.celebrate(multiplier, won);
  }
}
