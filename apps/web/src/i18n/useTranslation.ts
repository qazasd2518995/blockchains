import { zh, type Dict } from './dict.zh';

export function useTranslation(): { t: Dict; locale: 'zh' } {
  return { t: zh, locale: 'zh' };
}
