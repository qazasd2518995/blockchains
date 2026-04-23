/**
 * L4 SfxEngine — 程序合成音效（Web Audio API）。
 * 0 byte 音檔下載；瞬時播放；跨瀏覽器。
 *
 * 設計原則：
 *   - 不引入 howler / @pixi/sound，最小依賴
 *   - 每個 SFX 是「振盪器 + 包絡 + filter」的組合，模擬真實賭場聲
 *   - 第一次 play 才 lazy-init AudioContext（避免瀏覽器自動播放阻擋）
 *   - 全域單例 + localStorage 記憶 mute / volume
 */

const STORAGE_KEY = 'bg.sfx.prefs';

interface Prefs {
  muted: boolean;
  volume: number;
}

function loadPrefs(): Prefs {
  if (typeof window === 'undefined') return { muted: false, volume: 0.6 };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { muted: false, volume: 0.6 };
    const parsed = JSON.parse(raw) as Partial<Prefs>;
    return {
      muted: Boolean(parsed.muted),
      volume: typeof parsed.volume === 'number' ? Math.max(0, Math.min(1, parsed.volume)) : 0.6,
    };
  } catch {
    return { muted: false, volume: 0.6 };
  }
}

function savePrefs(p: Prefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* no-op */
  }
}

class SfxEngineImpl {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private prefs: Prefs;
  private listeners = new Set<(p: Prefs) => void>();

  constructor() {
    this.prefs = loadPrefs();
  }

