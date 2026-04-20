import { useLocaleStore } from '@/stores/localeStore';
import { useTranslation } from '@/i18n/useTranslation';

export function LocaleToggle({ compact = false }: { compact?: boolean }) {
  const { locale, toggleLocale } = useLocaleStore();
  const { t } = useTranslation();
  const next = locale === 'zh' ? 'EN' : 'ZH';
  const current = locale === 'zh' ? '简' : 'EN';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      title={locale === 'zh' ? t.common.switchToEnglish : t.common.switchToChinese}
      className={`inline-flex items-center gap-2 rounded-sm border border-brass-500/55 bg-ivory-100/70 font-serif text-[12px] font-semibold tracking-[0.18em] text-ivory-900 transition hover:border-brass-500 hover:bg-ivory-200 hover:text-brass-700 ${
        compact ? 'px-2.5 py-1' : 'px-3.5 py-2'
      }`}
    >
      <span className="text-brass-600">◆</span>
      <span>{current}</span>
      <span className="text-ivory-500">→ {next}</span>
    </button>
  );
}
