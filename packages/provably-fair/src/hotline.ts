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
const HOTLINE_GAME_LAYOUTS = new Map<string, { reels: number; rows: number }>([
  ['h5-nine-line-pull-king', { reels: 5, rows: 3 }],
  ['h5-water-margin', { reels: 5, rows: 3 }],
  ['h5-diamond-strike', { reels: 5, rows: 3 }],
  ['h5-yu-pu-tuan', { reels: 5, rows: 4 }],
  ['h5-fruit-little-mary', { reels: 5, rows: 3 }],
  ['h5-aztec-treasure', { reels: 3, rows: 3 }],
  ['h5-fire-88', { reels: 3, rows: 3 }],
  ['h5-lucky-777', { reels: 3, rows: 3 }],
  ['h5-caishen-fa-fa-fa', { reels: 5, rows: 3 }],
  ['h5-flying-together', { reels: 5, rows: 3 }],
  ['h5-star-97', { reels: 3, rows: 3 }],
  ['h5-fortune-ox', { reels: 3, rows: 4 }],
  ['h5-mahjong-ways', { reels: 5, rows: 4 }],
  ['h5-mahjong-ways-2', { reels: 5, rows: 5 }],
  ['h5-dragon-hatch', { reels: 6, rows: 5 }],
  ['h5-captains-bounty', { reels: 5, rows: 3 }],
  ['h5-caishen-wins', { reels: 6, rows: 5 }],
  ['h5-queen-of-bounty', { reels: 5, rows: 3 }],
  ['h5-golden-empire', { reels: 6, rows: 5 }],
  ['h5-fortune-gems', { reels: 3, rows: 3 }],
  ['h5-gates-of-olympus', { reels: 6, rows: 5 }],
]);
export type HotlineEvaluationMode = 'paylines' | 'ways' | 'cluster';

/** Imported games whose source scenes advertise an all-ways payout model. */
export const HOTLINE_WAYS_GAME_IDS = new Set([
  'h5-flying-together',
  'h5-mahjong-ways',
  'h5-mahjong-ways-2',
  'h5-caishen-wins',
  'h5-golden-empire',
]);

/** Imported games whose source scenes remove every matching symbol as a cluster. */
export const HOTLINE_CLUSTER_GAME_IDS = new Set([
  ...HOTLINE_MEGA_GAME_IDS,
  'h5-dragon-hatch',
  'h5-gates-of-olympus',
]);
export const HOTLINE_CASCADE_GAME_IDS = new Set([
  ...HOTLINE_MEGA_GAME_IDS,
  'h5-mahjong-ways',
  'h5-mahjong-ways-2',
  'h5-dragon-hatch',
  'h5-captains-bounty',
  'h5-caishen-wins',
  'h5-queen-of-bounty',
  'h5-golden-empire',
  'h5-gates-of-olympus',
]);
export const HOTLINE_FEATURE_GAME_IDS = new Set([
  ...HOTLINE_MEGA_GAME_IDS,
  ...Array.from(HOTLINE_GAME_LAYOUTS.keys()).filter((gameId) => gameId !== 'h5-dragon-hatch'),
]);
const HOTLINE_5X3_PAYTABLE = [
  { weight: 58, payout3: 0.92, payout4: 2.3, payout5: 4.8 },
  { weight: 46, payout3: 1.2, payout4: 3.2, payout5: 6.8 },
  { weight: 34, payout3: 1.7, payout4: 5.2, payout5: 13 },
  { weight: 23, payout3: 2.8, payout4: 8.5, payout5: 26 },
  { weight: 11, payout3: 5, payout4: 16, payout5: 60 },
  { weight: 6, payout3: 8, payout4: 35, payout5: 120 },
  { weight: 3.5, payout3: 15, payout4: 80, payout5: 250 },
  { weight: 1.5, payout3: 25, payout4: 160, payout5: 450 },
] as const;
const HOTLINE_3X3_PAYTABLE = [
  { weight: 450, payout3: 0.92, payout4: 0.92, payout5: 0.92 },
  { weight: 160, payout3: 1.6, payout4: 1.6, payout5: 1.6 },
  { weight: 90, payout3: 3.2, payout4: 3.2, payout5: 3.2 },
  { weight: 45, payout3: 6, payout4: 6, payout5: 6 },
  { weight: 20, payout3: 12, payout4: 12, payout5: 12 },
  { weight: 12, payout3: 20, payout4: 20, payout5: 20 },
  { weight: 8, payout3: 40, payout4: 40, payout5: 40 },
  { weight: 5, payout3: 80, payout4: 80, payout5: 80 },
] as const;
const HOTLINE_MEGA_PAYTABLE = [
  { weight: 16, payout3: 0.345, payout4: 0.688, payout5: 1.376 },
  { weight: 16, payout3: 0.516, payout4: 1.033, payout5: 1.721 },
  { weight: 16, payout3: 0.688, payout4: 1.376, payout5: 2.237 },
  { weight: 16, payout3: 0.861, payout4: 1.721, payout5: 2.754 },
  { weight: 10, payout3: 1.205, payout4: 2.409, payout5: 4.13 },
  { weight: 8.5, payout3: 1.548, payout4: 3.097, payout5: 4.818 },
  { weight: 7, payout3: 1.893, payout4: 3.785, payout5: 5.506 },
  { weight: 5.5, payout3: 2.237, payout4: 4.473, payout5: 6.194 },
] as const;

