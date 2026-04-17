import { hmacIntStream } from './hmac.js';

export const KENO_POOL_SIZE = 40;
export const KENO_DRAW_COUNT = 10;
export const KENO_MIN_PICKS = 1;
export const KENO_MAX_PICKS = 10;

export type KenoRisk = 'low' | 'medium' | 'high';

/**
 * Draw KENO_DRAW_COUNT unique numbers from 1..KENO_POOL_SIZE using Fisher-Yates.
 */
export function kenoDraw(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number[] {
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
 * Payout table (multiplier) by (risk, picks, hits).
 * These are battle-tested Stake-style tables; House edge ≈ 3-5%.
 */
const PAYOUT_TABLE: Record<KenoRisk, number[][]> = {
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
