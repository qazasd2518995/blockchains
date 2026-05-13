import { Prisma } from '@prisma/client';
import { GameId } from '@bg/shared';

const ZERO = new Prisma.Decimal(0);
const ROULETTE_GAME_IDS = [GameId.MINI_ROULETTE, GameId.CARNIVAL] as const;
const ROULETTE_GAME_ID_SET = new Set<string>(ROULETTE_GAME_IDS);
const STRAIGHT_SLOT_COUNT = 13;

type StoredRouletteBet = {
  type?: unknown;
  value?: unknown;
  amount?: unknown;
};

type BetForEffectiveAmount = {
  gameId: string;
  amount: Prisma.Decimal;
  resultData: Prisma.JsonValue | null;
};

export function includesHedgedTurnoverGame(gameId?: string | string[] | null): boolean {
  if (!gameId) return true;
  if (Array.isArray(gameId)) return gameId.some((id) => ROULETTE_GAME_ID_SET.has(id));
  return ROULETTE_GAME_ID_SET.has(gameId);
}

export function getHedgedTurnoverGameFilter(gameId?: string | string[]): string | string[] {
  if (!gameId) return [...ROULETTE_GAME_IDS];
  if (Array.isArray(gameId)) return gameId.filter((id) => ROULETTE_GAME_ID_SET.has(id));
  return gameId;
}

export function effectiveBetAmountForReport(bet: BetForEffectiveAmount): Prisma.Decimal {
  if (!ROULETTE_GAME_ID_SET.has(bet.gameId)) return bet.amount;
  const lineBets = extractRouletteBets(bet.resultData);
  if (!lineBets) return bet.amount;

  const effective = calculateRouletteEffectiveTurnover(lineBets);
  if (effective.lessThanOrEqualTo(0)) return ZERO;
  return effective.greaterThan(bet.amount) ? bet.amount : effective;
}

export function calculateRouletteEffectiveTurnover(lineBets: StoredRouletteBet[]): Prisma.Decimal {
  let gross = ZERO;
  const groups = {
    red: ZERO,
    black: ZERO,
    odd: ZERO,
    even: ZERO,
    low: ZERO,
    high: ZERO,
  };
  const columns = [ZERO, ZERO, ZERO, ZERO];
  const straights = Array.from({ length: STRAIGHT_SLOT_COUNT }, () => ZERO);

  for (const bet of lineBets) {
    const amount = parsePositiveDecimal(bet.amount);
    if (!amount) continue;
    gross = gross.add(amount);

    switch (bet.type) {
      case 'red':
      case 'black':
      case 'odd':
      case 'even':
      case 'low':
      case 'high':
        groups[bet.type] = groups[bet.type].add(amount);
        break;
      case 'column': {
        const value = parseInteger(bet.value);
        if (value >= 1 && value <= 3) columns[value] = (columns[value] ?? ZERO).add(amount);
        break;
      }
      case 'straight': {
        const value = parseInteger(bet.value);
        if (value >= 0 && value < STRAIGHT_SLOT_COUNT) {
          straights[value] = (straights[value] ?? ZERO).add(amount);
        }
        break;
      }
    }
  }

  let hedged = ZERO;
  hedged = hedged.add(matchedPairAmount(groups.red, groups.black));
  hedged = hedged.add(matchedPairAmount(groups.odd, groups.even));
  hedged = hedged.add(matchedPairAmount(groups.low, groups.high));

  const columnMatched = decimalMin(columns.slice(1));
  hedged = hedged.add(columnMatched.mul(3));

  const allStraightMatched = decimalMin(straights);
  if (allStraightMatched.greaterThan(0)) {
    hedged = hedged.add(allStraightMatched.mul(STRAIGHT_SLOT_COUNT));
  }
  const remainingStraights = straights.map((amount) => amount.sub(allStraightMatched));
  const nonZeroStraightMatched = decimalMin(remainingStraights.slice(1));
  hedged = hedged.add(nonZeroStraightMatched.mul(STRAIGHT_SLOT_COUNT - 1));

  const effective = gross.sub(hedged);
  return effective.greaterThan(0) ? effective : ZERO;
}

function extractRouletteBets(resultData: Prisma.JsonValue | null): StoredRouletteBet[] | null {
  if (!resultData || typeof resultData !== 'object' || Array.isArray(resultData)) return null;
  const bets = (resultData as { bets?: unknown }).bets;
  if (!Array.isArray(bets)) return null;
  return bets.filter((bet): bet is StoredRouletteBet => Boolean(bet && typeof bet === 'object'));
}

function parsePositiveDecimal(value: unknown): Prisma.Decimal | null {
  if (value === null || value === undefined) return null;
  try {
    const parsed = new Prisma.Decimal(String(value));
    return parsed.greaterThan(0) ? parsed : null;
  } catch {
    return null;
  }
}

function parseInteger(value: unknown): number {
  if (typeof value === 'number' && Number.isInteger(value)) return value;
  if (typeof value === 'string' && /^-?\d+$/.test(value)) return Number.parseInt(value, 10);
  return Number.NaN;
}

function matchedPairAmount(a: Prisma.Decimal, b: Prisma.Decimal): Prisma.Decimal {
  return decimalMin([a, b]).mul(2);
}

function decimalMin(values: Prisma.Decimal[]): Prisma.Decimal {
  if (values.length === 0) return ZERO;
  return values.reduce((min, value) => (value.lessThan(min) ? value : min), values[0] ?? ZERO);
}
