import { hmacIntStream } from './hmac.js';

export const THOR2_MODEL_VERSION = 'thor2-observed-rules-v2';
export const THOR2_REELS = 6;
export const THOR2_ROWS = 5;
export const THOR2_MAX_CASCADES = 8;
export const THOR2_MAX_FREE_SPINS = 100;
export const THOR2_MAX_WIN_MULTIPLIER = 25_000;
export const THOR2_LEGAL_MULTIPLIERS = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 50, 100, 250, 500, 1_000,
] as const;

export type Thor2FeatureKind = 'regular' | 'super' | 'lucky' | 'natural';

export interface Thor2Cell {
  symbol: number;
  multiplier?: number;
}

export interface Thor2SymbolWin {
  symbol: number;
  count: number;
  positions: number[];
  payMultiplier: number;
}

export interface Thor2MultiplierEvent {
  position: number;
  from: number;
  to: number;
  level: 1 | 2 | 3;
}

export interface Thor2Cascade {
  before: Thor2Cell[];
  after: Thor2Cell[];
  wins: Thor2SymbolWin[];
  baseWinMultiplier: number;
  collectedMultiplier: number;
  accumulatedMultiplier: number;
  payoutMultiplier: number;
  upgrades: Thor2MultiplierEvent[];
}

export interface Thor2Round {
  index: number;
  grid: Thor2Cell[];
  finalGrid: Thor2Cell[];
  cascades: Thor2Cascade[];
  payoutMultiplier: number;
  accumulatedMultiplier: number;
  retriggeredSpins: number;
  superBonusMultiplier: number;
}

export interface Thor2FeatureResult {
  kind: Thor2FeatureKind;
  spinsAwarded: number;
  spinsPlayed: number;
  rounds: Thor2Round[];
  accumulatedMultiplier: number;
  totalMultiplier: number;
  maxWinReached: boolean;
}

export interface Thor2EngineResult {
  grid: Thor2Cell[];
  cascades: Thor2Cascade[];
  feature?: Thor2FeatureResult;
  totalMultiplier: number;
  maxWinReached: boolean;
}

type RandomSource = { nextInt(maxExclusive: number): number; chance(rate: number): boolean };

const NORMAL_SYMBOLS = [3, 4, 5, 6, 9, 10, 11, 12, 13] as const;
const SYMBOL_WEIGHTS = [5, 7, 8, 10, 13, 14, 15, 16, 18] as const;
const MULTIPLIER_SYMBOLS = [15, 16, 17, 18, 19] as const;
const MULTIPLIER_BUCKETS = [
  [2, 3, 4, 5, 6, 8],
  [10, 12, 15, 20, 25],
  [50],
  [100, 250, 500],
  [1_000],
] as const;

// The original help values are credit values.  The local engine keeps the
// same relative paytable and expresses them as total-bet multipliers.
const PAYTABLE: Record<number, readonly [number, number, number]> = {
  3: [2, 5, 10],
  4: [0.5, 2, 5],
  5: [0.4, 1, 3],
  6: [0.3, 0.4, 2.4],
  9: [0.2, 0.3, 2],
  10: [0.16, 0.24, 1.6],
  11: [0.1, 0.2, 1],
  12: [0.08, 0.18, 0.8],
  13: [0.05, 0.15, 0.4],
};

function randomSource(serverSeed: string, clientSeed: string, nonce: number): RandomSource {
  const stream = hmacIntStream(serverSeed, clientSeed, nonce);
  return {
    nextInt(maxExclusive) {
      const value = stream.next().value ?? 0;
      return Math.floor((value / 0x1_0000_0000) * maxExclusive);
    },
    chance(rate) {
      const value = stream.next().value ?? 0;
      return value / 0x1_0000_0000 < rate;
    },
  };
}

