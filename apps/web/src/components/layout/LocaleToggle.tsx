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
      className={`inline-flex items-center gap-2 rounded-sm border border-[#186073]/55 bg-white/70 font-semibold text-[12px] font-semibold tracking-[0.18em] text-[#0F172A] transition hover:border-[#186073] hover:bg-[#F5F7FA] hover:text-[#186073] ${
        compact ? 'px-2.5 py-1' : 'px-3.5 py-2'
      }`}
    >
      <span className="text-[#AE8B35]">◆</span>
      <span>{current}</span>
      <span className="text-white0">→ {next}</span>
    </button>
  );
}
