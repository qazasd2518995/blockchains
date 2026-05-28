import {
  GAMES_REGISTRY,
  normalizeBettingLimitRangeKey,
  normalizeBettingLimitsByGame,
  isBettingLimitWithinParent,
  type BettingLimitsByGame,
} from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const GAME_IDS = Object.values(GAMES_REGISTRY)
  .filter((game) => game.enabled)
  .map((game) => game.id);

export function normalizeStoredBettingLimits(
  limits: unknown,
  fallbackLevel?: unknown,
): BettingLimitsByGame {
  const normalized = normalizeBettingLimitsByGame(limits);
  const fallback = normalizeBettingLimitRangeKey(fallbackLevel);
  return Object.fromEntries(GAME_IDS.map((gameId) => [gameId, normalized[gameId] ?? fallback]));
}

export function resolveRequestedBettingLimits(
  requestedLimits: unknown,
  requestedLevel: unknown,
  parentLimits: unknown,
  parentLevel: unknown,
): BettingLimitsByGame {
  if (requestedLimits && typeof requestedLimits === 'object' && !Array.isArray(requestedLimits)) {
    const normalized = normalizeBettingLimitsByGame(requestedLimits);
    const parent = normalizeStoredBettingLimits(parentLimits, parentLevel);
    return Object.fromEntries(
      GAME_IDS.map((gameId) => [
        gameId,
        normalized[gameId] ?? parent[gameId] ?? normalizeBettingLimitRangeKey(parentLevel),
      ]),
    );
  }
  if (requestedLevel !== undefined) {
    const range = normalizeBettingLimitRangeKey(requestedLevel);
    return Object.fromEntries(GAME_IDS.map((gameId) => [gameId, range]));
  }
  return normalizeStoredBettingLimits(parentLimits, parentLevel);
}

export function assertBettingLimitsWithinParent(
  childLimits: unknown,
  childLevel: unknown,
  parentLimits: unknown,
  parentLevel: unknown,
): void {
  const child = normalizeStoredBettingLimits(childLimits, childLevel);
  const parent = normalizeStoredBettingLimits(parentLimits, parentLevel);
  const violation = GAME_IDS.find(
    (gameId) => !isBettingLimitWithinParent(child[gameId], parent[gameId]),
  );
  if (violation) {
    const game = GAMES_REGISTRY[violation];
    throw new ApiError('HIERARCHY_VIOLATION', `${game?.nameZh ?? violation} 的限紅不能高於上級。`);
  }
}
