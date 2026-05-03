import { hmacIntStream } from './hmac.js';

export const HOTLINE_REELS = 5;
export const HOTLINE_MINI_REELS = 3;
export const HOTLINE_ROWS = 3;
export const HOTLINE_MEGA_REELS = 5;
export const HOTLINE_MEGA_ROWS = 6;
export const HOTLINE_MEGA_MAX_CASCADES = 6;
export const HOTLINE_3X3_GAME_IDS = new Set([
  'temple-slot',
  'candy-slot',
  'sakura-slot',
]);
export const HOTLINE_MEGA_GAME_IDS = new Set([
  'thunder-slot',
  'dragon-mega-slot',
  'nebula-slot',
  'jungle-slot',
  'vampire-slot',
]);

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

export const HOTLINE_MEGA_SYMBOLS = [
  { name: 'LOW_A', weight: 28, payout3: 0.03, payout4: 0.12, payout5: 0.45 },
  { name: 'LOW_B', weight: 23, payout3: 0.04, payout4: 0.18, payout5: 0.7 },
  { name: 'MID_A', weight: 18, payout3: 0.06, payout4: 0.3, payout5: 1.2 },
  { name: 'MID_B', weight: 13, payout3: 0.1, payout4: 0.55, payout5: 2.5 },
  { name: 'HIGH_A', weight: 8, payout3: 0.18, payout4: 1.2, payout5: 7 },
  { name: 'PREMIUM', weight: 3, payout3: 0.45, payout4: 4, payout5: 25 },
] as const;

export type HotlineSymbol = (typeof HOTLINE_SYMBOLS)[number] | (typeof HOTLINE_MEGA_SYMBOLS)[number];

function pickSymbol(rand01: number, symbols: readonly HotlineSymbol[]): number {
  const totalWeight = symbols.reduce((sum, symbol) => sum + symbol.weight, 0);
  let accum = 0;
  const target = rand01 * totalWeight;
  for (let i = 0; i < symbols.length; i += 1) {
    accum += symbols[i]!.weight;
    if (target < accum) return i;
  }
  return symbols.length - 1;
}

/**
 * Grid is [reel][row], each entry is symbol index.
 */
export function hotlineSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelCount = HOTLINE_REELS,
  rowCount = HOTLINE_ROWS,
): number[][] {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForRows(rowCount);
  const grid: number[][] = [];
  for (let r = 0; r < reelCount; r += 1) {
    const col: number[] = [];
    for (let y = 0; y < rowCount; y += 1) {
      const v = stream.next().value as number;
      col.push(pickSymbol(v / 0x1_0000_0000, symbols));
    }
    grid.push(col);
  }
  return grid;
}

export interface HotlineWinPosition {
  reel: number;
  row: number;
}

export interface HotlineCascadeStep {
  index: number;
  grid: number[][];
  lines: HotlineWinLine[];
  multiplier: number;
  removed: HotlineWinPosition[];
}

export interface HotlineCascadeResult {
  initialGrid: number[][];
  finalGrid: number[][];
  cascades: HotlineCascadeStep[];
  lines: HotlineWinLine[];
  totalMultiplier: number;
}

export interface HotlineWinLine {
  lineId: string;
  path: number[];
  startReel: number;
  direction: 'ltr' | 'rtl';
  row: number;
  symbol: number;
  count: number;
  payout: number; // multiplier (0 if none)
  ways?: number;
}

export function hotlineSpinCascades(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelCount = HOTLINE_MEGA_REELS,
  rowCount = HOTLINE_MEGA_ROWS,
  maxCascades = HOTLINE_MEGA_MAX_CASCADES,
): HotlineCascadeResult {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForRows(rowCount);
  const nextSymbol = (): number => {
    const v = stream.next().value as number;
    return pickSymbol(v / 0x1_0000_0000, symbols);
  };

  let grid = Array.from({ length: reelCount }, () =>
    Array.from({ length: rowCount }, () => nextSymbol()),
  );
  const initialGrid = cloneGrid(grid);
  const cascades: HotlineCascadeStep[] = [];
  const allLines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let index = 0; index < maxCascades; index += 1) {
    const evaluated = hotlineEvaluate(grid);
    if (evaluated.lines.length === 0 || evaluated.totalMultiplier <= 0) break;

    const removed = collectHotlineWinPositions(grid, evaluated.lines);
    if (removed.length === 0) break;

    cascades.push({
      index,
      grid: cloneGrid(grid),
      lines: evaluated.lines,
      multiplier: evaluated.totalMultiplier,
      removed,
    });
    allLines.push(...evaluated.lines);
    totalMultiplier += evaluated.totalMultiplier;
    grid = applyHotlineCascadeDrop(grid, removed, rowCount, nextSymbol);
  }

  return {
    initialGrid,
    finalGrid: cloneGrid(grid),
    cascades,
    lines: allLines,
    totalMultiplier: Number(totalMultiplier.toFixed(4)),
  };
}

