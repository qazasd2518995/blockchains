import { en } from './dict.en';
import { zhHant } from './dict.zh-Hant';
import { zhHans, toSimplified } from './dict.zh-Hans';
import type { Locale } from './types';

const TEXT_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;
const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

const LEGACY_ENGLISH_TEXT: Record<string, string> = {
  公告: 'Latest',
  優惠: 'Promos',
  熱門: 'Hot',
  熱門遊戲: 'Popular Games',
  飛行: 'Flight',
  牌桌: 'Tables',
  拉霸: 'Slots',
  輪盤: 'Roulette',
  即開: 'Instant',
  策略: 'Strategy',
  大廳: 'Lobby',
  記錄: 'Records',
  彩金: 'Jackpot',
  倍數符號: 'Multiplier Symbol',
  待觸發: 'Pending',
  免費旋轉: 'Free Spins',
  免費旋轉中: 'Free Spins',
  請將手機轉為橫向: 'Rotate your phone sideways',
  'Mega 寬版盤面需要更寬的遊玩空間': 'Mega wide reels need more horizontal space',
  系統維護升級公告: 'System maintenance and upgrade notice',
  '新遊戲 JetX3 震撼上架': 'New game JetX3 is now live',
  每週倍率王活動開跑: 'Weekly Multiplier King event is live',
  '理性遊戲，量力而為': 'Responsible gaming reminder: play responsibly',
  '歡迎回來，登入後立即進入遊戲大廳。': 'Welcome back. Log in to enter the lobby.',
  遊戲大廳: 'Lobby',
  會員錢包: 'Member Wallet',
  投注紀錄: 'Bet Records',
  '請先登入會員，登入完成後會回到剛才的遊戲頁面繼續操作。':
    'Log in first. After login, you will return to the game page.',
};

const englishTextMap = buildEnglishTextMap();

export function installLegacyDomLocalizer(locale: Locale): () => void {
  if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') {
    return () => undefined;
  }

  let frameId = 0;
  const schedule = () => {
    if (frameId) return;
    frameId = window.requestAnimationFrame(() => {
      frameId = 0;
      localizeNode(document.body, locale);
    });
  };

  schedule();
  const observer = new MutationObserver(schedule);
  observer.observe(document.body, {
    attributes: true,
    attributeFilter: [...TEXT_ATTRIBUTES],
    characterData: true,
    childList: true,
    subtree: true,
  });

  return () => {
    observer.disconnect();
    if (frameId) window.cancelAnimationFrame(frameId);
  };
}

function localizeNode(node: Node, locale: Locale): void {
  if (node.nodeType === Node.TEXT_NODE) {
    const next = localizeText(node.textContent ?? '', locale);
    if (node.textContent !== next) node.textContent = next;
    return;
  }

  if (!(node instanceof HTMLElement)) return;

  for (const attr of TEXT_ATTRIBUTES) {
    const value = node.getAttribute(attr);
    if (!value) continue;
    const next = localizeText(value, locale);
    if (next !== value) node.setAttribute(attr, next);
  }

  if (SKIP_TEXT_TAGS.has(node.tagName)) return;

  node.childNodes.forEach((child) => localizeNode(child, locale));
}

function localizeText(value: string, locale: Locale): string {
  if (!value.trim()) return value;
  if (locale === 'zh-Hant') return value;
  if (locale === 'zh-Hans') return toSimplified(value);
  return localizeEnglish(value);
}

function localizeEnglish(value: string): string {
  const leading = value.match(/^\s*/)?.[0] ?? '';
  const trailing = value.match(/\s*$/)?.[0] ?? '';
  const core = value.trim();
  const translated = englishTextMap.get(core) ?? englishTextMap.get(toSimplified(core));
  return translated ? `${leading}${translated}${trailing}` : value;
}

function buildEnglishTextMap(): Map<string, string> {
  const map = new Map<string, string>(Object.entries(LEGACY_ENGLISH_TEXT));
  collectStringPairs(zhHant, en, map);
  collectStringPairs(zhHans, en, map);
  for (const [traditional, english] of Object.entries(LEGACY_ENGLISH_TEXT)) {
    map.set(toSimplified(traditional), english);
  }
  return map;
}

function collectStringPairs(source: unknown, target: unknown, map: Map<string, string>): void {
  if (typeof source === 'string' && typeof target === 'string') {
    map.set(source, target);
    return;
  }
  if (!source || !target || typeof source !== 'object' || typeof target !== 'object') return;
  for (const [key, sourceValue] of Object.entries(source)) {
    collectStringPairs(sourceValue, (target as Record<string, unknown>)[key], map);
  }
}
