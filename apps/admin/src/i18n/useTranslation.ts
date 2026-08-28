import {
  createContext,
  createElement,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { en } from './dict.en';
import { zhHans } from './dict.zh';
import { zhHant } from './dict.zh-Hant';
import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_NATIVE_NAMES,
  isLocale,
  type Dict,
  type Locale,
} from './types';
import { installLegacyDomLocalizer } from './legacyDomLocalizer';
import { adminBrand } from '@admin-brand';

const STORAGE_KEY = adminBrand.localeStorageKey;

const dictionaries: Record<Locale, Dict> = {
  'zh-Hant': applyBrandCopy(zhHant, 'zh-Hant'),
  'zh-Hans': applyBrandCopy(zhHans, 'zh-Hans'),
  en: applyBrandCopy(en, 'en'),
};

export interface LocaleOption {
  locale: Locale;
  label: string;
  nativeName: string;
}

interface I18nContextValue {
  t: Dict;
  locale: Locale;
  setLocale: (locale: Locale) => void;
  localeOptions: LocaleOption[];
}

const localeOptions: LocaleOption[] = LOCALES.map((locale) => ({
  locale,
  label: LOCALE_LABELS[locale],
  nativeName: LOCALE_NATIVE_NAMES[locale],
}));

const I18nContext = createContext<I18nContextValue>({
  t: zhHant,
  locale: DEFAULT_LOCALE,
  setLocale: () => undefined,
  localeOptions,
});

export function I18nProvider({ children }: { children: ReactNode }): JSX.Element {
  const [locale, setLocaleState] = useState<Locale>(() => readInitialLocale());

  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = 'ltr';
    localStorage.setItem(STORAGE_KEY, locale);
  }, [locale]);

  useEffect(() => installLegacyDomLocalizer(locale), [locale]);

  const setLocale = useCallback((nextLocale: Locale) => {
    setLocaleState(nextLocale);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      t: dictionaries[locale],
      locale,
      setLocale,
      localeOptions,
    }),
    [locale, setLocale],
  );

  return createElement(I18nContext.Provider, { value }, children);
}

export function useTranslation(): I18nContextValue {
  return useContext(I18nContext);
}

function readInitialLocale(): Locale {
  if (typeof window === 'undefined') return DEFAULT_LOCALE;

  const stored = localStorage.getItem(STORAGE_KEY);
  if (isLocale(stored)) return stored;

  return DEFAULT_LOCALE;
}

function applyBrandCopy(dictionary: Dict, locale: Locale): Dict {
  const copy = adminBrand.copy[locale];
  return {
    ...dictionary,
    auth: {
      ...dictionary.auth,
      title: copy.authTitle,
      subtitle: copy.authSubtitle,
      heroEyebrow: copy.heroEyebrow,
      heroTitle: copy.heroTitle,
      heroDescription: copy.heroDescription,
    },
    shell: {
      ...dictionary.shell,
      brand: copy.brand,
      brandShort: copy.brandShort,
    },
  };
}
