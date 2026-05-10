import type { zhHant } from './dict.zh-Hant';

export const DEFAULT_LOCALE = 'zh-Hant';
export const LOCALES = ['zh-Hant', 'zh-Hans', 'en'] as const;

export type Locale = (typeof LOCALES)[number];
type DeepWiden<T> = T extends string
  ? string
  : T extends readonly (infer Item)[]
    ? readonly DeepWiden<Item>[]
    : T extends object
      ? { [Key in keyof T]: DeepWiden<T[Key]> }
      : T;

export type Dict = DeepWiden<typeof zhHant>;

export const LOCALE_LABELS: Record<Locale, string> = {
  'zh-Hant': '繁中',
  'zh-Hans': '简中',
  en: 'EN',
};

export const LOCALE_NATIVE_NAMES: Record<Locale, string> = {
  'zh-Hant': '繁體中文',
  'zh-Hans': '简体中文',
  en: 'English',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.includes(value as Locale);
}
