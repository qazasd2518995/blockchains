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
  const suffixColor = {
    acid: 'text-neon-acid',
    ember: 'text-neon-ember',
    toxic: 'text-neon-toxic',
    ice: 'text-neon-ice',
  }[titleSuffixColor];

  const tagClass = {
    acid: 'tag-acid',
    ember: 'tag-ember',
    toxic: 'tag-toxic',
    ice: 'tag',
  }[rtpAccent];

  const hasSuffix = titleSuffix.trim().length > 0;
  const separator = locale === 'en' ? '.' : '';

  return (
    <>
      {/* 緊湊 header：一列搞定 breadcrumb + 標題 + tags */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink-200 pb-3">
        <div className="flex min-w-0 items-baseline gap-3">
          <div className="flex items-center gap-2 text-[10px] tracking-[0.25em] text-ink-500">
            <Link to="/lobby" className="transition hover:text-neon-acid">
              ◄ {t.common.lobby}
            </Link>
            <span className="text-ink-300">/</span>
            <span className="text-neon-acid">{breadcrumb}</span>
          </div>
          <span className="label text-[9px] text-ink-400">{section}</span>
          <h1 className="font-display text-2xl font-bold tracking-wide md:text-3xl">
            <span className="text-ink-900">
              {title}
              {hasSuffix ? separator : ''}
            </span>
            {hasSuffix && <span className={suffixColor}>{titleSuffix}</span>}
          </h1>
          <p
            className="hidden max-w-md truncate text-[11px] text-ink-500 lg:block"
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
    </>
  );
}
