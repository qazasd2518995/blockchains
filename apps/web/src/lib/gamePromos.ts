import {
  BACCARAT_TABLE_GAME_IDS,
  CARD_WAR_GAME_IDS,
  GameId,
  SLOT_GAME_IDS,
  type GameIdType,
} from '@bg/shared';

const SLOT_MAX_MULTIPLIERS: Partial<Record<GameIdType, number>> = {
  [GameId.HOTLINE]: 25000,
  [GameId.FRUIT_SLOT]: 25000,
  [GameId.FORTUNE_SLOT]: 25000,
  [GameId.OCEAN_SLOT]: 25000,
  [GameId.TEMPLE_SLOT]: 18888,
  [GameId.CANDY_SLOT]: 18888,
  [GameId.SAKURA_SLOT]: 18888,
  [GameId.THUNDER_SLOT]: 50000,
  [GameId.DRAGON_MEGA_SLOT]: 81000,
  [GameId.NEBULA_SLOT]: 81000,
  [GameId.JUNGLE_SLOT]: 50000,
  [GameId.VAMPIRE_SLOT]: 50000,
};

const HIGH_CRASH_MULTIPLIER_IDS = new Set<GameIdType>([
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.JETX3,
]);

const CRASH_GAME_IDS = new Set<GameIdType>([
  GameId.ROCKET,
  GameId.AVIATOR,
  GameId.SPACE_FLEET,
  GameId.JETX,
  GameId.BALLOON,
  GameId.JETX3,
  GameId.DOUBLE_X,
]);

const CARD_WAR_PROMO_IDS = new Set<GameIdType>([...CARD_WAR_GAME_IDS]);
const BACCARAT_TABLE_PROMO_IDS = new Set<GameIdType>([...BACCARAT_TABLE_GAME_IDS]);

const HOT_GAME_IDS = new Set<GameIdType>([
  GameId.AVIATOR,
  GameId.JETX,
  GameId.PLINKO,
  GameId.MINES,
  GameId.HOTLINE,
  GameId.FORTUNE_SLOT,
  GameId.OCEAN_SLOT,
  GameId.CANDY_SLOT,
  GameId.THUNDER_SLOT,
  GameId.NEBULA_SLOT,
  GameId.VAMPIRE_SLOT,
  GameId.WHEEL,
  GameId.CARNIVAL,
  GameId.BLACKJACK,
  ...BACCARAT_TABLE_GAME_IDS,
  GameId.TWENTY_ONE_HALF_DOLL,
  GameId.TUI_TONGZI_DRAGON,
  GameId.BLACK_DOT_TIANJIU,
  ...CARD_WAR_GAME_IDS,
]);

export function getGamePromoMultiplier(gameId: string): number {
  const id = gameId as GameIdType;
  if (SLOT_GAME_IDS.includes(id as (typeof SLOT_GAME_IDS)[number])) {
    return SLOT_MAX_MULTIPLIERS[id] ?? 35000;
  }
  if (CRASH_GAME_IDS.has(id)) return HIGH_CRASH_MULTIPLIER_IDS.has(id) ? 4000 : 2800;
  if (id === GameId.PLINKO || id === GameId.PLINKO_X) return 165;
  if (id === GameId.MINES) return 1200;
  if (id === GameId.TOWER) return 800;
  if (id === GameId.DICE) return 32.33;
  if (id === GameId.KENO) return 1000;
  if (id === GameId.WHEEL) return 48.25;
  if (id === GameId.MINI_ROULETTE || id === GameId.CARNIVAL) return 12;
  if (id === GameId.BLACKJACK) return 2.5;
  if (BACCARAT_TABLE_PROMO_IDS.has(id)) return 9;
  if (
    id === GameId.TWENTY_ONE_HALF_DOLL ||
    id === GameId.TWENTY_ONE_HALF_BUNNY ||
    id === GameId.TWENTY_ONE_HALF_STAR
  ) {
    return 2.4;
  }
  if (
    id === GameId.TUI_TONGZI_DRAGON ||
    id === GameId.TUI_TONGZI_LION ||
    id === GameId.TUI_TONGZI_JADE ||
    id === GameId.TUI_TONGZI_NEON ||
    id === GameId.TUI_TONGZI_GOLD
  ) {
    return 3;
  }
  if (
    id === GameId.BLACK_DOT_TIANJIU ||
    id === GameId.BLACK_DOT_ROYAL ||
    id === GameId.BLACK_DOT_STREET ||
    id === GameId.BLACK_DOT_SHADOW ||
    id === GameId.BLACK_DOT_GOLD ||
    CARD_WAR_PROMO_IDS.has(id)
  ) {
    return 1.96;
  }
  if (id === GameId.HILO) return 999;
  return 1000;
}

export function getGamePromoMultiplierLabel(gameId: string): string {
  if (gameId === GameId.HILO) return '無上限';
  return `${getGamePromoMultiplier(gameId)}X`;
}

export function isGamePromoHot(gameId: string): boolean {
  return HOT_GAME_IDS.has(gameId as GameIdType);
}

export function getMegaSlotMaxWinMultiplier(gameId: string): number {
  return getGamePromoMultiplier(gameId);
}
