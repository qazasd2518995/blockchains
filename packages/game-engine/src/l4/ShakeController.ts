import type { Container, Ticker } from 'pixi.js';
import { gsap } from 'gsap';

/**
 * L4 Container shake with decay：
 * store base xy + tween {s:1→0} + ticker 套 sin(t*freq)*amp*s
 * Stake 慣例：贏家 shake 300-800ms，千倍獎 1.5s。
 * 失敗局絕對不 shake（對稱感差）。
 */
export class ShakeController {
  private target: Container;
  private baseX = 0;
  private baseY = 0;
  private baseRotation = 0;
  private tickFn: ((tk: Ticker) => void) | null = null;
  private app: { ticker: { add: (fn: (tk: Ticker) => void) => void; remove: (fn: (tk: Ticker) => void) => void } };
  private state = { s: 0 };
  private amp = 0;
  private freq = 30;
  private startAt = 0;
  private phase = 0;

  constructor(
    target: Container,
    app: { ticker: { add: (fn: (tk: Ticker) => void) => void; remove: (fn: (tk: Ticker) => void) => void } },
  ) {
    this.target = target;
    this.app = app;
    this.baseX = target.x;
    this.baseY = target.y;
    this.baseRotation = target.rotation;
  }

  shake(amp: number, durationSec: number, freq = 30): void {
    if (amp <= 0 || durationSec <= 0) return;
    this.stop();
    this.amp = amp;
    this.freq = freq;
    this.startAt = performance.now() / 1000;
    this.phase = Math.random() * Math.PI * 2;
    this.state.s = 1;

    this.tickFn = () => {
      const decay = this.state.s;
      if (decay <= 0) return;
      const t = performance.now() / 1000 - this.startAt;
      const offX =
        (Math.sin(t * this.freq + this.phase) * 0.72 +
          Math.sin(t * this.freq * 2.2 + this.phase * 0.6) * 0.28) *
        this.amp *
        decay;
      const offY =
        (Math.cos(t * this.freq * 1.25 + this.phase * 0.4) * 0.62 +
          Math.sin(t * this.freq * 1.9 + this.phase) * 0.22) *
        this.amp *
        decay *
        0.78;
      const microX = Math.sin(t * this.freq * 4.4 + this.phase * 1.6) * this.amp * decay * decay * 0.08;
      const microY = Math.cos(t * this.freq * 3.8 + this.phase * 0.9) * this.amp * decay * decay * 0.06;
      this.target.x = this.baseX + offX;
      this.target.y = this.baseY + offY + microY;
      this.target.x += microX;
      this.target.rotation =
        this.baseRotation +
        Math.sin(t * this.freq * 0.62 + this.phase) * 0.0048 * this.amp * decay;
    };
    this.app.ticker.add(this.tickFn);

    gsap.to(this.state, {
      s: 0,
      duration: durationSec,
      ease: 'power2.out',
      onComplete: () => this.stop(),
    });
  }

  stop(): void {
    if (this.tickFn) {
      this.app.ticker.remove(this.tickFn);
      this.tickFn = null;
    }
    this.target.x = this.baseX;
    this.target.y = this.baseY;
    this.target.rotation = this.baseRotation;
    this.state.s = 0;
  }

  dispose(): void {
    this.stop();
  }
}
