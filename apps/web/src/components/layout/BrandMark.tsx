import { Link } from 'react-router-dom';
import { ResponsiveImage } from '@/lib/optimizedImages';
import { useTranslation } from '@/i18n/useTranslation';

interface Props {
  to: string;
  subtitle?: string;
  tone?: 'dark' | 'light';
  className?: string;
}

export function BrandMark({ to, subtitle, tone = 'dark', className = '' }: Props): JSX.Element {
  const { t } = useTranslation();
  const titleClass = tone === 'dark' ? 'text-white' : 'text-[#0F172A]';
  const subtitleClass = tone === 'dark' ? 'text-white/[0.78]' : 'text-[#4A5568]';
  const badgeClass =
    tone === 'dark'
      ? 'border-[#F59E0B]/35 bg-[#130C07]/72'
      : 'border-[#F59E0B]/30 bg-[#FFF7ED]';

  return (
    <Link to={to} className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center overflow-hidden rounded-[10px] border ${badgeClass}`}
      >
        <ResponsiveImage
          src="/brand/yachiyo-emblem.png"
          alt=""
          preset="lobby-card"
          sizes="44px"
          loading="eager"
          width={824}
          height={824}
          className="h-10 w-10 object-contain"
          draggable={false}
        />
      </span>
      <span className="min-w-0">
        <span
          className={`block truncate text-[15px] font-extrabold tracking-[0.22em] ${titleClass}`}
          translate="no"
        >
          {t.landing.brandName}
        </span>
        {subtitle ? (
          <span className={`mt-0.5 block truncate text-[11px] ${subtitleClass}`}>{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}
