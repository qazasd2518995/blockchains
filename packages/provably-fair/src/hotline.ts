import { hmacIntStream } from './hmac.js';
import { getH5OriginalGameSpec } from './h5OriginalSpecs.js';

export const HOTLINE_REELS = 5;
export const HOTLINE_MINI_REELS = 3;
export const HOTLINE_ROWS = 3;
export const HOTLINE_MEGA_REELS = 6;
export const HOTLINE_MEGA_ROWS = 5;
export const HOTLINE_MEGA_MAX_CASCADES = 20;
export const HOTLINE_MEGA_CLUSTER_MIN_COUNT = 8;
export const HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER = 1000;

export function getHotlineMaximumTotalMultiplier(gameId?: string): number {
  return getH5OriginalGameSpec(gameId)?.maximumWinMultiplier ?? HOTLINE_MEGA_MAX_TOTAL_MULTIPLIER;
}
export const HOTLINE_3X3_GAME_IDS = new Set(['temple-slot', 'candy-slot', 'sakura-slot']);
export const HOTLINE_MEGA_GAME_IDS = new Set([
  'thunder-slot',
  'dragon-mega-slot',
  'nebula-slot',
  'jungle-slot',
  'vampire-slot',
]);
const HOTLINE_GAME_LAYOUTS = new Map<
  string,
  { reels: number; rows: number; reelRows?: readonly number[] }
>([
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
  ['h5-fortune-ox', { reels: 3, rows: 4, reelRows: [3, 4, 3] }],
  ['h5-mahjong-ways', { reels: 5, rows: 4 }],
  ['h5-mahjong-ways-2', { reels: 5, rows: 5, reelRows: [4, 5, 5, 5, 4] }],
  ['h5-dragon-hatch', { reels: 5, rows: 5 }],
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
  ...Array.from(HOTLINE_GAME_LAYOUTS.keys()).filter(
    (gameId) =>
      gameId !== 'h5-dragon-hatch' &&
      gameId !== 'h5-flying-together' &&
      gameId !== 'h5-star-97' &&
      gameId !== 'h5-fortune-ox' &&
      gameId !== 'h5-fortune-gems',
  ),
]);
export const HOTLINE_SOURCE_FEATURE_GAME_IDS = new Set([
  'h5-fortune-ox',
  'h5-fortune-gems',
  'h5-aztec-treasure',
  'h5-star-97',
]);
export const FORTUNE_OX_FEATURE_TRIGGER_RATE = 0.0077;
export const FORTUNE_OX_FULL_SCREEN_MULTIPLIER = 10;
export const FORTUNE_GEMS_MULTIPLIERS = [1, 2, 3, 5, 10, 15] as const;
const HOTLINE_MAHJONG_GAME_IDS = new Set(['h5-mahjong-ways', 'h5-mahjong-ways-2']);
const HOTLINE_BOUNTY_GAME_IDS = new Set(['h5-captains-bounty', 'h5-queen-of-bounty']);
const HOTLINE_MAHJONG_BASE_MULTIPLIERS = [1, 2, 3, 5] as const;
const HOTLINE_MAHJONG_FREE_MULTIPLIERS = [2, 4, 6, 10] as const;
const HOTLINE_MAHJONG_GOLD_RATE = 0.2;
const HOTLINE_BOUNTY_WILD_RATE = 0.035;
const HOTLINE_CAISHEN_WILD_RATE = 0.03;
const HOTLINE_GOLDEN_EMPIRE_GOLD_RATE = 0.12;
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
  payout2?: number;
  payout3: number;
  payout4: number;
  payout5: number;
  payout6?: number;
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

export type HotlineSymbol = HotlineSymbolDefinition;

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
  gameId?: string,
): number[][] {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  const grid: number[][] = [];
  for (let r = 0; r < reelCount; r += 1) {
    const col: number[] = [];
    for (let y = 0; y < reelRows[r]!; y += 1) {
      const v = stream.next().value as number;
      let symbol = pickSymbol(v / 0x1_0000_0000, symbols);
      if (gameId === 'h5-flying-together' && (r === 0 || r === reelCount - 1)) {
        const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 13) - 1;
        for (let retry = 0; symbol === wild && retry < 16; retry += 1) {
          symbol = pickSymbol((stream.next().value as number) / 0x1_0000_0000, symbols);
        }
        if (symbol === wild) symbol = 0;
      }
      col.push(symbol);
    }
    grid.push(col);
  }
  return grid;
}

/**
 * Runs source-specific non-cascade features without translating them into the
 * shared free-spin model. Fortune Ox uses one server result for the final
 * "respin until win" board; its Cocos scene supplies the continuous reel
 * animation from the sourceFeature flag.
 */
export function hotlineSpinSourceFeatureRound(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gameId: string,
  reelCount = getHotlineReelCount(gameId),
  rowCount = getHotlineRowCount(gameId),
  mode?: HotlineSourceFeatureMode,
): HotlineCascadeResult {
  if (gameId === 'h5-aztec-treasure') {
    const stream = hmacIntStream(serverSeed, clientSeed, nonce);
    const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
    const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
    const grid = Array.from({ length: reelCount }, () =>
      Array.from({ length: rowCount }, () => pickSymbol(nextRandom01(), symbols)),
    );
    const evaluated = evaluateAztecGems(grid);
    const multiplierIndex = pickFortuneGemsMultiplierIndex(nextRandom01(), false);
    const multiplier = FORTUNE_GEMS_MULTIPLIERS[multiplierIndex]!;
    const lines = evaluated.lines.map((line) => ({
      ...line,
      payout: roundMultiplier(line.payout * multiplier),
    }));
    return {
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines,
      totalMultiplier: roundMultiplier(evaluated.totalMultiplier * multiplier),
      sourceFeature: {
        type: 'aztec-gems-multiplier',
        multiplierIndex,
        multiplier,
      },
    };
  }

  if (gameId === 'h5-fortune-gems') {
    const stream = hmacIntStream(serverSeed, clientSeed, nonce);
    const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
    const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
    const grid = Array.from({ length: reelCount }, () =>
      Array.from({ length: rowCount }, () => pickSymbol(nextRandom01(), symbols)),
    );
    const evaluated = hotlineEvaluate(grid, gameId);
    const enhancedBet = mode === 'fortune-gems-extra-bet';
    const multiplierIndex = pickFortuneGemsMultiplierIndex(nextRandom01(), enhancedBet);
    const multiplier = FORTUNE_GEMS_MULTIPLIERS[multiplierIndex]!;
    const lines = evaluated.lines.map((line) => ({
      ...line,
      payout: roundMultiplier(line.payout * multiplier),
    }));
    const totalMultiplier = roundMultiplier(evaluated.totalMultiplier * multiplier);
    return {
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines,
      totalMultiplier,
      sourceFeature: {
        type: 'fortune-gems-multiplier',
        multiplierIndex,
        multiplier,
        enhancedBet,
        winEx: totalMultiplier > 0,
      },
    };
  }

  if (gameId !== 'h5-fortune-ox') {
    const grid = hotlineSpin(serverSeed, clientSeed, nonce, reelCount, rowCount, gameId);
    const evaluated = hotlineEvaluate(grid, gameId);
    if (gameId === 'h5-star-97') {
      const sevenCount = grid.flat().filter((symbol) => symbol === 8).length;
      return {
        initialGrid: cloneGrid(grid),
        finalGrid: cloneGrid(grid),
        cascades: [],
        lines: evaluated.lines,
        totalMultiplier: evaluated.totalMultiplier,
        sourceFeature: {
          type: 'star-97-seven-multiplier',
          sevenCount,
          multiplier: getStar97SevenMultiplier(grid),
        },
      };
    }
    return {
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines: evaluated.lines,
      totalMultiplier: evaluated.totalMultiplier,
    };
  }

  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
  const nextSymbol = (): number => pickSymbol(nextRandom01(), symbols);
  const triggered = nextRandom01() < FORTUNE_OX_FEATURE_TRIGGER_RATE;
  let respins = 0;
  let grid: number[][];
  let evaluated: ReturnType<typeof hotlineEvaluate>;

  if (triggered) {
    do {
      respins += 1;
      const outer = Array.from({ length: 3 }, () => nextSymbol());
      grid = [outer, Array.from({ length: 4 }, () => nextSymbol()), [...outer]];
      evaluated = hotlineEvaluate(grid, gameId);
    } while (evaluated.totalMultiplier <= 0 && respins < 512);

    if (evaluated.totalMultiplier <= 0) {
      const payline = H5_FORTUNE_OX_PAYLINES[respins % H5_FORTUNE_OX_PAYLINES.length]!;
      const symbol = grid[0]![payline.path[0]!]!;
      grid[1]![payline.path[1]!] = symbol;
      grid[2]![payline.path[2]!] = symbol;
      evaluated = hotlineEvaluate(grid, gameId);
    }
  } else {
    const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
    grid = reelRows.map((rows) => Array.from({ length: rows }, () => nextSymbol()));
    evaluated = hotlineEvaluate(grid, gameId);
  }

  const fullScreenMultiplier = getFortuneOxFullScreenMultiplier(grid);
  return {
    initialGrid: cloneGrid(grid),
    finalGrid: cloneGrid(grid),
    cascades: [],
    lines: evaluated.lines,
    totalMultiplier: evaluated.totalMultiplier,
    ...(triggered || fullScreenMultiplier > 1
      ? {
          sourceFeature: {
            type: 'fortune-ox-respin' as const,
            triggered,
            respins,
            fullScreenMultiplier,
          },
        }
      : {}),
  };
}

function pickFortuneGemsMultiplierIndex(rand01: number, enhancedBet: boolean): number {
  // The source exposes indices 0-5 as 1x/2x/3x/5x/10x/15x. Extra Bet costs
  // 50% more and removes 1x; the remaining values stay weighted toward the
  // low multipliers so high wheel stops remain visibly rare.
  const weights = enhancedBet ? [0, 44, 28, 17, 8, 3] : [52, 24, 13, 7, 3, 1];
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  let target = rand01 * total;
  for (let index = 0; index < weights.length; index += 1) {
    target -= weights[index]!;
    if (target < 0) return index;
  }
  return weights.length - 1;
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
  /** Source reel positions rendered with the gold-plated Mahjong prefab. */
  goldPositions?: HotlineWinPosition[];
  sourceAction?: HotlineCascadeSourceAction;
  sourceGrid?: number[][];
  collectedSymbols?: number;
  collectedThisStep?: number;
  sourceStacks?: HotlineSourceStack[];
  /** Multiplier rendered by source clients while this exact tumble settles. */
  sourceAppliedMultiplier?: number;
}

export interface HotlineSourceStack {
  id: number;
  symbol: number;
  positions: HotlineWinPosition[];
  state: 'ordinary' | 'gold' | 'wild';
  remaining?: number;
}

export interface HotlineCascadeSourceAction {
  type: 'dragon-earth' | 'dragon-water' | 'dragon-fire' | 'dragon-queen';
  positions: HotlineWinPosition[];
  symbol?: number;
}

export interface HotlineSpecialSymbol extends HotlineWinPosition {
  type: 'scatter' | 'multiplier';
  value?: number;
}

export type HotlineSourceFeatureResult =
  | {
      type: 'fortune-ox-respin';
      triggered: boolean;
      respins: number;
      fullScreenMultiplier: number;
    }
  | {
      type: 'fortune-gems-multiplier';
      multiplierIndex: number;
      multiplier: number;
      enhancedBet: boolean;
      winEx: boolean;
    }
  | {
      type: 'aztec-gems-multiplier';
      multiplierIndex: number;
      multiplier: (typeof FORTUNE_GEMS_MULTIPLIERS)[number];
    }
  | {
      type: 'star-97-seven-multiplier';
      sevenCount: number;
      multiplier: number;
    };

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
  /** Persistent source multiplier after this free spin has completed. */
  sourceMultiplierBank?: number;
  totalMultiplier: number;
  extraFreeSpinsAwarded: number;
  sourceJackpot?: HotlineSourceJackpotResult;
  sourceMiniGame?: HotlineFruitLittleMaryMiniGameResult;
  sourceFeature?: HotlineSourceFeatureResult;
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
}

export type HotlineSourceJackpotResult =
  | {
      type: 'diamond-strike-jackpot';
      tierMultiplier: 10 | 30 | 100 | 1000;
      picks: number[];
      payoutMultiplier: number;
    }
  | {
      type: 'fruit-little-mary-jackpot';
      positions: HotlineWinPosition[];
      payoutMultiplier: number;
    }
  | {
      type: 'fire-88-jackpot';
      tierMultiplier: 38 | 88 | 888;
      picks: number[];
      payoutMultiplier: number;
    };

export interface HotlineFruitLittleMaryMiniRound {
  /** Source mini-prefab ids (0-6) shown on the four center reels. */
  reelSymbols: number[];
  /** Zero-based position on the source scene's 24-cell running-light ring. */
  stopIndex: number;
  /** Award printed above the mini reels, expressed against one line bet. */
  lineBetMultiplier: number;
}

export interface HotlineFruitLittleMaryMiniGameResult {
  type: 'fruit-little-mary';
  attempts: number;
  rounds: HotlineFruitLittleMaryMiniRound[];
  lineBetMultiplier: number;
  /** Normalized against the nine-line total bet used by settlement. */
  payoutMultiplier: number;
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
  /** Source selector mode (for example Queen 20/10/5 or Lucky 777 28/14/7). */
  sourceFreeModeType?: number;
  /** Fixed multiplier applied to every source free-game win (Caishen Wins = 8). */
  sourceFreeWinMultiplier?: number;
  /** Pick-result contract consumed by Diamond Strike's packaged getOpenBox UI. */
  sourceJackpot?: HotlineSourceJackpotResult;
  /** Complete running-light/reel contract consumed by Fruit Little Mary's mini game. */
  sourceMiniGame?: HotlineFruitLittleMaryMiniGameResult;
}

export interface HotlineCascadeResult {
  initialGrid: number[][];
  finalGrid: number[][];
  cascades: HotlineCascadeStep[];
  lines: HotlineWinLine[];
  totalMultiplier: number;
  features?: HotlineMegaFeatureResult;
  sourceFeature?: HotlineSourceFeatureResult;
  finalGoldPositions?: HotlineWinPosition[];
  finalSourceStacks?: HotlineSourceStack[];
}

