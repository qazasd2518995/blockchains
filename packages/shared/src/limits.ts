export const MIN_BET_AMOUNT = 1;
export const MAX_BET_AMOUNT = 100000;
export const ROULETTE_MAX_BET_LINES = 10;
export const PLINKO_MAX_BALLS = 20;

export const BETTING_LIMIT_RANGE_OPTIONS = [
  { key: 'range_1_500', label: '1-500', min: 1, max: 500, rank: 0 },
  { key: 'range_50_1000', label: '50-1000', min: 50, max: 1000, rank: 1 },
  { key: 'range_100_2000', label: '100-2000', min: 100, max: 2000, rank: 2 },
  { key: 'range_10_3000', label: '基本款 10-3000', min: 10, max: 3000, rank: 2.5 },
  { key: 'range_10_5000', label: '基本款 10-5000', min: 10, max: 5000, rank: 3 },
  { key: 'range_500_5000', label: '500-5000', min: 500, max: 5000, rank: 3 },
  { key: 'range_100_10000', label: '100-10000', min: 100, max: 10000, rank: 4 },
  { key: 'range_1000_10000', label: '1000-10000', min: 1000, max: 10000, rank: 4 },
  { key: 'range_5000_50000', label: '5000-50000', min: 5000, max: 50000, rank: 5 },
] as const;

export type BettingLimitRangeKey = (typeof BETTING_LIMIT_RANGE_OPTIONS)[number]['key'];
export type BettingLimitsByGame = Record<string, BettingLimitRangeKey>;
export type BettingLimitOptionsByGame = Record<string, BettingLimitRangeKey[]>;

export const DEFAULT_BETTING_LIMIT_RANGE: BettingLimitRangeKey = 'range_10_3000';

const RANGE_BY_KEY = new Map<BettingLimitRangeKey, (typeof BETTING_LIMIT_RANGE_OPTIONS)[number]>(
  BETTING_LIMIT_RANGE_OPTIONS.map((option) => [option.key, option]),
);

const LEGACY_BETTING_LIMIT_TO_RANGE: Record<string, BettingLimitRangeKey> = {
  level1: 'range_1_500',
  level2: 'range_50_1000',
  level3: 'range_100_2000',
  level4: 'range_1000_10000',
  level5: 'range_5000_50000',
  unlimited: 'range_5000_50000',
};

export function normalizeBettingLimitRangeKey(value: unknown): BettingLimitRangeKey {
  if (typeof value === 'string') {
    if (RANGE_BY_KEY.has(value as BettingLimitRangeKey)) return value as BettingLimitRangeKey;
    return LEGACY_BETTING_LIMIT_TO_RANGE[value] ?? DEFAULT_BETTING_LIMIT_RANGE;
  }
  return DEFAULT_BETTING_LIMIT_RANGE;
}

export function resolveBettingLimitRange(
  value: unknown,
): (typeof BETTING_LIMIT_RANGE_OPTIONS)[number] {
  return (
    RANGE_BY_KEY.get(normalizeBettingLimitRangeKey(value)) ??
    RANGE_BY_KEY.get(DEFAULT_BETTING_LIMIT_RANGE)!
  );
}

export function normalizeBettingLimitsByGame(value: unknown): BettingLimitsByGame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([gameId]) => typeof gameId === 'string' && gameId.length > 0)
      .map(([gameId, range]) => [
        gameId,
        normalizeBettingLimitRangeKey(Array.isArray(range) ? range[0] : range),
      ]),
  );
}

export function normalizeBettingLimitOptionsByGame(value: unknown): BettingLimitOptionsByGame {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([gameId]) => typeof gameId === 'string' && gameId.length > 0)
      .map(([gameId, ranges]) => {
        if (Array.isArray(ranges)) {
          const normalized = Array.from(
            new Set(ranges.map((range) => normalizeBettingLimitRangeKey(range))),
          );
          return [gameId, normalized];
        }
        return [gameId, bettingLimitRangesAtOrBelow(ranges)];
      }),
  );
}

export function bettingLimitRangesAtOrBelow(value: unknown): BettingLimitRangeKey[] {
  const rank = resolveBettingLimitRange(value).rank;
  return BETTING_LIMIT_RANGE_OPTIONS.filter((option) => option.rank <= rank).map(
    (option) => option.key,
  );
}

export function isBettingLimitOptionAllowed(
  selectedRange: unknown,
  allowedRanges: readonly unknown[],
): boolean {
  const selected = normalizeBettingLimitRangeKey(selectedRange);
  return allowedRanges.some((range) => normalizeBettingLimitRangeKey(range) === selected);
}

export function getBettingLimitForGame(
  limits: unknown,
  gameId: string | undefined,
  fallbackLevel?: unknown,
): (typeof BETTING_LIMIT_RANGE_OPTIONS)[number] {
  const normalized = normalizeBettingLimitsByGame(limits);
  const key = gameId ? normalized[gameId] : undefined;
  return resolveBettingLimitRange(key ?? fallbackLevel);
}

export function isBettingLimitWithinParent(childRange: unknown, parentRange: unknown): boolean {
  return resolveBettingLimitRange(childRange).rank <= resolveBettingLimitRange(parentRange).rank;
}

export function resolveDefaultChildBettingLimitRange(parentRange: unknown): BettingLimitRangeKey {
  const normalizedParent = normalizeBettingLimitRangeKey(parentRange);
  return isBettingLimitWithinParent(DEFAULT_BETTING_LIMIT_RANGE, normalizedParent)
    ? DEFAULT_BETTING_LIMIT_RANGE
    : normalizedParent;
}