// 符號池：權重決定出現率（Stake-style 類 slot）
// 索引 => 名稱
type HotlineSymbolDefinition = {
  name: string;
  weight: number;
  payout3: number;
  payout4: number;
  payout5: number;
};

function makeHotlineSymbols(
  paytable: readonly Omit<HotlineSymbolDefinition, 'name'>[],
): ReadonlyArray<HotlineSymbolDefinition> {
  return paytable.map((entry, index) => ({
    name: index < 4 ? `SOFT_LOSS_${index + 1}` : `SOFT_WIN_${index - 3}`,
    ...entry,
  }));
}

export const HOTLINE_SYMBOLS = makeHotlineSymbols(HOTLINE_5X3_PAYTABLE);

export const HOTLINE_MINI_SYMBOLS = makeHotlineSymbols(HOTLINE_3X3_PAYTABLE);

export const HOTLINE_MEGA_SYMBOLS = makeHotlineSymbols(HOTLINE_MEGA_PAYTABLE);
export const HOTLINE_MEGA_FREE_SPIN_TRIGGER = 4;
export const HOTLINE_MEGA_FREE_SPIN_RETRIGGER_TRIGGER = 3;
export const HOTLINE_MEGA_FREE_SPIN_BASE_AWARD = 15;
export const HOTLINE_MEGA_FREE_SPIN_RETRIGGER_AWARD = 5;
export const HOTLINE_MEGA_MAX_FREE_SPINS = 100;
export const HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER = 100;
export const HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER =
  HOTLINE_MEGA_BUY_FEATURE_COST_MULTIPLIER * 2;
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
  | (typeof HOTLINE_MINI_SYMBOLS)[number]
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
  const symbols = getHotlineSymbolsForGrid(reelCount, rowCount);
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
  /** Zero-based index of the source scene's line overlay. */
  lineIndex?: number;
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
  enableFeatures = rowCount >= HOTLINE_MEGA_ROWS,
  gameId?: string,
): HotlineCascadeResult {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForGrid(reelCount, rowCount);
  const nextRandom01 = (): number => {
    const v = stream.next().value as number;
    return v / 0x1_0000_0000;
  };
  const nextSymbol = (): number => {
    return pickSymbol(nextRandom01(), symbols);
  };

  const round = runHotlineCascadeRound(nextSymbol, reelCount, rowCount, maxCascades, gameId);
  const features = enableFeatures
    ? buildMegaFeatureResult(
        round,
        nextRandom01,
        nextSymbol,
        reelCount,
        rowCount,
        maxCascades,
        gameId,
      )
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
  gameId?: string,
): HotlineCascadeResult {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForGrid(reelCount, rowCount);
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
  const cappedFreeSpins = buildBuyFeatureFreeSpinsWithinCap(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    gameId,
  );
  const features: HotlineMegaFeatureResult = {
    scatterSymbols,
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded: cappedFreeSpins.freeSpinsAwarded,
    freeSpinsPlayed: cappedFreeSpins.freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds: cappedFreeSpins.freeSpinRounds,
    freeSpinMultiplierBank: cappedFreeSpins.freeSpinMultiplierBank,
    freeSpinWinMultiplier: cappedFreeSpins.freeSpinWinMultiplier,
    totalMultiplier: cappedFreeSpins.freeSpinWinMultiplier,
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
  gameId?: string,
): HotlineInternalCascadeRound {
  let grid = Array.from({ length: reelCount }, () =>
    Array.from({ length: rowCount }, () => nextSymbol()),
  );
  const initialGrid = cloneGrid(grid);
  const cascades: HotlineCascadeStep[] = [];
  const allLines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let index = 0; index < maxCascades; index += 1) {
    const evaluated = hotlineEvaluate(grid, gameId);
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
  gameId?: string,
): HotlineMegaFeatureResult {
  const scatterSymbols = drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, false);
  const baseScatterMultiplier = getMegaScatterPayout(scatterSymbols.length);
  const baseSymbolWinMultiplier = baseRound.totalMultiplier;
  const baseWinMultiplier = roundMultiplier(baseSymbolWinMultiplier + baseScatterMultiplier);
  const baseMultiplierSymbols = drawMegaMultiplierSymbols(
    nextRandom01,
    reelCount,
    rowCount,
    baseSymbolWinMultiplier,
    false,
    scatterSymbols,
  );
  const baseMultiplierTotal = sumSpecialValues(baseMultiplierSymbols);
  const baseAppliedMultiplier =
    baseSymbolWinMultiplier > 0 && baseMultiplierTotal > 0 ? baseMultiplierTotal : 1;
  const baseTotalMultiplier = roundMultiplier(
    baseScatterMultiplier + baseSymbolWinMultiplier * baseAppliedMultiplier,
  );

  const initialFreeSpinsAwarded =
    scatterSymbols.length >= HOTLINE_MEGA_FREE_SPIN_TRIGGER ? HOTLINE_MEGA_FREE_SPIN_BASE_AWARD : 0;
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    initialFreeSpinsAwarded,
    gameId,
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
  gameId?: string,
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
    const round = runHotlineCascadeRound(nextSymbol, reelCount, rowCount, maxCascades, gameId);
    const scatterRoundSymbols = drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, true);
    const roundScatterMultiplier = getMegaScatterPayout(scatterRoundSymbols.length);
    const roundSymbolWinMultiplier = round.totalMultiplier;
    const roundBaseMultiplier = roundMultiplier(roundSymbolWinMultiplier + roundScatterMultiplier);
    const extraFreeSpinsAwarded =
      scatterRoundSymbols.length >= HOTLINE_MEGA_FREE_SPIN_RETRIGGER_TRIGGER
        ? HOTLINE_MEGA_FREE_SPIN_RETRIGGER_AWARD
        : 0;
    const multiplierSymbols = drawMegaMultiplierSymbols(
      nextRandom01,
      reelCount,
      rowCount,
      roundSymbolWinMultiplier,
      true,
      scatterRoundSymbols,
    );
    const multiplierTotal = sumSpecialValues(multiplierSymbols);
    freeSpinMultiplierBank = roundMultiplier(freeSpinMultiplierBank + multiplierTotal);
    const appliedMultiplier =
      roundSymbolWinMultiplier > 0 && freeSpinMultiplierBank > 0 ? freeSpinMultiplierBank : 1;
    const totalMultiplier = roundMultiplier(
      roundScatterMultiplier + roundSymbolWinMultiplier * appliedMultiplier,
    );
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

