import { hmacIntStream } from './hmac.js';

export const HOTLINE_REELS = 5;
export const HOTLINE_MINI_REELS = 3;
export const HOTLINE_ROWS = 3;
export const HOTLINE_MEGA_REELS = 6;
export const HOTLINE_MEGA_ROWS = 5;
export const HOTLINE_MEGA_MAX_CASCADES = 20;
export const HOTLINE_MEGA_CLUSTER_MIN_COUNT = 8;
export const HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER = 1000;
export const HOTLINE_3X3_GAME_IDS = new Set(['temple-slot', 'candy-slot', 'sakura-slot']);
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
  { name: 'PREMIUM_A', weight: 4, payout3: 10, payout4: 25, payout5: 50 },
  { name: 'PREMIUM_B', weight: 5, payout3: 2.5, payout4: 10, payout5: 25 },
  { name: 'PREMIUM_C', weight: 6, payout3: 2, payout4: 5, payout5: 15 },
  { name: 'COINS', weight: 7, payout3: 1.5, payout4: 2, payout5: 12 },
  { name: 'RED_GEM', weight: 9, payout3: 1, payout4: 1.5, payout5: 10 },
  { name: 'PURPLE_GEM', weight: 10, payout3: 0.8, payout4: 1.2, payout5: 8 },
  { name: 'YELLOW_GEM', weight: 13, payout3: 0.5, payout4: 1, payout5: 5 },
  { name: 'GREEN_GEM', weight: 16, payout3: 0.4, payout4: 0.9, payout5: 4 },
  { name: 'BLUE_GEM', weight: 20, payout3: 0.25, payout4: 0.75, payout5: 2 },
] as const;
export const HOTLINE_MEGA_FREE_SPIN_TRIGGER = 4;
export const HOTLINE_MEGA_FREE_SPIN_RETRIGGER_TRIGGER = 3;
export const HOTLINE_MEGA_FREE_SPIN_BASE_AWARD = 15;
export const HOTLINE_MEGA_FREE_SPIN_RETRIGGER_AWARD = 5;
export const HOTLINE_MEGA_MAX_FREE_SPINS = 100;
export const HOTLINE_MEGA_MULTIPLIER_VALUES = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500, 1000,
] as const;
export const HOTLINE_MEGA_SCATTER_PAYOUTS = {
  4: 3,
  5: 5,
  6: 100,
} as const;

export type HotlineSymbol =
  | (typeof HOTLINE_SYMBOLS)[number]
  | (typeof HOTLINE_MEGA_SYMBOLS)[number];

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

export interface HotlineSpecialSymbol extends HotlineWinPosition {
  type: 'scatter' | 'multiplier';
  value?: number;
}

export interface HotlineFreeSpinRound {
  index: number;
  initialGrid: number[][];
  finalGrid: number[][];
  cascades: HotlineCascadeStep[];
  lines: HotlineWinLine[];
  baseMultiplier: number;
  scatterSymbols: HotlineSpecialSymbol[];
  multiplierSymbols: HotlineSpecialSymbol[];
  multiplierTotal: number;
  appliedMultiplier: number;
  totalMultiplier: number;
  extraFreeSpinsAwarded: number;
}

export interface HotlineMegaFeatureResult {
  scatterSymbols: HotlineSpecialSymbol[];
  scatterCount: number;
  freeSpinsAwarded: number;
  freeSpinsPlayed: number;
  baseWinMultiplier: number;
  baseMultiplierSymbols: HotlineSpecialSymbol[];
  baseMultiplierTotal: number;
  baseAppliedMultiplier: number;
  baseTotalMultiplier: number;
  freeSpinRounds: HotlineFreeSpinRound[];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
  totalMultiplier: number;
}

export interface HotlineCascadeResult {
  initialGrid: number[][];
  finalGrid: number[][];
  cascades: HotlineCascadeStep[];
  lines: HotlineWinLine[];
  totalMultiplier: number;
  features?: HotlineMegaFeatureResult;
}

export interface HotlineWinLine {
  lineId: string;
  path: number[];
  positions?: HotlineWinPosition[];
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
  const nextRandom01 = (): number => {
    const v = stream.next().value as number;
    return v / 0x1_0000_0000;
  };
  const nextSymbol = (): number => {
    return pickSymbol(nextRandom01(), symbols);
  };

