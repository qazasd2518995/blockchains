import { GameId, SLOT_GAME_IDS, type GameIdType } from '@bg/shared';

const SLOT_MAX_MULTIPLIERS: Partial<Record<GameIdType, number>> = {
  [GameId.HOTLINE]: 35000,
  [GameId.FRUIT_SLOT]: 35000,
  [GameId.FORTUNE_SLOT]: 35000,
  [GameId.OCEAN_SLOT]: 35000,
  [GameId.TEMPLE_SLOT]: 18000,
  [GameId.CANDY_SLOT]: 18000,
  [GameId.SAKURA_SLOT]: 18000,
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
]);

export function getGamePromoMultiplier(gameId: string): number {
  const id = gameId as GameIdType;
  if (SLOT_GAME_IDS.includes(id as (typeof SLOT_GAME_IDS)[number])) {
    return SLOT_MAX_MULTIPLIERS[id] ?? 35000;
  }
  if (CRASH_GAME_IDS.has(id)) return HIGH_CRASH_MULTIPLIER_IDS.has(id) ? 4000 : 2800;
  if (id === GameId.PLINKO || id === GameId.PLINKO_X) return 1480;
  if (id === GameId.MINES) return 1900;
  if (id === GameId.TOWER) return 2800;
  if (id === GameId.DICE) return 9900;
  if (id === GameId.KENO) return 12000;
  if (id === GameId.WHEEL || id === GameId.MINI_ROULETTE || id === GameId.CARNIVAL) return 1800;
  if (id === GameId.BLACKJACK || id === GameId.HILO) return 800;
  return 1000;
}

export function getGamePromoMultiplierLabel(gameId: string): string {
  return `${getGamePromoMultiplier(gameId).toLocaleString('en-US')}X`;
}

export function isGamePromoHot(gameId: string): boolean {
  return HOT_GAME_IDS.has(gameId as GameIdType);
}

export function getMegaSlotMaxWinMultiplier(gameId: string): number {
  return getGamePromoMultiplier(gameId);
}