function buildBuyFeatureFreeSpinsWithinCap(
  nextRandom01: () => number,
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
  gameId?: string,
): {
  freeSpinsAwarded: number;
  freeSpinRounds: HotlineFreeSpinRound[];
  freeSpinMultiplierBank: number;
  freeSpinWinMultiplier: number;
} {
  let best = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    HOTLINE_MEGA_FREE_SPIN_BASE_AWARD,
    gameId,
  );
  if (best.freeSpinWinMultiplier <= HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER) {
    return best;
  }

  for (let attempt = 0; attempt < 64; attempt += 1) {
    const candidate = runMegaFreeSpinRounds(
      nextRandom01,
      nextSymbol,
      reelCount,
      rowCount,
      maxCascades,
      HOTLINE_MEGA_FREE_SPIN_BASE_AWARD,
      gameId,
    );
    if (candidate.freeSpinWinMultiplier < best.freeSpinWinMultiplier) {
      best = candidate;
    }
    if (candidate.freeSpinWinMultiplier <= HOTLINE_MEGA_BUY_FEATURE_MAX_TOTAL_MULTIPLIER) {
      return candidate;
    }
  }

  return best;
}

function drawMegaScatterSymbols(
  nextRandom01: () => number,
  reelCount: number,
  rowCount: number,
  freeSpinMode: boolean,
): HotlineSpecialSymbol[] {
  const roll = nextRandom01();
  const count = freeSpinMode
    ? roll < 0.0006
      ? 6
      : roll < 0.0025
        ? 5
        : roll < 0.008
          ? 4
          : roll < 0.025
            ? 3
            : roll < 0.1
              ? 2
              : roll < 0.28
                ? 1
                : 0
    : roll < 0.0001
      ? 6
      : roll < 0.0005
        ? 5
        : roll < 0.003
          ? 4
          : roll < 0.035
            ? 3
            : roll < 0.175
              ? 2
              : roll < 0.425
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
  blockedPositions: HotlineWinPosition[] = [],
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
  return pickUniquePositions(nextRandom01, count, reelCount, rowCount, blockedPositions).map(
    (position) => ({
      ...position,
      type: 'multiplier' as const,
      value: pickMegaMultiplierValue(nextRandom01),
    }),
  );
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
  blockedPositions: HotlineWinPosition[] = [],
): HotlineWinPosition[] {
  const max = reelCount * rowCount;
  const blocked = new Set(blockedPositions.map((position) => `${position.reel}:${position.row}`));
  const target = Math.max(0, Math.min(count, max - blocked.size));
  const keyed = new Map<string, HotlineWinPosition>();

  while (keyed.size < target) {
    const reel = Math.floor(nextRandom01() * reelCount);
    const row = Math.floor(nextRandom01() * rowCount);
    if (blocked.has(`${reel}:${row}`)) continue;
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

export interface HotlinePaylineDefinition {
  id: string;
  path: readonly number[];
  /** Zero-based child index under the original Cocos WinLine node. */
  lineIndex?: number;
}

export const HOTLINE_PAYLINES_5X3: readonly HotlinePaylineDefinition[] = [
  { id: 'top', path: [0, 0, 0, 0, 0] },
  { id: 'middle', path: [1, 1, 1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2, 2, 2] },
  { id: 'v-down', path: [0, 1, 2, 1, 0] },
  { id: 'v-up', path: [2, 1, 0, 1, 2] },
] as const;

export const HOTLINE_PAYLINES_3X3: readonly HotlinePaylineDefinition[] = [
  { id: 'top', path: [0, 0, 0] },
  { id: 'middle', path: [1, 1, 1] },
  { id: 'bottom', path: [2, 2, 2] },
  { id: 'diag-down', path: [0, 1, 2] },
  { id: 'diag-up', path: [2, 1, 0] },
] as const;

export const HOTLINE_PAYLINES = HOTLINE_PAYLINES_5X3;

const H5_PAYLINES_5X3_15_PATHS = [
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 0, 1, 2, 1],
  [1, 2, 1, 0, 1],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
] as const;

/** The source scene numbers these center, top, bottom, V-down, V-up, then four zigzags. */
export const H5_NINE_LINE_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines(
  H5_PAYLINES_5X3_15_PATHS.slice(0, 9),
);

const H5_FIFTEEN_LINE_PAYLINES = makeIndexedPaylines(H5_PAYLINES_5X3_15_PATHS);
const H5_FIVE_LINE_PAYLINES_5X3 = makeIndexedPaylines(H5_PAYLINES_5X3_15_PATHS.slice(0, 5));
const H5_PAYLINES_3X3_8 = makeIndexedPaylines([
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [0, 1, 2],
  [2, 1, 0],
  [0, 1, 0],
  [2, 1, 2],
  [1, 0, 1],
]);
const H5_PAYLINES_3X4_10 = makeIndexedPaylines([
  [1, 1, 1],
  [2, 2, 2],
  [0, 0, 0],
  [3, 3, 3],
  [0, 1, 2],
  [1, 2, 3],
  [2, 1, 0],
  [3, 2, 1],
  [0, 1, 0],
  [3, 2, 3],
]);
const H5_PAYLINES_5X4_50 = makeIndexedPaylines(
  buildBalancedPaylinePaths(5, 4, 50, [
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [0, 0, 0, 0, 0],
    [3, 3, 3, 3, 3],
    [0, 1, 2, 1, 0],
    [3, 2, 1, 2, 3],
    [0, 0, 1, 0, 0],
    [3, 3, 2, 3, 3],
    [1, 0, 1, 2, 1],
    [2, 3, 2, 1, 2],
  ]),
);

const H5_FIXED_PAYLINE_COUNTS: Readonly<Record<string, number>> = {
  'h5-nine-line-pull-king': 9,
  'h5-water-margin': 9,
  'h5-diamond-strike': 15,
  'h5-yu-pu-tuan': 50,
  'h5-fruit-little-mary': 9,
  'h5-aztec-treasure': 5,
  'h5-fire-88': 7,
  'h5-lucky-777': 5,
  'h5-caishen-fa-fa-fa': 9,
  'h5-star-97': 8,
  'h5-fortune-ox': 10,
  'h5-captains-bounty': 5,
  'h5-queen-of-bounty': 5,
  'h5-fortune-gems': 5,
};

function makeIndexedPaylines(paths: readonly (readonly number[])[]): HotlinePaylineDefinition[] {
  return paths.map((path, lineIndex) => ({
    id: `line-${lineIndex + 1}`,
    path: [...path],
    lineIndex,
  }));
}

function buildBalancedPaylinePaths(
  reelCount: number,
  rowCount: number,
  count: number,
  preferred: readonly (readonly number[])[],
): number[][] {
  const keyed = new Map<string, number[]>();
  const add = (path: readonly number[]): void => {
    if (path.length !== reelCount || path.some((row) => row < 0 || row >= rowCount)) return;
    keyed.set(path.join(','), [...path]);
  };
  preferred.forEach(add);

  const candidates: number[][] = [];
  const visit = (path: number[]): void => {
    if (path.length === reelCount) {
      candidates.push([...path]);
      return;
    }
    for (let row = 0; row < rowCount; row += 1) {
      if (path.length > 0 && Math.abs(row - path[path.length - 1]!) > 1) continue;
      path.push(row);
      visit(path);
      path.pop();
    }
  };
  visit([]);
  const center = (rowCount - 1) / 2;
  candidates.sort((a, b) => {
    const movement = (path: number[]): number =>
      path.slice(1).reduce((sum, row, index) => sum + Math.abs(row - path[index]!), 0);
    const centerDistance = (path: number[]): number =>
      path.reduce((sum, row) => sum + Math.abs(row - center), 0);
    return (
      movement(a) - movement(b) ||
      centerDistance(a) - centerDistance(b) ||
      a.join('').localeCompare(b.join(''))
    );
  });
  candidates.forEach(add);
  return [...keyed.values()].slice(0, count);
}

export function getHotlineEvaluationMode(
  gameId: string | undefined,
  rowCount = getHotlineRowCount(gameId),
): HotlineEvaluationMode {
  if (gameId && HOTLINE_WAYS_GAME_IDS.has(gameId)) return 'ways';
  if (gameId && HOTLINE_CLUSTER_GAME_IDS.has(gameId)) return 'cluster';
  return rowCount >= HOTLINE_MEGA_ROWS ? 'cluster' : 'paylines';
}

export function getHotlinePaylinesForGame(
  gameId: string | undefined,
  reelCount = getHotlineReelCount(gameId),
  rowCount = getHotlineRowCount(gameId),
): readonly HotlinePaylineDefinition[] {
  const count = gameId ? H5_FIXED_PAYLINE_COUNTS[gameId] : undefined;
  if (!count) return reelCount === HOTLINE_MINI_REELS ? HOTLINE_PAYLINES_3X3 : HOTLINE_PAYLINES_5X3;
  if (reelCount === 5 && rowCount === 4) return H5_PAYLINES_5X4_50.slice(0, count);
  if (reelCount === 5) {
    if (count <= 5) return H5_FIVE_LINE_PAYLINES_5X3.slice(0, count);
    if (count <= 9) return H5_NINE_LINE_PAYLINES.slice(0, count);
    return H5_FIFTEEN_LINE_PAYLINES.slice(0, count);
  }
  if (rowCount === 4) return H5_PAYLINES_3X4_10.slice(0, count);
  return H5_PAYLINES_3X3_8.slice(0, count);
}

export function getHotlineReelCount(gameId?: string): number {
  const layout = gameId ? HOTLINE_GAME_LAYOUTS.get(gameId) : undefined;
  if (layout) return layout.reels;
  if (gameId && HOTLINE_3X3_GAME_IDS.has(gameId)) return HOTLINE_MINI_REELS;
  if (gameId && HOTLINE_MEGA_GAME_IDS.has(gameId)) return HOTLINE_MEGA_REELS;
  return HOTLINE_REELS;
}

export function getHotlineRowCount(gameId?: string): number {
  const layout = gameId ? HOTLINE_GAME_LAYOUTS.get(gameId) : undefined;
  if (layout) return layout.rows;
  return gameId && HOTLINE_MEGA_GAME_IDS.has(gameId) ? HOTLINE_MEGA_ROWS : HOTLINE_ROWS;
}

export function isHotlineMegaGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_MEGA_GAME_IDS.has(gameId));
}