  const round = runHotlineCascadeRound(nextSymbol, reelCount, rowCount, maxCascades);
  const features =
    rowCount >= HOTLINE_MEGA_ROWS
      ? buildMegaFeatureResult(round, nextRandom01, nextSymbol, reelCount, rowCount, maxCascades)
      : undefined;

  return {
    initialGrid: round.initialGrid,
    finalGrid: round.finalGrid,
    cascades: round.cascades,
    lines: round.lines,
    totalMultiplier: features?.totalMultiplier ?? capMegaMultiplier(round.totalMultiplier),
    ...(features ? { features } : {}),
  };
}

export function hotlineBuyFreeSpins(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  reelCount = HOTLINE_MEGA_REELS,
  rowCount = HOTLINE_MEGA_ROWS,
  maxCascades = HOTLINE_MEGA_MAX_CASCADES,
): HotlineCascadeResult {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForRows(rowCount);
  const nextRandom01 = (): number => {
    const v = stream.next().value as number;
    return v / 0x1_0000_0000;
  };
  const nextSymbol = (): number => {
    return pickSymbol(nextRandom01(), symbols);
  };
  const initialGrid = Array.from({ length: reelCount }, () =>
    Array.from({ length: rowCount }, () => nextSymbol()),
  );
  const scatterSymbols = pickUniquePositions(
    nextRandom01,
    HOTLINE_MEGA_FREE_SPIN_TRIGGER,
    reelCount,
    rowCount,
  ).map((position) => ({ ...position, type: 'scatter' as const }));
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    HOTLINE_MEGA_FREE_SPIN_BASE_AWARD,
  );
  const features: HotlineMegaFeatureResult = {
    scatterSymbols,
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded: freeSpins.freeSpinsAwarded,
    freeSpinsPlayed: freeSpins.freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds: freeSpins.freeSpinRounds,
    freeSpinMultiplierBank: freeSpins.freeSpinMultiplierBank,
    freeSpinWinMultiplier: freeSpins.freeSpinWinMultiplier,
    totalMultiplier: capMegaMultiplier(freeSpins.freeSpinWinMultiplier),
  };

  return {
    initialGrid: cloneGrid(initialGrid),
    finalGrid: cloneGrid(initialGrid),
    cascades: [],
    lines: [],
    totalMultiplier: features.totalMultiplier,
    features,
  };
}

type HotlineInternalCascadeRound = Omit<HotlineCascadeResult, 'features'>;

function runHotlineCascadeRound(
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
): HotlineInternalCascadeRound {
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

function buildMegaFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
): HotlineMegaFeatureResult {
  const scatterSymbols = drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, false);
  const baseScatterMultiplier = getMegaScatterPayout(scatterSymbols.length);
  const baseWinMultiplier = roundMultiplier(baseRound.totalMultiplier + baseScatterMultiplier);
  const baseMultiplierSymbols = drawMegaMultiplierSymbols(
    nextRandom01,
    reelCount,
    rowCount,
    baseWinMultiplier,
    false,
  );
  const baseMultiplierTotal = sumSpecialValues(baseMultiplierSymbols);
  const baseAppliedMultiplier =
    baseWinMultiplier > 0 && baseMultiplierTotal > 0 ? baseMultiplierTotal : 1;
  const baseTotalMultiplier = roundMultiplier(baseWinMultiplier * baseAppliedMultiplier);

  const initialFreeSpinsAwarded =
    scatterSymbols.length >= HOTLINE_MEGA_FREE_SPIN_TRIGGER ? HOTLINE_MEGA_FREE_SPIN_BASE_AWARD : 0;
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    initialFreeSpinsAwarded,
  );

  return {
    scatterSymbols,
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded: freeSpins.freeSpinsAwarded,
    freeSpinsPlayed: freeSpins.freeSpinRounds.length,
    baseWinMultiplier,
    baseMultiplierSymbols,
    baseMultiplierTotal,
    baseAppliedMultiplier,
    baseTotalMultiplier,
    freeSpinRounds: freeSpins.freeSpinRounds,
    freeSpinMultiplierBank: freeSpins.freeSpinMultiplierBank,
    freeSpinWinMultiplier: freeSpins.freeSpinWinMultiplier,
    totalMultiplier: capMegaMultiplier(baseTotalMultiplier + freeSpins.freeSpinWinMultiplier),
  };
}

