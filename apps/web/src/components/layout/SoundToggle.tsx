import { useEffect, useState } from 'react';
import { Volume2, VolumeX } from 'lucide-react';
import { Sfx } from '@bg/game-engine';

interface Props {
  variant?: 'dark' | 'light';
  className?: string;
}

export function SoundToggle({ variant = 'dark', className = '' }: Props): JSX.Element {
  const [muted, setMuted] = useState(() => Sfx.isMuted());

  useEffect(() => {
    return Sfx.subscribe((p) => setMuted(p.muted));
  }, []);

  const toggle = (): void => {
    Sfx.setMuted(!muted);
    if (muted) Sfx.tick();
  };

  const base =
    variant === 'dark'
      ? 'border-white/12 bg-[#162338] text-white/80 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white'
      : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#186073]/40';

  const Icon = muted ? VolumeX : Volume2;

  return (
    <button
      type="button"
      onClick={toggle}
      title={muted ? '開啟音效' : '關閉音效'}
      aria-label={muted ? '開啟音效' : '關閉音效'}
      aria-pressed={muted}
      className={`inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border transition ${base} ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
    </button>
  );
}