export function isHotlineCascadeGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_CASCADE_GAME_IDS.has(gameId));
}

export function isHotlineFeatureGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_FEATURE_GAME_IDS.has(gameId));
}

function getHotlineSymbolsForGrid(reelCount: number, rowCount: number): readonly HotlineSymbol[] {
  if (rowCount >= HOTLINE_MEGA_ROWS) return HOTLINE_MEGA_SYMBOLS;
  if (reelCount === HOTLINE_MINI_REELS) return HOTLINE_MINI_SYMBOLS;
  return HOTLINE_SYMBOLS;
}

function makeHotlineWinLine(
  payline: HotlinePaylineDefinition,
  symbol: number,
  count: number,
  startReel: number,
  direction: 'ltr' | 'rtl',
  symbols: readonly HotlineSymbol[],
  payoutScale = 1,
): HotlineWinLine {
  const sym = symbols[symbol]!;
  const rawPayout = count >= 5 ? sym.payout5 : count === 4 ? sym.payout4 : sym.payout3;
  return {
    lineId: payline.id,
    ...(payline.lineIndex !== undefined ? { lineIndex: payline.lineIndex } : {}),
    path: [...payline.path],
    startReel,
    direction,
    row: payline.path[startReel]!,
    symbol,
    count,
    payout: roundMultiplier(rawPayout * payoutScale),
  };
}

