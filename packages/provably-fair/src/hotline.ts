import { hmacIntStream } from './hmac.js';

export const HOTLINE_REELS = 5;
export const HOTLINE_ROWS = 3;

// 符號池：權重決定出現率（Stake-style 類 slot）
// 索引 => 名稱
export const HOTLINE_SYMBOLS = [
  { name: 'CHERRY', weight: 20, payout3: 2, payout4: 5, payout5: 10 },
  { name: 'BELL', weight: 15, payout3: 3, payout4: 8, payout5: 20 },
  { name: 'SEVEN', weight: 10, payout3: 5, payout4: 15, payout5: 50 },
  { name: 'BAR', weight: 8, payout3: 10, payout4: 30, payout5: 100 },
  { name: 'DIAMOND', weight: 5, payout3: 20, payout4: 80, payout5: 300 },
  { name: 'JACKPOT', weight: 2, payout3: 50, payout4: 250, payout5: 1000 },
] as const;

export type HotlineSymbol = (typeof HOTLINE_SYMBOLS)[number];

const TOTAL_WEIGHT = HOTLINE_SYMBOLS.reduce((s, x) => s + x.weight, 0);

function pickSymbol(rand01: number): number {
  let accum = 0;
  const target = rand01 * TOTAL_WEIGHT;
  for (let i = 0; i < HOTLINE_SYMBOLS.length; i += 1) {
    accum += HOTLINE_SYMBOLS[i]!.weight;
    if (target < accum) return i;
  }
  return HOTLINE_SYMBOLS.length - 1;
}

/**
 * Grid is [reel][row], each entry is symbol index.
 */
export function hotlineSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): number[][] {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const grid: number[][] = [];
  for (let r = 0; r < HOTLINE_REELS; r += 1) {
    const col: number[] = [];
    for (let y = 0; y < HOTLINE_ROWS; y += 1) {
      const v = stream.next().value as number;
      col.push(pickSymbol(v / 0x1_0000_0000));
    }
    grid.push(col);
  }
  return grid;
}

export interface HotlineWinLine {
  lineId: string;
  path: number[];
  row: number;
  symbol: number;
  count: number;
  payout: number; // multiplier (0 if none)
}

export const HOTLINE_PAYLINES = [
  { id: 'top', path: [0, 0, 0, 0, 0] },
  { id: 'middle', path: [1, 1, 1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2, 2, 2] },
  { id: 'v-down', path: [0, 1, 2, 1, 0] },
  { id: 'v-up', path: [2, 1, 0, 1, 2] },
] as const;

/**
 * Hotline: evaluate five classic paylines from left to right.
 * A line wins when the first three or more reels match on the same payline.
 */
export function hotlineEvaluate(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (const payline of HOTLINE_PAYLINES) {
    const firstRow = payline.path[0]!;
    const firstSymbol = grid[0]?.[firstRow];
    if (firstSymbol === undefined) continue;
    let count = 1;
    for (let reel = 1; reel < HOTLINE_REELS; reel += 1) {
      if (grid[reel]?.[payline.path[reel]!] === firstSymbol) count += 1;
      else break;
    }
    if (count >= 3) {
      const sym = HOTLINE_SYMBOLS[firstSymbol]!;
      const payout =
        count === 5 ? sym.payout5 : count === 4 ? sym.payout4 : sym.payout3;
      lines.push({
        lineId: payline.id,
        path: [...payline.path],
        row: firstRow,
        symbol: firstSymbol,
        count,
        payout,
      });
      totalMultiplier += payout;
    }
  }

  return { lines, totalMultiplier };
}