export const HOTLINE_PAYLINES_5X3 = [
  { id: 'top', path: [0, 0, 0, 0, 0] },
  { id: 'middle', path: [1, 1, 1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2, 2, 2] },
  { id: 'v-down', path: [0, 1, 2, 1, 0] },
  { id: 'v-up', path: [2, 1, 0, 1, 2] },
] as const;

export const HOTLINE_PAYLINES_3X3 = [
  { id: 'top', path: [0, 0, 0] },
  { id: 'middle', path: [1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2] },
  { id: 'diag-down', path: [0, 1, 2] },
  { id: 'diag-up', path: [2, 1, 0] },
] as const;

export const HOTLINE_PAYLINES = HOTLINE_PAYLINES_5X3;

export function getHotlineReelCount(gameId?: string): number {
  if (gameId && HOTLINE_3X3_GAME_IDS.has(gameId)) return HOTLINE_MINI_REELS;
  if (gameId && HOTLINE_MEGA_GAME_IDS.has(gameId)) return HOTLINE_MEGA_REELS;
  return HOTLINE_REELS;
}

export function getHotlineRowCount(gameId?: string): number {
  return gameId && HOTLINE_MEGA_GAME_IDS.has(gameId) ? HOTLINE_MEGA_ROWS : HOTLINE_ROWS;
}

export function isHotlineMegaGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_MEGA_GAME_IDS.has(gameId));
}

function getHotlinePaylines(reelCount: number) {
  return reelCount === HOTLINE_MINI_REELS ? HOTLINE_PAYLINES_3X3 : HOTLINE_PAYLINES_5X3;
}

function getHotlineSymbolsForRows(rowCount: number): readonly HotlineSymbol[] {
  return rowCount >= HOTLINE_MEGA_ROWS ? HOTLINE_MEGA_SYMBOLS : HOTLINE_SYMBOLS;
}

function makeHotlineWinLine(
  payline: { id: string; path: readonly number[] },
  symbol: number,
  count: number,
  startReel: number,
  direction: 'ltr' | 'rtl',
): HotlineWinLine {
  const sym = HOTLINE_SYMBOLS[symbol]!;
  const payout =
    count === 5 ? sym.payout5 : count === 4 ? sym.payout4 : sym.payout3;
  return {
    lineId: payline.id,
    path: [...payline.path],
    startReel,
    direction,
    row: payline.path[startReel]!,
    symbol,
    count,
    payout,
  };
}

function evaluatePaylineEdge(
  grid: number[][],
  payline: { id: string; path: readonly number[] },
  reelCount: number,
  direction: 'ltr' | 'rtl',
): HotlineWinLine | null {
  const edgeReel = direction === 'ltr' ? 0 : reelCount - 1;
  const step = direction === 'ltr' ? 1 : -1;
  const symbol = grid[edgeReel]?.[payline.path[edgeReel]!];
  if (symbol === undefined) return null;

  let count = 1;
  for (let reel = edgeReel + step; reel >= 0 && reel < reelCount; reel += step) {
    if (grid[reel]?.[payline.path[reel]!] === symbol) count += 1;
    else break;
  }

  if (count < 3) return null;
  const startReel = direction === 'ltr' ? 0 : reelCount - count;
  return makeHotlineWinLine(payline, symbol, count, startReel, direction);
}

function isSamePaylineWin(a: HotlineWinLine, b: HotlineWinLine): boolean {
  return (
    a.lineId === b.lineId &&
    a.startReel === b.startReel &&
    a.symbol === b.symbol &&
    a.count === b.count
  );
}

/**
 * Hotline: evaluate fixed paylines from both outer edges.
 * This matches common "Both Ways" slots: symbols must be adjacent on a payline
 * and start from the leftmost or rightmost reel. Middle-only runs do not pay.
 */
