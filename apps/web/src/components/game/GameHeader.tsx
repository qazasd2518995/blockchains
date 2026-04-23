import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  artwork?: string;
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

  // Map old accent → new palette
  const suffixColor = {
    acid: 'text-[#186073]',
    ember: 'text-[#D4574A]',
    toxic: 'text-win',
    ice: 'text-[#266F85]',
  }[titleSuffixColor];

  // RTP accent on dark hero — always use the gold-on-dark chip for legibility
  void rtpAccent;
  const tagClass = 'tag tag-goldOnDark';

  const hasSuffix = titleSuffix.trim().length > 0;
  const separator = '';
  const backdrop = artwork ?? '/backgrounds/casino-atmosphere.png';
  const backdropOpacity = artwork ? 'opacity-[0.92]' : 'opacity-30';

  return (
    <div className="relative mb-6 overflow-hidden rounded-[20px] border border-[#16324A]/16 bg-[#091725] p-6 shadow-[0_24px_60px_rgba(15,23,42,0.16)]">
      <img
        src={backdrop}
        alt=""
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full object-cover ${artworkPosition} ${backdropOpacity}`}
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(4,12,22,0.96)_0%,rgba(6,16,30,0.88)_30%,rgba(6,16,30,0.58)_60%,rgba(6,16,30,0.2)_100%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_82%_42%,rgba(201,162,71,0.12),transparent_22%)]" />
      <div className="pointer-events-none absolute inset-x-6 bottom-0 h-px bg-[linear-gradient(90deg,rgba(255,255,255,0.02),rgba(143,208,223,0.35),rgba(255,255,255,0.02))]" />

      <div className="relative flex flex-wrap items-center justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
            <div className="flex items-center gap-2 text-[12px] text-white/68">
              <Link to="/lobby" className="inline-flex items-center gap-1 transition hover:text-[#8FD0DF]">
                <ArrowLeft className="h-3.5 w-3.5" />
                {t.common.lobby}
              </Link>
              <span className="text-white/22">/</span>
              <span className="text-[#8FD0DF]">{breadcrumb}</span>
            </div>
            <span className="tag tag-goldOnDark">{section}</span>
            <span className="tag tag-onDark hidden md:inline-flex">Live Game</span>
          </div>

          <h1 className="mt-4 font-semibold text-[30px] leading-tight md:text-[40px]">
            <span className="text-white">
              {title}
              {hasSuffix ? separator : ''}
            </span>
            {hasSuffix && <span className={suffixColor}>{titleSuffix}</span>}
          </h1>
          <p className="mt-3 max-w-3xl text-[13px] text-white/72 md:text-[14px]" title={description}>
            {description}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className={tagClass}>{rtpLabel}</span>
          <span className="tag tag-onDark hidden md:inline-flex">
            <span className="dot-online" />
            即時派彩
          </span>
        </div>
      </div>
    </div>
  );
}
