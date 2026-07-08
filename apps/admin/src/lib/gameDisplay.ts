import {
  BLACK_DOT_GAME_IDS,
  GAMES_REGISTRY,
  LOCAL_TABLE_GAME_IDS,
  TUI_TONGZI_GAME_IDS,
  TWENTY_ONE_HALF_GAME_IDS,
  getGameMeta,
} from '@bg/shared';

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
};

const LOCAL_TABLE_GAME_ID_SET = new Set<string>(LOCAL_TABLE_GAME_IDS);
const TWENTY_ONE_HALF_GAME_ID_SET = new Set<string>(TWENTY_ONE_HALF_GAME_IDS);
const TUI_TONGZI_GAME_ID_SET = new Set<string>(TUI_TONGZI_GAME_IDS);
const BLACK_DOT_GAME_ID_SET = new Set<string>(BLACK_DOT_GAME_IDS);

export function getAdminGameTitle(gameId: string): string {
  return getGameMeta(gameId)?.nameZh ?? LOCAL_TABLE_TITLE_FALLBACK[gameId] ?? gameId;
}

export function getAdminGameSubtitle(gameId: string): string | null {
  if (TWENTY_ONE_HALF_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 十點半';
  if (gameId === 'tui-tongzi-jade' || gameId === 'tui-tongzi-neon') return '牌桌遊戲 · 推索子';
  if (gameId === 'tui-tongzi-gold') return '牌桌遊戲 · 推萬子';
  if (TUI_TONGZI_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 推筒子';
  if (BLACK_DOT_GAME_ID_SET.has(gameId)) return '牌桌遊戲 · 黑粒仔';
  if (gameId === 'card-war') return '牌桌遊戲 · 比大小';
  return getGameMeta(gameId)?.name ?? null;
}

export function getAdminGameOptionLabel(gameId: string): string {
  const title = getAdminGameTitle(gameId);
  const subtitle = getAdminGameSubtitle(gameId);
  return subtitle ? `${title} · ${subtitle}` : title;
}

export function getAdminGameIdListLabel(gameIds: string[]): string {
  return gameIds.map(getAdminGameTitle).join('、');
}

export function isAdminLocalTableGame(gameId: string): boolean {
  return LOCAL_TABLE_GAME_ID_SET.has(gameId);
}

export function getEnabledAdminGames() {
  return Object.values(GAMES_REGISTRY).filter(
    (game) => game.enabled && !isAdminLocalTableGame(game.id),
  );
}
