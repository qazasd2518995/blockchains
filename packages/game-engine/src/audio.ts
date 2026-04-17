type SoundSource = string | { src: string; volume?: number; loop?: boolean };

export class AudioManager {
  private audios = new Map<string, HTMLAudioElement>();
  private muted = false;
  private masterVolume = 0.7;

  register(alias: string, source: SoundSource): void {
    const src = typeof source === 'string' ? source : source.src;
    const audio = new Audio(src);
    audio.preload = 'auto';
    if (typeof source === 'object') {
      if (source.volume !== undefined) audio.volume = source.volume;
      if (source.loop) audio.loop = true;
    }
    this.audios.set(alias, audio);
  }

  play(alias: string): void {
    if (this.muted) return;
    const audio = this.audios.get(alias);
    if (!audio) return;
    const clone = audio.cloneNode(true) as HTMLAudioElement;
    clone.volume = audio.volume * this.masterVolume;
    void clone.play().catch(() => {
      // Autoplay blocked; ignore.
    });
  }

  stop(alias: string): void {
    const audio = this.audios.get(alias);
    if (!audio) return;
    audio.pause();
    audio.currentTime = 0;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, volume));
  }

  isMuted(): boolean {
    return this.muted;
  }

  dispose(): void {
    for (const audio of this.audios.values()) {
      audio.pause();
      audio.src = '';
    }
    this.audios.clear();
  }
}