function evaluatePaylineEdge(
  grid: number[][],
  payline: HotlinePaylineDefinition,
  reelCount: number,
  direction: 'ltr' | 'rtl',
  symbols: readonly HotlineSymbol[],
  payoutScale: number,
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
  return makeHotlineWinLine(payline, symbol, count, startReel, direction, symbols, payoutScale);
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
export function hotlineEvaluate(
  grid: number[][],
  gameId?: string,
): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const rowCount = Math.max(...grid.map((col) => col.length), 0);
  const mode = getHotlineEvaluationMode(gameId, rowCount);
  if (mode === 'cluster') return hotlineEvaluateClusters(grid);
  if (mode === 'ways') return hotlineEvaluateAdjacentWays(grid);

  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;
  const reelCount = grid.length === HOTLINE_MINI_REELS ? HOTLINE_MINI_REELS : HOTLINE_REELS;
  const paylines = getHotlinePaylinesForGame(gameId, reelCount, rowCount);
  const symbols = getHotlineSymbolsForGrid(reelCount, rowCount);
  // The generic paytable was calibrated around five active lines. Imported
  // games expose the total stake, so normalize additional source paylines to
  // avoid multiplying the expected return merely by enabling their overlays.
  const payoutScale = Math.min(1, 5 / Math.max(1, paylines.length));

  for (const payline of paylines) {
    const leftWin = evaluatePaylineEdge(grid, payline, reelCount, 'ltr', symbols, payoutScale);
    const rightWin = evaluatePaylineEdge(grid, payline, reelCount, 'rtl', symbols, payoutScale);
    if (leftWin) {
      lines.push(leftWin);
      totalMultiplier += leftWin.payout;
    }
    if (rightWin && (!leftWin || !isSamePaylineWin(leftWin, rightWin))) {
      lines.push(rightWin);
      totalMultiplier += rightWin.payout;
    }
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

function hotlineEvaluateClusters(grid: number[][]): {
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

function hotlineEvaluateAdjacentWays(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const reelCount = grid.length;
  const rowCount = Math.max(...grid.map((column) => column.length), 0);
  const symbols = getHotlineSymbolsForGrid(reelCount, rowCount);
  const payoutDivisor = getAdjacentWaysPayoutDivisor(reelCount, rowCount);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let symbol = 0; symbol < symbols.length; symbol += 1) {
    const positions: HotlineWinPosition[] = [];
    let consecutiveReels = 0;
    let ways = 1;
    for (let reel = 0; reel < reelCount; reel += 1) {
      const matches: HotlineWinPosition[] = [];
      for (let row = 0; row < (grid[reel]?.length ?? 0); row += 1) {
        if (grid[reel]?.[row] === symbol) matches.push({ reel, row });
      }
      if (matches.length === 0) break;
      consecutiveReels += 1;
      ways *= matches.length;
      positions.push(...matches);
    }
    if (consecutiveReels < 3) continue;

    const symbolMeta = symbols[symbol]!;
    const rawPayout =
      consecutiveReels >= 5
        ? symbolMeta.payout5
        : consecutiveReels === 4
          ? symbolMeta.payout4
          : symbolMeta.payout3;
    const payout = roundMultiplier((rawPayout * ways) / payoutDivisor);
    if (payout <= 0) continue;
    const firstRows = Array.from({ length: reelCount }, (_, reel) =>
      reel < consecutiveReels
        ? (positions.find((position) => position.reel === reel)?.row ?? 0)
        : 0,
    );
    lines.push({
      lineId: `ways-${symbol}`,
      path: firstRows,
      positions,
      startReel: 0,
      direction: 'ltr',
      row: firstRows[0] ?? 0,
      symbol,
      count: consecutiveReels,
      payout,
      ways,
    });
    totalMultiplier += payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

/**
 * The shared symbol tables are total-stake multipliers rather than per-way
 * coin values. These layout divisors keep their long-run return aligned with
 * the fixed-line variants while still paying proportionally to winning ways.
 */
function getAdjacentWaysPayoutDivisor(reelCount: number, rowCount: number): number {
  if (rowCount >= 5) return reelCount >= 6 ? 7 : 6.1;
  if (rowCount === 4) return 33.1;
  return 9.1;
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
