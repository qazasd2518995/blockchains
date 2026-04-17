export type Locale = 'zh' | 'en';

export const LOCALES: { code: Locale; label: string; native: string }[] = [
  { code: 'zh', label: 'ZH', native: '简体中文' },
  { code: 'en', label: 'EN', native: 'English' },
];
