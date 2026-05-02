const STORAGE_KEY = 'bg.bgm.prefs';

export interface BgmTrack {
  title: string;
  src: string;
}

export interface BgmPrefs {
  muted: boolean;
  volume: number;
}

export interface BgmState extends BgmPrefs {
  currentTitle: string;
  playing: boolean;
  blocked: boolean;
  suppressed: boolean;
}

const DEFAULT_PREFS: BgmPrefs = {
  muted: false,
  volume: 0.32,
};

const TRACKS: BgmTrack[] = [
  { title: '爆分之夜', src: '/bgm/boom-night.mp3' },
  { title: '爆分之夜 2', src: '/bgm/boom-night-2.mp3' },
  { title: '倍率起飛', src: '/bgm/multiplier-takeoff.mp3' },
  { title: '倍率起飛 2', src: '/bgm/multiplier-takeoff-2.mp3' },
  { title: '一線成王', src: '/bgm/line-king.mp3' },
  { title: '一線成王 2', src: '/bgm/line-king-2.mp3' },
  { title: '下一局更猛', src: '/bgm/next-round.mp3' },
  { title: '下一局更猛 2', src: '/bgm/next-round-2.mp3' },
];

function loadPrefs(): BgmPrefs {
  if (typeof window === 'undefined') return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<BgmPrefs>;
    return {
      muted: Boolean(parsed.muted),
      volume: typeof parsed.volume === 'number'
        ? Math.max(0, Math.min(1, parsed.volume))
        : DEFAULT_PREFS.volume,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

function savePrefs(prefs: BgmPrefs): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs));
  } catch {
    /* no-op */
  }
}

class PlatformBgmImpl {
  private audio: HTMLAudioElement | null = null;
  private prefs: BgmPrefs = loadPrefs();
  private listeners = new Set<(state: BgmState) => void>();
  private currentIndex = -1;
  private initialized = false;
  private playing = false;
  private blocked = false;
  private suppressed = false;
  private fadeTimer: number | null = null;

  init(): void {
    this.ensureAudio();
    this.tryPlay();
  }

  subscribe(cb: (state: BgmState) => void): () => void {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  getSnapshot(): BgmState {
    return {
      muted: this.prefs.muted,
      volume: this.prefs.volume,
      currentTitle: TRACKS[this.currentIndex]?.title ?? '',
      playing: this.playing,
      blocked: this.blocked,
      suppressed: this.suppressed,
    };
  }

  isMuted(): boolean {
    return this.prefs.muted;
  }

  setMuted(muted: boolean): void {
    this.prefs = { ...this.prefs, muted };
    savePrefs(this.prefs);
    if (muted) {
      this.pause();
    } else {
      this.tryPlay();
    }
    this.notify();
  }

  toggleMuted(): void {
    this.setMuted(!this.prefs.muted);
  }

  setVolume(volume: number): void {
    const nextVolume = Math.max(0, Math.min(1, volume));
    this.prefs = { ...this.prefs, volume: nextVolume };
    savePrefs(this.prefs);
    if (this.audio) this.audio.volume = nextVolume;
    this.notify();
  }

  unlockFromGesture(): void {
    if (this.suppressed && !this.prefs.muted) {
      this.primeWhileSuppressed();
      return;
    }
    this.tryPlay();
  }

  setRouteSuppressed(suppressed: boolean): void {
    if (this.suppressed === suppressed) return;
    this.suppressed = suppressed;
    if (suppressed) {
      this.pause();
    } else {
      this.tryPlay();
    }
    this.notify();
  }

  private ensureAudio(): HTMLAudioElement | null {
    if (typeof window === 'undefined' || typeof Audio === 'undefined') return null;
    if (this.audio) return this.audio;

    const audio = new Audio();
    audio.preload = 'auto';
    audio.volume = this.prefs.volume;
    audio.crossOrigin = 'anonymous';
    audio.addEventListener('ended', () => this.playNextTrack());
    audio.addEventListener('play', () => {
      this.playing = true;
      this.blocked = false;
      this.notify();
    });
    audio.addEventListener('pause', () => {
      this.playing = false;
      this.notify();
    });

    this.audio = audio;
    this.selectRandomTrack();
    this.initialized = true;
    return audio;
  }

  private selectRandomTrack(): void {
    const audio = this.audio;
    if (!audio || TRACKS.length === 0) return;
    let nextIndex = Math.floor(Math.random() * TRACKS.length);
    if (TRACKS.length > 1 && nextIndex === this.currentIndex) {
      nextIndex = (nextIndex + 1 + Math.floor(Math.random() * (TRACKS.length - 1))) % TRACKS.length;
    }
    this.currentIndex = nextIndex;
    audio.src = TRACKS[nextIndex]!.src;
    audio.load();
    this.notify();
  }

  private playNextTrack(): void {
    this.selectRandomTrack();
    this.tryPlay();
  }

  private primeWhileSuppressed(): void {
    const audio = this.ensureAudio();
    if (!audio) return;
    const originalMuted = audio.muted;
    const originalVolume = audio.volume;
    audio.muted = true;
    audio.volume = 0;
    void audio.play()
      .then(() => {
        audio.pause();
        audio.muted = originalMuted;
        audio.volume = originalVolume;
        this.blocked = false;
        this.notify();
      })
      .catch(() => {
        audio.muted = originalMuted;
        audio.volume = originalVolume;
        this.blocked = true;
        this.notify();
      });
  }

  private tryPlay(): void {
    const audio = this.ensureAudio();
    if (!audio || this.prefs.muted || this.suppressed) return;
    if (!this.initialized || !audio.src) this.selectRandomTrack();
    this.clearFade();
    audio.volume = this.prefs.volume;
    void audio.play()
      .then(() => {
        this.playing = true;
        this.blocked = false;
        this.notify();
      })
      .catch(() => {
        this.playing = false;
        this.blocked = true;
        this.notify();
      });
  }

  private pause(): void {
    const audio = this.audio;
    this.clearFade();
    if (!audio) return;
    audio.pause();
    this.playing = false;
  }

  private clearFade(): void {
    if (this.fadeTimer === null) return;
    window.clearInterval(this.fadeTimer);
    this.fadeTimer = null;
  }

  private notify(): void {
    const state = this.getSnapshot();
    for (const cb of this.listeners) cb(state);
  }
}

export const PlatformBgm = new PlatformBgmImpl();
