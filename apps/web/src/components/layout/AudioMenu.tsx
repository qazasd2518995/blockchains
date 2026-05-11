import { useEffect, useRef, useState } from 'react';
import { Music, Volume2, VolumeOff, VolumeX } from 'lucide-react';
import { Sfx } from '@bg/game-engine';
import { PlatformBgm, type BgmState } from '@/lib/platformBgm';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  variant?: 'dark' | 'light';
  className?: string;
  showLabel?: boolean;
}

export function AudioMenu({
  variant = 'dark',
  className = '',
  showLabel = false,
}: Props): JSX.Element {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [sfxMuted, setSfxMuted] = useState(() => Sfx.isMuted());
  const [bgmState, setBgmState] = useState<BgmState>(() => PlatformBgm.getSnapshot());
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => Sfx.subscribe((prefs) => setSfxMuted(prefs.muted)), []);
  useEffect(() => PlatformBgm.subscribe(setBgmState), []);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const musicMuted = bgmState.muted || bgmState.suppressed;
  const allMuted = sfxMuted && musicMuted;
  const ButtonIcon = allMuted ? VolumeX : Volume2;

  const buttonBase =
    variant === 'dark'
      ? 'border-white/12 bg-[#162338] text-white/80 hover:border-white/24 hover:bg-[#1A2A41] hover:text-white'
      : 'border-[#E5E7EB] bg-white text-[#0F172A] hover:border-[#186073]/40';
  const menuBase =
    variant === 'dark'
      ? 'border-white/12 bg-[#101B2D] text-white shadow-[0_18px_40px_rgba(0,0,0,0.35)]'
      : 'border-[#D6E5EC] bg-white text-[#0F172A] shadow-[0_18px_36px_rgba(15,23,42,0.16)]';
  const itemBase =
    variant === 'dark' ? 'text-white/82 hover:bg-white/8' : 'text-[#0F172A] hover:bg-[#EDF7FA]';

  const toggleSfx = (): void => {
    Sfx.setMuted(!sfxMuted);
    if (sfxMuted) Sfx.tick();
  };

  const toggleMusic = (): void => {
    PlatformBgm.toggleMuted();
  };

  return (
    <div ref={menuRef} className="relative inline-flex shrink-0">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        title={t.common.audio}
        aria-label={t.common.audio}
        aria-expanded={open}
        className={`inline-flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full border transition ${
          showLabel ? 'h-11 w-auto gap-1.5 px-3' : 'h-11 w-11'
        } ${buttonBase} ${className}`}
      >
        <ButtonIcon className="h-4 w-4" aria-hidden="true" />
        {showLabel ? <span className="text-[12px] font-bold">{t.common.audio}</span> : null}
      </button>

      {open && (
        <div
          role="menu"
          className={`absolute right-0 top-full z-[90] mt-2 w-44 overflow-hidden rounded-2xl border p-1.5 ${menuBase}`}
        >
          <AudioMenuItem
            label={t.common.sound}
            action={sfxMuted ? t.common.soundOn : t.common.soundOff}
            active={!sfxMuted}
            icon={sfxMuted ? VolumeX : Volume2}
            className={itemBase}
            onClick={toggleSfx}
          />
          <AudioMenuItem
            label={t.common.music}
            action={bgmState.muted ? t.common.musicOn : t.common.musicOff}
            active={!musicMuted}
            icon={musicMuted ? VolumeOff : Music}
            className={itemBase}
            onClick={toggleMusic}
          />
        </div>
      )}
    </div>
  );
}

function AudioMenuItem({
  label,
  action,
  active,
  icon: Icon,
  className,
  onClick,
}: {
  label: string;
  action: string;
  active: boolean;
  icon: typeof Volume2;
  className: string;
  onClick: () => void;
}): JSX.Element {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className={`flex w-full items-center gap-2 rounded-xl px-2.5 py-2 text-left transition ${className}`}
    >
      <span
        className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${
          active ? 'bg-[#DDFBEA] text-[#17864A]' : 'bg-[#F3E6E6] text-[#A33A3A]'
        }`}
      >
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-black">{label}</span>
        <span className="block truncate text-[10px] font-bold opacity-60">{action}</span>
      </span>
      <span
        className={`h-2.5 w-2.5 shrink-0 rounded-full ${active ? 'bg-[#28A35D]' : 'bg-[#CBD5E1]'}`}
        aria-hidden="true"
      />
    </button>
  );
}