function runMegaFreeSpinRounds(
  nextRandom01: () => number,
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
  initialFreeSpinsAwarded: number,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineFreeSpinRound[];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  let freeSpinsAwarded = Math.min(
    HOTLINE_MEGA_MAX_FREE_SPINS,
    Math.max(0, initialFreeSpinsAwarded),
  );
  let freeSpinMultiplierBank = 0;
  let freeSpinWinMultiplier = 0;
  const freeSpinRounds: HotlineFreeSpinRound[] = [];

  for (let index = 0; index < freeSpinsAwarded && index < HOTLINE_MEGA_MAX_FREE_SPINS; index += 1) {
    const round = runHotlineCascadeRound(nextSymbol, reelCount, rowCount, maxCascades);
    const scatterRoundSymbols = drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, true);
    const roundScatterMultiplier = getMegaScatterPayout(scatterRoundSymbols.length);
    const roundBaseMultiplier = roundMultiplier(round.totalMultiplier + roundScatterMultiplier);
    const extraFreeSpinsAwarded =
      scatterRoundSymbols.length >= HOTLINE_MEGA_FREE_SPIN_RETRIGGER_TRIGGER
        ? HOTLINE_MEGA_FREE_SPIN_RETRIGGER_AWARD
        : 0;
    const multiplierSymbols = drawMegaMultiplierSymbols(
      nextRandom01,
      reelCount,
      rowCount,
      roundBaseMultiplier,
      true,
    );
    const multiplierTotal = sumSpecialValues(multiplierSymbols);
    freeSpinMultiplierBank = roundMultiplier(freeSpinMultiplierBank + multiplierTotal);
    const appliedMultiplier =
      roundBaseMultiplier > 0 && freeSpinMultiplierBank > 0 ? freeSpinMultiplierBank : 1;
    const totalMultiplier = roundMultiplier(roundBaseMultiplier * appliedMultiplier);
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + totalMultiplier);

    if (extraFreeSpinsAwarded > 0) {
      freeSpinsAwarded = Math.min(
        HOTLINE_MEGA_MAX_FREE_SPINS,
        freeSpinsAwarded + extraFreeSpinsAwarded,
      );
    }

    freeSpinRounds.push({
      index,
      initialGrid: round.initialGrid,
      finalGrid: round.finalGrid,
      cascades: round.cascades,
      lines: round.lines,
      baseMultiplier: roundBaseMultiplier,
      scatterSymbols: scatterRoundSymbols,
      multiplierSymbols,
      multiplierTotal,
      appliedMultiplier,
      totalMultiplier: capMegaMultiplier(totalMultiplier),
      extraFreeSpinsAwarded,
    });
  }

  return {
    freeSpinsAwarded,
    freeSpinRounds,
    freeSpinMultiplierBank,
    freeSpinWinMultiplier,
  };
}

function drawMegaScatterSymbols(
  nextRandom01: () => number,
  reelCount: number,
  rowCount: number,
  freeSpinMode: boolean,
): HotlineSpecialSymbol[] {
  const roll = nextRandom01();
  const count = freeSpinMode
    ? roll < 0.003
      ? 6
      : roll < 0.014
        ? 5
        : roll < 0.048
          ? 4
          : roll < 0.14
            ? 3
            : roll < 0.34
              ? 2
              : roll < 0.6
                ? 1
                : 0
    : roll < 0.0002
      ? 6
      : roll < 0.001
        ? 5
        : roll < 0.004
          ? 4
          : roll < 0.04
            ? 3
            : roll < 0.2
              ? 2
              : roll < 0.48
                ? 1
                : 0;

  return pickUniquePositions(nextRandom01, count, reelCount, rowCount).map((position) => ({
    ...position,
    type: 'scatter' as const,
  }));
}

function drawMegaMultiplierSymbols(
  nextRandom01: () => number,
  reelCount: number,
  rowCount: number,
  baseMultiplier: number,
  freeSpinMode: boolean,
): HotlineSpecialSymbol[] {
  const roll = nextRandom01();
  const chance = freeSpinMode ? 0.18 : 0.07;
  if (baseMultiplier <= 0 || roll >= chance) return [];

  const countRoll = nextRandom01();
  const count = freeSpinMode
    ? countRoll < 0.025
      ? 3
      : countRoll < 0.14
        ? 2
        : 1
    : countRoll < 0.008
      ? 3
      : countRoll < 0.07
        ? 2
        : 1;
  return pickUniquePositions(nextRandom01, count, reelCount, rowCount).map((position) => ({
    ...position,
    type: 'multiplier' as const,
    value: pickMegaMultiplierValue(nextRandom01),
  }));
}

