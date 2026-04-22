import { Link } from 'react-router-dom';

interface Props {
  to: string;
  subtitle?: string;
  tone?: 'dark' | 'light';
  className?: string;
}

export function BrandMark({
  to,
  subtitle,
  tone = 'dark',
  className = '',
}: Props): JSX.Element {
  const titleClass = tone === 'dark' ? 'text-white' : 'text-[#0F172A]';
  const subtitleClass = tone === 'dark' ? 'text-white/[0.78]' : 'text-[#4A5568]';
  const badgeClass =
    tone === 'dark'
      ? 'from-[#186073] to-[#0E4555] text-white'
      : 'from-[#1A2530] to-[#186073] text-white';

  return (
    <Link to={to} className={`flex min-w-0 items-center gap-3 ${className}`}>
      <span
        className={`inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-[10px] bg-gradient-to-br text-[17px] font-extrabold uppercase tracking-[0.18em] ${badgeClass}`}
        translate="no"
      >
        BG
      </span>
      <span className="min-w-0">
        <span className={`block truncate text-[15px] font-extrabold tracking-[0.22em] ${titleClass}`} translate="no">
          BG 娛樂城
        </span>
        {subtitle ? (
          <span className={`mt-0.5 block truncate text-[11px] ${subtitleClass}`}>{subtitle}</span>
        ) : null}
      </span>
    </Link>
  );
}
