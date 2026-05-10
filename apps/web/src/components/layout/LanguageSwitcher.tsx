import { Languages } from 'lucide-react';
import type { Locale } from '@/i18n/types';
import { useTranslation } from '@/i18n/useTranslation';

interface LanguageSwitcherProps {
  variant?: 'dark' | 'light';
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  variant = 'dark',
  compact = false,
  className = '',
}: LanguageSwitcherProps): JSX.Element {
  const { locale, setLocale, localeOptions, t } = useTranslation();
  const base =
    variant === 'dark'
      ? 'border-white/12 bg-[#162338] text-white/82 hover:border-white/24 hover:bg-[#1A2A41]'
      : 'border-[#D8E7EE] bg-[#F7FCFE] text-[#17657D] hover:border-[#186073]/40';

  return (
    <label
      className={`relative inline-flex min-h-11 shrink-0 items-center rounded-full border transition ${base} ${
        compact ? 'w-11 justify-center px-0' : 'gap-1.5 px-3'
      } ${className}`}
      title={t.common.language}
      aria-label={t.common.language}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact ? <span className="text-[12px] font-bold">{t.common.language}</span> : null}
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className={`absolute inset-0 cursor-pointer opacity-0 ${compact ? 'w-11' : 'w-full'}`}
        aria-label={t.common.language}
      >
        {localeOptions.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.nativeName}
          </option>
        ))}
      </select>
      {!compact ? (
        <span className="pointer-events-none data-num text-[11px] font-black text-current/75">
          {localeOptions.find((option) => option.locale === locale)?.label}
        </span>
      ) : null}
    </label>
  );
}
