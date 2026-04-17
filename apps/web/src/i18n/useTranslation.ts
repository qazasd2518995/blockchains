import { useLocaleStore } from '@/stores/localeStore';
import { zh, type Dict } from './dict.zh';
import { en } from './dict.en';

const DICTS: Record<string, Dict> = { zh, en };

export function useTranslation(): { t: Dict; locale: 'zh' | 'en' } {
  const locale = useLocaleStore((s) => s.locale);
  const t = DICTS[locale] ?? zh;
  return { t, locale };
}
