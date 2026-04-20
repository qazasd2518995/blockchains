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
  private tickFn: ((tk: Ticker) => void) | null = null;
  private app: { ticker: { add: (fn: (tk: Ticker) => void) => void; remove: (fn: (tk: Ticker) => void) => void } };
  private state = { s: 0 };
  private amp = 0;
  private freq = 30;
  private startAt = 0;

  constructor(
    target: Container,
    app: { ticker: { add: (fn: (tk: Ticker) => void) => void; remove: (fn: (tk: Ticker) => void) => void } },
  ) {
    this.target = target;
    this.app = app;
    this.baseX = target.x;
    this.baseY = target.y;
  }

  shake(amp: number, durationSec: number, freq = 30): void {
    if (amp <= 0 || durationSec <= 0) return;
    this.stop();
    this.amp = amp;
    this.freq = freq;
    this.startAt = performance.now() / 1000;
    this.state.s = 1;

    this.tickFn = () => {
      const decay = this.state.s;
      if (decay <= 0) return;
      const t = performance.now() / 1000 - this.startAt;
      const offX = Math.sin(t * this.freq) * this.amp * decay;
      const offY = Math.cos(t * this.freq * 1.3) * this.amp * decay * 0.7;
      this.target.x = this.baseX + offX;
      this.target.y = this.baseY + offY;
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
    this.state.s = 0;
  }

  dispose(): void {
    this.stop();
  }
}
