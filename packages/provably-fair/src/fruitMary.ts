import { hmacFloatStream } from './hmac.js';
export type FruitMaryBetId = 4 | 16 | 20 | 8 | 2 | 19 | 13 | 5;

export interface FruitMaryBetSelection {
  fruitId: FruitMaryBetId;
  units: number;
}

export interface FruitMaryOutcome {
  legacyType: number;
  positions: number[];
  payoutByPosition: number[];
  totalPayoutUnits: number;
  presentation:
    | 'normal'
    | 'small-triple'
    | 'big-triple'
    | 'four-happiness'
    | 'flower-rain'
    | 'eight-dragons'
    | 'stumble'
    | 'train'
    | 'grand-slam'
    | 'fail';
}

export const FRUIT_MARY_POSITION_MULTIPLIERS: Readonly<Record<number, number>> = {
  1: 10,
  2: 20,
  3: 50,
  4: 120,
  5: 5,
  6: 2,
  7: 15,
  8: 20,
  9: 2,
  10: 0,
  11: 5,
  12: 2,
  13: 10,
  14: 20,
  15: 2,
  16: 40,
  17: 5,
  18: 2,
  19: 15,
  20: 30,
  21: 2,
  22: 0,
  23: 5,
  24: 2,
};

export const FRUIT_MARY_POSITION_BET_IDS: Readonly<Record<number, FruitMaryBetId | 0>> = {
  1: 13,
  2: 2,
  3: 4,
  4: 4,
  5: 5,
  6: 5,
  7: 19,
  8: 8,
  9: 8,
  10: 0,
  11: 5,
  12: 13,
  13: 13,
  14: 2,
  15: 16,
  16: 16,
  17: 5,
  18: 19,
  19: 19,
  20: 20,
  21: 20,
  22: 0,
  23: 5,
  24: 2,
};

export const FRUIT_MARY_PAYOUT_POSITIONS = Object.freeze(
  Array.from({ length: 24 }, (_, index) => index + 1).filter(
    (position) => FRUIT_MARY_POSITION_MULTIPLIERS[position]! > 0,
  ),
);

const FOUR_HAPPINESS_PROBABILITY = 0.0005;
const GRAND_SLAM_PROBABILITY = 0.00002;
const GRAND_SLAM_POSITIONS = [10, ...FRUIT_MARY_PAYOUT_POSITIONS] as const;
const FOUR_HAPPINESS_POSITIONS = [10, 23, 11, 5, 17] as const;

function categoryPositionProbability(
  positions: readonly number[],
  fourHappinessPayoutUnits = 0,
): number {
  const categoryPayoutUnits = positions.reduce(
    (total, position) => total + (FRUIT_MARY_POSITION_MULTIPLIERS[position] ?? 0),
    0,
  );
  return (
    (0.96 -
      GRAND_SLAM_PROBABILITY * categoryPayoutUnits -
      FOUR_HAPPINESS_PROBABILITY * fourHappinessPayoutUnits) /
    categoryPayoutUnits
  );
}

const CATEGORY_POSITIONS = [
  [3, 4],
  [15, 16],
  [20, 21],
  [8, 9],
  [2, 14, 24],
  [7, 18, 19],
  [1, 12, 13],
  [5, 6, 11, 17, 23],
] as const;
const POSITION_LANDING_PROBABILITY = new Map<number, number>();
for (const positions of CATEGORY_POSITIONS) {
  const isApple = positions[0] === 5;
  const probability = categoryPositionProbability(positions, isApple ? 20 : 0);
  for (const position of positions) POSITION_LANDING_PROBABILITY.set(position, probability);
}

const LANDING_WEIGHTS = FRUIT_MARY_PAYOUT_POSITIONS.map((position) => ({
  position,
  probability: POSITION_LANDING_PROBABILITY.get(position) ?? 0,
}));

export type FruitMaryRandomSource = () => number;

function randomSource(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): FruitMaryRandomSource {
  const stream = hmacFloatStream(serverSeed, clientSeed, nonce);
  return () => stream.next().value ?? 0;
}

function betMap(bets: readonly FruitMaryBetSelection[]): Map<number, number> {
  return new Map(bets.map((bet) => [bet.fruitId, bet.units]));
}

function payoutForPositions(
  positions: readonly number[],
  bets: readonly FruitMaryBetSelection[],
): { payoutByPosition: number[]; totalPayoutUnits: number } {
  const amounts = betMap(bets);
  const payoutByPosition = positions.map((position) => {
    const fruitId = FRUIT_MARY_POSITION_BET_IDS[position] ?? 0;
    const multiplier = FRUIT_MARY_POSITION_MULTIPLIERS[position] ?? 0;
    return fruitId === 0 ? 0 : (amounts.get(fruitId) ?? 0) * multiplier;
  });
  return {
    payoutByPosition,
    totalPayoutUnits: payoutByPosition.reduce((total, payout) => total + payout, 0),
  };
}

function presentationFor(legacyType: number): FruitMaryOutcome['presentation'] {
  return (
    (
      [
        'normal',
        'small-triple',
        'big-triple',
        'four-happiness',
        'flower-rain',
        'eight-dragons',
        'stumble',
        'train',
        'grand-slam',
        'fail',
      ] as const
    )[legacyType] ?? 'normal'
  );
}

