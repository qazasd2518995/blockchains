import { GameId, SLOT_GAME_IDS, type GameIdType } from '@bg/shared';

const SLOT_MAX_MULTIPLIERS: Partial<Record<GameIdType, number>> = {
  [GameId.HOTLINE]: 1250,
  [GameId.FRUIT_SLOT]: 1250,
  [GameId.FORTUNE_SLOT]: 1250,
  [GameId.OCEAN_SLOT]: 1250,
  [GameId.TEMPLE_SLOT]: 25,
  [GameId.CANDY_SLOT]: 25,
  [GameId.SAKURA_SLOT]: 25,
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
  if (id === GameId.PLINKO || id === GameId.PLINKO_X) return 165;
  if (id === GameId.MINES) return 5044291;
  if (id === GameId.TOWER) return 4242;
  if (id === GameId.DICE) return 32.33;
  if (id === GameId.KENO) return 1000;
  if (id === GameId.WHEEL) return 48.25;
  if (id === GameId.MINI_ROULETTE || id === GameId.CARNIVAL) return 12;
  if (id === GameId.BLACKJACK) return 2.5;
  if (id === GameId.HILO) return 999;
  return 1000;
}

export function getGamePromoMultiplierLabel(gameId: string): string {
  if (gameId === GameId.HILO) return '無上限';
  return `${getGamePromoMultiplier(gameId).toLocaleString('en-US')}X`;
}

export function isGamePromoHot(gameId: string): boolean {
  return HOT_GAME_IDS.has(gameId as GameIdType);
}

export function getMegaSlotMaxWinMultiplier(gameId: string): number {
  return getGamePromoMultiplier(gameId);
}