function weightedNormalSymbol(random: RandomSource): number {
  const total = SYMBOL_WEIGHTS.reduce((sum, weight) => sum + weight, 0);
  let cursor = random.nextInt(total);
  for (let index = 0; index < NORMAL_SYMBOLS.length; index += 1) {
    cursor -= SYMBOL_WEIGHTS[index] ?? 0;
    if (cursor < 0) return NORMAL_SYMBOLS[index] ?? 13;
  }
  return 13;
}

function multiplierCell(random: RandomSource, forcedValue?: number): Thor2Cell {
  const bucketRoll = random.nextInt(10_000);
  const rolledBucket = bucketRoll < 7_400 ? 0 : bucketRoll < 9_300 ? 1 : bucketRoll < 9_800 ? 2 : 3;
  const forcedBucket =
    forcedValue === undefined
      ? -1
      : MULTIPLIER_BUCKETS.findIndex((values) =>
          (values as readonly number[]).includes(forcedValue),
        );
  const bucket = forcedBucket >= 0 ? forcedBucket : rolledBucket;
  const values = MULTIPLIER_BUCKETS[bucket] ?? MULTIPLIER_BUCKETS[0];
  const multiplier = forcedValue ?? values[random.nextInt(values.length)] ?? 2;
  return { symbol: MULTIPLIER_SYMBOLS[bucket] ?? 15, multiplier };
}

function randomCell(
  random: RandomSource,
  options: { bonusRate: number; superBonusRate: number; multiplierRate: number; lucky: boolean },
): Thor2Cell {
  if (options.lucky && random.chance(0.32)) return multiplierCell(random, 1_000);
  if (random.chance(options.bonusRate)) return { symbol: 1 };
  if (random.chance(options.superBonusRate)) return { symbol: 20 };
  if (random.chance(options.multiplierRate)) {
    return multiplierCell(random, options.lucky ? 1_000 : undefined);
  }
  return { symbol: weightedNormalSymbol(random) };
}

function buildGrid(
  random: RandomSource,
  options: { bonusRate: number; superBonusRate: number; multiplierRate: number; lucky: boolean },
): Thor2Cell[] {
  return Array.from({ length: THOR2_REELS * THOR2_ROWS }, () => randomCell(random, options));
}

function payForCount(symbol: number, count: number): number {
  const values = PAYTABLE[symbol];
  if (!values || count < 8) return 0;
  return count >= 12 ? values[2] : count >= 10 ? values[1] : values[0];
}

function bonusPayForCount(count: number): number {
  if (count >= 6) return 100;
  if (count === 5) return 5;
  return count === 4 ? 3 : 0;
}

export function evaluateThor2AnywherePays(grid: readonly Thor2Cell[]): Thor2SymbolWin[] {
  const positions = new Map<number, number[]>();
  grid.forEach((cell, index) => {
    if (!PAYTABLE[cell.symbol]) return;
    const list = positions.get(cell.symbol) ?? [];
    list.push(index);
    positions.set(cell.symbol, list);
  });
  return Array.from(positions.entries())
    .map(([symbol, symbolPositions]) => ({
      symbol,
      count: symbolPositions.length,
      positions: symbolPositions,
      payMultiplier: payForCount(symbol, symbolPositions.length),
    }))
    .filter((win) => win.payMultiplier > 0);
}

function upgradeMultiplier(value: number, levels: 1 | 2 | 3) {
  const currentIndex = THOR2_LEGAL_MULTIPLIERS.indexOf(
    value as (typeof THOR2_LEGAL_MULTIPLIERS)[number],
  );
  if (currentIndex < 0 || currentIndex === THOR2_LEGAL_MULTIPLIERS.length - 1) return null;
  const nextIndex = Math.min(THOR2_LEGAL_MULTIPLIERS.length - 1, currentIndex + levels);
  return {
    value: THOR2_LEGAL_MULTIPLIERS[nextIndex] ?? value,
    level: levels,
  };
}

function rollUpgradeLevels(random: RandomSource, superMode: boolean): 0 | 1 | 2 | 3 {
  if (!random.chance(superMode ? 0.58 : 0.24)) return 0;
  if (superMode && random.chance(0.24)) return 3;
  return random.chance(0.35) ? 2 : 1;
}

