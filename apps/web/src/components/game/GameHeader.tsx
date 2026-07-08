import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { ResponsiveImage, type ResponsivePreset } from '@/lib/optimizedImages';
import { useTranslation } from '@/i18n/useTranslation';
import { useGameReturnTarget } from '@/hooks/useGameReturnTarget';

interface Props {
  artwork?: string;
  artworkPreset?: ResponsivePreset;
  artworkSizes?: string;
  artworkPosition?: string;
  section: string;
  title: string;
  titleSuffix: string;
  titleSuffixColor?: 'acid' | 'ember' | 'toxic' | 'ice';
  description: string;
  rtpLabel: string;
  rtpAccent?: 'acid' | 'ember' | 'toxic' | 'ice';
  breadcrumb: string;
}

export function GameHeader({
  artwork,
  artworkPreset,
  artworkSizes,
  artworkPosition = 'object-[78%_center]',
  section,
  title,
  titleSuffix,
  titleSuffixColor = 'acid',
  description,
  rtpLabel,
  rtpAccent = 'acid',
  breadcrumb,
}: Props) {
  const { t } = useTranslation();
  const returnTarget = useGameReturnTarget();

  // Map old accent → new palette
  const suffixColor = {
    acid: 'text-[#EA580C]',
    ember: 'text-[#D4574A]',
    toxic: 'text-win',
    ice: 'text-[#F97316]',
  }[titleSuffixColor];

  // RTP accent on dark hero — always use the gold-on-dark chip for legibility
  void rtpAccent;
  const tagClass = 'tag tag-goldOnDark';

  const hasSuffix = titleSuffix.trim().length > 0;
  const separator = '';
  const backdrop = artwork ?? '/backgrounds/casino-atmosphere.png';
  const backdropPreset = artworkPreset ?? (artwork ? 'lobby-card' : 'hero');
  const backdropSizes =
    artworkSizes ??
    (artwork ? '(max-width: 480px) 320px, (min-width: 1280px) 960px, 100vw' : '100vw');
  const backdropOpacity = artwork ? 'opacity-[0.92]' : 'opacity-30';

  return (
    <div className="game-header relative mb-4 overflow-hidden rounded-[16px] border border-[#C4B5FD]/34 bg-[#F6F0FF] p-4 shadow-[0_22px_52px_rgba(88,28,135,0.12)] sm:mb-6 sm:rounded-[20px] sm:p-6">
      <ResponsiveImage
        src={backdrop}
        alt=""
        aria-hidden="true"
        preset={backdropPreset}
        sizes={backdropSizes}
        loading="eager"
        fetchPriority="high"
        width={1600}
        height={700}
        className={`game-header__art pointer-events-none absolute inset-0 h-full w-full object-cover ${artworkPosition} ${backdropOpacity}`}
      />
      <div className="game-header__shade pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(250,245,255,0.96)_0%,rgba(245,243,255,0.88)_34%,rgba(255,228,236,0.58)_66%,rgba(237,233,254,0.42)_100%)]" />
      <div className="game-header__glow pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_42%,rgba(232,201,107,0.22),transparent_24%)]" />
      <div className="game-header__rule pointer-events-none absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(90deg,rgba(232,201,107,0.02),rgba(234,88,12,0.28),rgba(232,201,107,0.02))]" />

      <div className="relative flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-[12px] text-white/68">
              <Link
                to={returnTarget.to}
                className="inline-flex items-center gap-1 transition hover:text-[#FDBA74]"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                {returnTarget.label || t.common.lobby}
              </Link>
              <span className="text-white/22">/</span>
              <span className="text-[#FDBA74]">{breadcrumb}</span>
            </div>
            <span className="tag tag-goldOnDark">{section}</span>
            <span className="tag tag-onDark hidden md:inline-flex">{t.common.liveGame}</span>
          </div>

          <h1 className="mt-4 font-semibold text-[26px] leading-tight sm:text-[30px] md:text-[40px]">
            <span className="text-white">
              {title}
              {hasSuffix ? separator : ''}
            </span>
            {hasSuffix && <span className={suffixColor}>{titleSuffix}</span>}
          </h1>
          <p
            className="mt-3 max-w-3xl text-[13px] leading-relaxed text-white/72 md:text-[14px]"
            title={description}
          >
            {description}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <span className={tagClass}>{rtpLabel}</span>
          <span className="tag tag-onDark hidden md:inline-flex">
            <span className="dot-online" />
            {t.common.realtimePayout}
          </span>
        </div>
      </div>
    </div>
  );
}