export type HotlineSourceFeatureMode = 'fortune-gems-extra-bet';

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
  /** Fraction of Nine-Line Pull King's visible jackpot awarded by this line. */
  jackpotShare?: number;
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
  sourceFreeModeType = 1,
): HotlineCascadeResult {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const nextRandom01 = (): number => {
    const v = stream.next().value as number;
    return v / 0x1_0000_0000;
  };
  const nextSymbol = (): number => {
    return pickSymbol(nextRandom01(), symbols);
  };

  const round = runHotlineCascadeRound(
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    gameId,
    nextRandom01,
  );
  const features = enableFeatures
    ? buildMegaFeatureResult(
        round,
        nextRandom01,
        nextSymbol,
        reelCount,
        rowCount,
        maxCascades,
        gameId,
        sourceFreeModeType,
      )
    : undefined;

  return {
    initialGrid: round.initialGrid,
    finalGrid: round.finalGrid,
    cascades: round.cascades,
    lines: round.lines,
    totalMultiplier: features?.totalMultiplier ?? capMegaMultiplier(round.totalMultiplier, gameId),
    ...(features ? { features } : {}),
    ...(round.finalGoldPositions
      ? { finalGoldPositions: clonePositions(round.finalGoldPositions) }
      : {}),
    ...(round.finalSourceStacks
      ? { finalSourceStacks: round.finalSourceStacks.map(cloneSourceStack) }
      : {}),
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
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const nextRandom01 = (): number => {
    const v = stream.next().value as number;
    return v / 0x1_0000_0000;
  };
  const nextSymbol = (): number => {
    return pickSymbol(nextRandom01(), symbols);
  };
  let nextSourceStackId = 0;
  const initialGoldenStacks = isGoldenEmpire(gameId)
    ? getHotlineReelRowCounts(gameId, reelCount, rowCount).map((rows, reel) =>
        drawGoldenEmpireColumn(rows, reel, nextSymbol, nextRandom01, () => nextSourceStackId++),
      )
    : undefined;
  const initialGrid = initialGoldenStacks
    ? expandSourceStackColumns(initialGoldenStacks)
    : getHotlineReelRowCounts(gameId, reelCount, rowCount).map((rows, reel) =>
        isCaishenWins(gameId)
          ? drawCaishenColumn(rows, reel, nextSymbol, nextRandom01)
          : Array.from({ length: rows }, () =>
              drawSourceSpecialSymbol(nextSymbol, reel, gameId, nextRandom01),
            ),
      );
  const sourceFourScatterFeature = isCaishenWins(gameId) || isGoldenEmpire(gameId);
  const gates = isGatesOfOlympus(gameId);
  const scatterTrigger = gates ? 3 : sourceFourScatterFeature ? 4 : HOTLINE_MEGA_FREE_SPIN_TRIGGER;
  const initialScatterCount = gates
    ? 10
    : sourceFourScatterFeature
      ? getCaishenFreeSpinAward(4)
      : HOTLINE_MEGA_FREE_SPIN_BASE_AWARD;
  const scatterSymbols = pickUniqueGridPositions(
    nextRandom01,
    scatterTrigger,
    getHotlineReelRowCounts(gameId, reelCount, rowCount),
  ).map((position) => ({ ...position, type: 'scatter' as const }));
  const cappedFreeSpins = buildBuyFeatureFreeSpinsWithinCap(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    gameId,
    initialScatterCount,
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
    ...(isCaishenWins(gameId) ? { sourceFreeWinMultiplier: 8 } : {}),
  };

  return {
    initialGrid: cloneGrid(initialGrid),
    finalGrid: cloneGrid(initialGrid),
    cascades: [],
    lines: [],
    totalMultiplier: features.totalMultiplier,
    features,
    ...(initialGoldenStacks
      ? { finalSourceStacks: exposeSourceStackColumns(initialGoldenStacks) }
      : {}),
  };
}

type HotlineInternalCascadeRound = Omit<HotlineCascadeResult, 'features'>;

interface HotlineInternalSourceStack {
  id: number;
  symbol: number;
  height: number;
  state: HotlineSourceStack['state'];
  remaining?: number;
}

function runHotlineCascadeRound(
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
  gameId?: string,
  nextRandom01?: () => number,
  freeSpinMode = false,
  bountyFreeModeType = 1,
  sourceFreeWinMultiplier = 8,
  persistentFreeMultiplierStart = 1,
): HotlineInternalCascadeRound {
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  let nextSourceStackId = 0;
  let goldenSourceColumns = isGoldenEmpire(gameId)
    ? reelRows.map((rows, reel) =>
        drawGoldenEmpireColumn(
          rows,
          reel,
          nextSymbol,
          nextRandom01 ?? (() => 0.5),
          () => nextSourceStackId++,
        ),
      )
    : undefined;
  let grid = goldenSourceColumns
    ? expandSourceStackColumns(goldenSourceColumns)
    : reelRows.map((rows, reel) =>
        isCaishenWins(gameId)
          ? drawCaishenColumn(rows, reel, nextSymbol, nextRandom01 ?? (() => 0.5))
          : Array.from({ length: rows }, () =>
              drawSourceSpecialSymbol(nextSymbol, reel, gameId, nextRandom01),
            ),
      );
  if (gameId === 'h5-fire-88') {
    grid = normalizeFire88ExclusiveTriggers(grid, nextSymbol);
  }
  let goldPositions = drawMahjongGoldPositions(grid, gameId, nextRandom01, freeSpinMode);
  const initialGrid = cloneGrid(grid);
  const cascades: HotlineCascadeStep[] = [];
  const allLines: HotlineWinLine[] = [];
  let totalMultiplier = 0;
  let collectedSymbols = 0;
  const appliedDragonActions = new Set<HotlineCascadeSourceAction['type']>();

  for (let index = 0; index < maxCascades; index += 1) {
    const sourceStacks = goldenSourceColumns
      ? exposeSourceStackColumns(goldenSourceColumns)
      : undefined;
    let sourceAction: HotlineCascadeSourceAction | undefined;
    let sourceGrid: number[][] | undefined;
    let evaluated = hotlineEvaluate(grid, gameId, sourceStacks, nextRandom01);

    // Dragon features are only allowed once the newly collapsed board has no
    // natural win. The previous implementation transformed the board before
    // evaluating it, which could skip a legitimate cascade and make the
    // collection animation disagree with the visible symbols.
    if (gameId === 'h5-dragon-hatch' && evaluated.lines.length === 0) {
      const action = applyDragonHatchCollectionAction(
        grid,
        collectedSymbols,
        appliedDragonActions,
        nextSymbol,
        nextRandom01 ?? (() => 0.5),
      );
      if (action) {
        sourceGrid = cloneGrid(grid);
        grid = action.grid;
        sourceAction = action.action;
        appliedDragonActions.add(action.action.type);

        // Earth first clears every low-value card. The source client renders
        // those cells as zero/blank, then consumes the following response as
        // the refilled board, so keep this transformation as its own step.
        if (sourceAction.type === 'dragon-earth') {
          cascades.push({
            index,
            grid: cloneGrid(grid),
            lines: [],
            multiplier: 0,
            removed: [],
            sourceAction,
            sourceGrid,
            collectedSymbols,
            collectedThisStep: 0,
          });
          continue;
        }

        evaluated = hotlineEvaluate(grid, gameId, sourceStacks, nextRandom01);
      }
    }
    const hasNineLineJackpot = evaluated.lines.some((line) => Number(line.jackpotShare || 0) > 0);
    const hasWaterMarginBonus =
      gameId === 'h5-water-margin' &&
      evaluated.lines.some(
        (line) =>
          line.symbol ===
            Number(getH5OriginalGameSpec('h5-water-margin')?.specialSymbols.bonusDragon ?? 9) - 1 &&
          getWaterMarginBonusGameAward(line.count) > 0,
      );
    const hasFruitLittleMaryBonus =
      gameId === 'h5-fruit-little-mary' &&
      evaluated.lines.some(
        (line) =>
          line.symbol ===
            Number(getH5OriginalGameSpec('h5-fruit-little-mary')?.specialSymbols.wild ?? 11) - 1 &&
          getFruitLittleMaryMiniGameAward(line.count) > 0,
      );
    if (
      evaluated.lines.length === 0 ||
      (evaluated.totalMultiplier <= 0 &&
        !hasNineLineJackpot &&
        !hasWaterMarginBonus &&
        !hasFruitLittleMaryBonus)
    ) {
      // Dragon Hatch still needs a response when a collection feature changes
      // the board without immediately creating a paying cluster. Its source
      // scene animates `orl` -> `rl` from `df`, then safely returns to idle.
      if (sourceAction && sourceGrid) {
        cascades.push({
          index,
          grid: cloneGrid(grid),
          lines: [],
          multiplier: 0,
          removed: [],
          sourceAction,
          sourceGrid,
          collectedSymbols,
          collectedThisStep: 0,
        });
        continue;
      }
      break;
    }

    const removed = collectHotlineWinPositions(grid, evaluated.lines);
    if (removed.length === 0) break;

    const cascadeWinMultiplier = getHotlineCascadeWinMultiplier(
      gameId,
      index,
      freeSpinMode,
      bountyFreeModeType,
      sourceFreeWinMultiplier,
      persistentFreeMultiplierStart,
    );
    const lines = evaluated.lines.map((line) => ({
      ...line,
      payout: roundMultiplier(line.payout * cascadeWinMultiplier),
    }));
    const stepMultiplier = roundMultiplier(evaluated.totalMultiplier * cascadeWinMultiplier);
    const collectedThisStep = gameId === 'h5-dragon-hatch' ? removed.length : 0;
    collectedSymbols += collectedThisStep;

    cascades.push({
      index,
      grid: cloneGrid(grid),
      lines,
      multiplier: stepMultiplier,
      removed,
      ...(goldPositions.length > 0 ? { goldPositions: clonePositions(goldPositions) } : {}),
      ...(sourceAction && sourceGrid ? { sourceAction, sourceGrid } : {}),
      ...(gameId === 'h5-dragon-hatch' ? { collectedSymbols, collectedThisStep } : {}),
      ...(sourceStacks ? { sourceStacks } : {}),
      ...(isGatesOfOlympus(gameId) ? { sourceAppliedMultiplier: cascadeWinMultiplier } : {}),
    });
    allLines.push(...lines);
    totalMultiplier += stepMultiplier;
    if (isMahjongGame(gameId)) {
      const dropped = applyMahjongCascadeDrop(
        grid,
        goldPositions,
        removed,
        nextSymbol,
        gameId,
        nextRandom01,
        freeSpinMode,
      );
      grid = dropped.grid;
      goldPositions = dropped.goldPositions;
    } else if (goldenSourceColumns && isGoldenEmpire(gameId)) {
      goldenSourceColumns = applyGoldenEmpireCascadeDrop(
        goldenSourceColumns,
        removed,
        rowCount,
        nextSymbol,
        nextRandom01 ?? (() => 0.5),
        () => nextSourceStackId++,
      );
      grid = expandSourceStackColumns(goldenSourceColumns);
    } else if (gameId && (HOTLINE_BOUNTY_GAME_IDS.has(gameId) || isCaishenWins(gameId))) {
      grid = applySourceSpecialCascadeDrop(
        grid,
        removed,
        rowCount,
        nextSymbol,
        gameId,
        nextRandom01,
      );
    } else {
      grid = applyHotlineCascadeDrop(grid, removed, rowCount, nextSymbol);
    }
  }

  return {
    initialGrid,
    finalGrid: cloneGrid(grid),
    cascades,
    lines: allLines,
    totalMultiplier: Number(totalMultiplier.toFixed(4)),
    ...(goldPositions.length > 0 ? { finalGoldPositions: clonePositions(goldPositions) } : {}),
    ...(goldenSourceColumns
      ? { finalSourceStacks: exposeSourceStackColumns(goldenSourceColumns) }
      : {}),
  };
}

interface DragonHatchSourceActionResult {
  grid: number[][];
  action: HotlineCascadeSourceAction;
}

/**
 * Recreates Dragon Hatch's four source collection thresholds. The original
 * client calls them Earth, Water, Fire and Queen and renders them from `df`.
 * Keeping the transformation here means the following cluster evaluation and
 * the animation consume exactly the same authoritative board.
 */
export function applyDragonHatchCollectionAction(
  grid: number[][],
  collectedSymbols: number,
  applied: ReadonlySet<HotlineCascadeSourceAction['type']>,
  nextSymbol: () => number,
  nextRandom01: () => number,
): DragonHatchSourceActionResult | null {
  if (collectedSymbols >= 10 && !applied.has('dragon-earth')) {
    const positions = grid.flatMap((column, reel) =>
      column.flatMap((symbol, row) => (symbol <= 3 ? [{ reel, row }] : [])),
    );
    return {
      grid: applyHotlineCascadeDrop(grid, positions, 5, nextSymbol),
      action: { type: 'dragon-earth', positions },
    };
  }

  if (collectedSymbols >= 30 && !applied.has('dragon-water')) {
    const positions = pickUniqueGridPositions(
      nextRandom01,
      4,
      grid.map((column) => column.length),
    );
    const transformed = cloneGrid(grid);
    for (const position of positions) transformed[position.reel]![position.row] = 8;
    return {
      grid: transformed,
      action: { type: 'dragon-water', positions },
    };
  }

  if (collectedSymbols >= 50 && !applied.has('dragon-fire')) {
    const symbol = Math.min(7, Math.floor(nextRandom01() * 8));
    const positions = grid.flatMap((column, reel) =>
      column.flatMap((_value, row) => ((reel + row) % 2 === 0 ? [{ reel, row }] : [])),
    );
    const transformed = cloneGrid(grid);
    for (const position of positions) transformed[position.reel]![position.row] = symbol;
    return {
      grid: transformed,
      action: { type: 'dragon-fire', positions, symbol },
    };
  }

  if (collectedSymbols >= 70 && !applied.has('dragon-queen')) {
    const positions = grid.flatMap((column, reel) =>
      column.flatMap((symbol, row) => (symbol <= 3 ? [{ reel, row }] : [])),
    );
    const transformed = cloneGrid(grid);
    for (const position of positions) {
      transformed[position.reel]![position.row] = transformed[position.reel]![position.row]! + 4;
    }
    return {
      grid: transformed,
      action: { type: 'dragon-queen', positions },
    };
  }

  return null;
}

function buildMegaFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
  gameId?: string,
  requestedSourceFreeModeType = 1,
): HotlineMegaFeatureResult {
  if (gameId === 'h5-nine-line-pull-king') {
    return buildNineLinePullKingFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-water-margin') {
    return buildWaterMarginFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-diamond-strike') {
    return buildDiamondStrikeFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-yu-pu-tuan') {
    return buildYuPuTuanFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-fruit-little-mary') {
    return buildFruitLittleMaryFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-fire-88') {
    return buildFire88FeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  if (gameId === 'h5-lucky-777') {
    return buildLucky777FeatureResult(baseRound);
  }
  if (gameId === 'h5-caishen-fa-fa-fa') {
    return buildCaishenFaFaFaFeatureResult(baseRound, nextRandom01, nextSymbol);
  }
  const mahjong = isMahjongGame(gameId);
  const bounty = Boolean(gameId && HOTLINE_BOUNTY_GAME_IDS.has(gameId));
  const caishen = isCaishenWins(gameId);
  const golden = isGoldenEmpire(gameId);
  const gates = isGatesOfOlympus(gameId);
  const sourceFreeModeType = bounty
    ? normalizeBountyFreeModeType(gameId!, requestedSourceFreeModeType)
    : 0;
  const scatterSymbols = mahjong
    ? drawMahjongScatterSymbols(nextRandom01, gameId!, false)
    : bounty
      ? drawBountyScatterSymbols(nextRandom01, gameId!, false, baseRound.cascades[0]?.removed ?? [])
      : caishen || golden
        ? drawCaishenScatterSymbols(nextRandom01, false, baseRound.cascades[0]?.removed ?? [])
        : drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, false);
  const baseScatterMultiplier =
    mahjong || bounty || caishen || golden || gates
      ? 0
      : getMegaScatterPayout(scatterSymbols.length);
  const baseSymbolWinMultiplier = baseRound.totalMultiplier;
  const baseWinMultiplier = roundMultiplier(baseSymbolWinMultiplier + baseScatterMultiplier);
  const baseMultiplierSymbols =
    mahjong || bounty || caishen || golden || gates
      ? []
      : drawMegaMultiplierSymbols(
          nextRandom01,
          reelCount,
          rowCount,
          baseSymbolWinMultiplier,
          false,
          scatterSymbols,
          gameId,
        );
  const baseMultiplierTotal = sumSpecialValues(baseMultiplierSymbols);
  const baseAppliedMultiplier =
    baseSymbolWinMultiplier > 0 && baseMultiplierTotal > 0 ? baseMultiplierTotal : 1;
  const baseTotalMultiplier = roundMultiplier(
    baseScatterMultiplier + baseSymbolWinMultiplier * baseAppliedMultiplier,
  );

  const initialFreeSpinsAwarded = mahjong
    ? getMahjongFreeSpinAward(gameId!, scatterSymbols.length)
    : bounty
      ? getBountyFreeSpinAward(gameId!, scatterSymbols.length, sourceFreeModeType)
      : caishen || golden
        ? getCaishenFreeSpinAward(scatterSymbols.length)
        : gates
          ? scatterSymbols.length >= 3
            ? 10
            : 0
          : scatterSymbols.length >= HOTLINE_MEGA_FREE_SPIN_TRIGGER
            ? HOTLINE_MEGA_FREE_SPIN_BASE_AWARD
            : 0;
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    maxCascades,
    initialFreeSpinsAwarded,
    gameId,
    sourceFreeModeType,
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
    totalMultiplier: capMegaMultiplier(
      baseTotalMultiplier + freeSpins.freeSpinWinMultiplier,
      gameId,
    ),
    ...(bounty ? { sourceFreeModeType } : {}),
    ...(caishen ? { sourceFreeWinMultiplier: 8 } : {}),
  };
}

function buildNineLinePullKingFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-nine-line-pull-king';
  const diamond = getH5OriginalGameSpec(gameId)!.specialSymbols.freeDiamond! - 1;
  const triggerLine = baseRound.lines
    .filter((line) => line.symbol === diamond && line.count >= 3)
    .sort((a, b) => b.count - a.count)[0];
  const triggerCount = triggerLine?.count ?? 0;
  const freeSpinsAwarded = getNineLinePullKingFreeSpinAward(triggerCount, nextRandom01());
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  for (let index = 0; index < freeSpinsAwarded; index += 1) {
    const round = runHotlineCascadeRound(nextSymbol, 5, 3, 1, gameId, nextRandom01, true);
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: round.initialGrid,
      finalGrid: round.finalGrid,
      cascades: round.cascades,
      lines: round.lines,
      baseMultiplier: round.totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: round.totalMultiplier,
      extraFreeSpinsAwarded: 0,
    });
  }

  const scatterSymbols = (triggerLine?.positions ?? []).map((position) => ({
    ...position,
    type: 'scatter' as const,
  }));
  return {
    scatterSymbols,
    scatterCount: triggerCount,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: baseRound.totalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseRound.totalMultiplier + freeSpinWinMultiplier),
  };
}

export function getNineLinePullKingFreeSpinAward(
  matchingDiamondCount: number,
  random01: number,
): number {
  const random = Math.max(0, Math.min(0.999999999, random01));
  if (matchingDiamondCount >= 5) return 11 + Math.floor(random * 10);
  if (matchingDiamondCount === 4) return 6 + Math.floor(random * 5);
  if (matchingDiamondCount === 3) return 1 + Math.floor(random * 5);
  return 0;
}

function buildWaterMarginFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-water-margin';
  const bonusDragon = getH5OriginalGameSpec(gameId)!.specialSymbols.bonusDragon! - 1;
  const triggerLines = baseRound.lines.filter(
    (line) => line.symbol === bonusDragon && getWaterMarginBonusGameAward(line.count) > 0,
  );
  const freeSpinsAwarded = Math.min(
    HOTLINE_MEGA_MAX_FREE_SPINS,
    triggerLines.reduce((sum, line) => sum + getWaterMarginBonusGameAward(line.count), 0),
  );
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  const nextFreeSymbol = (): number => {
    for (let retry = 0; retry < 16; retry += 1) {
      const symbol = nextSymbol();
      if (symbol !== bonusDragon) return symbol;
    }
    // The original SHZWheel applies the same deterministic fallback when id
    // 9 is selected during its free mode.
    return 0;
  };

  for (let index = 0; index < freeSpinsAwarded; index += 1) {
    const round = runHotlineCascadeRound(nextFreeSymbol, 5, 3, 1, gameId, nextRandom01, true);
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: round.initialGrid,
      finalGrid: round.finalGrid,
      cascades: round.cascades,
      lines: round.lines,
      baseMultiplier: round.totalMultiplier,
      scatterSymbols: [],
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: round.totalMultiplier,
      extraFreeSpinsAwarded: 0,
    });
  }

  const uniqueTriggerPositions = new Map<string, HotlineWinPosition>();
  triggerLines.forEach((line) =>
    (line.positions ?? []).forEach((position) =>
      uniqueTriggerPositions.set(`${position.reel}:${position.row}`, position),
    ),
  );
  const scatterSymbols = [...uniqueTriggerPositions.values()].map((position) => ({
    ...position,
    type: 'scatter' as const,
  }));

  return {
    scatterSymbols,
    scatterCount: scatterSymbols.length,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: baseRound.totalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseRound.totalMultiplier + freeSpinWinMultiplier),
  };
}

/** Bonus-game counts printed in the packaged Water Margin rule sprite. */
export function getWaterMarginBonusGameAward(matchingDragonCount: number): number {
  if (matchingDragonCount >= 15) return 27;
  if (matchingDragonCount >= 5) return 3;
  if (matchingDragonCount === 4) return 2;
  if (matchingDragonCount === 3) return 1;
  return 0;
}

function buildDiamondStrikeFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-diamond-strike';
  const spec = getH5OriginalGameSpec(gameId)!;
  const normalSeven = spec.specialSymbols.seven! - 1;
  const goldenSeven = spec.specialSymbols.goldenSeven! - 1;
  const baseScatterSymbols = collectDiamondStrikeScatterSymbols(baseRound.initialGrid);
  const initialFreeSpins = hasDiamondStrikeScatterTrigger(baseScatterSymbols) ? 8 : 0;
  const baseJackpot = drawDiamondStrikeJackpot(baseRound.initialGrid, nextRandom01);
  const baseJackpotMultiplier = baseJackpot?.payoutMultiplier ?? 0;
  const baseTotalMultiplier = roundMultiplier(baseRound.totalMultiplier + baseJackpotMultiplier);
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinsAwarded = initialFreeSpins;
  let freeSpinWinMultiplier = 0;

  const nextFreeSymbol = (): number => {
    const symbol = nextSymbol();
    // DiamondWheel.getRandomId swaps the ordinary Seven for its golden
    // jackpot-enabled counterpart while the source free background is active.
    return symbol === normalSeven ? goldenSeven : symbol;
  };

  for (let index = 0; index < freeSpinsAwarded && index < HOTLINE_MEGA_MAX_FREE_SPINS; index += 1) {
    const round = runHotlineCascadeRound(nextFreeSymbol, 5, 3, 1, gameId, nextRandom01, true);
    const scatterSymbols = collectDiamondStrikeScatterSymbols(round.initialGrid);
    const requestedExtraFreeSpins = hasDiamondStrikeScatterTrigger(scatterSymbols) ? 8 : 0;
    const previousFreeSpinsAwarded = freeSpinsAwarded;
    freeSpinsAwarded = Math.min(
      HOTLINE_MEGA_MAX_FREE_SPINS,
      freeSpinsAwarded + requestedExtraFreeSpins,
    );
    const extraFreeSpinsAwarded = freeSpinsAwarded - previousFreeSpinsAwarded;
    const sourceJackpot = drawDiamondStrikeJackpot(round.initialGrid, nextRandom01);
    const totalMultiplier = roundMultiplier(
      round.totalMultiplier + (sourceJackpot?.payoutMultiplier ?? 0),
    );
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: round.initialGrid,
      finalGrid: round.finalGrid,
      cascades: round.cascades,
      lines: round.lines,
      baseMultiplier: round.totalMultiplier,
      scatterSymbols,
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier,
      extraFreeSpinsAwarded,
      ...(sourceJackpot ? { sourceJackpot } : {}),
    });
  }

  return {
    scatterSymbols: baseScatterSymbols,
    scatterCount: new Set(baseScatterSymbols.map((symbol) => symbol.reel)).size,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseTotalMultiplier + freeSpinWinMultiplier),
    ...(baseJackpot ? { sourceJackpot: baseJackpot } : {}),
  };
}

function buildYuPuTuanFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-yu-pu-tuan';
  const spec = getH5OriginalGameSpec(gameId)!;
  const wild = spec.specialSymbols.wild! - 1;
  const normalA = 6 - 1;
  const upgradedShoes = spec.specialSymbols.shoes! - 1;
  const baseScatterSymbols = collectYuPuTuanScatterSymbols(baseRound.initialGrid);
  const freeSpinsAwarded = hasYuPuTuanScatterTrigger(baseScatterSymbols) ? 10 : 0;
  const stickyWilds = new Set<string>();
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  const nextFreeSymbol = (): number => {
    const symbol = nextSymbol();
    // YPTWheel.getRandomId upgrades the ordinary A (source id 6) into the
    // shoes premium symbol (source id 12) while free mode is active.
    return symbol === normalA ? upgradedShoes : symbol;
  };

  for (let index = 0; index < freeSpinsAwarded; index += 1) {
    const grid = getHotlineReelRowCounts(gameId, 5, 4).map((rows, reel) =>
      Array.from({ length: rows }, () =>
        drawSourceSpecialSymbol(nextFreeSymbol, reel, gameId, nextRandom01),
      ),
    );

    // Wilds on reels 2-5 remain in the same cell through the end of all ten
    // free games. Overlay old positions before discovering new sticky Wilds
    // so both evaluation and the Cocos animation consume the same board.
    for (const key of stickyWilds) {
      const [reel = -1, row = -1] = key.split(':').map(Number);
      if (grid[reel]?.[row] !== undefined) grid[reel]![row] = wild;
    }
    grid.forEach((column, reel) =>
      column.forEach((symbol, row) => {
        if (symbol === wild && reel >= 1) stickyWilds.add(`${reel}:${row}`);
      }),
    );

    const evaluated = evaluateYuPuTuan(grid);
    const removed = collectHotlineWinPositions(grid, evaluated.lines);
    const cascades: HotlineCascadeStep[] =
      evaluated.lines.length > 0
        ? [
            {
              index: 0,
              grid: cloneGrid(grid),
              lines: evaluated.lines,
              multiplier: evaluated.totalMultiplier,
              removed,
            },
          ]
        : [];
    const scatterSymbols = collectYuPuTuanScatterSymbols(grid);
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + evaluated.totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades,
      lines: evaluated.lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols,
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: evaluated.totalMultiplier,
      // The packaged rules award exactly ten spins and do not advertise a
      // Scatter retrigger during the feature.
      extraFreeSpinsAwarded: 0,
    });
  }

  return {
    scatterSymbols: baseScatterSymbols,
    scatterCount: new Set(baseScatterSymbols.map((symbol) => symbol.reel)).size,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: baseRound.totalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseRound.totalMultiplier + freeSpinWinMultiplier),
  };
}

function collectYuPuTuanScatterSymbols(grid: number[][]): HotlineSpecialSymbol[] {
  const scatter = Number(getH5OriginalGameSpec('h5-yu-pu-tuan')?.specialSymbols.scatter ?? 10) - 1;
  return grid.flatMap((column, reel) =>
    reel <= 2
      ? column.flatMap((symbol, row) =>
          symbol === scatter ? [{ reel, row, type: 'scatter' as const }] : [],
        )
      : [],
  );
}

const FRUIT_LITTLE_MARY_RING_SYMBOLS: readonly number[] = [
  6, 5, 0, -1, 6, 2, 1, 3, 4, -1, 2, 0, 1, 4, 5, -1, 6, 0, 3, 4, 5, -1, 2, 3,
] as const;
const FRUIT_LITTLE_MARY_MINI_MULTIPLIERS: readonly number[] = [5, 10, 20, 50, 70, 100, 200];
const FRUIT_LITTLE_MARY_BOMB_STOPS = [3, 9, 15, 21] as const;

/** Three/four/five leading Wilds award one/two/three source mini-game attempts. */
export function getFruitLittleMaryMiniGameAward(count: number): number {
  return count >= 5 ? 3 : count === 4 ? 2 : count === 3 ? 1 : 0;
}

function buildFruitLittleMaryMiniGame(
  attempts: number,
  nextRandom01: () => number,
): HotlineFruitLittleMaryMiniGameResult | undefined {
  if (attempts <= 0) return undefined;
  const validStops = FRUIT_LITTLE_MARY_RING_SYMBOLS.flatMap((symbol, stopIndex) =>
    symbol >= 0 ? [stopIndex] : [],
  );
  const rounds: HotlineFruitLittleMaryMiniRound[] = [];
  let lineBetMultiplier = 0;

  const centerReels = (target: number): number[] => {
    const matchingReel = Math.min(3, Math.floor(nextRandom01() * 4));
    return Array.from({ length: 4 }, (_, reel) => {
      if (reel === matchingReel) return target;
      // Keep the other three visibly different from the ring symbol and from
      // one another. This avoids manufacturing the source's separate 3/4 of
      // a-kind center-reel awards while the running-light award is settled.
      return (target + reel + 1) % 7 === target ? (target + reel + 2) % 7 : (target + reel + 1) % 7;
    });
  };

  for (let attempt = 0; attempt < attempts; attempt += 1) {
    const successRoll = nextRandom01();
    const successCount = successRoll < 0.25 ? 0 : successRoll < 0.85 ? 1 : 2;
    for (let success = 0; success < successCount; success += 1) {
      const stopIndex =
        validStops[
          Math.min(validStops.length - 1, Math.floor(nextRandom01() * validStops.length))
        ]!;
      const target = FRUIT_LITTLE_MARY_RING_SYMBOLS[stopIndex]!;
      const awardMultiplier = FRUIT_LITTLE_MARY_MINI_MULTIPLIERS[target]!;
      lineBetMultiplier = roundMultiplier(lineBetMultiplier + awardMultiplier);
      rounds.push({
        reelSymbols: centerReels(target),
        stopIndex,
        lineBetMultiplier: awardMultiplier,
      });
    }
    const bombStop =
      FRUIT_LITTLE_MARY_BOMB_STOPS[
        Math.min(
          FRUIT_LITTLE_MARY_BOMB_STOPS.length - 1,
          Math.floor(nextRandom01() * FRUIT_LITTLE_MARY_BOMB_STOPS.length),
        )
      ]!;
    rounds.push({
      reelSymbols: centerReels(Math.floor(nextRandom01() * 7)),
      stopIndex: bombStop,
      lineBetMultiplier: 0,
    });
  }

  return {
    type: 'fruit-little-mary',
    attempts,
    rounds,
    lineBetMultiplier,
    payoutMultiplier: roundMultiplier(lineBetMultiplier / 9),
  };
}

function collectFruitLittleMaryBonusSymbols(grid: number[][]): HotlineSpecialSymbol[] {
  const bonus =
    Number(getH5OriginalGameSpec('h5-fruit-little-mary')?.specialSymbols.bonus ?? 9) - 1;
  return grid.flatMap((column, reel) =>
    column.flatMap((symbol, row) =>
      symbol === bonus ? [{ reel, row, type: 'scatter' as const }] : [],
    ),
  );
}

function hasFruitLittleMaryBonusTrigger(symbols: readonly HotlineSpecialSymbol[]): boolean {
  const reels = new Set(symbols.map((symbol) => symbol.reel));
  for (let start = 0; start <= 2; start += 1) {
    if (reels.has(start) && reels.has(start + 1) && reels.has(start + 2)) return true;
  }
  return false;
}

function buildFruitLittleMaryFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-fruit-little-mary';
  const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 11) - 1;
  const miniAttempts = baseRound.lines.reduce(
    (sum, line) => sum + (line.symbol === wild ? getFruitLittleMaryMiniGameAward(line.count) : 0),
    0,
  );
  const sourceMiniGame = buildFruitLittleMaryMiniGame(miniAttempts, nextRandom01);
  const baseBonusSymbols = collectFruitLittleMaryBonusSymbols(baseRound.initialGrid);
  const initialFreeSpins = hasFruitLittleMaryBonusTrigger(baseBonusSymbols) ? 1 : 0;
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let pendingFreeSpins = initialFreeSpins;
  let freeSpinsAwarded = initialFreeSpins;
  let freeSpinWinMultiplier = 0;

  while (pendingFreeSpins > 0 && freeSpinRounds.length < HOTLINE_MEGA_MAX_FREE_SPINS) {
    pendingFreeSpins -= 1;
    let grid: number[][] = [];
    let evaluated: ReturnType<typeof evaluateFruitLittleMary> = { lines: [], totalMultiplier: 0 };
    // The packaged scene cannot safely open Little Mary and auto-advance a
    // free spin at the same time. Natural free boards therefore avoid a
    // second Wild-only mini trigger, while ordinary Wild substitutions remain
    // available on all other winning lines.
    for (let attempt = 0; attempt < 24; attempt += 1) {
      grid = getHotlineReelRowCounts(gameId, 5, 3).map((rows, reel) =>
        Array.from({ length: rows }, () =>
          drawSourceSpecialSymbol(nextSymbol, reel, gameId, nextRandom01),
        ),
      );
      evaluated = evaluateFruitLittleMary(grid);
      const hasMiniTrigger = evaluated.lines.some(
        (line) => line.symbol === wild && getFruitLittleMaryMiniGameAward(line.count) > 0,
      );
      if (!hasMiniTrigger) break;
    }
    const scatterSymbols = collectFruitLittleMaryBonusSymbols(grid);
    const extraFreeSpinsAwarded = hasFruitLittleMaryBonusTrigger(scatterSymbols) ? 1 : 0;
    pendingFreeSpins += extraFreeSpinsAwarded;
    freeSpinsAwarded += extraFreeSpinsAwarded;
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + evaluated.totalMultiplier);
    freeSpinRounds.push({
      index: freeSpinRounds.length,
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines: evaluated.lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols,
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: evaluated.totalMultiplier,
      extraFreeSpinsAwarded,
    });
  }

  const miniMultiplier = sourceMiniGame?.payoutMultiplier ?? 0;
  const baseTotalMultiplier = roundMultiplier(baseRound.totalMultiplier + miniMultiplier);
  return {
    scatterSymbols: baseBonusSymbols,
    scatterCount: new Set(baseBonusSymbols.map((symbol) => symbol.reel)).size,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseTotalMultiplier + freeSpinWinMultiplier),
    ...(sourceMiniGame ? { sourceMiniGame } : {}),
  };
}

function collectFire88SymbolPositions(grid: number[][], symbol: number): HotlineWinPosition[] {
  return grid.flatMap((column, reel) =>
    column.flatMap((value, row) => (value === symbol ? [{ reel, row }] : [])),
  );
}

function normalizeFire88ExclusiveTriggers(
  sourceGrid: number[][],
  nextSymbol: () => number,
): number[][] {
  const spec = getH5OriginalGameSpec('h5-fire-88')!;
  const wild = spec.specialSymbols.wild! - 1;
  const jackpot88 = spec.specialSymbols.jackpot88! - 1;
  const grid = cloneGrid(sourceGrid);
  const wilds = collectFire88SymbolPositions(grid, wild);
  if (wilds.length < 2 || collectFire88SymbolPositions(grid, jackpot88).length < 3) return grid;

  const replace = wilds.at(-1)!;
  let symbol = 0;
  for (let retry = 0; retry < 16; retry += 1) {
    symbol = nextSymbol();
    if (symbol !== wild && symbol !== jackpot88) break;
    symbol = 0;
  }
  grid[replace.reel]![replace.row] = symbol;
  return grid;
}

function drawFire88Jackpot(
  grid: number[][],
  nextRandom01: () => number,
): HotlineSourceJackpotResult | undefined {
  const jackpot88 = getH5OriginalGameSpec('h5-fire-88')!.specialSymbols.jackpot88! - 1;
  if (collectFire88SymbolPositions(grid, jackpot88).length < 3) return undefined;
  const roll = nextRandom01();
  const tierMultiplier: 38 | 88 | 888 = roll < 0.65 ? 38 : roll < 0.93 ? 88 : 888;
  const other =
    tierMultiplier === 38
      ? ([88, 888] as const)
      : tierMultiplier === 88
        ? ([38, 888] as const)
        : ([38, 88] as const);
  const revealOrder = [tierMultiplier, other[0], tierMultiplier, other[1], tierMultiplier];
  return {
    type: 'fire-88-jackpot',
    tierMultiplier,
    // Fire88Main consumes this array from the end for each selected coin.
    picks: [...revealOrder].reverse(),
    payoutMultiplier: tierMultiplier,
  };
}

function buildFire88FeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-fire-88';
  const spec = getH5OriginalGameSpec(gameId)!;
  const wild = spec.specialSymbols.wild! - 1;
  const jackpot88 = spec.specialSymbols.jackpot88! - 1;
  const baseWilds = collectFire88SymbolPositions(baseRound.initialGrid, wild);
  const baseJackpots = collectFire88SymbolPositions(baseRound.initialGrid, jackpot88);
  const sourceJackpot = drawFire88Jackpot(baseRound.initialGrid, nextRandom01);
  const freeSpinsAwarded = baseWilds.length >= 2 ? 1 : 0;
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  if (freeSpinsAwarded > 0) {
    const nextFreeSymbol = (): number => {
      for (let retry = 0; retry < 16; retry += 1) {
        const symbol = nextSymbol();
        if (symbol !== wild) return symbol;
      }
      return 0;
    };
    const round = runHotlineCascadeRound(nextFreeSymbol, 3, 3, 1, gameId, nextRandom01, true);
    const freeJackpot = drawFire88Jackpot(round.initialGrid, nextRandom01);
    const totalMultiplier = roundMultiplier(
      round.totalMultiplier + (freeJackpot?.payoutMultiplier ?? 0),
    );
    freeSpinWinMultiplier = totalMultiplier;
    freeSpinRounds.push({
      index: 0,
      initialGrid: round.initialGrid,
      finalGrid: round.finalGrid,
      cascades: round.cascades,
      lines: round.lines,
      baseMultiplier: round.totalMultiplier,
      scatterSymbols: collectFire88SymbolPositions(round.initialGrid, jackpot88).map(
        (position) => ({
          ...position,
          type: 'scatter' as const,
        }),
      ),
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier,
      extraFreeSpinsAwarded: 0,
      ...(freeJackpot ? { sourceJackpot: freeJackpot } : {}),
    });
  }

  const baseTotalMultiplier = roundMultiplier(
    baseRound.totalMultiplier + (sourceJackpot?.payoutMultiplier ?? 0),
  );
  return {
    scatterSymbols: [...baseWilds, ...baseJackpots].map((position) => ({
      ...position,
      type: 'scatter' as const,
    })),
    scatterCount: baseJackpots.length,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseTotalMultiplier + freeSpinWinMultiplier),
    ...(sourceJackpot ? { sourceJackpot } : {}),
  };
}

function collectLucky777Wilds(grid: number[][]): HotlineSpecialSymbol[] {
  const wild = Number(getH5OriginalGameSpec('h5-lucky-777')?.specialSymbols.wild ?? 9) - 1;
  return grid.flatMap((column, reel) =>
    column.flatMap((symbol, row) =>
      symbol === wild ? [{ reel, row, type: 'scatter' as const }] : [],
    ),
  );
}

/**
 * The paid spin only opens Lucky 777's source selector. The selected number
 * of rounds and its x1/x2/x4 award are generated by a second deterministic
 * action after the player chooses a mode.
 */
