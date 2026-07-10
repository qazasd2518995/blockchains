import {
  BLACK_DOT_GAME_IDS,
  CARD_WAR_GAME_IDS,
  GAMES_REGISTRY,
  LOCAL_TABLE_GAME_IDS,
  TUI_TONGZI_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
  getGameMeta,
} from '@bg/shared';
import { toSimplified, toTraditional } from '@/i18n/dict.zh-Hant';
import type { Locale } from '@/i18n/types';

const LOCAL_TABLE_TITLE_FALLBACK: Record<string, string> = {
  'twenty-one-half-doll': '萌娃十點半',
  'twenty-one-half-bunny': '兔糖十點半',
  'twenty-one-half-star': '星願十點半',
  'tui-tongzi-dragon': '龍門推筒',
  'tui-tongzi-lion': '醒獅推筒',
  'tui-tongzi-jade': '玉兔推索',
  'tui-tongzi-neon': '霓虹推索',
  'tui-tongzi-gold': '金殿推萬',
  'black-dot-tianjiu': '天九黑粒',
  'black-dot-royal': '御殿黑粒',
  'black-dot-street': '街頭黑粒',
  'black-dot-shadow': '影武黑粒',
  'black-dot-gold': '金礦黑粒',
  'card-war': '王牌比大小',
  'card-war-neon': '霓夜比大小',
  'card-war-gold': '金爵比大小',
  'card-war-crystal': '冰晶比大小',
};

const LOCAL_TABLE_ENGLISH_TITLE_FALLBACK: Record<string, string> = {
  'twenty-one-half-doll': 'Dolly 10.5',
  'twenty-one-half-bunny': 'Bunny 10.5',
  'twenty-one-half-star': 'Starlit 10.5',
  'tui-tongzi-dragon': 'Dragon Tongzi',
  'tui-tongzi-lion': 'Lion Tongzi',
  'tui-tongzi-jade': 'Jade Suozi',
  'tui-tongzi-neon': 'Neon Suozi',
  'tui-tongzi-gold': 'Golden Wanzi',
  'black-dot-tianjiu': 'Tin Kau Black Dot',
  'black-dot-royal': 'Royal Black Dot',
  'black-dot-street': 'Street Black Dot',
  'black-dot-shadow': 'Shadow Black Dot',
  'black-dot-gold': 'Golden Black Dot',
  'card-war': 'Card War',
  'card-war-neon': 'Neon High Card',
  'card-war-gold': 'Golden High Card',
  'card-war-crystal': 'Crystal High Card',
};

const LOCAL_TABLE_GAME_ID_SET = new Set<string>(LOCAL_TABLE_GAME_IDS);
const TWENTY_ONE_HALF_GAME_ID_SET = new Set<string>(TWENTY_ONE_HALF_GAME_IDS);
const TUI_TONGZI_GAME_ID_SET = new Set<string>(TUI_TONGZI_GAME_IDS);
const BLACK_DOT_GAME_ID_SET = new Set<string>(BLACK_DOT_GAME_IDS);
const CARD_WAR_GAME_ID_SET = new Set<string>(CARD_WAR_GAME_IDS);

export function getAdminGameTitle(gameId: string, locale: Locale = 'zh-Hant'): string {
  const meta = getGameMeta(gameId);
  if (locale === 'en') return meta?.name ?? LOCAL_TABLE_ENGLISH_TITLE_FALLBACK[gameId] ?? gameId;
  const title = meta?.nameZh ?? LOCAL_TABLE_TITLE_FALLBACK[gameId] ?? gameId;
  return locale === 'zh-Hans' ? toSimplified(title) : toTraditional(title);
}

export function getAdminGameSubtitle(gameId: string, locale: Locale = 'zh-Hant'): string | null {
  const subtitle = getLocalTableSubtitle(gameId, locale);
  if (subtitle) return subtitle;

  const englishName = getGameMeta(gameId)?.name ?? null;
  if (!englishName || locale === 'en') return null;
  return englishName;
}

export function getAdminGameOptionLabel(gameId: string, locale: Locale = 'zh-Hant'): string {
  const title = getAdminGameTitle(gameId, locale);
  const subtitle = getAdminGameSubtitle(gameId, locale);
  return subtitle ? `${title} · ${subtitle}` : title;
}

export function getAdminGameIdListLabel(gameIds: string[], locale: Locale = 'zh-Hant'): string {
  return gameIds
    .map((gameId) => getAdminGameTitle(gameId, locale))
    .join(locale === 'en' ? ', ' : '、');
}

export function isAdminLocalTableGame(gameId: string): boolean {
  return LOCAL_TABLE_GAME_ID_SET.has(gameId);
}

export function getEnabledAdminGames() {
  return Object.values(GAMES_REGISTRY).filter(
    (game) => game.enabled && !isAdminLocalTableGame(game.id),
  );
}

function getLocalTableSubtitle(gameId: string, locale: Locale): string | null {
  const zhHant = getLocalTableSubtitleZhHant(gameId);
  if (!zhHant) return null;
  if (locale === 'en') return getLocalTableSubtitleEnglish(gameId);
  return locale === 'zh-Hans' ? toSimplified(zhHant) : zhHant;
}

function getLocalTableSubtitleZhHant(gameId: string): string | null {
  if (TWENTY_ONE_HALF_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 十點半';
  if (gameId === 'tui-tongzi-jade' || gameId === 'tui-tongzi-neon') return '牌桌遊戲 · 推索子';
  if (gameId === 'tui-tongzi-gold') return '牌桌遊戲 · 推萬子';
  if (TUI_TONGZI_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 推筒子';
  if (BLACK_DOT_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 黑粒仔';
  if (CARD_WAR_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 比大小';
  return null;
}

function getLocalTableSubtitleEnglish(gameId: string): string | null {
  if (TWENTY_ONE_HALF_GAME_ID_SET.has(gameId)) return 'Table Game · 10.5';
  if (gameId === 'tui-tongzi-jade' || gameId === 'tui-tongzi-neon') return 'Table Game · Suozi';
  if (gameId === 'tui-tongzi-gold') return 'Table Game · Wanzi';
  if (TUI_TONGZI_GAME_ID_SET.has(gameId)) return 'Table Game · Tongzi';
  if (BLACK_DOT_GAME_ID_SET.has(gameId)) return 'Table Game · Black Dot';
  if (CARD_WAR_GAME_ID_SET.has(gameId)) return 'Table Game · High Card';
  return null;
}
