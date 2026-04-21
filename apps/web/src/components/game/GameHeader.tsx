import { Link } from 'react-router-dom';
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
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-[#E5E7EB] pb-4">
      <div className="flex min-w-0 items-baseline gap-4">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-[#4A5568]">
          <Link to="/lobby" className="transition hover:text-[#186073]">
            ◄ {t.common.lobby}
          </Link>
          <span className="text-[#C9A247]">◆</span>
          <span className="text-[#186073]">{breadcrumb}</span>
        </div>
        <span className="font-semibold text-sm text-[#AE8B35]">{section}</span>
        <h1 className="font-semibold text-3xl leading-tight md:text-4xl">
          <span className="text-[#0F172A]">
            {title}
            {hasSuffix ? separator : ''}
          </span>
          {hasSuffix && <span className={`italic ${suffixColor}`}>{titleSuffix}</span>}
        </h1>
        <p
          className="hidden max-w-md truncate text-[11px] text-[#4A5568] lg:block"
          title={description}
        >
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={tagClass}>{rtpLabel}</span>
        <span className="tag hidden md:inline-flex">
          <span className="dot-online dot-online" />
          PROVABLY FAIR
        </span>
      </div>
    </div>
  );
}
