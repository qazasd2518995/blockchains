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
  const { t, locale } = useTranslation();

  // Map old accent → new palette
  const suffixColor = {
    acid: 'text-brass-700',
    ember: 'text-wine-500',
    toxic: 'text-win',
    ice: 'text-felt-400',
  }[titleSuffixColor];

  const tagClass = {
    acid: 'tag-gold',
    ember: 'tag-wine',
    toxic: 'tag-felt',
    ice: 'tag',
  }[rtpAccent];

  const hasSuffix = titleSuffix.trim().length > 0;
  const separator = locale === 'en' ? '.' : '';

  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4 border-b border-brass-500/40 pb-4">
      <div className="flex min-w-0 items-baseline gap-4">
        <div className="flex items-center gap-2 font-mono text-[10px] tracking-[0.25em] text-ivory-600">
          <Link to="/lobby" className="transition hover:text-brass-700">
            ◄ {t.common.lobby}
          </Link>
          <span className="text-brass-500">◆</span>
          <span className="text-brass-700">{breadcrumb}</span>
        </div>
        <span className="font-script text-sm text-brass-600">{section}</span>
        <h1 className="font-serif text-3xl leading-tight md:text-4xl">
          <span className="text-ivory-950">
            {title}
            {hasSuffix ? separator : ''}
          </span>
          {hasSuffix && <span className={`italic ${suffixColor}`}>{titleSuffix}</span>}
        </h1>
        <p
          className="hidden max-w-md truncate text-[11px] text-ivory-600 lg:block"
          title={description}
        >
          {description}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={tagClass}>{rtpLabel}</span>
        <span className="tag hidden md:inline-flex">
          <span className="status-dot status-dot-live" />
          PROVABLY FAIR
        </span>
      </div>
    </div>
  );
}