function buildLucky777FeatureResult(
  baseRound: HotlineInternalCascadeRound,
): HotlineMegaFeatureResult {
  const wilds = collectLucky777Wilds(baseRound.initialGrid);
  const triggered = wilds.length >= 3;
  const defaultSpins =
    getH5OriginalGameSpec('h5-lucky-777')?.freeModes?.find((mode) => mode.type === 1)?.spins ?? 28;
  return {
    scatterSymbols: wilds,
    scatterCount: wilds.length,
    freeSpinsAwarded: triggered ? defaultSpins : 0,
    freeSpinsPlayed: 0,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: baseRound.totalMultiplier,
    freeSpinRounds: [],
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: 0,
    totalMultiplier: baseRound.totalMultiplier,
    ...(triggered ? { sourceFreeModeType: 0 } : {}),
  };
}

function collectCaishenFaFaFaScatters(grid: number[][]): HotlineSpecialSymbol[] {
  const scatter =
    Number(getH5OriginalGameSpec('h5-caishen-fa-fa-fa')?.specialSymbols.scatter ?? 9) - 1;
  return grid.flatMap((column, reel) =>
    column.flatMap((symbol, row) =>
      symbol === scatter ? [{ reel, row, type: 'scatter' as const }] : [],
    ),
  );
}

/** Exact 3/4/5+ Scatter awards printed in the packaged free-game help page. */
export function getCaishenFaFaFaFreeSpinAward(scatterCount: number): number {
  if (scatterCount >= 5) return 50;
  if (scatterCount === 4) return 20;
  if (scatterCount === 3) return 10;
  return 0;
}

/**
 * Restores the source free-game contract: every free draw receives one to
 * three distinct golden Fa columns, and new Scatter symbols retrigger the
 * same 10/20/50-game award. The expanded board is the board evaluated and
 * sent to the Cocos client, so its line animation and settlement cannot
 * disagree.
 */
function buildCaishenFaFaFaFeatureResult(
  baseRound: HotlineInternalCascadeRound,
  nextRandom01: () => number,
  nextSymbol: () => number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-caishen-fa-fa-fa';
  const redWild = getH5OriginalGameSpec(gameId)!.specialSymbols.redWild! - 1;
  const baseScatters = collectCaishenFaFaFaScatters(baseRound.initialGrid);
  let freeSpinsAwarded = getCaishenFaFaFaFreeSpinAward(baseScatters.length);
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  for (let index = 0; index < freeSpinsAwarded && index < HOTLINE_MEGA_MAX_FREE_SPINS; index += 1) {
    const grid = Array.from({ length: 5 }, () => Array.from({ length: 3 }, () => nextSymbol()));
    const expandedReels = new Set<number>();
    const expandedReelCount = 1 + Math.floor(nextRandom01() * 3);
    while (expandedReels.size < expandedReelCount) {
      expandedReels.add(Math.min(4, Math.floor(nextRandom01() * 5)));
    }
    for (const reel of expandedReels) grid[reel] = [redWild, redWild, redWild];

    const evaluated = evaluateCaishenFaFaFa(grid);
    const scatterSymbols = collectCaishenFaFaFaScatters(grid);
    const extraFreeSpinsAwarded = getCaishenFaFaFaFreeSpinAward(scatterSymbols.length);
    if (extraFreeSpinsAwarded > 0) {
      freeSpinsAwarded = Math.min(
        HOTLINE_MEGA_MAX_FREE_SPINS,
        freeSpinsAwarded + extraFreeSpinsAwarded,
      );
    }
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + evaluated.totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines: evaluated.lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols,
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: 1,
      totalMultiplier: evaluated.totalMultiplier,
      extraFreeSpinsAwarded,
    });
  }

  return {
    scatterSymbols: baseScatters,
    scatterCount: baseScatters.length,
    freeSpinsAwarded,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: baseRound.totalMultiplier,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: baseRound.totalMultiplier,
    freeSpinRounds,
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier,
    totalMultiplier: roundMultiplier(baseRound.totalMultiplier + freeSpinWinMultiplier),
    sourceFreeWinMultiplier: 1,
  };
}

function hasYuPuTuanScatterTrigger(symbols: readonly HotlineSpecialSymbol[]): boolean {
  const reels = new Set(symbols.map((symbol) => symbol.reel));
  return reels.has(0) && reels.has(1) && reels.has(2);
}

function collectDiamondStrikeScatterSymbols(grid: number[][]): HotlineSpecialSymbol[] {
  const scatter =
    Number(getH5OriginalGameSpec('h5-diamond-strike')?.specialSymbols.scatter ?? 7) - 1;
  const allowedReels = new Set([0, 2, 4]);
  return grid.flatMap((column, reel) =>
    allowedReels.has(reel)
      ? column.flatMap((symbol, row) =>
          symbol === scatter ? [{ reel, row, type: 'scatter' as const }] : [],
        )
      : [],
  );
}

function hasDiamondStrikeScatterTrigger(symbols: readonly HotlineSpecialSymbol[]): boolean {
  const reels = new Set(symbols.map((symbol) => symbol.reel));
  return reels.has(0) && reels.has(2) && reels.has(4);
}

function drawDiamondStrikeJackpot(
  grid: number[][],
  nextRandom01: () => number,
): HotlineSourceJackpotResult | undefined {
  const goldenSeven =
    Number(getH5OriginalGameSpec('h5-diamond-strike')?.specialSymbols.goldenSeven ?? 9) - 1;
  if (grid.flat().filter((symbol) => symbol === goldenSeven).length < 3) return undefined;
  const tierMultiplier = getDiamondStrikeJackpotTier(nextRandom01());
  return {
    type: 'diamond-strike-jackpot',
    tierMultiplier,
    // The packaged picker reveals this array from the end and completes only
    // after every supplied item was chosen. Three identical entries therefore
    // produce the documented "find three matching jackpot symbols" sequence.
    picks: [tierMultiplier, tierMultiplier, tierMultiplier],
    payoutMultiplier: tierMultiplier,
  };
}

/** Fixed total-bet tiers printed in Diamond Strike's packaged rule page. */
export function getDiamondStrikeJackpotTier(random01: number): 10 | 30 | 100 | 1000 {
  const random = Math.max(0, Math.min(0.999999999, random01));
  if (random < 0.001) return 1000;
  if (random < 0.021) return 100;
  if (random < 0.171) return 30;
  return 10;
}

/**
 * Generates the continuation chosen in Queen of Bounty's free-game selector.
 * The selector is a second source action, so its deterministic stream is
 * domain-separated from the paid spin instead of replaying that spin.
 */
export function hotlineSelectBountyFreeMode(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  gameId: string,
  requestedSourceFreeModeType: number,
): HotlineMegaFeatureResult {
  if (!HOTLINE_BOUNTY_GAME_IDS.has(gameId)) {
    throw new Error('BOUNTY_FREE_MODE_ONLY_AVAILABLE_FOR_BOUNTY_GAMES');
  }
  const sourceFreeModeType = normalizeBountyFreeModeType(gameId, requestedSourceFreeModeType);
  const reelCount = 5;
  const rowCount = 3;
  const stream = hmacIntStream(
    serverSeed,
    `${clientSeed}:bounty-free-mode:${sourceFreeModeType}`,
    nonce,
  );
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
  const nextSymbol = (): number => pickSymbol(nextRandom01(), symbols);
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    HOTLINE_MEGA_MAX_CASCADES,
    getBountyFreeSpinAward(gameId, 3, sourceFreeModeType),
    gameId,
    sourceFreeModeType,
  );
  const scatterSymbols = pickUniqueGridPositions(nextRandom01, 3, [3, 3, 3, 3, 3]).map(
    (position) => ({ ...position, type: 'scatter' as const }),
  );

  return {
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
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: freeSpins.freeSpinWinMultiplier,
    totalMultiplier: capMegaMultiplier(freeSpins.freeSpinWinMultiplier),
    sourceFreeModeType,
  };
}

/**
 * Generates Lucky 777's Gold Cup continuation after the source selector has
 * returned. Each chosen mode keeps the same total-bet paytable and applies
 * its printed x1/x2/x4 multiplier to every visible line award.
 */
export function hotlineSelectLucky777FreeMode(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  requestedSourceFreeModeType: number,
): HotlineMegaFeatureResult {
  const gameId = 'h5-lucky-777';
  const modes = getH5OriginalGameSpec(gameId)?.freeModes ?? [];
  const requested = Math.trunc(requestedSourceFreeModeType);
  const mode = modes.find((candidate) => candidate.type === requested) ?? modes[0];
  if (!mode) throw new Error('LUCKY_777_FREE_MODES_NOT_CONFIGURED');
  const winMultiplier = mode.cascadeMultipliers[0] ?? 1;
  const stream = hmacIntStream(serverSeed, `${clientSeed}:lucky-777-free-mode:${mode.type}`, nonce);
  const symbols = getHotlineSymbolsForGame(gameId, 3, 3);
  const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
  const nextSymbol = (): number => pickSymbol(nextRandom01(), symbols);
  const freeSpinRounds: HotlineFreeSpinRound[] = [];
  let freeSpinWinMultiplier = 0;

  for (let index = 0; index < mode.spins; index += 1) {
    const grid = Array.from({ length: 3 }, () => Array.from({ length: 3 }, () => nextSymbol()));
    const evaluated = evaluateLucky777(grid);
    const lines = evaluated.lines.map((line) => ({
      ...line,
      payout: roundMultiplier(line.payout * winMultiplier),
    }));
    const totalMultiplier = roundMultiplier(evaluated.totalMultiplier * winMultiplier);
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + totalMultiplier);
    freeSpinRounds.push({
      index,
      initialGrid: cloneGrid(grid),
      finalGrid: cloneGrid(grid),
      cascades: [],
      lines,
      baseMultiplier: evaluated.totalMultiplier,
      scatterSymbols: collectLucky777Wilds(grid),
      multiplierSymbols: [],
      multiplierTotal: 0,
      appliedMultiplier: winMultiplier,
      totalMultiplier,
      extraFreeSpinsAwarded: 0,
    });
  }

  return {
    scatterSymbols: [],
    scatterCount: 3,
    freeSpinsAwarded: mode.spins,
    freeSpinsPlayed: freeSpinRounds.length,
    baseWinMultiplier: 0,
    baseMultiplierSymbols: [],
    baseMultiplierTotal: 0,
    baseAppliedMultiplier: 1,
    baseTotalMultiplier: 0,
    freeSpinRounds,
    freeSpinMultiplierBank: winMultiplier,
    freeSpinWinMultiplier,
    totalMultiplier: capMegaMultiplier(freeSpinWinMultiplier),
    sourceFreeModeType: mode.type,
    sourceFreeWinMultiplier: winMultiplier,
  };
}

/** Generates the authoritative continuation after Caishen's gamble/collect panel. */
export function hotlineSelectCaishenFreeGame(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  requestedSpinCount = 8,
  requestedWinMultiplier = 8,
): HotlineMegaFeatureResult {
  const gameId = 'h5-caishen-wins';
  const reelCount = 6;
  const rowCount = 5;
  const spinCount = Math.max(0, Math.min(20, Math.trunc(requestedSpinCount)));
  const sourceFreeWinMultiplier = Math.max(2, Math.min(20, Math.trunc(requestedWinMultiplier)));
  const stream = hmacIntStream(
    serverSeed,
    `${clientSeed}:caishen-free:${spinCount}:${sourceFreeWinMultiplier}`,
    nonce,
  );
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const nextRandom01 = (): number => (stream.next().value as number) / 0x1_0000_0000;
  const nextSymbol = (): number => pickSymbol(nextRandom01(), symbols);
  const freeSpins = runMegaFreeSpinRounds(
    nextRandom01,
    nextSymbol,
    reelCount,
    rowCount,
    HOTLINE_MEGA_MAX_CASCADES,
    spinCount,
    gameId,
    1,
    sourceFreeWinMultiplier,
  );
  const scatterSymbols = pickUniqueGridPositions(nextRandom01, 4, [5, 5, 5, 5, 5, 5]).map(
    (position) => ({ ...position, type: 'scatter' as const }),
  );
  return {
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
    freeSpinMultiplierBank: 0,
    freeSpinWinMultiplier: freeSpins.freeSpinWinMultiplier,
    totalMultiplier: capMegaMultiplier(freeSpins.freeSpinWinMultiplier),
    sourceFreeWinMultiplier,
  };
}

function normalizeBountyFreeModeType(gameId: string, requested: number): number {
  const modes = getH5OriginalGameSpec(gameId)?.freeModes ?? [];
  const normalized = Math.trunc(requested);
  return modes.some((mode) => mode.type === normalized) ? normalized : (modes[0]?.type ?? 1);
}

function runMegaFreeSpinRounds(
  nextRandom01: () => number,
  nextSymbol: () => number,
  reelCount: number,
  rowCount: number,
  maxCascades: number,
  initialFreeSpinsAwarded: number,
  gameId?: string,
  bountyFreeModeType = 1,
  sourceFreeWinMultiplier = 8,
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
  let persistentFreeMultiplier = 1;
  const freeSpinRounds: HotlineFreeSpinRound[] = [];

  for (let index = 0; index < freeSpinsAwarded && index < HOTLINE_MEGA_MAX_FREE_SPINS; index += 1) {
    const mahjong = isMahjongGame(gameId);
    const bounty = Boolean(gameId && HOTLINE_BOUNTY_GAME_IDS.has(gameId));
    const caishen = isCaishenWins(gameId);
    const golden = isGoldenEmpire(gameId);
    const gates = isGatesOfOlympus(gameId);
    const round = runHotlineCascadeRound(
      nextSymbol,
      reelCount,
      rowCount,
      maxCascades,
      gameId,
      nextRandom01,
      true,
      bountyFreeModeType,
      sourceFreeWinMultiplier,
      persistentFreeMultiplier,
    );
    const scatterRoundSymbols = mahjong
      ? drawMahjongScatterSymbols(nextRandom01, gameId!, true)
      : bounty
        ? drawBountyScatterSymbols(nextRandom01, gameId!, true, round.cascades[0]?.removed ?? [])
        : caishen || golden
          ? drawCaishenScatterSymbols(nextRandom01, true, round.cascades[0]?.removed ?? [])
          : drawMegaScatterSymbols(nextRandom01, reelCount, rowCount, true);
    const roundScatterMultiplier =
      mahjong || bounty || caishen || golden || gates
        ? 0
        : getMegaScatterPayout(scatterRoundSymbols.length);
    const roundSymbolWinMultiplier = round.totalMultiplier;
    const roundBaseMultiplier = roundMultiplier(roundSymbolWinMultiplier + roundScatterMultiplier);
    const extraFreeSpinsAwarded = mahjong
      ? getMahjongFreeSpinAward(gameId!, scatterRoundSymbols.length)
      : bounty
        ? getBountyFreeSpinAward(gameId!, scatterRoundSymbols.length, bountyFreeModeType)
        : caishen || golden
          ? getCaishenFreeSpinAward(scatterRoundSymbols.length)
          : gates
            ? scatterRoundSymbols.length >= 3
              ? 10
              : 0
            : scatterRoundSymbols.length >= HOTLINE_MEGA_FREE_SPIN_RETRIGGER_TRIGGER
              ? HOTLINE_MEGA_FREE_SPIN_RETRIGGER_AWARD
              : 0;
    const multiplierSymbols =
      mahjong || bounty || caishen || golden || gates
        ? []
        : drawMegaMultiplierSymbols(
            nextRandom01,
            reelCount,
            rowCount,
            roundSymbolWinMultiplier,
            true,
            scatterRoundSymbols,
            gameId,
          );
    const multiplierTotal = sumSpecialValues(multiplierSymbols);
    freeSpinMultiplierBank =
      golden || gates
        ? persistentFreeMultiplier
        : roundMultiplier(freeSpinMultiplierBank + multiplierTotal);
    const appliedMultiplier =
      mahjong || bounty || caishen || golden || gates
        ? 1
        : roundSymbolWinMultiplier > 0 && freeSpinMultiplierBank > 0
          ? freeSpinMultiplierBank
          : 1;
    const totalMultiplier = roundMultiplier(
      roundScatterMultiplier + roundSymbolWinMultiplier * appliedMultiplier,
    );
    freeSpinWinMultiplier = roundMultiplier(freeSpinWinMultiplier + totalMultiplier);
    if (golden || gates) {
      persistentFreeMultiplier += round.cascades.filter((cascade) => cascade.multiplier > 0).length;
      freeSpinMultiplierBank = persistentFreeMultiplier;
    }

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
      ...(gates ? { sourceMultiplierBank: persistentFreeMultiplier } : {}),
      totalMultiplier: capMegaMultiplier(totalMultiplier, gameId),
      extraFreeSpinsAwarded,
      ...(round.finalGoldPositions
        ? { finalGoldPositions: clonePositions(round.finalGoldPositions) }
        : {}),
      ...(round.finalSourceStacks
        ? { finalSourceStacks: round.finalSourceStacks.map(cloneSourceStack) }
        : {}),
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
  initialFreeSpinsAwarded = HOTLINE_MEGA_FREE_SPIN_BASE_AWARD,
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
    initialFreeSpinsAwarded,
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
      initialFreeSpinsAwarded,
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

function isMahjongGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_MAHJONG_GAME_IDS.has(gameId));
}

function isCaishenWins(gameId?: string): boolean {
  return gameId === 'h5-caishen-wins';
}

function isGoldenEmpire(gameId?: string): boolean {
  return gameId === 'h5-golden-empire';
}

function isGatesOfOlympus(gameId?: string): boolean {
  return gameId === 'h5-gates-of-olympus';
}

