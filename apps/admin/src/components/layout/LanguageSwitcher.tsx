import { Languages } from 'lucide-react';
import type { Locale } from '@/i18n/types';
import { useTranslation } from '@/i18n/useTranslation';

interface LanguageSwitcherProps {
  compact?: boolean;
  className?: string;
}

export function LanguageSwitcher({
  compact = false,
  className = '',
}: LanguageSwitcherProps): JSX.Element {
  const { locale, setLocale, localeOptions, t } = useTranslation();

  return (
    <label
      className={`relative inline-flex min-h-10 shrink-0 items-center rounded-sm border border-[#186073]/60 bg-[#1A2530]/50 text-[#E8D48A] transition hover:border-[#186073] hover:bg-[#0E4555] hover:text-white ${
        compact ? 'w-10 justify-center px-0' : 'gap-2 px-3'
      } ${className}`}
      title={t.common.language}
      aria-label={t.common.language}
    >
      <Languages className="h-4 w-4 shrink-0" aria-hidden="true" />
      {!compact ? <span className="text-[11px] font-semibold">{t.common.language}</span> : null}
      <select
        value={locale}
        onChange={(event) => setLocale(event.target.value as Locale)}
        className={`absolute inset-0 cursor-pointer opacity-0 ${compact ? 'w-10' : 'w-full'}`}
        aria-label={t.common.language}
      >
        {localeOptions.map((option) => (
          <option key={option.locale} value={option.locale}>
            {option.nativeName}
          </option>
        ))}
      </select>
      {!compact ? (
        <span className="pointer-events-none font-mono text-[10px] font-bold text-current/75">
          {localeOptions.find((option) => option.locale === locale)?.label}
        </span>
      ) : null}
    </label>
  );
}
