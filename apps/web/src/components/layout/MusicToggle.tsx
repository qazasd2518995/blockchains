import { useEffect, useState } from 'react';
import { Music, VolumeOff } from 'lucide-react';
import { PlatformBgm, type BgmState } from '@/lib/platformBgm';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  variant?: 'dark' | 'light';
  className?: string;
  showLabel?: boolean;
}

export function MusicToggle({
  variant = 'dark',
  className = '',
  showLabel = false,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [state, setState] = useState<BgmState>(() => PlatformBgm.getSnapshot());

  useEffect(() => {
    return PlatformBgm.subscribe(setState);
  }, []);

  const muted = state.muted || state.suppressed;
  const Icon = muted ? VolumeOff : Music;
  const base =
    variant === 'dark'
      ? 'border-white/12 bg-[#162338] text-white/80 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white'
      : 'border-[#FED7AA] bg-[#FFF7ED] text-[#9A3412] hover:border-[#EA580C]/45 hover:bg-[#FFEDD5]';

  const toggle = (): void => {
    PlatformBgm.toggleMuted();
  };

  const label = state.muted ? t.common.musicOn : t.common.musicOff;

  return (
    <button
      type="button"
      onClick={toggle}
      title={label}
      aria-label={label}
      aria-pressed={state.muted}
      className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border transition ${
        showLabel ? 'h-11 w-auto gap-1.5 px-3' : 'h-11 w-11'
      } ${base} ${className}`}
    >
      <Icon className="h-4 w-4" aria-hidden="true" />
      {showLabel ? <span className="text-[12px] font-bold">{t.common.music}</span> : null}
    </button>
  );
}
