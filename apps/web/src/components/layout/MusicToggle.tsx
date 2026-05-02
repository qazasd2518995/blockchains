import { useEffect, useState } from 'react';
import { Music, VolumeOff } from 'lucide-react';
import { PlatformBgm, type BgmState } from '@/lib/platformBgm';

interface Props {
  variant?: 'dark' | 'light';
  className?: string;
  showLabel?: boolean;
}

export function MusicToggle({ variant = 'dark', className = '', showLabel = false }: Props): JSX.Element {
  const [state, setState] = useState<BgmState>(() => PlatformBgm.getSnapshot());

  useEffect(() => {
    return PlatformBgm.subscribe(setState);
  }, []);

  const muted = state.muted || state.suppressed;
  const Icon = muted ? VolumeOff : Music;
  const base =
    variant === 'dark'
      ? 'border-white/12 bg-[#162338] text-white/80 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white'
      : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#186073]/40';

  const toggle = (): void => {
    PlatformBgm.toggleMuted();
  };

  return (
    <button
      type="button"
      onClick={toggle}
      title={state.muted ? '開啟音樂' : '關閉音樂'}
      aria-label={state.muted ? '開啟音樂' : '關閉音樂'}
      aria-pressed={state.muted}
      className={`inline-flex h-9 shrink-0 items-center justify-center rounded-full border transition ${
        showLabel ? 'w-auto gap-1.5 px-3' : 'w-9'
      } ${base} ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {showLabel ? <span className="text-[12px] font-bold">音樂</span> : null}
    </button>
  );
}
