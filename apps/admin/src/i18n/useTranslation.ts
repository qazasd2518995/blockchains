import { dict } from './dict.zh';

export function useTranslation(): { t: typeof dict; locale: 'zh-Hans' } {
  return { t: dict, locale: 'zh-Hans' };
}
