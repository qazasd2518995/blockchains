import {
  BETTING_LIMIT_MANAGED_GAME_IDS,
  GAMES_REGISTRY,
  bettingLimitRangesAtOrBelow,
  isBettingLimitOptionAllowed,
  normalizeBettingLimitOptionsByGame,
  normalizeBettingLimitRangeKey,
  normalizeBettingLimitsByGame,
  resolveDefaultChildBettingLimitRange,
  type BettingLimitOptionsByGame,
  type BettingLimitsByGame,
  type BettingLimitRangeKey,
} from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const GAME_IDS = [...BETTING_LIMIT_MANAGED_GAME_IDS];

export function normalizeStoredBettingLimits(
  limits: unknown,
  fallbackLevel?: unknown,
): BettingLimitsByGame {
  const normalized = normalizeBettingLimitsByGame(limits);
  const fallback = normalizeBettingLimitRangeKey(fallbackLevel);
  return Object.fromEntries(GAME_IDS.map((gameId) => [gameId, normalized[gameId] ?? fallback]));
}

export function normalizeStoredAgentBettingLimitOptions(
  limits: unknown,
  fallbackLevel?: unknown,
): BettingLimitOptionsByGame {
  const normalized = normalizeBettingLimitOptionsByGame(limits);
  const fallback = bettingLimitRangesAtOrBelow(fallbackLevel);
  return Object.fromEntries(
    GAME_IDS.map((gameId) => [gameId, normalized[gameId]?.length ? normalized[gameId] : fallback]),
  );
}

export function resolveDefaultChildBettingLimitLevel(parentLevel: unknown): BettingLimitRangeKey {
  return resolveDefaultChildBettingLimitRange(parentLevel);
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

export function resolveRequestedAgentBettingLimitOptions(
  requestedLimits: unknown,
  requestedLevel: unknown,
  parentLimits: unknown,
  parentLevel: unknown,
): BettingLimitOptionsByGame {
  if (requestedLimits && typeof requestedLimits === 'object' && !Array.isArray(requestedLimits)) {
    const normalized = normalizeBettingLimitOptionsByGame(requestedLimits);
    const parent = normalizeStoredAgentBettingLimitOptions(parentLimits, parentLevel);
    return Object.fromEntries(
      GAME_IDS.map((gameId) => {
        const requested = normalized[gameId];
        return [
          gameId,
          requested && requested.length > 0
            ? requested
            : (parent[gameId] ?? bettingLimitRangesAtOrBelow(parentLevel)),
        ];
      }),
    );
  }
  if (requestedLevel !== undefined) {
    const ranges = bettingLimitRangesAtOrBelow(requestedLevel);
    return Object.fromEntries(GAME_IDS.map((gameId) => [gameId, ranges]));
  }
  return normalizeStoredAgentBettingLimitOptions(parentLimits, parentLevel);
}

export function assertBettingLimitsWithinParent(
  childLimits: unknown,
  childLevel: unknown,
  parentLimits: unknown,
  parentLevel: unknown,
): void {
  const child = normalizeStoredBettingLimits(childLimits, childLevel);
  const parent = normalizeStoredAgentBettingLimitOptions(parentLimits, parentLevel);
  const violation = GAME_IDS.find(
    (gameId) => !isBettingLimitOptionAllowed(child[gameId], parent[gameId] ?? []),
  );
  if (violation) {
    const game = GAMES_REGISTRY[violation];
    throw new ApiError(
      'HIERARCHY_VIOLATION',
      `${game?.nameZh ?? violation} 的限紅不在上級授權方案內。`,
    );
  }
}

export function assertAgentBettingLimitOptionsWithinParent(
  childLimits: unknown,
  childLevel: unknown,
  parentLimits: unknown,
  parentLevel: unknown,
): void {
  const child = normalizeStoredAgentBettingLimitOptions(childLimits, childLevel);
  const parent = normalizeStoredAgentBettingLimitOptions(parentLimits, parentLevel);
  const violation = GAME_IDS.find((gameId) => {
    const allowed = parent[gameId] ?? [];
    return (child[gameId] ?? []).some((range) => !isBettingLimitOptionAllowed(range, allowed));
  });
  if (violation) {
    const game = GAMES_REGISTRY[violation];
    throw new ApiError(
      'HIERARCHY_VIOLATION',
      `${game?.nameZh ?? violation} 含有上級未授權的限紅方案。`,
    );
  }
}