function outcome(
  legacyType: number,
  positions: readonly number[],
  bets: readonly FruitMaryBetSelection[],
): FruitMaryOutcome {
  const payout = payoutForPositions(positions, bets);
  return {
    legacyType,
    positions: [...positions],
    ...payout,
    presentation: presentationFor(legacyType),
  };
}

function decoratedLanding(
  position: number,
  bets: readonly FruitMaryBetSelection[],
  rng: FruitMaryRandomSource,
): FruitMaryOutcome {
  const roll = rng();
  let legacyType = 0;
  if (roll < 0.008) legacyType = 1;
  else if (roll < 0.014) legacyType = 2;
  else if (roll < 0.02) legacyType = 4;
  else if (roll < 0.024) legacyType = 5;
  else if (roll < 0.032) legacyType = 6;
  else if (roll < 0.038) legacyType = 7;
  if (legacyType === 0) return outcome(0, [position], bets);

  // A lucky landing in the source client is a short sequence, not a second
  // single landing. Keep the selected payout unchanged by using unbet symbols
  // as presentation hops, then finish on the authoritative landing. Players
  // therefore see two or three lights after LUCKY without changing RTP.
  const activeBetIds = new Set(bets.filter((bet) => bet.units > 0).map((bet) => bet.fruitId));
  const safeHops = FRUIT_MARY_PAYOUT_POSITIONS.filter((candidate) => {
    const betId = FRUIT_MARY_POSITION_BET_IDS[candidate] ?? 0;
    return candidate !== position && betId !== 0 && !activeBetIds.has(betId);
  });
  const resultCount = rng() < 0.5 ? 2 : 3;
  const intermediateCount = resultCount - 1;
  const intermediate: number[] = [];
  while (intermediate.length < intermediateCount) {
    if (safeHops.length === 0) {
      intermediate.push(intermediate.length % 2 === 0 ? 10 : 22);
      continue;
    }
    const index = Math.floor(rng() * safeHops.length);
    intermediate.push(safeHops.splice(Math.min(index, safeHops.length - 1), 1)[0]!);
  }
  return outcome(legacyType, [position <= 10 ? 22 : 10, ...intermediate, position], bets);
}

export function fruitMarySpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bets: readonly FruitMaryBetSelection[],
): FruitMaryOutcome {
  const rng = randomSource(serverSeed, clientSeed, nonce);
  let cursor = rng();

  if (cursor < GRAND_SLAM_PROBABILITY) {
    return outcome(8, GRAND_SLAM_POSITIONS, bets);
  }
  cursor -= GRAND_SLAM_PROBABILITY;
  if (cursor < FOUR_HAPPINESS_PROBABILITY) {
    return outcome(3, FOUR_HAPPINESS_POSITIONS, bets);
  }
  cursor -= FOUR_HAPPINESS_PROBABILITY;

  for (const landing of LANDING_WEIGHTS) {
    if (cursor < landing.probability) return decoratedLanding(landing.position, bets, rng);
    cursor -= landing.probability;
  }

  const lossPosition = rng() < 0.5 ? 10 : 22;
  return outcome(rng() < 0.25 ? 9 : 0, [lossPosition], bets);
}

export function fruitMaryOutcomeForPosition(
  position: number,
  bets: readonly FruitMaryBetSelection[],
): FruitMaryOutcome {
  if (!Number.isInteger(position) || position < 1 || position > 24) {
    throw new Error('Fruit Mary position must be an integer from 1 to 24');
  }
  return outcome(0, [position], bets);
}

export function fruitMaryOutcomeForPresentation(
  legacyType: number,
  positions: readonly number[],
  bets: readonly FruitMaryBetSelection[],
): FruitMaryOutcome {
  if (!Number.isInteger(legacyType) || legacyType < 0 || legacyType > 9) {
    throw new Error('Fruit Mary legacy type must be an integer from 0 to 9');
  }
  if (
    positions.length === 0 ||
    positions.some((position) => !Number.isInteger(position) || position < 1 || position > 24)
  ) {
    throw new Error('Fruit Mary positions must contain integers from 1 to 24');
  }
  return outcome(legacyType, positions, bets);
}

export function fruitMaryTheoreticalRtp(fruitId: FruitMaryBetId): number {
  const oneUnitBet: FruitMaryBetSelection[] = [{ fruitId, units: 1 }];
  let expected =
    GRAND_SLAM_PROBABILITY * outcome(8, GRAND_SLAM_POSITIONS, oneUnitBet).totalPayoutUnits +
    FOUR_HAPPINESS_PROBABILITY * outcome(3, FOUR_HAPPINESS_POSITIONS, oneUnitBet).totalPayoutUnits;
  for (const landing of LANDING_WEIGHTS) {
    expected += landing.probability * outcome(0, [landing.position], oneUnitBet).totalPayoutUnits;
  }
  return expected;
}

export function fruitMaryGamble(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  choice: 1 | 2,
): { number: number; won: boolean } {
  const number = Math.floor(randomSource(serverSeed, clientSeed, nonce)() * 14) + 1;
  return { number, won: choice === 1 ? number < 8 : number >= 8 };
}