export function hotlineEvaluate(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const rowCount = Math.max(...grid.map((col) => col.length), 0);
  if (rowCount >= HOTLINE_MEGA_ROWS) return hotlineEvaluateWays(grid);

  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;
  const reelCount = grid.length === HOTLINE_MINI_REELS ? HOTLINE_MINI_REELS : HOTLINE_REELS;
  const paylines = getHotlinePaylines(reelCount);

  for (const payline of paylines) {
    const leftWin = evaluatePaylineEdge(grid, payline, reelCount, 'ltr');
    const rightWin = evaluatePaylineEdge(grid, payline, reelCount, 'rtl');
    if (leftWin) {
      lines.push(leftWin);
      totalMultiplier += leftWin.payout;
    }
    if (rightWin && (!leftWin || !isSamePaylineWin(leftWin, rightWin))) {
      lines.push(rightWin);
      totalMultiplier += rightWin.payout;
    }
  }

  return { lines, totalMultiplier };
}

function hotlineEvaluateWays(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const reelCount = grid.length;
  const rowCount = Math.max(...grid.map((col) => col.length), 0);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let symbol = 0; symbol < HOTLINE_MEGA_SYMBOLS.length; symbol += 1) {
    const left = evaluateWaysEdge(grid, symbol, rowCount, 'ltr');
    const right = evaluateWaysEdge(grid, symbol, rowCount, 'rtl');
    if (left) {
      lines.push(left);
      totalMultiplier += left.payout;
    }
    if (
      right &&
      !lines.some((line) =>
        line.symbol === right.symbol &&
        line.startReel === right.startReel &&
        line.count === right.count,
      )
    ) {
      lines.push(right);
      totalMultiplier += right.payout;
    }
  }

  return {
    lines,
    totalMultiplier: Number(totalMultiplier.toFixed(4)),
  };

  function evaluateWaysEdge(
    sourceGrid: number[][],
    symbolIndex: number,
    rows: number,
    direction: 'ltr' | 'rtl',
  ): HotlineWinLine | null {
    const edgeReel = direction === 'ltr' ? 0 : reelCount - 1;
    const step = direction === 'ltr' ? 1 : -1;
    const path = Array.from({ length: reelCount }, () => 0);
    let count = 0;
    let ways = 1;

    for (let reel = edgeReel; reel >= 0 && reel < reelCount; reel += step) {
      const positions = sourceGrid[reel]
        ?.map((cell, row) => ({ cell, row }))
        .filter((item) => item.cell === symbolIndex)
        .map((item) => item.row) ?? [];
      if (positions.length === 0) break;
      path[reel] = Math.max(0, Math.min(rows - 1, positions[0] ?? 0));
      count += 1;
      ways *= positions.length;
    }

    if (count < 3) return null;
    const startReel = direction === 'ltr' ? 0 : reelCount - count;
    const symbolMeta = HOTLINE_MEGA_SYMBOLS[symbolIndex]!;
    const basePayout =
      count >= 5 ? symbolMeta.payout5 : count === 4 ? symbolMeta.payout4 : symbolMeta.payout3;
    return {
      lineId: `ways-${symbolIndex}-${direction}`,
      path,
      startReel,
      direction,
      row: path[startReel] ?? 0,
      symbol: symbolIndex,
      count,
      ways,
      payout: Number((basePayout * ways).toFixed(4)),
    };
  }
}

function cloneGrid(grid: number[][]): number[][] {
  return grid.map((col) => [...col]);
}

function collectHotlineWinPositions(
  grid: number[][],
  lines: HotlineWinLine[],
): HotlineWinPosition[] {
  const keyed = new Map<string, HotlineWinPosition>();

  for (const line of lines) {
    const startReel = Math.max(0, Math.min(grid.length - 1, line.startReel));
    const endReel = Math.min(grid.length - 1, startReel + line.count - 1);
    for (let reel = startReel; reel <= endReel; reel += 1) {
      const col = grid[reel] ?? [];
      for (let row = 0; row < col.length; row += 1) {
        if (col[row] !== line.symbol) continue;
        keyed.set(`${reel}:${row}`, { reel, row });
      }
    }
  }

  return [...keyed.values()].sort((a, b) => a.reel - b.reel || a.row - b.row);
}

function applyHotlineCascadeDrop(
  grid: number[][],
  removed: HotlineWinPosition[],
  rowCount: number,
  nextSymbol: () => number,
): number[][] {
  const removedByReel = new Map<number, Set<number>>();
  for (const pos of removed) {
    const rows = removedByReel.get(pos.reel) ?? new Set<number>();
    rows.add(pos.row);
    removedByReel.set(pos.reel, rows);
  }

  return grid.map((col, reel) => {
    const rows = removedByReel.get(reel);
    if (!rows || rows.size === 0) return [...col];
    const remaining = col.filter((_symbol, row) => !rows.has(row));
    const fillCount = Math.max(0, rowCount - remaining.length);
    const dropped = [...Array.from({ length: fillCount }, () => nextSymbol()), ...remaining];
    return dropped.slice(-rowCount);
  });
}