function refillGrid(
  before: readonly Thor2Cell[],
  removed: ReadonlySet<number>,
  random: RandomSource,
  multiplierRate: number,
  lucky: boolean,
): Thor2Cell[] {
  const next = Array<Thor2Cell>(THOR2_REELS * THOR2_ROWS);
  for (let reel = 0; reel < THOR2_REELS; reel += 1) {
    const survivors: Thor2Cell[] = [];
    for (let row = THOR2_ROWS - 1; row >= 0; row -= 1) {
      const position = reel * THOR2_ROWS + row;
      if (!removed.has(position)) survivors.unshift(before[position] ?? { symbol: 13 });
    }
    const missing = THOR2_ROWS - survivors.length;
    const column = Array.from({ length: missing }, () =>
      randomCell(random, { bonusRate: 0, superBonusRate: 0, multiplierRate, lucky }),
    ).concat(survivors);
    for (let row = 0; row < THOR2_ROWS; row += 1) {
      next[reel * THOR2_ROWS + row] = column[row] ?? { symbol: 13 };
    }
  }
  return next;
}

function playRound(
  random: RandomSource,
  grid: Thor2Cell[],
  accumulatedMultiplier: number,
  superMode: boolean,
  lucky: boolean,
): { round: Thor2Round; finalGrid: Thor2Cell[] } {
  const initialGrid = grid.map((cell) => ({ ...cell }));
  const cascades: Thor2Cascade[] = [];
  let current = grid;
  let roundPayout = 0;
  let runningMultiplier = accumulatedMultiplier;

  for (let cascadeIndex = 0; cascadeIndex < THOR2_MAX_CASCADES; cascadeIndex += 1) {
    const wins = evaluateThor2AnywherePays(current);
    if (wins.length === 0) break;
    const before = current.map((cell) => ({ ...cell }));
    const upgrades: Thor2MultiplierEvent[] = [];
    // The original client protocol carries one UpgradeLevel sequence for the
    // whole screen. Every multiplier symbol advances by that same number of
    // legal steps (with 1000x clamped), rather than independently rolling an
    // upgrade per symbol.
    const upgradeLevels = current.some((cell) => Boolean(cell.multiplier))
      ? rollUpgradeLevels(random, superMode)
      : 0;
    const upgraded = current.map((cell, position) => {
      if (!cell.multiplier || upgradeLevels === 0) return { ...cell };
      const next = upgradeMultiplier(cell.multiplier, upgradeLevels);
      if (!next) return { ...cell };
      upgrades.push({ position, from: cell.multiplier, to: next.value, level: next.level });
      const bucketIndex = MULTIPLIER_BUCKETS.findIndex((bucket) =>
        (bucket as readonly number[]).includes(next.value),
      );
      return {
        symbol: MULTIPLIER_SYMBOLS[Math.max(0, bucketIndex)] ?? 15,
        multiplier: next.value,
      };
    });
    const baseWinMultiplier = wins.reduce((sum, win) => sum + win.payMultiplier, 0);
    const collectedMultiplier = upgraded.reduce((sum, cell) => sum + (cell.multiplier ?? 0), 0);
    runningMultiplier += collectedMultiplier;
    const effectiveMultiplier = lucky
      ? Math.max(1, collectedMultiplier)
      : Math.max(1, runningMultiplier);
    const payoutMultiplier = baseWinMultiplier * effectiveMultiplier;
    roundPayout += payoutMultiplier;
    const removed = new Set(wins.flatMap((win) => win.positions));
    current = refillGrid(upgraded, removed, random, superMode ? 0.095 : 0.065, lucky);
    cascades.push({
      before,
      after: current.map((cell) => ({ ...cell })),
      wins,
      baseWinMultiplier,
      collectedMultiplier,
      accumulatedMultiplier: runningMultiplier,
      payoutMultiplier,
      upgrades,
    });
  }

  const bonusCount = current.filter((cell) => cell.symbol === 1).length;
  const superBonusCount = Math.min(4, current.filter((cell) => cell.symbol === 20).length);
  const superBonusMultiplier =
    bonusCount >= 3 ? ([0, 100, 500, 5_000, 25_000][superBonusCount] ?? 0) : 0;
  return {
    round: {
      index: 0,
      grid: initialGrid,
      finalGrid: current.map((cell) => ({ ...cell })),
      cascades,
      payoutMultiplier: roundPayout + superBonusMultiplier,
      accumulatedMultiplier: runningMultiplier,
      retriggeredSpins: bonusCount >= 3 ? 5 : 0,
      superBonusMultiplier,
    },
    finalGrid: current,
  };
}