function getHotlineCascadeWinMultiplier(
  gameId: string | undefined,
  cascadeIndex: number,
  freeSpinMode: boolean,
  bountyFreeModeType: number,
  sourceFreeWinMultiplier: number,
  persistentFreeMultiplierStart: number,
): number {
  let values: readonly number[];
  if (isMahjongGame(gameId)) {
    values = freeSpinMode ? HOTLINE_MAHJONG_FREE_MULTIPLIERS : HOTLINE_MAHJONG_BASE_MULTIPLIERS;
  } else if (gameId && HOTLINE_BOUNTY_GAME_IDS.has(gameId)) {
    values = freeSpinMode
      ? (getH5OriginalGameSpec(gameId)?.freeModes?.find((mode) => mode.type === bountyFreeModeType)
          ?.cascadeMultipliers ?? HOTLINE_MAHJONG_BASE_MULTIPLIERS)
      : HOTLINE_MAHJONG_BASE_MULTIPLIERS;
  } else if (isCaishenWins(gameId)) {
    return freeSpinMode ? sourceFreeWinMultiplier : 1;
  } else if (isGoldenEmpire(gameId)) {
    return freeSpinMode ? persistentFreeMultiplierStart + Math.max(0, cascadeIndex) : 1;
  } else if (isGatesOfOlympus(gameId)) {
    return (freeSpinMode ? persistentFreeMultiplierStart : 1) + Math.max(0, cascadeIndex);
  } else {
    return 1;
  }
  return values[Math.min(Math.max(0, cascadeIndex), values.length - 1)]!;
}

function getMahjongFreeSpinAward(gameId: string, scatterCount: number): number {
  if (scatterCount < 3) return 0;
  const baseAward = gameId === 'h5-mahjong-ways' ? 12 : 10;
  return baseAward + Math.max(0, scatterCount - 3) * 2;
}

function getBountyFreeSpinAward(
  gameId: string,
  scatterCount: number,
  freeModeType: number,
): number {
  if (scatterCount < 3) return 0;
  if (gameId === 'h5-captains-bounty') {
    return 10 + Math.max(0, scatterCount - 3) * 5;
  }
  return (
    getH5OriginalGameSpec(gameId)?.freeModes?.find((mode) => mode.type === freeModeType)?.spins ??
    20
  );
}

function getCaishenFreeSpinAward(scatterCount: number): number {
  return scatterCount >= 4 ? 8 + Math.max(0, scatterCount - 4) * 2 : 0;
}

function drawBountyScatterSymbols(
  nextRandom01: () => number,
  gameId: string,
  freeSpinMode: boolean,
  blockedPositions: HotlineWinPosition[] = [],
): HotlineSpecialSymbol[] {
  const triggerRate = gameId === 'h5-captains-bounty' ? 0.0049 : 0.005;
  const triggerRoll = nextRandom01();
  let count = 0;
  if (triggerRoll < triggerRate) {
    const extraRoll = nextRandom01();
    count = extraRoll < 0.94 ? 3 : extraRoll < 0.99 ? 4 : 5;
  } else {
    const teaseRoll = nextRandom01();
    const twoScatterRate = freeSpinMode ? 0.03 : 0.055;
    const oneScatterRate = freeSpinMode ? 0.12 : 0.2;
    count = teaseRoll < twoScatterRate ? 2 : teaseRoll < oneScatterRate ? 1 : 0;
  }
  return pickUniqueGridPositions(nextRandom01, count, [3, 3, 3, 3, 3], blockedPositions).map(
    (position) => ({ ...position, type: 'scatter' as const }),
  );
}

function drawCaishenScatterSymbols(
  nextRandom01: () => number,
  freeSpinMode: boolean,
  blockedPositions: HotlineWinPosition[] = [],
): HotlineSpecialSymbol[] {
  const triggerRoll = nextRandom01();
  let count = 0;
  if (triggerRoll < 0.0051) {
    const extraRoll = nextRandom01();
    count = extraRoll < 0.94 ? 4 : extraRoll < 0.99 ? 5 : 6;
  } else {
    const teaseRoll = nextRandom01();
    const threeScatterRate = freeSpinMode ? 0.025 : 0.045;
    const twoScatterRate = freeSpinMode ? 0.08 : 0.14;
    const oneScatterRate = freeSpinMode ? 0.2 : 0.31;
    count =
      teaseRoll < threeScatterRate
        ? 3
        : teaseRoll < twoScatterRate
          ? 2
          : teaseRoll < oneScatterRate
            ? 1
            : 0;
  }
  return pickUniqueGridPositions(nextRandom01, count, [5, 5, 5, 5, 5, 5], blockedPositions).map(
    (position) => ({ ...position, type: 'scatter' as const }),
  );
}

function drawMahjongScatterSymbols(
  nextRandom01: () => number,
  gameId: string,
  freeSpinMode: boolean,
): HotlineSpecialSymbol[] {
  const triggerRate = gameId === 'h5-mahjong-ways' ? 0.0049 : 0.0046;
  const triggerRoll = nextRandom01();
  let count = 0;
  if (triggerRoll < triggerRate) {
    const extraRoll = nextRandom01();
    count = extraRoll < 0.94 ? 3 : extraRoll < 0.99 ? 4 : 5;
  } else {
    const teaseRoll = nextRandom01();
    const twoScatterRate = freeSpinMode ? 0.035 : 0.05;
    const oneScatterRate = freeSpinMode ? 0.14 : 0.18;
    count = teaseRoll < twoScatterRate ? 2 : teaseRoll < oneScatterRate ? 1 : 0;
  }

  return pickUniqueGridPositions(nextRandom01, count, getHotlineReelRowCounts(gameId)).map(
    (position) => ({ ...position, type: 'scatter' as const }),
  );
}

function pickUniqueGridPositions(
  nextRandom01: () => number,
  count: number,
  reelRows: readonly number[],
  blockedPositions: readonly HotlineWinPosition[] = [],
): HotlineWinPosition[] {
  const blocked = new Set(blockedPositions.map((position) => `${position.reel}:${position.row}`));
  const available = reelRows
    .flatMap((rows, reel) => Array.from({ length: rows }, (_, row) => ({ reel, row })))
    .filter((position) => !blocked.has(`${position.reel}:${position.row}`));
  const picked: HotlineWinPosition[] = [];
  for (let index = 0; index < count && available.length > 0; index += 1) {
    const selectedIndex = Math.min(
      available.length - 1,
      Math.floor(nextRandom01() * available.length),
    );
    picked.push(available.splice(selectedIndex, 1)[0]!);
  }
  return picked;
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
  gameId?: string,
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
      value: pickMegaMultiplierValue(nextRandom01, gameId),
    }),
  );
}

function pickMegaMultiplierValue(nextRandom01: () => number, gameId?: string): number {
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
  ].filter((item) => gameId !== 'h5-gates-of-olympus' || item.value <= 500);
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

function capMegaMultiplier(value: number, gameId?: string): number {
  return Math.min(getHotlineMaximumTotalMultiplier(gameId), roundMultiplier(value));
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

/** Exact Line_1 through Line_9 order printed in Caishen Fa Fa Fa's help page. */
export const H5_CAISHEN_FA_FA_FA_PAYLINES: readonly HotlinePaylineDefinition[] =
  makeIndexedPaylines([
    [1, 1, 1, 1, 1],
    [0, 0, 0, 0, 0],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 0, 0, 1],
    [1, 2, 2, 2, 1],
  ]);

/** Exact 1-9 order drawn on Fruit Little Mary's packaged second help page. */
export const H5_FRUIT_LITTLE_MARY_PAYLINES: readonly HotlinePaylineDefinition[] =
  makeIndexedPaylines([
    [0, 0, 0, 0, 0],
    [1, 1, 1, 1, 1],
    [2, 2, 2, 2, 2],
    [0, 1, 2, 1, 0],
    [2, 1, 0, 1, 2],
    [0, 0, 1, 2, 2],
    [2, 2, 1, 0, 0],
    [1, 0, 1, 2, 1],
    [1, 2, 1, 0, 1],
  ]);

/** Exact Line_1 through Line_9 order drawn by the original Nine-Line Pull King scene. */
const H5_NINE_LINE_PULL_KING_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines([
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
]);

/** Exact 1-9 paths printed in Water Margin's packaged shz_img_guize1 sprite. */
const H5_WATER_MARGIN_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines([
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 0, 2, 0, 0],
  [2, 2, 0, 2, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 2, 2, 2, 1],
  [2, 0, 0, 0, 2],
]);

const H5_FIFTEEN_LINE_PAYLINES = makeIndexedPaylines(H5_PAYLINES_5X3_15_PATHS);
const H5_FIVE_LINE_PAYLINES_5X3 = makeIndexedPaylines(H5_PAYLINES_5X3_15_PATHS.slice(0, 5));
/** Exact 01-20 order printed in the official Captain/Queen of Bounty rules. */
const H5_BOUNTY_PAYLINES = makeIndexedPaylines([
  [1, 1, 1, 1, 1],
  [0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2],
  [0, 1, 2, 1, 0],
  [2, 1, 0, 1, 2],
  [0, 0, 1, 0, 0],
  [2, 2, 1, 2, 2],
  [1, 2, 2, 2, 1],
  [1, 0, 0, 0, 1],
  [0, 1, 1, 1, 0],
  [2, 1, 1, 1, 2],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [1, 0, 1, 0, 1],
  [1, 2, 1, 2, 1],
  [0, 1, 0, 1, 0],
  [2, 1, 2, 1, 2],
  [0, 0, 1, 2, 2],
  [2, 2, 1, 0, 0],
  [0, 2, 0, 2, 0],
]);
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
export const H5_AZTEC_GEMS_PAYLINES: readonly HotlinePaylineDefinition[] = H5_PAYLINES_3X3_8.slice(
  0,
  5,
);
/** Exact centre/top/bottom/diagonal order used by Fortune Gems' line_01-line_05 sprites. */
export const H5_FORTUNE_GEMS_PAYLINES: readonly HotlinePaylineDefinition[] =
  H5_PAYLINES_3X3_8.slice(0, 5);
