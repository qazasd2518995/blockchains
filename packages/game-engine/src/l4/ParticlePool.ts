import { Container, Graphics, type Ticker } from 'pixi.js';

interface PooledParticle {
  g: Graphics;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  gravity: number;
  rot: number;
  rotSpeed: number;
  scale: number;
  scaleFrom: number;
  scaleTo: number;
  alphaFrom: number;
  alphaTo: number;
  drag: number;
  drift: number;
  phase: number;
  spark: boolean;
  twinkle: number;
  stretch: number;
  active: boolean;
}

export interface EmitOptions {
  x: number;
  y: number;
  count: number;
  colors: number[];
  speedMin?: number;
  speedMax?: number;
  sizeMin?: number;
  sizeMax?: number;
  lifeMin?: number;
  lifeMax?: number;
  gravity?: number;
  spreadRad?: number;  // 發散弧度，預設 2π（全方向）
  angleRad?: number;   // 中心角度（配合 spreadRad < 2π）
  shape?: 'square' | 'circle' | 'mixed';
}

/**
 * L4 粒子池：預分配 N 個 Graphics 循環使用，避免熱路徑 new。
 * Stake/Roobet 等平台技術：同屏 < 300 粒子以保 60fps。
 */
export class ParticlePool {
  private readonly pool: PooledParticle[] = [];
  private readonly container: Container;
  private readonly capacity: number;

  constructor(parent: Container, capacity = 200) {
    this.capacity = capacity;
    this.container = new Container();
    parent.addChild(this.container);
    for (let i = 0; i < capacity; i += 1) {
      const g = new Graphics();
      g.visible = false;
      this.container.addChild(g);
      this.pool.push({
        g,
        vx: 0,
        vy: 0,
        life: 0,
        maxLife: 0,
        gravity: 0,
        rot: 0,
        rotSpeed: 0,
        scale: 1,
        scaleFrom: 1,
        scaleTo: 0.1,
        alphaFrom: 1,
        alphaTo: 0,
        drag: 0.98,
        drift: 0,
        phase: 0,
        spark: false,
        twinkle: 0,
        stretch: 0,
        active: false,
      });
    }
  }

  emit(opts: EmitOptions): void {
    const {
      x,
      y,
      count,
      colors,
      speedMin = 2,
      speedMax = 9,
      sizeMin = 2,
      sizeMax = 6,
      lifeMin = 44,
      lifeMax = 84,
      gravity = 0.14,
      spreadRad = Math.PI * 2,
      angleRad = -Math.PI / 2,
      shape = 'mixed',
    } = opts;
    let emitted = 0;
    for (const p of this.pool) {
      if (emitted >= count) break;
      if (p.active) continue;
      const spread = (Math.random() - 0.5) * spreadRad;
      const angle = angleRad + spread;
      const speed = speedMin + Math.random() * (speedMax - speedMin);
      const size = sizeMin + Math.random() * (sizeMax - sizeMin);
      const color = colors[Math.floor(Math.random() * colors.length)]!;
      p.g.clear();
      const drawCircle = shape === 'circle' || (shape === 'mixed' && Math.random() > 0.58);
      const drawSpark = shape === 'mixed' && Math.random() > 0.72;
      if (drawSpark) {
        p.g
          .roundRect(-size * 0.28, -size * 1.35, size * 0.56, size * 2.7, size * 0.2)
          .fill({ color, alpha: 0.95 });
        p.g
          .circle(0, -size * 0.4, size * 0.28)
          .fill({ color: 0xFFFFFF, alpha: 0.35 });
      } else if (drawCircle) {
        p.g.circle(0, 0, size).fill({ color, alpha: 0.92 });
        p.g.circle(-size * 0.2, -size * 0.2, size * 0.34).fill({ color: 0xFFFFFF, alpha: 0.3 });
      } else {
        p.g
          .poly([
            0,
            -size,
            size * 0.72,
            0,
            0,
            size,
            -size * 0.72,
            0,
          ])
          .fill({ color, alpha: 0.94 });
        p.g
          .poly([
            0,
            -size * 0.42,
            size * 0.32,
            0,
            0,
            size * 0.42,
            -size * 0.32,
            0,
          ])
          .fill({ color: 0xFFFFFF, alpha: 0.2 });
      }
      p.g.x = x;
      p.g.y = y;
      p.g.alpha = 0.95;
      p.g.scale.set(0.92 + Math.random() * 0.2);
      p.g.rotation = Math.random() * Math.PI * 2;
      p.g.visible = true;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.rot = 0;
      p.rotSpeed = (Math.random() - 0.5) * 0.3;
      p.scale = 1;
      p.scaleFrom = 0.92 + Math.random() * 0.28;
      p.scaleTo = 0.16 + Math.random() * 0.26;
      p.alphaFrom = 0.72 + Math.random() * 0.28;
      p.alphaTo = 0;
      p.drag = 0.956 + Math.random() * 0.02;
      p.drift = (Math.random() - 0.5) * 0.35;
      p.phase = Math.random() * Math.PI * 2;
      p.spark = drawSpark;
      p.twinkle = 0.8 + Math.random() * 0.6;
      p.stretch = 0.12 + Math.random() * 0.28;
      p.active = true;
      emitted += 1;
    }
  }

  update(tk: Ticker): void {
    const dt = tk.deltaTime;
    for (const p of this.pool) {
      if (!p.active) continue;
      p.g.x += p.vx * dt;
      p.g.y += p.vy * dt;
      p.g.x += Math.sin((p.maxLife - p.life) * 0.08 + p.phase) * p.drift * dt;
      p.vy += p.gravity * dt;
      p.vx *= p.drag;
      p.rot += p.rotSpeed * dt;
      if (p.spark) {
        p.g.rotation = Math.atan2(p.vy, p.vx) + Math.PI / 2;
      } else {
        p.g.rotation = p.rot;
      }
      p.life -= dt;
      const t = Math.max(0, p.life / p.maxLife);
      const eased = t * t;
      const twinkle = 0.86 + Math.sin((p.maxLife - p.life) * 0.18 * p.twinkle + p.phase) * 0.14;
      p.g.alpha = (p.alphaTo + (p.alphaFrom - p.alphaTo) * eased) * twinkle;
      const nextScale = p.scaleTo + (p.scaleFrom - p.scaleTo) * t;
      const velocityStretch = Math.min(0.92, (Math.abs(p.vx) + Math.abs(p.vy)) * 0.04) * p.stretch;
      const scaleX = Math.max(0.12, nextScale * (1 - velocityStretch * 0.35));
      const scaleY = Math.max(0.12, nextScale * (1 + velocityStretch));
      p.g.scale.set(scaleX, scaleY);
      if (p.life <= 0) {
        p.active = false;
        p.g.visible = false;
      }
    }
  }

  dispose(): void {
    for (const p of this.pool) p.g.destroy();
    this.pool.length = 0;
    this.container.destroy({ children: true });
  }

  get activeCount(): number {
    return this.pool.reduce((n, p) => n + (p.active ? 1 : 0), 0);
  }

  get capacityTotal(): number {
    return this.capacity;
  }
}
