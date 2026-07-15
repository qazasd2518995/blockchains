import { hmacIntStream } from './hmac.js';

export const KENO_POOL_SIZE = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MIN_PICKS = 1;
export const KENO_MAX_PICKS = 10;

export type KenoRisk = 'low' | 'medium' | 'high';

/**
 * Draw KENO_DRAW_COUNT unique numbers from 1..KENO_POOL_SIZE using Fisher-Yates.
 */
export function kenoDraw(serverSeed: string, clientSeed: string, nonce: number): number[] {
  const pool = Array.from({ length: KENO_POOL_SIZE }, (_, i) => i + 1);
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  for (let i = KENO_POOL_SIZE - 1; i > 0; i -= 1) {
    const r = stream.next().value as number;
    const j = r % (i + 1);
    const a = pool[i] as number;
    const b = pool[j] as number;
    pool[i] = b;
    pool[j] = a;
  }
  return pool.slice(0, KENO_DRAW_COUNT).sort((a, b) => a - b);
}

/**
 * Original payout table (multiplier) by (risk, picks, hits).
 *
 * Most rows used zero for every losing hit count. That made controlled losses
 * unnecessarily all-or-nothing. The public table below is derived from this
 * baseline by adding partial-loss outcomes while preserving each row's
 * original expected return.
 */
const BASE_PAYOUT_TABLE: Record<KenoRisk, number[][]> = {
  // [picks - 1][hits]
  low: [
    [0.7, 1.85],
    [0, 2, 3.8],
    [0, 1.1, 1.38, 26],
    [0, 0, 2.2, 7.9, 90],
    [0, 0, 1.5, 4.2, 13, 300],
    [0, 0, 1.1, 2, 6.2, 100, 700],
    [0, 0, 1.1, 1.6, 3.5, 15, 225, 700],
    [0, 0, 1.1, 1.5, 2, 5.5, 39, 100, 800],
    [0, 0, 1.1, 1.3, 1.7, 2.5, 7.5, 50, 250, 1000],
    [0, 0, 1.1, 1.2, 1.3, 1.8, 3.5, 13, 50, 250, 1000],
  ],
  medium: [
    [0.4, 2.75],
    [0, 1.8, 5.1],
    [0, 0, 2.8, 50],
    [0, 0, 1.7, 10, 100],
    [0, 0, 1.4, 4, 14, 390],
    [0, 0, 0, 3, 9, 180, 710],
    [0, 0, 0, 2, 7, 30, 400, 800],
    [0, 0, 0, 2, 4, 11, 67, 400, 900],
    [0, 0, 0, 2, 2.5, 5, 15, 100, 500, 1000],
    [0, 0, 0, 1.4, 2.2, 4, 10, 26, 100, 500, 1000],
  ],
  high: [
    [0, 3.96],
    [0, 0, 17.1],
    [0, 0, 0, 81.5],
    [0, 0, 0, 10, 259],
    [0, 0, 0, 4.5, 48, 450],
    [0, 0, 0, 0, 11, 350, 710],
    [0, 0, 0, 0, 7, 90, 400, 800],
    [0, 0, 0, 0, 5, 20, 270, 600, 900],
    [0, 0, 0, 0, 4, 11, 56, 500, 800, 1000],
    [0, 0, 0, 0, 3.5, 8, 13, 63, 500, 800, 1000],
  ],
};

const PARTIAL_LOSS_LADDERS: Record<KenoRisk, Record<number, readonly number[]>> = {
  low: {
    1: [0.7],
    2: [0, 0.7],
  },
  medium: {
    1: [0.4],
    2: [0, 0.6],
    3: [0, 0.25, 0.65],
  },
  high: {
    1: [0.2],
    2: [0, 0.5],
    3: [0, 0.2, 0.55],
    4: [0, 0.15, 0.35, 0.65],
  },
};

const MIN_WIN_MULTIPLIER = 1.01;

/**
 * Keep Keno's existing RTP while turning otherwise identical zero-payout hit
 * counts into a natural spread of soft, partial, and full losses. The added
 * losing-side return is funded proportionally from the portion of winning
 * multipliers above 1.01x, so a historical win never becomes a loss.
 */
const PAYOUT_TABLE: Record<KenoRisk, number[][]> = {
  low: BASE_PAYOUT_TABLE.low.map((row, index) => shapePayoutRow('low', index + 1, row)),
  medium: BASE_PAYOUT_TABLE.medium.map((row, index) => shapePayoutRow('medium', index + 1, row)),
  high: BASE_PAYOUT_TABLE.high.map((row, index) => shapePayoutRow('high', index + 1, row)),
};

function shapePayoutRow(risk: KenoRisk, picks: number, baseRow: number[]): number[] {
  const probabilities = baseRow.map((_, hits) => kenoHitProbability(picks, hits));
  const zeroCount = baseRow.filter((multiplier) => multiplier === 0).length;
  const lossLadder = PARTIAL_LOSS_LADDERS[risk][zeroCount] ?? [];
  let zeroIndex = 0;
  const shaped = baseRow.map((multiplier) => {
    if (multiplier !== 0) return multiplier;
    const replacement = lossLadder[zeroIndex] ?? 0;
    zeroIndex += 1;
    return replacement;
  });

  const addedExpectedReturn = shaped.reduce((sum, multiplier, hits) => {
    const baseMultiplier = baseRow[hits] ?? 0;
    return sum + Math.max(0, multiplier - baseMultiplier) * (probabilities[hits] ?? 0);
  }, 0);
  const reducibleExpectedReturn = baseRow.reduce((sum, multiplier, hits) => {
    if (multiplier <= MIN_WIN_MULTIPLIER) return sum;
    return sum + (multiplier - MIN_WIN_MULTIPLIER) * (probabilities[hits] ?? 0);
  }, 0);
  const winnerSurplusFactor =
    reducibleExpectedReturn > 0
      ? Math.max(0, 1 - addedExpectedReturn / reducibleExpectedReturn)
      : 1;

  return shaped.map((multiplier, hits) => {
    const baseMultiplier = baseRow[hits] ?? 0;
    const adjusted =
      baseMultiplier > MIN_WIN_MULTIPLIER
        ? MIN_WIN_MULTIPLIER + (baseMultiplier - MIN_WIN_MULTIPLIER) * winnerSurplusFactor
        : multiplier;
    return Math.floor(adjusted * 10000) / 10000;
  });
}

function kenoHitProbability(picks: number, hits: number): number {
  if (hits < 0 || hits > picks || hits > KENO_DRAW_COUNT) return 0;
  const misses = KENO_DRAW_COUNT - hits;
  if (misses > KENO_POOL_SIZE - picks) return 0;
  return (
    (combination(picks, hits) * combination(KENO_POOL_SIZE - picks, misses)) /
    combination(KENO_POOL_SIZE, KENO_DRAW_COUNT)
  );
}

function combination(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  const count = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= count; index += 1) {
    result = (result * (n - count + index)) / index;
  }
  return result;
}

export function kenoMultiplier(risk: KenoRisk, picks: number, hits: number): number {
  const table = PAYOUT_TABLE[risk];
  const row = table[picks - 1];
  if (!row) return 0;
  const raw = row[hits] ?? 0;
  return Math.floor(raw * 10000) / 10000;
}

export function kenoEvaluate(
  drawn: number[],
  selected: number[],
): { hits: number[]; misses: number[] } {
  const drawnSet = new Set(drawn);
  const hits: number[] = [];
  const misses: number[] = [];
  for (const pick of selected) {
    if (drawnSet.has(pick)) hits.push(pick);
    else misses.push(pick);
  }
  return { hits, misses };
}