  private ensureCtx(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const Ctor =
        window.AudioContext ??
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return null;
      try {
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.prefs.muted ? 0 : this.prefs.volume;
        this.master.connect(this.ctx.destination);
      } catch {
        return null;
      }
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume().catch(() => undefined);
    }
    return this.ctx;
  }

  private get out(): AudioNode | null {
    this.ensureCtx();
    return this.master;
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    savePrefs(this.prefs);
    if (this.master && this.ctx) {
      this.master.gain.cancelScheduledValues(this.ctx.currentTime);
      this.master.gain.setValueAtTime(muted ? 0 : this.prefs.volume, this.ctx.currentTime);
    }
    this.notify();
  }

  isMuted(): boolean {
    return this.prefs.muted;
  }

  setVolume(volume: number): void {
    const v = Math.max(0, Math.min(1, volume));
    this.prefs = { ...this.prefs, volume: v };
    savePrefs(this.prefs);
    if (this.master && this.ctx && !this.prefs.muted) {
      this.master.gain.setTargetAtTime(v, this.ctx.currentTime, 0.04);
    }
    this.notify();
  }

  getVolume(): number {
    return this.prefs.volume;
  }

  subscribe(cb: (p: Prefs) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  private notify(): void {
    for (const cb of this.listeners) cb({ ...this.prefs });
  }

  // ───────── 程序合成 sound primitives ─────────

  private tone(opts: {
    freq: number;
    type?: OscillatorType;
    durationSec: number;
    attack?: number;
    decay?: number;
    sustainLevel?: number;
    release?: number;
    peakGain?: number;
    pitchEndFreq?: number;
    pitchSweepShape?: 'linear' | 'exponential';
    delaySec?: number;
    filter?: { type: BiquadFilterType; freq: number; q?: number };
  }): void {
    const ctx = this.ensureCtx();
    const out = this.out;
    if (!ctx || !out) return;
    const t0 = ctx.currentTime + (opts.delaySec ?? 0);

    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(opts.freq, t0);
    if (opts.pitchEndFreq && opts.pitchEndFreq !== opts.freq) {
      const sweep = opts.pitchSweepShape ?? 'exponential';
      const safeEnd = Math.max(20, opts.pitchEndFreq);
      if (sweep === 'exponential') {
        osc.frequency.exponentialRampToValueAtTime(safeEnd, t0 + opts.durationSec);
      } else {
        osc.frequency.linearRampToValueAtTime(safeEnd, t0 + opts.durationSec);
      }
    }

    const gain = ctx.createGain();
    const peak = opts.peakGain ?? 0.18;
    const attack = opts.attack ?? 0.005;
    const decay = opts.decay ?? 0.04;
    const sustain = opts.sustainLevel ?? 0.7;
    const release = opts.release ?? 0.12;
    const sustainTime = Math.max(0.001, opts.durationSec - attack - decay - release);

    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + attack);
    gain.gain.linearRampToValueAtTime(peak * sustain, t0 + attack + decay);
    gain.gain.setValueAtTime(peak * sustain, t0 + attack + decay + sustainTime);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + attack + decay + sustainTime + release);

    let last: AudioNode = gain;
    osc.connect(gain);

    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.frequency.value = opts.filter.freq;
      if (opts.filter.q) f.Q.value = opts.filter.q;
      gain.connect(f);
      last = f;
    }

    last.connect(out);
    osc.start(t0);
    osc.stop(t0 + opts.durationSec + 0.05);
  }

  private noise(opts: {
    durationSec: number;
    peakGain?: number;
    delaySec?: number;
    filter?: { type: BiquadFilterType; freq: number; q?: number };
  }): void {
    const ctx = this.ensureCtx();
    const out = this.out;
    if (!ctx || !out) return;
    const t0 = ctx.currentTime + (opts.delaySec ?? 0);
    const sampleCount = Math.max(1, Math.floor(ctx.sampleRate * opts.durationSec));
    const buf = ctx.createBuffer(1, sampleCount, ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < sampleCount; i += 1) {
      data[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }
    const src = ctx.createBufferSource();
    src.buffer = buf;
    const gain = ctx.createGain();
    const peak = opts.peakGain ?? 0.12;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.linearRampToValueAtTime(peak, t0 + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + opts.durationSec);
    let last: AudioNode = gain;
    src.connect(gain);
    if (opts.filter) {
      const f = ctx.createBiquadFilter();
      f.type = opts.filter.type;
      f.frequency.value = opts.filter.freq;
      if (opts.filter.q) f.Q.value = opts.filter.q;
      gain.connect(f);
      last = f;
    }
    last.connect(out);
    src.start(t0);
    src.stop(t0 + opts.durationSec + 0.02);
  }

  // ───────── Game-flavour SFX ─────────

  /** Down-click for placing a bet. */
  bet(): void {
    this.tone({ freq: 720, type: 'square', durationSec: 0.07, peakGain: 0.12, pitchEndFreq: 540 });
    this.noise({ durationSec: 0.05, peakGain: 0.04, filter: { type: 'highpass', freq: 1500 } });
  }

  /** Crisp confirm tone for cashout / submit. */
  cashout(): void {
    this.tone({ freq: 660, type: 'triangle', durationSec: 0.16, peakGain: 0.18, pitchEndFreq: 990 });
    this.tone({ freq: 1320, type: 'sine', durationSec: 0.18, peakGain: 0.1, pitchEndFreq: 1980, delaySec: 0.04 });
  }

  /** Generic UI tick. */
  tick(): void {
    this.tone({ freq: 880, type: 'sine', durationSec: 0.05, peakGain: 0.08 });
  }

  /** Loss "deflate" — soft and not punishing. */
  loss(): void {
    this.tone({
      freq: 360,
      type: 'sine',
      durationSec: 0.45,
      peakGain: 0.12,
      pitchEndFreq: 180,
      pitchSweepShape: 'linear',
      attack: 0.01,
      release: 0.32,
      filter: { type: 'lowpass', freq: 800 },
    });
  }

  /** Small win — single bell ping. */
  winSmall(): void {
    this.tone({ freq: 988, type: 'triangle', durationSec: 0.22, peakGain: 0.22, pitchEndFreq: 1318 });
    this.tone({ freq: 1976, type: 'sine', durationSec: 0.22, peakGain: 0.1, pitchEndFreq: 2637, delaySec: 0.02 });
    this.noise({ durationSec: 0.12, peakGain: 0.06, filter: { type: 'highpass', freq: 4000 } });
  }

  /** Big win — three-note chord arpeggio. */
  winBig(): void {
    const notes = [659, 988, 1318];
    notes.forEach((freq, i) => {
      this.tone({
        freq,
        type: 'triangle',
        durationSec: 0.42,
        peakGain: 0.2,
        delaySec: i * 0.07,
        attack: 0.008,
        decay: 0.06,
        release: 0.22,
      });
    });
    this.noise({ durationSec: 0.3, peakGain: 0.08, filter: { type: 'highpass', freq: 3500 } });
  }

  /** Huge win — chord roll + sparkle shimmer. */
  winHuge(): void {
    const notes = [523, 659, 784, 988, 1318, 1568];
    notes.forEach((freq, i) => {
      this.tone({
        freq,
        type: 'triangle',
        durationSec: 0.7,
        peakGain: 0.24,
        delaySec: i * 0.06,
        attack: 0.008,
        decay: 0.08,
        sustainLevel: 0.6,
        release: 0.45,
      });
    });
    for (let i = 0; i < 6; i += 1) {
      this.tone({
        freq: 2200 + Math.random() * 1500,
        type: 'sine',
        durationSec: 0.14,
        peakGain: 0.07,
        delaySec: 0.18 + i * 0.07,
      });
    }
    this.noise({ durationSec: 0.6, peakGain: 0.06, filter: { type: 'highpass', freq: 5000 } });
  }

  /** Mega win — fanfare. */
  winMega(): void {
    this.winHuge();
    this.tone({
      freq: 110,
      type: 'sawtooth',
      durationSec: 1.2,
      peakGain: 0.18,
      pitchEndFreq: 220,
      attack: 0.05,
      release: 0.6,
      filter: { type: 'lowpass', freq: 600, q: 4 },
    });
    for (let i = 0; i < 12; i += 1) {
      this.tone({
        freq: 1800 + Math.random() * 1200,
        type: 'sine',
        durationSec: 0.08,
        peakGain: 0.08,
        delaySec: 0.4 + i * 0.04,
      });
    }
  }
}

export const Sfx = new SfxEngineImpl();
