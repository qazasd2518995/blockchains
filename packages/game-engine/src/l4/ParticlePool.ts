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
      sizeMax = 5,
      lifeMin = 40,
      lifeMax = 70,
      gravity = 0.18,
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
      const drawCircle = shape === 'circle' || (shape === 'mixed' && Math.random() > 0.5);
      if (drawCircle) {
        p.g.circle(0, 0, size).fill({ color });
      } else {
        p.g.rect(-size / 2, -size / 2, size, size).fill({ color });
      }
      p.g.x = x;
      p.g.y = y;
      p.g.alpha = 1;
      p.g.scale.set(1);
      p.g.rotation = 0;
      p.g.visible = true;
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      p.life = lifeMin + Math.random() * (lifeMax - lifeMin);
      p.maxLife = p.life;
      p.gravity = gravity;
      p.rot = 0;
      p.rotSpeed = (Math.random() - 0.5) * 0.3;
      p.scale = 1;
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
      p.vy += p.gravity * dt;
      p.vx *= 0.98;
      p.rot += p.rotSpeed * dt;
      p.g.rotation = p.rot;
      p.life -= dt;
      const t = Math.max(0, p.life / p.maxLife);
      p.g.alpha = t;
      p.g.scale.set(Math.max(0.1, t));
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
