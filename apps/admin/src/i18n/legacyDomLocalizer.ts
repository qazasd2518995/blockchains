import { en } from './dict.en';
import { zhHans } from './dict.zh';
import { zhHant, toSimplified, toTraditional } from './dict.zh-Hant';
import type { Locale } from './types';

const TEXT_ATTRIBUTES = ['aria-label', 'placeholder', 'title'] as const;
const SKIP_TEXT_TAGS = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TEXTAREA', 'INPUT']);

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

  if (locale === 'zh-Hant') return toTraditional(value);
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
  const map = new Map<string, string>();
  collectStringPairs(zhHans, en, map);
  collectStringPairs(zhHant, en, map);
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
