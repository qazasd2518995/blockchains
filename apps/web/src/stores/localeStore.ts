import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { Locale } from '@/i18n/types';

interface LocaleState {
  locale: Locale;
  setLocale: (l: Locale) => void;
  toggleLocale: () => void;
}

export const useLocaleStore = create<LocaleState>()(
  persist(
    (set) => ({
      locale: 'zh',
      setLocale: (locale) => {
        document.documentElement.lang = locale === 'zh' ? 'zh-Hans' : 'en';
        set({ locale });
      },
      toggleLocale: () =>
        set((s) => {
          const next: Locale = s.locale === 'zh' ? 'en' : 'zh';
          document.documentElement.lang = next === 'zh' ? 'zh-Hans' : 'en';
          return { locale: next };
        }),
    }),
    { name: 'bg-locale' },
  ),
);