function forceBonusTrigger(grid: Thor2Cell[], random: RandomSource): Thor2Cell[] {
  const next = grid.map((cell) => ({ ...cell }));
  const used = new Set<number>();
  while (used.size < 4) used.add(random.nextInt(next.length));
  used.forEach((position) => {
    next[position] = { symbol: 1 };
  });
  return next;
}

function shapeLuckyStrikeLoss(grid: Thor2Cell[]): Thor2Cell[] {
  const next = grid.map((cell) => ({ ...cell }));
  const counts = new Map<number, number>();
  for (let position = 0; position < next.length; position += 1) {
    const cell = next[position] ?? { symbol: 13 };
    if (cell.multiplier) {
      next[position] = { symbol: 19, multiplier: 1_000 };
      continue;
    }
    if (!PAYTABLE[cell.symbol]) continue;
    const count = (counts.get(cell.symbol) ?? 0) + 1;
    if (count <= 7) {
      counts.set(cell.symbol, count);
      continue;
    }
    const replacement = NORMAL_SYMBOLS.find((symbol) => (counts.get(symbol) ?? 0) < 7) ?? 13;
    next[position] = { symbol: replacement };
    counts.set(replacement, (counts.get(replacement) ?? 0) + 1);
  }
  return next;
}

function shapeLuckyStrikeMaxWin(grid: Thor2Cell[], random: RandomSource): Thor2Cell[] {
  const next = shapeLuckyStrikeLoss(grid);
  const normalPositions = next
    .map((cell, position) => ({ cell, position }))
    .filter(({ cell }) => !cell.multiplier)
    .map(({ position }) => position);
  while (normalPositions.length < 8) {
    const position = next.findIndex((cell) => Boolean(cell.multiplier));
    if (position < 0) break;
    next[position] = { symbol: 3 };
    normalPositions.push(position);
  }
  const winningPositions = new Set(normalPositions.slice(0, 8));
  winningPositions.forEach((position) => {
    next[position] = { symbol: 3 };
  });
  let multiplierCount = next.filter((cell) => Boolean(cell.multiplier)).length;
  for (let position = 0; position < next.length && multiplierCount < 13; position += 1) {
    if (winningPositions.has(position) || next[position]?.multiplier) continue;
    next[position] = multiplierCell(random, 1_000);
    multiplierCount += 1;
  }
  return next;
}

function maybeForceFeatureWin(
  grid: Thor2Cell[],
  random: RandomSource,
  superMode: boolean,
): Thor2Cell[] {
  if (!random.chance(superMode ? 0.075 : 0.035)) return grid;
  const next = grid.map((cell) => ({ ...cell }));
  const symbols = superMode ? [3, 4, 5, 6, 9] : [6, 9, 10, 11, 12, 13];
  const symbol = symbols[random.nextInt(symbols.length)] ?? 13;
  const positions = next
    .map((cell, position) => ({ cell, position }))
    .filter(({ cell }) => !cell.multiplier && cell.symbol !== 1 && cell.symbol !== 20)
    .slice(0, 8);
  positions.forEach(({ position }) => {
    next[position] = { symbol };
  });
  return next;
}

function capResultMultiplier(value: number): number {
  return Math.min(THOR2_MAX_WIN_MULTIPLIER, Math.max(0, Math.round(value * 10_000) / 10_000));
}

