import { hmacIntStream } from './hmac.js';

export const MINES_GRID_SIZE = 25;
export const MINES_MIN_COUNT = 1;
export const MINES_MAX_COUNT = 24;
export const MINES_HOUSE_EDGE = 0.03;

export function minesPositions(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  mineCount: number,
): number[] {
  if (mineCount < MINES_MIN_COUNT || mineCount > MINES_MAX_COUNT) {
    throw new Error(
      `Mine count ${mineCount} out of range [${MINES_MIN_COUNT}, ${MINES_MAX_COUNT}]`,
    );
  }
  const positions = Array.from({ length: MINES_GRID_SIZE }, (_, i) => i);
  const ints = hmacIntStream(serverSeed, clientSeed, nonce);

  for (let i = MINES_GRID_SIZE - 1; i > 0; i -= 1) {
    const next = ints.next();
    if (next.done) throw new Error('Mines HMAC stream exhausted');
    const j = next.value % (i + 1);
    const a = positions[i] as number;
    const b = positions[j] as number;
    positions[i] = b;
    positions[j] = a;
  }
  return positions.slice(0, mineCount).sort((a, b) => a - b);
}

function comb(n: number, k: number): number {
  if (k < 0 || k > n) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  const limit = Math.min(k, n - k);
  for (let i = 0; i < limit; i += 1) {
    result = (result * (n - i)) / (i + 1);
  }
  return result;
}

export function minesMultiplier(mineCount: number, gemsRevealed: number): number {
  if (gemsRevealed === 0) return 1;
  const safeCells = MINES_GRID_SIZE - mineCount;
  if (gemsRevealed > safeCells) {
    throw new Error(`Cannot reveal ${gemsRevealed} gems with ${safeCells} safe cells`);
  }
  const numerator = comb(MINES_GRID_SIZE, gemsRevealed);
  const denominator = comb(safeCells, gemsRevealed);
  const fair = numerator / denominator;
  const multiplier = (1 - MINES_HOUSE_EDGE) * fair;
  return Math.floor(multiplier * 10000) / 10000;
}

export function minesNextMultiplier(
  mineCount: number,
  gemsRevealed: number,
): number | null {
  const safeCells = MINES_GRID_SIZE - mineCount;
  if (gemsRevealed + 1 > safeCells) return null;
  return minesMultiplier(mineCount, gemsRevealed + 1);
}
