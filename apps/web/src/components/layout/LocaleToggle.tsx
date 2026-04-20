import { useLocaleStore } from '@/stores/localeStore';

export function LocaleToggle({ compact = false }: { compact?: boolean }) {
  const { locale, toggleLocale } = useLocaleStore();
  const next = locale === 'zh' ? 'EN' : 'ZH';
  const current = locale === 'zh' ? '简' : 'EN';

  return (
    <button
      type="button"
      onClick={toggleLocale}
      title={locale === 'zh' ? 'Switch to English' : '切换至简体中文'}
      className={`inline-flex items-center gap-1.5 border border-ink-200 bg-ink-50/50 font-mono text-[11px] font-semibold tracking-[0.2em] text-ink-700 transition hover:border-neon-acid hover:bg-neon-acid/10 hover:text-neon-acid ${
        compact ? 'px-2 py-1' : 'px-3 py-2'
      }`}
    >
      <span className="text-neon-acid/80">⌘</span>
      <span>{current}</span>
      <span className="text-ink-400">→{next}</span>
    </button>
  );
}