export function thor2Spin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  options: { extraBet?: boolean; buyFeature?: 'regular' | 'super' | 'lucky' } = {},
): Thor2EngineResult {
  const random = randomSource(serverSeed, clientSeed, nonce);
  const kind = options.buyFeature;
  const isLucky = kind === 'lucky';
  const luckyMaxWin = isLucky && random.chance(1 / 6.44);
  let grid = buildGrid(random, {
    bonusRate: kind ? 0 : 0.002,
    superBonusRate: 0.0012,
    multiplierRate: isLucky ? 0.32 : 0.008,
    lucky: isLucky,
  });
  if (kind === 'regular' || kind === 'super') grid = forceBonusTrigger(grid, random);
  if (!kind && random.chance(options.extraBet ? 0.0074 : 0.0037)) {
    grid = forceBonusTrigger(grid, random);
  }
  if (isLucky) {
    grid = luckyMaxWin ? shapeLuckyStrikeMaxWin(grid, random) : shapeLuckyStrikeLoss(grid);
  }

  const initialBonusCount = grid.filter((cell) => cell.symbol === 1).length;
  const base = playRound(random, grid, 0, kind === 'super', isLucky);
  const naturalFeature = initialBonusCount >= 4 && !isLucky;
  if (!kind && !naturalFeature) {
    const totalMultiplier = capResultMultiplier(base.round.payoutMultiplier);
    return {
      grid: base.finalGrid,
      cascades: base.round.cascades,
      totalMultiplier,
      maxWinReached: totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER,
    };
  }
  if (isLucky) {
    const totalMultiplier = capResultMultiplier(base.round.payoutMultiplier);
    return {
      grid: base.finalGrid,
      cascades: base.round.cascades,
      feature: {
        kind: 'lucky',
        spinsAwarded: 1,
        spinsPlayed: 1,
        rounds: [{ ...base.round, index: 1 }],
        accumulatedMultiplier: base.round.accumulatedMultiplier,
        totalMultiplier,
        maxWinReached: totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER,
      },
      totalMultiplier,
      maxWinReached: totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER,
    };
  }

  const featureKind: Thor2FeatureKind = kind ?? 'natural';
  const rounds: Thor2Round[] = [];
  let awarded = 15;
  let accumulatedMultiplier = 0;
  let totalMultiplier = base.round.payoutMultiplier + bonusPayForCount(initialBonusCount);
  for (let index = 0; index < awarded && index < THOR2_MAX_FREE_SPINS; index += 1) {
    const freeGrid = maybeForceFeatureWin(
      buildGrid(random, {
        bonusRate: 0.004,
        superBonusRate: 0.0012,
        multiplierRate: featureKind === 'super' ? 0.1 : 0.07,
        lucky: false,
      }),
      random,
      featureKind === 'super',
    );
    const played = playRound(
      random,
      freeGrid,
      accumulatedMultiplier,
      featureKind === 'super',
      false,
    );
    accumulatedMultiplier = played.round.accumulatedMultiplier;
    const retrigger = Math.min(played.round.retriggeredSpins, THOR2_MAX_FREE_SPINS - awarded);
    awarded += retrigger;
    totalMultiplier += played.round.payoutMultiplier;
    rounds.push({ ...played.round, index: index + 1, retriggeredSpins: retrigger });
    grid = played.finalGrid;
    if (totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER) break;
  }
  totalMultiplier = capResultMultiplier(totalMultiplier);
  const maxWinReached = totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER;
  return {
    // The top-level grid is the paid base-game screen. Free-game screens are
    // retained in feature.rounds. Keeping the trigger screen here lets the
    // original client enter its native free-game presentation correctly.
    grid: base.round.grid,
    cascades: base.round.cascades,
    feature: {
      kind: featureKind,
      spinsAwarded: awarded,
      spinsPlayed: rounds.length,
      rounds,
      accumulatedMultiplier,
      totalMultiplier,
      maxWinReached,
    },
    totalMultiplier,
    maxWinReached,
  };
}
