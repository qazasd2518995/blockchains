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
      <div className="mb-6 flex items-center gap-3 text-[11px] tracking-[0.25em] text-ink-500">
        <Link to="/lobby" className="transition hover:text-neon-acid">
          ◄ {t.common.lobby}
        </Link>
        <span>/</span>
        <span className="text-neon-acid">{breadcrumb}</span>
      </div>

      <div className="mb-8 flex items-end justify-between border-b border-white/10 pb-6">
        <div>
          <div className="label">{section}</div>
          <h1 className="mt-2 font-serif text-6xl font-black italic">
            <span className="text-bone">
              {title}
              {hasSuffix ? separator : ''}
            </span>
            {hasSuffix && <span className={`italic ${suffixColor}`}>{titleSuffix}</span>}
          </h1>
          <p className="mt-3 max-w-xl text-[12px] text-ink-400">{description}</p>
        </div>
        <div className="hidden flex-col items-end gap-2 md:flex">
          <span className={tagClass}>{rtpLabel}</span>
          <span className="tag">
            <span className="status-dot status-dot-live" />
            PROVABLY FAIR
          </span>
        </div>
      </div>
    </>
  );
}
