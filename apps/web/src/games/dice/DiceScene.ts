import { Application, Container, Graphics, Text, TextStyle } from 'pixi.js';
import { gsap } from 'gsap';

export interface DiceSceneCallbacks {
  onReady?: () => void;
}

interface DotLayout {
  x: number;
  y: number;
}

const PIP_LAYOUTS: Record<number, DotLayout[]> = {
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

export class DiceScene {
  private app: Application | null = null;
  private dice: Container | null = null;
  private diceFace: Graphics | null = null;
  private pipContainer: Container | null = null;
  private glow: Graphics | null = null;
  private particles: Container | null = null;
  private rollLabel: Text | null = null;
  private targetLabel: Text | null = null;

  async init(canvas: HTMLCanvasElement, width: number, height: number): Promise<void> {
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

    // 背景网格点阵（terminal grid）
    const grid = new Graphics();
    const gridStep = 24;
    for (let x = 0; x < width; x += gridStep) {
      for (let y = 0; y < height; y += gridStep) {
        grid.circle(x, y, 0.8).fill({ color: 0xd4ff3a, alpha: 0.06 });
      }
    }
    app.stage.addChild(grid);

    const glow = new Graphics();
    this.glow = glow;
    app.stage.addChild(glow);

    this.particles = new Container();
    app.stage.addChild(this.particles);

    const dice = new Container();
    dice.x = width / 2;
    dice.y = height / 2;
    this.dice = dice;
    app.stage.addChild(dice);

    const diceSize = Math.min(width, height) * 0.32;
    const face = new Graphics()
      .rect(-diceSize / 2, -diceSize / 2, diceSize, diceSize)
      .fill({ color: 0xf4efe4 })
      .stroke({ color: 0xd4ff3a, width: 2 });
    // 內側边框
    face
      .rect(-diceSize / 2 + 4, -diceSize / 2 + 4, diceSize - 8, diceSize - 8)
      .stroke({ color: 0x05060a, width: 1, alpha: 0.3 });
    this.diceFace = face;
    dice.addChild(face);

    const pipContainer = new Container();
    dice.addChild(pipContainer);
    this.pipContainer = pipContainer;
    this.drawPips(3, diceSize);

    const rollStyle = new TextStyle({
      fontFamily: 'Bebas Neue, IBM Plex Mono, monospace',
      fontSize: Math.round(height * 0.18),
      fontWeight: '400',
      fill: 0xf4efe4,
      align: 'center',
      letterSpacing: 2,
    });
    const rollLabel = new Text({ text: '—', style: rollStyle });
    rollLabel.anchor.set(0.5);
    rollLabel.x = width / 2;
    rollLabel.y = height * 0.86;
    rollLabel.alpha = 0.5;
    this.rollLabel = rollLabel;
    app.stage.addChild(rollLabel);

    const targetStyle = new TextStyle({
      fontFamily: 'IBM Plex Mono, ui-monospace, monospace',
      fontSize: Math.round(height * 0.045),
      fontWeight: '500',
      fill: 0xd4ff3a,
      align: 'center',
      letterSpacing: 4,
    });
    const targetLabel = new Text({ text: '', style: targetStyle });
    targetLabel.anchor.set(0.5);
    targetLabel.x = width / 2;
    targetLabel.y = height * 0.12;
    this.targetLabel = targetLabel;
    app.stage.addChild(targetLabel);

    // 角落装饰 - terminal-style brackets
    const bracketStyle = { color: 0xd4ff3a, width: 2, alpha: 0.5 };
    const b = 20;
    const bp = 12;
    const brackets = new Graphics();
    // TL
    brackets.moveTo(bp, bp + b).lineTo(bp, bp).lineTo(bp + b, bp).stroke(bracketStyle);
    // TR
    brackets
      .moveTo(width - bp - b, bp)
      .lineTo(width - bp, bp)
      .lineTo(width - bp, bp + b)
      .stroke(bracketStyle);
    // BL
    brackets
      .moveTo(bp, height - bp - b)
      .lineTo(bp, height - bp)
      .lineTo(bp + b, height - bp)
      .stroke(bracketStyle);
    // BR
    brackets
      .moveTo(width - bp - b, height - bp)
      .lineTo(width - bp, height - bp)
      .lineTo(width - bp, height - bp - b)
      .stroke(bracketStyle);
    app.stage.addChild(brackets);

    app.ticker.add(() => {
      if (this.dice) this.dice.rotation += 0.0015;
    });
  }

  setTargetLabel(target: number, direction: 'under' | 'over'): void {
    if (!this.targetLabel) return;
    this.targetLabel.text =
      direction === 'under'
        ? `TARGET  <  ${target.toFixed(2)}`
        : `TARGET  >  ${target.toFixed(2)}`;
  }

  private drawPips(value: number, diceSize: number): void {
    if (!this.pipContainer) return;
    this.pipContainer.removeChildren();
    const layout = PIP_LAYOUTS[value] ?? PIP_LAYOUTS[1]!;
    const pipRadius = diceSize * 0.08;
    const offset = diceSize * 0.26;
    for (const pip of layout) {
      const g = new Graphics()
        .rect(pip.x * offset - pipRadius, pip.y * offset - pipRadius, pipRadius * 2, pipRadius * 2)
        .fill({ color: 0x05060a });
      this.pipContainer.addChild(g);
    }
  }

  async playRoll(roll: number, won: boolean): Promise<void> {
    if (!this.dice || !this.rollLabel || !this.diceFace || !this.glow) return;
    const dice = this.dice;
    const label = this.rollLabel;
    const glow = this.glow;

    const rollValue = roll;
    const diceSize = Math.min(this.app?.canvas.width ?? 400, this.app?.canvas.height ?? 400) * 0.32;
    const steps = 14;

    return new Promise<void>((resolve) => {
      const startScale = dice.scale.x;
      const tl = gsap.timeline({
        onComplete: () => {
          resolve();
        },
      });
      tl.to(dice.scale, { x: startScale * 1.15, y: startScale * 1.15, duration: 0.18, ease: 'power2.out' })
        .to(dice, { rotation: dice.rotation + Math.PI * 3, duration: 0.9, ease: 'power1.inOut' }, 0)
        .to(dice.scale, { x: startScale, y: startScale, duration: 0.2, ease: 'power1.in' });

      let tick = 0;
      const shuffler = this.app?.ticker.add(() => {
        if (tick % 3 === 0) {
          const face = Math.floor(Math.random() * 6) + 1;
          this.drawPips(face, diceSize);
        }
        tick += 1;
        if (tick > steps * 3) this.app?.ticker.remove(shuffler as never);
      });

      gsap.to(label, {
        alpha: 0,
        duration: 0.2,
        onComplete: () => {
          label.text = rollValue.toFixed(2);
          const finalFace = Math.max(1, Math.min(6, Math.round(rollValue / (100 / 6)) || 1));
          this.drawPips(finalFace, diceSize);
          gsap.to(label, { alpha: 1, duration: 0.25, ease: 'power2.out' });
        },
        delay: 1.0,
      });

      const color = won ? 0xd4ff3a : 0xff4e50;
      gsap.to(glow, {
        alpha: 0.9,
        duration: 0.3,
        delay: 1.0,
        onStart: () => {
          glow
            .clear()
            .circle(dice.x, dice.y, diceSize * 0.9)
            .fill({ color, alpha: 0.3 });
        },
      });
      gsap.to(glow, { alpha: 0, duration: 0.8, delay: 1.5 });

      if (won) this.emitParticles(color);
    });
  }

  private emitParticles(color: number): void {
    if (!this.particles || !this.app) return;
    const centerX = (this.app.canvas.width ?? 400) / 2;
    const centerY = (this.app.canvas.height ?? 400) / 2;
    for (let i = 0; i < 28; i += 1) {
      const particle = new Graphics().circle(0, 0, 3 + Math.random() * 3).fill({ color });
      particle.x = centerX;
      particle.y = centerY;
      this.particles.addChild(particle);

      const angle = Math.random() * Math.PI * 2;
      const distance = 100 + Math.random() * 80;
      gsap.to(particle, {
        x: centerX + Math.cos(angle) * distance,
        y: centerY + Math.sin(angle) * distance,
        alpha: 0,
        duration: 0.8 + Math.random() * 0.4,
        ease: 'power2.out',
        onComplete: () => {
          particle.destroy();
        },
      });
    }
  }

  resetIdle(): void {
    if (!this.rollLabel) return;
    this.rollLabel.text = '—';
    this.rollLabel.alpha = 0.7;
  }

  dispose(): void {
    this.app?.destroy(true, { children: true });
    this.app = null;
    this.dice = null;
    this.diceFace = null;
    this.pipContainer = null;
    this.glow = null;
    this.particles = null;
    this.rollLabel = null;
    this.targetLabel = null;
  }
}