function pickMegaMultiplierValue(nextRandom01: () => number): number {
  const weighted = [
    { value: 2, weight: 44 },
    { value: 3, weight: 28 },
    { value: 4, weight: 22 },
    { value: 5, weight: 16 },
    { value: 6, weight: 12 },
    { value: 8, weight: 7 },
    { value: 10, weight: 4 },
    { value: 12, weight: 3 },
    { value: 15, weight: 1.5 },
    { value: 20, weight: 0.9 },
    { value: 25, weight: 0.5 },
    { value: 50, weight: 0.2 },
    { value: 100, weight: 0.07 },
    { value: 250, weight: 0.02 },
    { value: 500, weight: 0.006 },
    { value: 1000, weight: 0.001 },
  ];
  const totalWeight = weighted.reduce((sum, item) => sum + item.weight, 0);
  const target = nextRandom01() * totalWeight;
  let accum = 0;
  for (const item of weighted) {
    accum += item.weight;
    if (target < accum) return item.value;
  }
  return 2;
}

function getMegaScatterPayout(count: number): number {
  if (count >= 6) return HOTLINE_MEGA_SCATTER_PAYOUTS[6];
  if (count === 5) return HOTLINE_MEGA_SCATTER_PAYOUTS[5];
  if (count === 4) return HOTLINE_MEGA_SCATTER_PAYOUTS[4];
  return 0;
}

function pickUniquePositions(
  nextRandom01: () => number,
  count: number,
  reelCount: number,
  rowCount: number,
): HotlineWinPosition[] {
  const max = reelCount * rowCount;
  const target = Math.max(0, Math.min(count, max));
  const keyed = new Map<string, HotlineWinPosition>();

  while (keyed.size < target) {
    const reel = Math.floor(nextRandom01() * reelCount);
    const row = Math.floor(nextRandom01() * rowCount);
    keyed.set(`${reel}:${row}`, { reel, row });
  }

  return [...keyed.values()].sort((a, b) => a.reel - b.reel || a.row - b.row);
}

function sumSpecialValues(symbols: HotlineSpecialSymbol[]): number {
  return symbols.reduce((sum, symbol) => sum + (symbol.value ?? 0), 0);
}

function roundMultiplier(value: number): number {
  return Number(value.toFixed(4));
}

function capMegaMultiplier(value: number): number {
  return Math.min(HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER, roundMultiplier(value));
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
  const payout = count === 5 ? sym.payout5 : count === 4 ? sym.payout4 : sym.payout3;
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
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let symbol = 0; symbol < HOTLINE_MEGA_SYMBOLS.length; symbol += 1) {
    const positions = collectSymbolPositions(grid, symbol);
    if (positions.length < HOTLINE_MEGA_CLUSTER_MIN_COUNT) continue;
    const line = makeMegaClusterWinLine(symbol, positions, reelCount);
    lines.push(line);
    totalMultiplier += line.payout;
  }

  return {
    lines,
    totalMultiplier: Number(totalMultiplier.toFixed(4)),
  };
}

function collectSymbolPositions(grid: number[][], symbol: number): HotlineWinPosition[] {
  const positions: HotlineWinPosition[] = [];
  for (let reel = 0; reel < grid.length; reel += 1) {
    const col = grid[reel] ?? [];
    for (let row = 0; row < col.length; row += 1) {
      if (col[row] === symbol) positions.push({ reel, row });
    }
  }
  return positions;
}

function makeMegaClusterWinLine(
  symbol: number,
  positions: HotlineWinPosition[],
  reelCount: number,
): HotlineWinLine {
  const symbolMeta = HOTLINE_MEGA_SYMBOLS[symbol]!;
  const count = positions.length;
  const payout =
    count >= 12 ? symbolMeta.payout5 : count >= 10 ? symbolMeta.payout4 : symbolMeta.payout3;
  const first = positions[0] ?? { reel: 0, row: 0 };
  const path = Array.from({ length: reelCount }, (_, reel) => {
    const row = positions.find((position) => position.reel === reel)?.row;
    return row ?? first.row;
  });
  return {
    lineId: `cluster-${symbol}`,
    path,
    positions,
    startReel: 0,
    direction: 'ltr',
    row: first.row,
    symbol,
    count,
    ways: count,
    payout,
  };
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
    if (line.positions && line.positions.length > 0) {
      for (const pos of line.positions) keyed.set(`${pos.reel}:${pos.row}`, pos);
      continue;
    }
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