export const H5_FIRE_88_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines([
  [1, 1, 1],
  [0, 0, 0],
  [2, 2, 2],
  [2, 1, 0],
  [0, 1, 2],
  [1, 0, 1],
  [1, 2, 1],
]);
/** The source frame labels these top, middle and bottom rows as lines 1-3. */
export const H5_LUCKY_777_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines([
  [0, 0, 0],
  [1, 1, 1],
  [2, 2, 2],
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
/** Exact 01-10 order shown in PG Soft's Fortune Ox rules and source overlay. */
const H5_FORTUNE_OX_PAYLINES = makeIndexedPaylines([
  [0, 0, 0],
  [0, 1, 0],
  [0, 1, 1],
  [1, 1, 0],
  [1, 1, 1],
  [1, 2, 1],
  [1, 2, 2],
  [2, 2, 1],
  [2, 2, 2],
  [2, 3, 2],
]);

/** Exact 01-50 order printed in Yu Pu Tuan's packaged slots_ptable_4 sprite. */
export const H5_YU_PU_TUAN_PAYLINES: readonly HotlinePaylineDefinition[] = makeIndexedPaylines([
  [0, 0, 0, 0, 0],
  [1, 1, 1, 1, 1],
  [2, 2, 2, 2, 2],
  [3, 3, 3, 3, 3],
  [0, 0, 1, 0, 0],
  [0, 0, 2, 0, 0],
  [0, 0, 3, 0, 0],
  [1, 1, 0, 1, 1],
  [1, 1, 2, 1, 1],
  [1, 1, 3, 1, 1],
  [2, 2, 0, 2, 2],
  [2, 2, 1, 2, 2],
  [2, 2, 3, 2, 2],
  [3, 3, 0, 3, 3],
  [3, 3, 1, 3, 3],
  [3, 3, 2, 3, 3],
  [0, 1, 1, 1, 0],
  [0, 2, 2, 2, 0],
  [0, 3, 3, 3, 0],
  [1, 0, 0, 0, 1],
  [1, 2, 2, 2, 1],
  [1, 3, 3, 3, 1],
  [2, 0, 0, 0, 2],
  [2, 1, 1, 1, 2],
  [2, 3, 3, 3, 2],
  [3, 0, 0, 0, 3],
  [3, 1, 1, 1, 3],
  [3, 2, 2, 2, 3],
  [0, 1, 2, 1, 0],
  [1, 2, 3, 2, 1],
  [2, 3, 0, 3, 2],
  [3, 0, 1, 0, 3],
  [0, 0, 1, 1, 1],
  [0, 0, 2, 2, 2],
  [0, 0, 3, 3, 3],
  [1, 1, 0, 0, 0],
  [1, 1, 2, 2, 2],
  [1, 1, 3, 3, 3],
  [2, 2, 0, 0, 0],
  [2, 2, 1, 1, 1],
  [2, 2, 3, 3, 3],
  [3, 3, 0, 0, 0],
  [3, 3, 1, 1, 1],
  [3, 3, 2, 2, 2],
  [0, 0, 0, 1, 1],
  [1, 1, 1, 2, 2],
  [2, 2, 2, 3, 3],
  [3, 3, 3, 0, 0],
  [0, 0, 0, 0, 1],
  [1, 1, 1, 1, 2],
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
  'h5-lucky-777': 3,
  'h5-caishen-fa-fa-fa': 9,
  'h5-star-97': 8,
  'h5-fortune-ox': 10,
  'h5-captains-bounty': 20,
  'h5-queen-of-bounty': 20,
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
  if (gameId === 'h5-nine-line-pull-king' && reelCount === 5 && rowCount === 3) {
    return H5_NINE_LINE_PULL_KING_PAYLINES;
  }
  if (gameId === 'h5-water-margin' && reelCount === 5 && rowCount === 3) {
    return H5_WATER_MARGIN_PAYLINES;
  }
  if (gameId === 'h5-fortune-ox' && reelCount === 3 && rowCount === 4) {
    return H5_FORTUNE_OX_PAYLINES;
  }
  if (gameId === 'h5-yu-pu-tuan' && reelCount === 5 && rowCount === 4) {
    return H5_YU_PU_TUAN_PAYLINES;
  }
  if (gameId === 'h5-fruit-little-mary' && reelCount === 5 && rowCount === 3) {
    return H5_FRUIT_LITTLE_MARY_PAYLINES;
  }
  if (gameId === 'h5-aztec-treasure' && reelCount === 3 && rowCount === 3) {
    return H5_AZTEC_GEMS_PAYLINES;
  }
  if (gameId === 'h5-fortune-gems' && reelCount === 3 && rowCount === 3) {
    return H5_FORTUNE_GEMS_PAYLINES;
  }
  if (gameId === 'h5-fire-88' && reelCount === 3 && rowCount === 3) {
    return H5_FIRE_88_PAYLINES;
  }
  if (gameId === 'h5-lucky-777' && reelCount === 3 && rowCount === 3) {
    return H5_LUCKY_777_PAYLINES;
  }
  if (gameId === 'h5-caishen-fa-fa-fa' && reelCount === 5 && rowCount === 3) {
    return H5_CAISHEN_FA_FA_FA_PAYLINES;
  }
  if (gameId && HOTLINE_BOUNTY_GAME_IDS.has(gameId) && reelCount === 5 && rowCount === 3) {
    return H5_BOUNTY_PAYLINES;
  }
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

export function getHotlineReelRowCounts(
  gameId: string | undefined,
  reelCount = getHotlineReelCount(gameId),
  rowCount = getHotlineRowCount(gameId),
): readonly number[] {
  const layout = gameId ? HOTLINE_GAME_LAYOUTS.get(gameId) : undefined;
  if (layout?.reelRows?.length === reelCount) return layout.reelRows;
  return Array.from({ length: reelCount }, () => rowCount);
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

export function isHotlineSourceFeatureGame(gameId?: string): boolean {
  return Boolean(gameId && HOTLINE_SOURCE_FEATURE_GAME_IDS.has(gameId));
}

export function getHotlineSymbolsForGame(
  gameId: string | undefined,
  reelCount = getHotlineReelCount(gameId),
  rowCount = getHotlineRowCount(gameId),
): readonly HotlineSymbol[] {
  const baseSymbols =
    rowCount >= HOTLINE_MEGA_ROWS
      ? HOTLINE_MEGA_SYMBOLS
      : reelCount === HOTLINE_MINI_REELS
        ? HOTLINE_MINI_SYMBOLS
        : HOTLINE_SYMBOLS;
  const sourceSpec = getH5OriginalGameSpec(gameId);
  const sourceCount = sourceSpec?.generatedSymbolCount ?? sourceSpec?.standardSymbolCount;
  const sourceSymbols =
    sourceCount && sourceCount > baseSymbols.length
      ? [
          ...baseSymbols,
          ...Array.from({ length: sourceCount - baseSymbols.length }, (_, offset) => ({
            ...baseSymbols[baseSymbols.length - 1]!,
            name: `SOURCE_SYMBOL_${baseSymbols.length + offset + 1}`,
          })),
        ]
      : baseSymbols;
  const sliced = sourceCount ? sourceSymbols.slice(0, sourceCount) : sourceSymbols;
  if (!sourceSpec?.settleWithSourcePaytable || sourceSpec.paytable.length === 0) return sliced;

  const paytableById = new Map(
    sourceSpec.paytable.map((entry) => [entry.sourceSymbolId, entry] as const),
  );
  return sliced.map((symbol, index) => {
    const source = paytableById.get(index + 1);
    if (!source) {
      const { payout2: _payout2, ...nonPayingSymbol } = symbol;
      return {
        ...nonPayingSymbol,
        payout3: 0,
        payout4: 0,
        payout5: 0,
        payout6: 0,
      };
    }
    return {
      ...symbol,
      ...(source.payout2 !== undefined
        ? { payout2: source.payout2 / sourceSpec.totalBetUnits }
        : {}),
      payout3: source.payout3 / sourceSpec.totalBetUnits,
      payout4: source.payout4 / sourceSpec.totalBetUnits,
      payout5: source.payout5 / sourceSpec.totalBetUnits,
      ...(source.payout6 !== undefined
        ? { payout6: source.payout6 / sourceSpec.totalBetUnits }
        : {}),
    };
  });
}

export function getHotlinePaylinePayoutScale(
  gameId: string | undefined,
  lineCount: number,
): number {
  if (getH5OriginalGameSpec(gameId)?.settleWithSourcePaytable) return 1;
  return Math.min(1, 5 / Math.max(1, lineCount));
}

export function getHotlineSymbolCount(gameId?: string): number {
  return getHotlineSymbolsForGame(gameId).length;
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
  const rawPayout =
    count >= 5
      ? sym.payout5
      : count === 4
        ? sym.payout4
        : count === 3
          ? sym.payout3
          : (sym.payout2 ?? 0);
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
  if (symbol === undefined || !symbols[symbol]) return null;

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

/** Exact five-line contract shown by the packaged Aztec Gems help pages. */
function evaluateAztecGems(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-aztec-treasure';
  const symbols = getHotlineSymbolsForGame(gameId, 3, 3);
  const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 8) - 1;
  const lines: HotlineWinLine[] = [];

  for (const payline of H5_AZTEC_GEMS_PAYLINES) {
    const values = payline.path.map((row, reel) => grid[reel]?.[row]);
    if (values.some((value) => value === undefined)) continue;
    const ordinary = new Set(values.filter((value) => value !== wild));
    if (ordinary.size > 1) continue;
    const symbol = ordinary.size === 0 ? wild : [...ordinary][0]!;
    if (!symbols[symbol]) continue;
    const line = makeHotlineWinLine(payline, symbol, 3, 0, 'ltr', symbols);
    line.positions = payline.path.map((row, reel) => ({ reel, row }));
    lines.push(line);
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

/**
 * Fortune Gems is a conventional five-line 3x3 game. Source symbol 008 is
 * Wild and substitutes for every ordinary symbol; the separate multiplier
 * reel is applied by hotlineSpinSourceFeatureRound after these base wins are
 * known. Keeping those two steps separate makes the displayed wheel stop and
 * the accounting multiplier derive from the same visible result.
 */
function evaluateFortuneGems(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-fortune-gems';
  const symbols = getHotlineSymbolsForGame(gameId, 3, 3);
  const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 8) - 1;
  const lines: HotlineWinLine[] = [];

  for (const payline of H5_FORTUNE_GEMS_PAYLINES) {
    const values = payline.path.map((row, reel) => grid[reel]?.[row]);
    if (values.some((value) => value === undefined)) continue;
    const ordinary = new Set(values.filter((value) => value !== wild));
    if (ordinary.size > 1) continue;
    const symbol = ordinary.size === 0 ? wild : [...ordinary][0]!;
    if (!symbols[symbol]) continue;
    const line = makeHotlineWinLine(payline, symbol, 3, 0, 'ltr', symbols);
    line.positions = payline.path.map((row, reel) => ({ reel, row }));
    lines.push(line);
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

/** Seven source lines; Wild substitutes and bannered 88 settles as ordinary 88. */
function evaluateFire88(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-fire-88';
  const symbols = getHotlineSymbolsForGame(gameId, 3, 3);
  const spec = getH5OriginalGameSpec(gameId)!;
  const wild = spec.specialSymbols.wild! - 1;
  const jackpot88 = spec.specialSymbols.jackpot88! - 1;
  const ordinary88 = 5;
  const lines: HotlineWinLine[] = [];

  const matches = (value: number | undefined, target: number): boolean => {
    if (value === undefined) return false;
    if (value === wild) return true;
    if (target === ordinary88) return value === ordinary88 || value === jackpot88;
    if (target === wild) return value === wild;
    return value === target;
  };

  for (const payline of H5_FIRE_88_PAYLINES) {
    const first = grid[0]?.[payline.path[0]!];
    if (first === undefined) continue;
    const candidates =
      first === wild
        ? [0, 1, 2, 3, 4, ordinary88, wild]
        : [first === jackpot88 ? ordinary88 : first];
    let best: HotlineWinLine | undefined;
    for (const target of candidates) {
      if (!payline.path.every((row, reel) => matches(grid[reel]?.[row], target))) continue;
      const line = makeHotlineWinLine(payline, target, 3, 0, 'ltr', symbols);
      line.positions = payline.path.map((row, reel) => ({ reel, row }));
      if (!best || line.payout > best.payout) best = line;
    }
    if (best) lines.push(best);
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

/**
 * Lucky 777 settles only its three horizontal rows. Wild substitutes for one
 * of the eight printed paytable symbols; a row made entirely from Wilds is a
 * feature trigger, not an undocumented Wild line award.
 */
function evaluateLucky777(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-lucky-777';
  const symbols = getHotlineSymbolsForGame(gameId, 3, 3);
  const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 9) - 1;
  const lines: HotlineWinLine[] = [];

  for (const payline of H5_LUCKY_777_PAYLINES) {
    const values = payline.path.map((row, reel) => grid[reel]?.[row]);
    if (values.some((value) => value === undefined)) continue;
    const ordinary = new Set(values.filter((value) => value !== wild));
    if (ordinary.size !== 1) continue;
    const symbol = [...ordinary][0]!;
    if (!symbols[symbol] || symbol === wild) continue;
    if (!values.every((value) => value === symbol || value === wild)) continue;
    const line = makeHotlineWinLine(payline, symbol, 3, 0, 'ltr', symbols);
    line.positions = payline.path.map((row, reel) => ({ reel, row }));
    lines.push(line);
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

const H5_CAISHEN_FA_FA_FA_FULL_SCREEN_MULTIPLIERS = [
  50, 100, 150, 250, 400, 500, 1_000, 2_500, 0, 5_000, 5_000,
] as const;

/**
 * Caishen Fa Fa Fa pays its nine fixed lines from either outer edge. Red and
 * blue Fa both substitute ordinary ids 1-8, but neither substitutes Scatter
 * or the other Fa colour. A mixed all-Wild run is not silently reinterpreted
 * as an ordinary symbol unless that ordinary symbol is visibly present.
 */
function evaluateCaishenFaFaFa(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-caishen-fa-fa-fa';
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const spec = getH5OriginalGameSpec(gameId)!;
  const scatter = spec.specialSymbols.scatter! - 1;
  const blueWild = spec.specialSymbols.blueWild! - 1;
  const redWild = spec.specialSymbols.redWild! - 1;
  const values = grid.flat();
  const first = values[0];

  if (values.length === 15 && first !== undefined && values.every((symbol) => symbol === first)) {
    const payout = H5_CAISHEN_FA_FA_FA_FULL_SCREEN_MULTIPLIERS[first] ?? 0;
    if (payout > 0) {
      const positions = grid.flatMap((column, reel) =>
        column.map((_symbol, row) => ({ reel, row })),
      );
      return {
        lines: [
          {
            lineId: 'full-screen',
            path: [1, 1, 1, 1, 1],
            positions,
            startReel: 0,
            direction: 'ltr',
            row: 1,
            symbol: first,
            count: positions.length,
            payout,
          },
        ],
        totalMultiplier: payout,
      };
    }
  }

  const isWild = (symbol: number | undefined): boolean => symbol === blueWild || symbol === redWild;
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (const payline of H5_CAISHEN_FA_FA_FA_PAYLINES) {
    for (const direction of ['ltr', 'rtl'] as const) {
      const edgeReel = direction === 'ltr' ? 0 : 4;
      const step = direction === 'ltr' ? 1 : -1;
      const edgeSymbol = grid[edgeReel]?.[payline.path[edgeReel]!];
      if (edgeSymbol === undefined || edgeSymbol === scatter) continue;
      const candidates =
        edgeSymbol === blueWild
          ? [...Array.from({ length: 8 }, (_, index) => index), blueWild]
          : edgeSymbol === redWild
            ? [...Array.from({ length: 8 }, (_, index) => index), redWild]
            : edgeSymbol >= 0 && edgeSymbol < 8
              ? [edgeSymbol]
              : [];
      let best: HotlineWinLine | undefined;

      for (const target of candidates) {
        const positions: HotlineWinPosition[] = [];
        const matchedValues: number[] = [];
        for (let reel = edgeReel; reel >= 0 && reel < 5; reel += step) {
          const value = grid[reel]?.[payline.path[reel]!];
          const matches =
            target < 8
              ? value === target || isWild(value)
              : target === blueWild
                ? value === blueWild
                : value === redWild;
          if (!matches || value === undefined) break;
          positions.push({ reel, row: payline.path[reel]! });
          matchedValues.push(value);
        }
        const minimumCount = target === blueWild || target === redWild ? 5 : 3;
        if (positions.length < minimumCount) continue;
        if (target < 8 && !matchedValues.includes(target)) continue;
        const startReel = direction === 'ltr' ? 0 : 5 - positions.length;
        const line = makeHotlineWinLine(
          payline,
          target,
          positions.length,
          startReel,
          direction,
          symbols,
        );
        line.positions = positions;
        if (line.payout <= 0) continue;
        if (
          !best ||
          line.payout > best.payout ||
          (line.payout === best.payout && line.count > best.count)
        ) {
          best = line;
        }
      }

      if (!best) continue;
      const duplicate = lines.some((line) => isSamePaylineWin(line, best));
      if (duplicate) continue;
      lines.push(best);
      totalMultiplier += best.payout;
    }
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

/**
 * The source advertises 243 ways: each paying symbol must begin on reel one
 * and continue through at least three adjacent reels. Every matching position
 * on a reel contributes one way. The logo substitutes on reels 2-4 only and
 * has no standalone paytable entry.
 */
function evaluateFlyingTogether(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-flying-together';
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const wild = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 13) - 1;
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let target = 0; target < wild; target += 1) {
    const positions: HotlineWinPosition[] = [];
    let ways = 1;
    let count = 0;
    for (let reel = 0; reel < Math.min(5, grid.length); reel += 1) {
      const matches = (grid[reel] ?? []).flatMap((symbol, row) =>
        symbol === target || (reel > 0 && reel < 4 && symbol === wild) ? [{ reel, row }] : [],
      );
      if (matches.length === 0) break;
      positions.push(...matches);
      ways *= matches.length;
      count += 1;
    }
    if (count < 3 || !grid[0]?.includes(target)) continue;
    const meta = symbols[target];
    if (!meta) continue;
    const perWay = count >= 5 ? meta.payout5 : count === 4 ? meta.payout4 : meta.payout3;
    const payout = roundMultiplier(perWay * ways);
    if (payout <= 0) continue;
    const path = Array.from({ length: 5 }, (_, reel) => {
      return positions.find((position) => position.reel === reel)?.row ?? 0;
    });
    lines.push({
      lineId: `ways-${target}`,
      path,
      positions,
      startReel: 0,
      direction: 'ltr',
      row: path[0]!,
      symbol: target,
      count,
      ways,
      payout,
    });
    totalMultiplier += payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

type Star97LineDefinition = {
  id: string;
  lineIndex: number;
  positions: readonly HotlineWinPosition[];
};

/** Exact order drawn on the source's fourth help page. */
const H5_STAR_97_LINES: readonly Star97LineDefinition[] = [
  {
    id: 'line-1',
    lineIndex: 0,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 0 },
      { reel: 2, row: 0 },
    ],
  },
  {
    id: 'line-2',
    lineIndex: 1,
    positions: [
      { reel: 0, row: 1 },
      { reel: 1, row: 1 },
      { reel: 2, row: 1 },
    ],
  },
  {
    id: 'line-3',
    lineIndex: 2,
    positions: [
      { reel: 0, row: 2 },
      { reel: 1, row: 2 },
      { reel: 2, row: 2 },
    ],
  },
  {
    id: 'line-4',
    lineIndex: 3,
    positions: [
      { reel: 0, row: 0 },
      { reel: 0, row: 1 },
      { reel: 0, row: 2 },
    ],
  },
  {
    id: 'line-5',
    lineIndex: 4,
    positions: [
      { reel: 1, row: 0 },
      { reel: 1, row: 1 },
      { reel: 1, row: 2 },
    ],
  },
  {
    id: 'line-6',
    lineIndex: 5,
    positions: [
      { reel: 2, row: 0 },
      { reel: 2, row: 1 },
      { reel: 2, row: 2 },
    ],
  },
  {
    id: 'line-7',
    lineIndex: 6,
    positions: [
      { reel: 0, row: 0 },
      { reel: 1, row: 1 },
      { reel: 2, row: 2 },
    ],
  },
  {
    id: 'line-8',
    lineIndex: 7,
    positions: [
      { reel: 0, row: 2 },
      { reel: 1, row: 1 },
      { reel: 2, row: 0 },
    ],
  },
] as const;

const H5_STAR_97_SEVEN_MULTIPLIERS = [1, 1, 2, 5, 20, 30, 40, 60, 80, 100] as const;
const H5_STAR_97_BAR_SYMBOLS = new Set([5, 6, 7]);
const H5_STAR_97_FRUIT_SYMBOLS = new Set([0, 1, 2, 4]);
const H5_STAR_97_FULL_SCREEN_MULTIPLIERS: Readonly<Record<number, number>> = {
  0: 60,
  1: 30,
  2: 40,
  3: 40,
  4: 50,
  5: 60,
  6: 70,
  7: 80,
};

export function getStar97SevenMultiplier(grid: number[][]): number {
  const count = Math.max(0, Math.min(9, grid.flat().filter((symbol) => symbol === 8).length));
  return H5_STAR_97_SEVEN_MULTIPLIERS[count]!;
}

function makeStar97Line(
  definition: Star97LineDefinition,
  symbol: number,
  positions: HotlineWinPosition[],
  payout: number,
): HotlineWinLine {
  const first = positions[0] ?? definition.positions[0]!;
  return {
    lineId: definition.id,
    lineIndex: definition.lineIndex,
    path: definition.positions.map((position) => position.row),
    positions,
    startReel: first.reel,
    direction: 'ltr',
    row: first.row,
    symbol,
    count: positions.length,
    payout: roundMultiplier(payout),
  };
}

/**
 * Star 97 is not an ordinary 3-reel slot: its eight lines include all three
 * vertical columns. Cherry pays for one/two/three occurrences anywhere on a
 * line, any three BAR colours pay, and the number of red sevens on the whole
 * board multiplies every ordinary line award. A documented full-board award
 * replaces the ordinary line total.
 */
function evaluateStar97(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const spec = getH5OriginalGameSpec('h5-star-97')!;
  const symbols = getHotlineSymbolsForGame('h5-star-97', 3, 3);
  if (grid.length !== 3 || grid.some((column) => column.length !== 3)) {
    return { lines: [], totalMultiplier: 0 };
  }

  const flat = grid.flat();
  const allSameSymbol = flat.every((symbol) => symbol === flat[0]);
  const exactFullScreenMultiplier =
    allSameSymbol && flat[0] !== undefined
      ? H5_STAR_97_FULL_SCREEN_MULTIPLIERS[flat[0]]
      : undefined;
  const allBars = flat.every((symbol) => H5_STAR_97_BAR_SYMBOLS.has(symbol));
  const allFruits = flat.every((symbol) => H5_STAR_97_FRUIT_SYMBOLS.has(symbol));
  const mixedFullScreenMultiplier =
    !allSameSymbol && allBars ? 30 : !allSameSymbol && allFruits ? 15 : undefined;
  const fullScreenMultiplier = exactFullScreenMultiplier ?? mixedFullScreenMultiplier;
  if (fullScreenMultiplier !== undefined) {
    const positions = H5_STAR_97_LINES.slice(0, 3).flatMap((line) => line.positions);
    return {
      lines: [
        {
          lineId: 'full-screen',
          path: [0, 0, 0],
          positions,
          startReel: 0,
          direction: 'ltr',
          row: 0,
          symbol: flat[0]!,
          count: 9,
          payout: fullScreenMultiplier,
        },
      ],
      totalMultiplier: fullScreenMultiplier,
    };
  }

  const sevenMultiplier = getStar97SevenMultiplier(grid);
  const cherryTable = spec.paytable.find((entry) => entry.sourceSymbolId === 1)!;
  const lines: HotlineWinLine[] = [];
  for (const definition of H5_STAR_97_LINES) {
    const cells = definition.positions.map((position) => ({
      ...position,
      symbol: grid[position.reel]![position.row]!,
    }));
    const cherryPositions = cells
      .filter((cell) => cell.symbol === 0)
      .map(({ reel, row }) => ({ reel, row }));
    if (cherryPositions.length > 0) {
      const sourcePayout =
        cherryPositions.length === 1
          ? cherryTable.payout1
          : cherryPositions.length === 2
            ? cherryTable.payout2
            : cherryTable.payout3;
      lines.push(
        makeStar97Line(
          definition,
          0,
          cherryPositions,
          ((sourcePayout ?? 0) / spec.totalBetUnits) * sevenMultiplier,
        ),
      );
      continue;
    }

    const values = cells.map((cell) => cell.symbol);
    const sameSymbol = values.every((symbol) => symbol === values[0]);
    const mixedBar = !sameSymbol && values.every((symbol) => H5_STAR_97_BAR_SYMBOLS.has(symbol));
    if (!sameSymbol && !mixedBar) continue;
    const sourcePayout = mixedBar ? 10 : symbols[values[0]!]!.payout3 * spec.totalBetUnits;
    lines.push(
      makeStar97Line(
        definition,
        values[0]!,
        cells.map(({ reel, row }) => ({ reel, row })),
        (sourcePayout / spec.totalBetUnits) * sevenMultiplier,
      ),
    );
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

export function getFortuneOxFullScreenMultiplier(grid: number[][]): number {
  if (grid.length !== 3 || grid.some((column, reel) => column.length !== [3, 4, 3][reel])) {
    return 1;
  }
  const wildIndex = (getH5OriginalGameSpec('h5-fortune-ox')?.specialSymbols.wild ?? 7) - 1;
  const nonWildSymbols = new Set(grid.flat().filter((symbol) => symbol !== wildIndex));
  return nonWildSymbols.size <= 1 ? FORTUNE_OX_FULL_SCREEN_MULTIPLIER : 1;
}

function evaluateFortuneOx(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const symbols = getHotlineSymbolsForGame('h5-fortune-ox', 3, 4);
  const wildIndex = (getH5OriginalGameSpec('h5-fortune-ox')?.specialSymbols.wild ?? 7) - 1;
  const fullScreenMultiplier = getFortuneOxFullScreenMultiplier(grid);
  const lines: HotlineWinLine[] = [];

  for (const payline of H5_FORTUNE_OX_PAYLINES) {
    const values = payline.path.map((row, reel) => grid[reel]?.[row]);
    if (values.some((value) => value === undefined)) continue;
    const ordinarySymbols = new Set(values.filter((value) => value !== wildIndex));
    if (ordinarySymbols.size > 1) continue;
    const symbol = ordinarySymbols.size === 0 ? wildIndex : [...ordinarySymbols][0]!;
    if (!symbols[symbol]) continue;

    const line = makeHotlineWinLine(payline, symbol, 3, 0, 'ltr', symbols);
    line.positions = payline.path.map((row, reel) => ({ reel, row }));
    line.payout = roundMultiplier(line.payout * fullScreenMultiplier);
    lines.push(line);
  }

  return {
    lines,
    totalMultiplier: roundMultiplier(lines.reduce((sum, line) => sum + line.payout, 0)),
  };
}

/**
 * Hotline: evaluate fixed paylines from both outer edges.
 * This matches common "Both Ways" slots: symbols must be adjacent on a payline
 * and start from the leftmost or rightmost reel. Middle-only runs do not pay.
 */
export function hotlineEvaluate(
  grid: number[][],
  gameId?: string,
  sourceStacks?: readonly HotlineSourceStack[],
  sourceRandom01?: () => number,
): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  if (gameId === 'h5-nine-line-pull-king') {
    return evaluateNineLinePullKing(grid, sourceRandom01);
  }
  if (gameId === 'h5-water-margin') return evaluateWaterMargin(grid);
  if (gameId === 'h5-diamond-strike') return evaluateDiamondStrike(grid);
  if (gameId === 'h5-yu-pu-tuan') return evaluateYuPuTuan(grid);
  if (gameId === 'h5-fruit-little-mary') return evaluateFruitLittleMary(grid);
  if (gameId === 'h5-aztec-treasure') return evaluateAztecGems(grid);
  if (gameId === 'h5-fortune-gems') return evaluateFortuneGems(grid);
  if (gameId === 'h5-fire-88') return evaluateFire88(grid);
  if (gameId === 'h5-lucky-777') return evaluateLucky777(grid);
  if (gameId === 'h5-caishen-fa-fa-fa') return evaluateCaishenFaFaFa(grid);
  if (gameId === 'h5-flying-together') return evaluateFlyingTogether(grid);
  if (gameId === 'h5-star-97') return evaluateStar97(grid);
  if (gameId === 'h5-fortune-ox') return evaluateFortuneOx(grid);
  if (gameId && HOTLINE_BOUNTY_GAME_IDS.has(gameId)) return evaluateBountyPaylines(grid, gameId);
  const rowCount = Math.max(...grid.map((col) => col.length), 0);
  const mode = getHotlineEvaluationMode(gameId, rowCount);
  if (mode === 'cluster') return hotlineEvaluateClusters(grid, gameId);
  if (mode === 'ways') return hotlineEvaluateAdjacentWays(grid, gameId, sourceStacks);

  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;
  const reelCount = grid.length === HOTLINE_MINI_REELS ? HOTLINE_MINI_REELS : HOTLINE_REELS;
  const paylines = getHotlinePaylinesForGame(gameId, reelCount, rowCount);
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  // The generic paytable was calibrated around five active lines. Imported
  // games expose the total stake, so normalize additional source paylines to
  // avoid multiplying the expected return merely by enabling their overlays.
  const payoutScale = getHotlinePaylinePayoutScale(gameId, paylines.length);

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

const H5_WATER_MARGIN_FULL_SCREEN_MULTIPLIERS = [
  50, 100, 150, 250, 400, 500, 1_000, 2_500, 5_000,
] as const;

/**
 * Water Margin pays the nine source lines from either outer edge. Dragon
 * runs of three/four trigger Little Mary without an ordinary line award;
 * therefore they intentionally remain in `lines` with payout zero.
 */
function evaluateWaterMargin(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-water-margin';
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const values = grid.flat();
  const fullScreen = values.length === 15;
  const first = values[0];
  let fullScreenMultiplier = 0;
  if (fullScreen && first !== undefined && values.every((symbol) => symbol === first)) {
    fullScreenMultiplier = H5_WATER_MARGIN_FULL_SCREEN_MULTIPLIERS[first] ?? 0;
  } else if (fullScreen && values.every((symbol) => symbol >= 0 && symbol <= 2)) {
    fullScreenMultiplier = 15;
  } else if (fullScreen && values.every((symbol) => symbol >= 3 && symbol <= 5)) {
    fullScreenMultiplier = 50;
  }

  if (fullScreenMultiplier > 0) {
    const bonusDragon = getH5OriginalGameSpec(gameId)!.specialSymbols.bonusDragon! - 1;
    const positions = grid.flatMap((column, reel) => column.map((_symbol, row) => ({ reel, row })));
    return {
      lines: [
        {
          lineId: 'full-screen',
          path: [1, 1, 1, 1, 1],
          positions,
          startReel: 0,
          direction: 'ltr',
          row: 1,
          symbol: first!,
          count: first === bonusDragon ? 15 : positions.length,
          payout: fullScreenMultiplier,
        },
      ],
      totalMultiplier: fullScreenMultiplier,
    };
  }

  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;
  for (const payline of H5_WATER_MARGIN_PAYLINES) {
    const leftWin = evaluatePaylineEdge(grid, payline, 5, 'ltr', symbols, 1);
    const rightWin = evaluatePaylineEdge(grid, payline, 5, 'rtl', symbols, 1);
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

/** Exact 15-line, left-to-right substitution contract used by Diamond Strike. */
function evaluateDiamondStrike(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-diamond-strike';
  const spec = getH5OriginalGameSpec(gameId)!;
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const seven = spec.specialSymbols.seven! - 1;
  const scatter = spec.specialSymbols.scatter! - 1;
  const wild = spec.specialSymbols.wild! - 1;
  const goldenSeven = spec.specialSymbols.goldenSeven! - 1;
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  const matchesTarget = (value: number | undefined, target: number): boolean => {
    if (value === undefined || value === scatter) return false;
    if (target === seven) return value === seven || value === goldenSeven || value === wild;
    if (target === wild) return value === wild;
    return value === target || value === wild;
  };

  for (const payline of H5_FIFTEEN_LINE_PAYLINES) {
    const first = grid[0]?.[payline.path[0]!];
    if (first === undefined || first === scatter) continue;
    const candidates =
      first === wild ? [0, 1, 2, 3, 4, seven, wild] : [first === goldenSeven ? seven : first];
    let best: HotlineWinLine | undefined;

    for (const target of candidates) {
      let count = 0;
      const positions: HotlineWinPosition[] = [];
      for (let reel = 0; reel < 5; reel += 1) {
        const row = payline.path[reel]!;
        if (!matchesTarget(grid[reel]?.[row], target)) break;
        count += 1;
        positions.push({ reel, row });
      }
      if (count < 3 || !symbols[target]) continue;
      const line = makeHotlineWinLine(payline, target, count, 0, 'ltr', symbols);
      line.positions = positions;
      if (
        !best ||
        line.payout > best.payout ||
        (line.payout === best.payout && count > best.count)
      ) {
        best = line;
      }
    }

    if (!best || best.payout <= 0) continue;
    lines.push(best);
    totalMultiplier += best.payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

/**
 * Yu Pu Tuan pays its 50 fixed lines from the first reel only. Wild appears
 * on reels 2-5 and substitutes every paying symbol, while Scatter is confined
 * to reels 1-3 and never substitutes. Dress, shoes and lady pay from two
 * adjacent reels; the card/flower/fan symbols require at least three.
 */
function evaluateYuPuTuan(grid: number[][]): { lines: HotlineWinLine[]; totalMultiplier: number } {
  const gameId = 'h5-yu-pu-tuan';
  const spec = getH5OriginalGameSpec(gameId)!;
  const symbols = getHotlineSymbolsForGame(gameId, 5, 4);
  const wild = spec.specialSymbols.wild! - 1;
  const scatter = spec.specialSymbols.scatter! - 1;
  const payingTargets = spec.paytable.map((entry) => entry.sourceSymbolId - 1);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  const matchesTarget = (value: number | undefined, target: number): boolean =>
    value !== undefined && value !== scatter && (value === target || value === wild);

  for (const payline of H5_YU_PU_TUAN_PAYLINES) {
    const first = grid[0]?.[payline.path[0]!];
    if (first === undefined || first === scatter) continue;
    const candidates = first === wild ? payingTargets : [first];
    let best: HotlineWinLine | undefined;

    for (const target of candidates) {
      if (!symbols[target] || target === wild || target === scatter) continue;
      let count = 0;
      const positions: HotlineWinPosition[] = [];
      for (let reel = 0; reel < 5; reel += 1) {
        const row = payline.path[reel]!;
        if (!matchesTarget(grid[reel]?.[row], target)) break;
        count += 1;
        positions.push({ reel, row });
      }
      const minimumCount = symbols[target]!.payout2 !== undefined ? 2 : 3;
      if (count < minimumCount) continue;
      const line = makeHotlineWinLine(payline, target, count, 0, 'ltr', symbols);
      line.positions = positions;
      if (line.payout <= 0) continue;
      if (
        !best ||
        line.payout > best.payout ||
        (line.payout === best.payout && count > best.count)
      ) {
        best = line;
      }
    }

    if (!best) continue;
    lines.push(best);
    totalMultiplier += best.payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

/**
 * Fruit Little Mary pays nine fixed lines from the first reel. Wild replaces
 * ids 1-8 only; BONUS and SCATTER must match themselves. An exact leading
 * Wild run is retained as a zero-payout line so the same authoritative board
 * can start the source 24-cell Little Mary feature.
 */
function evaluateFruitLittleMary(grid: number[][]): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const gameId = 'h5-fruit-little-mary';
  const spec = getH5OriginalGameSpec(gameId)!;
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const bonus = spec.specialSymbols.bonus! - 1;
  const scatter = spec.specialSymbols.scatter! - 1;
  const wild = spec.specialSymbols.wild! - 1;
  const substitutableTargets = Array.from({ length: 8 }, (_, index) => index);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (const payline of H5_FRUIT_LITTLE_MARY_PAYLINES) {
    const values = payline.path.map((row, reel) => grid[reel]?.[row]);
    const first = values[0];
    if (first === undefined) continue;

    let wildCount = 0;
    while (wildCount < values.length && values[wildCount] === wild) wildCount += 1;
    if (wildCount >= 3) {
      const line = makeHotlineWinLine(payline, wild, wildCount, 0, 'ltr', symbols);
      line.positions = Array.from({ length: wildCount }, (_, reel) => ({
        reel,
        row: payline.path[reel]!,
      }));
      line.payout = 0;
      lines.push(line);
      // The source help assigns this exact Wild run to Little Mary and does
      // not print a Wild line prize. Do not simultaneously reinterpret the
      // same run as the highest ordinary symbol.
      continue;
    }

    const candidates =
      first === wild
        ? substitutableTargets
        : first === bonus || first === scatter
          ? [first]
          : first >= 0 && first < 8
            ? [first]
            : [];
    let best: HotlineWinLine | undefined;
    for (const target of candidates) {
      if (!symbols[target]) continue;
      const allowsWild = target !== bonus && target !== scatter;
      let count = 0;
      const positions: HotlineWinPosition[] = [];
      for (let reel = 0; reel < 5; reel += 1) {
        const value = values[reel];
        if (value !== target && !(allowsWild && value === wild)) break;
        count += 1;
        positions.push({ reel, row: payline.path[reel]! });
      }
      const minimumCount = symbols[target]!.payout2 !== undefined ? 2 : 3;
      if (count < minimumCount) continue;
      const line = makeHotlineWinLine(payline, target, count, 0, 'ltr', symbols);
      line.positions = positions;
      if (line.payout <= 0) continue;
      if (
        !best ||
        line.payout > best.payout ||
        (line.payout === best.payout && count > best.count)
      ) {
        best = line;
      }
    }

    if (!best) continue;
    lines.push(best);
    totalMultiplier += best.payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

/** Exact left-to-right awards printed in the packaged Nine-Line rule sprite. */
function evaluateNineLinePullKing(
  grid: number[][],
  nextRandom01: () => number = () => 0,
): { lines: HotlineWinLine[]; totalMultiplier: number } {
  const gameId = 'h5-nine-line-pull-king';
  const spec = getH5OriginalGameSpec(gameId)!;
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const seven = spec.specialSymbols.seven! - 1;
  const jackpotChest = spec.specialSymbols.jackpotChest! - 1;
  const bar = spec.specialSymbols.bar! - 1;
  const barTable = spec.paytable.find((entry) => entry.sourceSymbolId === bar + 1);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (const payline of H5_NINE_LINE_PULL_KING_PAYLINES) {
    const symbol = grid[0]?.[payline.path[0]!];
    if (symbol === undefined || !symbols[symbol]) continue;
    let count = 1;
    for (let reel = 1; reel < 5; reel += 1) {
      if (grid[reel]?.[payline.path[reel]!] !== symbol) break;
      count += 1;
    }
    if (count < (symbol === bar ? 2 : 3)) continue;

    const line = makeHotlineWinLine(payline, symbol, Math.min(5, count), 0, 'ltr', symbols);
    if (symbol === seven) {
      const minimum = count >= 5 ? 5_000 : count === 4 ? 3_000 : 1_000;
      const randomBonus =
        1 + Math.floor(Math.max(0, Math.min(0.999999999, nextRandom01())) * minimum);
      line.payout = roundMultiplier((minimum + randomBonus) / spec.totalBetUnits);
    } else if (symbol === jackpotChest) {
      line.payout = 0;
      line.jackpotShare = count >= 5 ? 0.5 : count === 4 ? 0.3 : 0.1;
    } else if (symbol === bar && count === 2) {
      line.payout = roundMultiplier((barTable?.payout2 ?? 0) / spec.totalBetUnits);
    }
    line.positions = payline.path.slice(0, count).map((row, reel) => ({ reel, row }));
    lines.push(line);
    totalMultiplier += line.payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

function evaluateBountyPaylines(
  grid: number[][],
  gameId: string,
): { lines: HotlineWinLine[]; totalMultiplier: number } {
  const symbols = getHotlineSymbolsForGame(gameId, 5, 3);
  const wildIndex = (getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 9) - 1;
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (const payline of H5_BOUNTY_PAYLINES) {
    // Wild is restricted to reels 2-4, therefore the first reel always
    // identifies the paying symbol exactly as the official left-to-right rule
    // requires.
    const symbol = grid[0]?.[payline.path[0]!];
    if (symbol === undefined || !symbols[symbol]) continue;
    const positions: HotlineWinPosition[] = [{ reel: 0, row: payline.path[0]! }];
    let count = 1;
    for (let reel = 1; reel < grid.length; reel += 1) {
      const row = payline.path[reel]!;
      const value = grid[reel]?.[row];
      if (value !== symbol && value !== wildIndex) break;
      count += 1;
      positions.push({ reel, row });
    }
    if (count < 3) continue;
    const meta = symbols[symbol]!;
    const payout = count >= 5 ? meta.payout5 : count === 4 ? meta.payout4 : meta.payout3;
    if (payout <= 0) continue;
    lines.push({
      lineId: payline.id,
      ...(payline.lineIndex !== undefined ? { lineIndex: payline.lineIndex } : {}),
      path: [...payline.path],
      positions,
      startReel: 0,
      direction: 'ltr',
      row: payline.path[0]!,
      symbol,
      count,
      payout: roundMultiplier(payout),
    });
    totalMultiplier += payout;
  }

  return { lines, totalMultiplier: roundMultiplier(totalMultiplier) };
}

function hotlineEvaluateClusters(
  grid: number[][],
  gameId?: string,
): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const reelCount = grid.length;
  const rowCount = Math.max(...grid.map((column) => column.length), 0);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const dragonSpec = gameId === 'h5-dragon-hatch' ? getH5OriginalGameSpec(gameId) : undefined;
  const ordinarySymbolCount = dragonSpec?.standardSymbolCount ?? symbols.length;
  const dragonWild = Number(dragonSpec?.specialSymbols.wild ?? 9) - 1;
  for (let symbol = 0; symbol < ordinarySymbolCount; symbol += 1) {
    const components =
      gameId === 'h5-dragon-hatch'
        ? collectConnectedSymbolComponents(grid, symbol, dragonWild)
        : [collectSymbolPositions(grid, symbol)];
    for (const positions of components) {
      const minimumCount =
        gameId === 'h5-dragon-hatch'
          ? (dragonSpec?.clusterMinimum ?? 4)
          : HOTLINE_MEGA_CLUSTER_MIN_COUNT;
      if (positions.length < minimumCount) continue;
      const hasTargetSymbol = positions.some(
        (position) => grid[position.reel]?.[position.row] === symbol,
      );
      // A Water feature can create an all-Wild cluster. Settle that cluster
      // once at the highest symbol value instead of once per substitute.
      if (gameId === 'h5-dragon-hatch' && !hasTargetSymbol && symbol !== ordinarySymbolCount - 1) {
        continue;
      }
      const line =
        gameId === 'h5-dragon-hatch'
          ? makeDragonHatchClusterWinLine(symbol, positions, reelCount)
          : makeMegaClusterWinLine(symbol, positions, reelCount, symbols);
      if (line.payout <= 0) continue;
      lines.push(line);
      totalMultiplier += line.payout;
    }
  }

  return {
    lines,
    totalMultiplier: Number(totalMultiplier.toFixed(4)),
  };
}

function hotlineEvaluateAdjacentWays(
  grid: number[][],
  gameId?: string,
  sourceStacks?: readonly HotlineSourceStack[],
): {
  lines: HotlineWinLine[];
  totalMultiplier: number;
} {
  const reelCount = grid.length;
  const rowCount = Math.max(...grid.map((column) => column.length), 0);
  const symbols = getHotlineSymbolsForGame(gameId, reelCount, rowCount);
  const sourceSpec = getH5OriginalGameSpec(gameId);
  const wildIndex = Number(sourceSpec?.specialSymbols.wild ?? 0) - 1;
  const payoutDivisor = getAdjacentWaysPayoutDivisor(reelCount, rowCount, gameId);
  const lines: HotlineWinLine[] = [];
  let totalMultiplier = 0;

  for (let symbol = 0; symbol < symbols.length; symbol += 1) {
    const positions: HotlineWinPosition[] = [];
    let consecutiveReels = 0;
    let ways = 1;
    for (let reel = 0; reel < reelCount; reel += 1) {
      const matches: HotlineWinPosition[] = [];
      for (let row = 0; row < (grid[reel]?.length ?? 0); row += 1) {
        const value = grid[reel]?.[row];
        if (value === symbol || value === wildIndex) matches.push({ reel, row });
      }
      if (matches.length === 0) break;
      consecutiveReels += 1;
      ways *=
        (isCaishenWins(gameId) || isGoldenEmpire(gameId)) && sourceStacks
          ? countSourceStackWays(sourceStacks, reel, symbol, wildIndex)
          : isCaishenWins(gameId)
            ? countCaishenWaysGroups(grid[reel] ?? [], symbol, wildIndex)
            : matches.length;
      positions.push(...matches);
    }
    if (consecutiveReels < 3) continue;
    const hasTargetSymbol = positions.some(
      (position) => grid[position.reel]?.[position.row] === symbol,
    );
    // A transformed all-Wild way settles once using the highest regular tile,
    // rather than being duplicated once for every possible substitute.
    if (!hasTargetSymbol && symbol !== symbols.length - 1) continue;

    const symbolMeta = symbols[symbol]!;
    const rawPayout =
      consecutiveReels >= 6
        ? (symbolMeta.payout6 ?? symbolMeta.payout5)
        : consecutiveReels === 5
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
function getAdjacentWaysPayoutDivisor(
  reelCount: number,
  rowCount: number,
  gameId?: string,
): number {
  if (getH5OriginalGameSpec(gameId)?.settleWithSourcePaytable) return 1;
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

function collectConnectedSymbolComponents(
  grid: number[][],
  symbol: number,
  wildSymbol = -1,
): HotlineWinPosition[][] {
  const visited = new Set<string>();
  const components: HotlineWinPosition[][] = [];
  for (let reel = 0; reel < grid.length; reel += 1) {
    for (let row = 0; row < (grid[reel]?.length ?? 0); row += 1) {
      const startSymbol = grid[reel]?.[row];
      if ((startSymbol !== symbol && startSymbol !== wildSymbol) || visited.has(`${reel}:${row}`)) {
        continue;
      }
      const component: HotlineWinPosition[] = [];
      const queue: HotlineWinPosition[] = [{ reel, row }];
      visited.add(`${reel}:${row}`);
      while (queue.length > 0) {
        const current = queue.shift()!;
        component.push(current);
        for (const neighbor of [
          { reel: current.reel - 1, row: current.row },
          { reel: current.reel + 1, row: current.row },
          { reel: current.reel, row: current.row - 1 },
          { reel: current.reel, row: current.row + 1 },
        ]) {
          const key = `${neighbor.reel}:${neighbor.row}`;
          if (
            neighbor.reel < 0 ||
            neighbor.reel >= grid.length ||
            neighbor.row < 0 ||
            neighbor.row >= (grid[neighbor.reel]?.length ?? 0) ||
            (grid[neighbor.reel]?.[neighbor.row] !== symbol &&
              grid[neighbor.reel]?.[neighbor.row] !== wildSymbol) ||
            visited.has(key)
          ) {
            continue;
          }
          visited.add(key);
          queue.push(neighbor);
        }
      }
      components.push(component);
    }
  }
  return components;
}

function dragonHatchCountTier(count: number): number {
  if (count >= 25) return 11;
  if (count >= 21) return 10;
  if (count >= 18) return 9;
  if (count >= 15) return 8;
  if (count >= 13) return 7;
  if (count >= 10) return 6;
  if (count === 9) return 5;
  if (count === 8) return 4;
  if (count === 7) return 3;
  if (count === 6) return 2;
  if (count === 5) return 1;
  return 0;
}

function makeDragonHatchClusterWinLine(
  symbol: number,
  positions: HotlineWinPosition[],
  reelCount: number,
): HotlineWinLine {
  const spec = getH5OriginalGameSpec('h5-dragon-hatch');
  const values = spec?.clusterPaytable?.[symbol];
  const payoutUnits = values?.[dragonHatchCountTier(positions.length)] ?? 0;
  const first = positions[0] ?? { reel: 0, row: 0 };
  return {
    lineId: `dragon-cluster-${symbol}-${first.reel}-${first.row}`,
    path: Array.from(
      { length: reelCount },
      (_, reel) => positions.find((position) => position.reel === reel)?.row ?? first.row,
    ),
    positions,
    startReel: first.reel,
    direction: 'ltr',
    row: first.row,
    symbol,
    count: positions.length,
    ways: positions.length,
    payout: roundMultiplier(payoutUnits / (spec?.totalBetUnits ?? 10)),
  };
}

function makeMegaClusterWinLine(
  symbol: number,
  positions: HotlineWinPosition[],
  reelCount: number,
  symbols: readonly HotlineSymbol[],
): HotlineWinLine {
  const symbolMeta = symbols[symbol]!;
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

function clonePositions(positions: readonly HotlineWinPosition[]): HotlineWinPosition[] {
  return positions.map((position) => ({ ...position }));
}

function cloneSourceStack(stack: HotlineSourceStack): HotlineSourceStack {
  return {
    ...stack,
    positions: clonePositions(stack.positions),
  };
}

function drawSourceSpecialSymbol(
  nextSymbol: () => number,
  reel: number,
  gameId: string | undefined,
  nextRandom01: (() => number) | undefined,
): number {
  let ordinary = nextSymbol();
  if (!gameId || !nextRandom01) {
    return ordinary;
  }
  if (gameId === 'h5-diamond-strike') {
    const scatter = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.scatter ?? 7) - 1;
    if (ordinary === scatter && reel !== 0 && reel !== 2 && reel !== 4) {
      for (let retry = 0; retry < 8 && ordinary === scatter; retry += 1) {
        ordinary = nextSymbol();
      }
      if (ordinary === scatter) ordinary = 0;
    }
    return ordinary;
  }
  if (gameId === 'h5-yu-pu-tuan') {
    const spec = getH5OriginalGameSpec(gameId)!;
    const wild = spec.specialSymbols.wild! - 1;
    const scatter = spec.specialSymbols.scatter! - 1;
    const invalidForReel = (symbol: number): boolean =>
      (symbol === wild && reel === 0) || (symbol === scatter && reel > 2);
    for (let retry = 0; retry < 12 && invalidForReel(ordinary); retry += 1) {
      ordinary = nextSymbol();
    }
    return invalidForReel(ordinary) ? 0 : ordinary;
  }
  const bountyWild = HOTLINE_BOUNTY_GAME_IDS.has(gameId) && reel >= 1 && reel <= 3;
  const caishenWild = isCaishenWins(gameId) && reel >= 1 && reel <= 4;
  if (!bountyWild && !caishenWild) return ordinary;
  const wildIndex = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 0) - 1;
  const rate = caishenWild ? HOTLINE_CAISHEN_WILD_RATE : HOTLINE_BOUNTY_WILD_RATE;
  return wildIndex >= 0 && nextRandom01() < rate ? wildIndex : ordinary;
}

/**
 * Caishen's source reels contain 2-4-cell-high symbols. Repeating the source
 * id across occupied cells preserves the bitmap layout, while the ways
 * evaluator below counts the contiguous stack once instead of once per cell.
 */
function drawCaishenColumn(
  rowCount: number,
  reel: number,
  nextSymbol: () => number,
  nextRandom01: () => number,
): number[] {
  const groupRoll = nextRandom01();
  const groupCount = groupRoll < 0.28 ? 3 : groupRoll < 0.72 ? 4 : 5;
  const heights = Array.from({ length: groupCount }, () => 1);
  for (let extra = groupCount; extra < rowCount; extra += 1) {
    const eligible = heights
      .map((height, index) => ({ height, index }))
      .filter((entry) => entry.height < 4);
    const chosen =
      eligible[Math.min(eligible.length - 1, Math.floor(nextRandom01() * eligible.length))];
    if (chosen) heights[chosen.index] = chosen.height + 1;
  }
  const groups: number[] = [];
  let previous = -1;
  for (const height of heights) {
    let symbol = drawSourceSpecialSymbol(nextSymbol, reel, 'h5-caishen-wins', nextRandom01);
    for (let retry = 0; symbol === previous && retry < 4; retry += 1) {
      symbol = drawSourceSpecialSymbol(nextSymbol, reel, 'h5-caishen-wins', nextRandom01);
    }
    groups.push(...Array.from({ length: height }, () => symbol));
    previous = symbol;
  }
  return groups.slice(0, rowCount);
}

function countCaishenWaysGroups(
  column: readonly number[],
  targetSymbol: number,
  wildSymbol: number,
): number {
  let count = 0;
  let previousMatchedValue: number | undefined;
  for (const value of column) {
    const matches = value === targetSymbol || value === wildSymbol;
    if (matches && value !== previousMatchedValue) count += 1;
    previousMatchedValue = matches ? value : undefined;
  }
  return count;
}

function countSourceStackWays(
  stacks: readonly HotlineSourceStack[],
  reel: number,
  targetSymbol: number,
  wildSymbol: number,
): number {
  return stacks.filter(
    (stack) =>
      stack.positions.some((position) => position.reel === reel) &&
      (stack.symbol === targetSymbol || stack.symbol === wildSymbol),
  ).length;
}

function drawGoldenEmpireColumn(
  rowCount: number,
  reel: number,
  nextSymbol: () => number,
  nextRandom01: () => number,
  nextId: () => number,
): HotlineInternalSourceStack[] {
  if (rowCount <= 0) return [];
  const allowsLargeSymbols = reel >= 1 && reel <= 4;
  const minimumGroups = allowsLargeSymbols ? Math.min(3, rowCount) : rowCount;
  const groupRoll = nextRandom01();
  const requestedGroups = allowsLargeSymbols
    ? groupRoll < 0.28
      ? 3
      : groupRoll < 0.72
        ? 4
        : 5
    : rowCount;
  const groupCount = Math.max(minimumGroups, Math.min(rowCount, requestedGroups));
  const heights = Array.from({ length: groupCount }, () => 1);
  for (let extra = groupCount; extra < rowCount; extra += 1) {
    const eligible = heights
      .map((height, index) => ({ height, index }))
      .filter((entry) => entry.height < 4);
    const chosen =
      eligible[Math.min(eligible.length - 1, Math.floor(nextRandom01() * eligible.length))];
    if (chosen) heights[chosen.index] = chosen.height + 1;
  }

  const stacks: HotlineInternalSourceStack[] = [];
  let previous = -1;
  for (const height of heights) {
    let symbol = nextSymbol();
    for (let retry = 0; symbol === previous && retry < 4; retry += 1) symbol = nextSymbol();
    const state =
      allowsLargeSymbols && nextRandom01() < HOTLINE_GOLDEN_EMPIRE_GOLD_RATE
        ? ('gold' as const)
        : ('ordinary' as const);
    stacks.push({ id: nextId(), symbol, height, state });
    previous = symbol;
  }
  return stacks;
}

function expandSourceStackColumns(columns: readonly HotlineInternalSourceStack[][]): number[][] {
  return columns.map((column) =>
    column.flatMap((stack) => Array.from({ length: stack.height }, () => stack.symbol)),
  );
}

function exposeSourceStackColumns(
  columns: readonly HotlineInternalSourceStack[][],
): HotlineSourceStack[] {
  const exposed: HotlineSourceStack[] = [];
  columns.forEach((column, reel) => {
    let row = 0;
    for (const stack of column) {
      exposed.push({
        id: stack.id,
        symbol: stack.symbol,
        positions: Array.from({ length: stack.height }, (_, offset) => ({
          reel,
          row: row + offset,
        })),
        state: stack.state,
        ...(stack.remaining !== undefined ? { remaining: stack.remaining } : {}),
      });
      row += stack.height;
    }
  });
  return exposed;
}

function applyGoldenEmpireCascadeDrop(
  columns: readonly HotlineInternalSourceStack[][],
  removed: readonly HotlineWinPosition[],
  rowCount: number,
  nextSymbol: () => number,
  nextRandom01: () => number,
  nextId: () => number,
): HotlineInternalSourceStack[][] {
  const removedByReel = new Map<number, Set<number>>();
  for (const position of removed) {
    const rows = removedByReel.get(position.reel) ?? new Set<number>();
    rows.add(position.row);
    removedByReel.set(position.reel, rows);
  }
  const wildIndex =
    Number(getH5OriginalGameSpec('h5-golden-empire')?.specialSymbols.wild ?? 12) - 1;

  return columns.map((column, reel) => {
    const removedRows = removedByReel.get(reel) ?? new Set<number>();
    let row = 0;
    const remaining: HotlineInternalSourceStack[] = [];
    for (const source of column) {
      const stack = { ...source };
      const hit = Array.from({ length: stack.height }, (_, offset) => row + offset).some(
        (position) => removedRows.has(position),
      );
      row += stack.height;
      if (!hit) {
        remaining.push(stack);
        continue;
      }
      if (stack.state === 'gold') {
        remaining.push({
          ...stack,
          symbol: wildIndex,
          state: 'wild',
          remaining: Math.max(1, stack.height),
        });
        continue;
      }
      if (stack.state === 'wild') {
        const nextRemaining = Math.max(0, Number(stack.remaining ?? stack.height) - 1);
        if (nextRemaining > 0) remaining.push({ ...stack, remaining: nextRemaining });
      }
    }

    const occupied = remaining.reduce((sum, stack) => sum + stack.height, 0);
    const fillCount = Math.max(0, rowCount - occupied);
    const filled = drawGoldenEmpireColumn(fillCount, reel, nextSymbol, nextRandom01, nextId);
    return [...filled, ...remaining];
  });
}

function applySourceSpecialCascadeDrop(
  grid: number[][],
  removed: HotlineWinPosition[],
  rowCount: number,
  nextSymbol: () => number,
  gameId: string,
  nextRandom01: (() => number) | undefined,
): number[][] {
  const removedByReel = new Map<number, Set<number>>();
  for (const position of removed) {
    const rows = removedByReel.get(position.reel) ?? new Set<number>();
    rows.add(position.row);
    removedByReel.set(position.reel, rows);
  }

  return grid.map((column, reel) => {
    const rows = removedByReel.get(reel);
    if (!rows || rows.size === 0) return [...column];
    const remaining = column.filter((_symbol, row) => !rows.has(row));
    const fillCount = Math.max(0, rowCount - remaining.length);
    const filled = isCaishenWins(gameId)
      ? drawCaishenColumn(fillCount, reel, nextSymbol, nextRandom01 ?? (() => 0.5))
      : Array.from({ length: fillCount }, () =>
          drawSourceSpecialSymbol(nextSymbol, reel, gameId, nextRandom01),
        );
    return [...filled, ...remaining].slice(-rowCount);
  });
}

function drawMahjongGoldPositions(
  grid: number[][],
  gameId: string | undefined,
  nextRandom01: (() => number) | undefined,
  freeSpinMode: boolean,
): HotlineWinPosition[] {
  if (!isMahjongGame(gameId) || !nextRandom01) return [];
  const standardCount = getH5OriginalGameSpec(gameId)?.standardSymbolCount ?? 0;
  const gold: HotlineWinPosition[] = [];
  for (let reel = 1; reel <= 3; reel += 1) {
    for (let row = 0; row < (grid[reel]?.length ?? 0); row += 1) {
      const symbol = grid[reel]?.[row];
      if (symbol === undefined || symbol < 0 || symbol >= standardCount) continue;
      const forcedFreeGold = freeSpinMode && gameId === 'h5-mahjong-ways-2' && reel === 2;
      if (forcedFreeGold || nextRandom01() < HOTLINE_MAHJONG_GOLD_RATE) {
        gold.push({ reel, row });
      }
    }
  }
  return gold;
}

function applyMahjongCascadeDrop(
  grid: number[][],
  goldPositions: HotlineWinPosition[],
  removed: HotlineWinPosition[],
  nextSymbol: () => number,
  gameId: string | undefined,
  nextRandom01: (() => number) | undefined,
  freeSpinMode: boolean,
): { grid: number[][]; goldPositions: HotlineWinPosition[] } {
  const goldKeys = new Set(goldPositions.map((position) => `${position.reel}:${position.row}`));
  const removedKeys = new Set(removed.map((position) => `${position.reel}:${position.row}`));
  const wildIndex = Number(getH5OriginalGameSpec(gameId)?.specialSymbols.wild ?? 0) - 1;
  const nextGrid: number[][] = [];
  const nextGold: HotlineWinPosition[] = [];

  for (let reel = 0; reel < grid.length; reel += 1) {
    const source = grid[reel] ?? [];
    const remaining: Array<{ symbol: number; gold: boolean }> = [];
    for (let row = 0; row < source.length; row += 1) {
      const key = `${reel}:${row}`;
      const gold = goldKeys.has(key);
      if (removedKeys.has(key)) {
        if (gold) remaining.push({ symbol: wildIndex, gold: false });
        continue;
      }
      remaining.push({ symbol: source[row]!, gold });
    }

    const fillCount = Math.max(0, source.length - remaining.length);
    const filled = Array.from({ length: fillCount }, () => ({
      symbol: nextSymbol(),
      gold: false,
    }));
    const cells = [...filled, ...remaining].slice(-source.length);
    // Apply the source reel restriction to newly inserted cells while
    // retaining gold on ordinary symbols that merely fell to a new row.
    for (let row = 0; row < cells.length; row += 1) {
      const cell = cells[row]!;
      const isNewCell = row < fillCount;
      const forcedFreeGold =
        isNewCell && freeSpinMode && gameId === 'h5-mahjong-ways-2' && reel === 2;
      const randomNewGold =
        isNewCell &&
        reel >= 1 &&
        reel <= 3 &&
        nextRandom01 !== undefined &&
        nextRandom01() < HOTLINE_MAHJONG_GOLD_RATE;
      if (cell.gold || forcedFreeGold || randomNewGold) nextGold.push({ reel, row });
    }
    nextGrid.push(cells.map((cell) => cell.symbol));
  }

  return { grid: nextGrid, goldPositions: nextGold };
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
