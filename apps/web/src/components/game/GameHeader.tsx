import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
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

  const tagClass = {
    acid: 'tag-gold',
    ember: 'tag-wine',
    toxic: 'tag-felt',
    ice: 'tag',
  }[rtpAccent];

  const hasSuffix = titleSuffix.trim().length > 0;
  const separator = '';

  return (
    <div className="relative mb-6 overflow-hidden rounded-[14px] border border-[#16324A]/12 bg-[#091725] p-5 shadow-[0_20px_48px_rgba(15,23,42,0.08)]">
      <img
        src="/backgrounds/casino-atmosphere.png"
        alt=""
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 h-full w-full object-cover object-[center_36%] opacity-30"
      />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(90deg,rgba(6,16,30,0.92)_0%,rgba(6,16,30,0.82)_42%,rgba(6,16,30,0.48)_100%)]" />

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
            <span className="rounded-full border border-[#C9A247]/24 bg-[#132233]/72 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-[#EFD886]">
              {section}
            </span>
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
          <span className="tag hidden border-white/14 bg-white/8 text-white/82 md:inline-flex">
            <span className="dot-online" />
            PROVABLY FAIR
          </span>
        </div>
      </div>
    </div>
  );
}
