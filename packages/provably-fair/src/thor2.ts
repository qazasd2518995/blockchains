import { hmacIntStream } from './hmac.js';

export const THOR2_MODEL_VERSION = 'thor2-observed-rules-v8-independent-ball-drops';
export const THOR2_REELS = 6;
export const THOR2_ROWS = 5;
export const THOR2_MAX_CASCADES = 8;
export const THOR2_MAX_FREE_SPINS = 100;
export const THOR2_MAX_FEATURE_MULTIPLIER_BALLS = 3;
export const THOR2_REGULAR_FEATURE_BALL_CELL_RATE = 0.008;
export const THOR2_SUPER_FEATURE_BALL_CELL_RATE = 0.014;
export const THOR2_MAX_WIN_MULTIPLIER = 5_000;
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

export interface Thor2SpinOptions {
  extraBet?: boolean;
  buyFeature?: 'regular' | 'super' | 'lucky';
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
function featureBallCellRate(superMode: boolean): number {
  // Every initial cell and every refill is evaluated independently. This
  // permits an uncollected multiplier to appear on an otherwise losing round,
  // and also permits a multiplier to arrive on a refill even when the opening
  // screen had none, without returning to the old almost-every-round density.
  return superMode ? THOR2_SUPER_FEATURE_BALL_CELL_RATE : THOR2_REGULAR_FEATURE_BALL_CELL_RATE;
}

// The archived official help lists awards at the minimum 20-credit bet. The
// engine settles in total-bet multipliers, so each displayed value is / 20.
const PAYTABLE: Record<number, readonly [number, number, number]> = {
  3: [10, 25, 50],
  4: [2.5, 10, 25],
  5: [2, 5, 15],
  6: [1.5, 2, 12],
  9: [1, 1.5, 10],
  10: [0.8, 1.2, 8],
  11: [0.5, 1, 5],
  12: [0.4, 0.9, 4],
  13: [0.25, 0.75, 2],
};

interface Thor2PayPattern {
  symbol: number;
  count: 8 | 10 | 12;
  payMultiplier: number;
}

interface Thor2ControlledRoundPlan extends Thor2PayPattern {
  multiplierValues: number[];
}

const CONTROL_PAY_PATTERNS: Thor2PayPattern[] = Object.entries(PAYTABLE).flatMap(
  ([symbol, values]) => [
    { symbol: Number(symbol), count: 8, payMultiplier: values[0] },
    { symbol: Number(symbol), count: 10, payMultiplier: values[1] },
    { symbol: Number(symbol), count: 12, payMultiplier: values[2] },
  ],
);
const THOR2_MAX_CONTROL_MULTIPLIER_TOTAL =
  (THOR2_REELS * THOR2_ROWS - 8) * THOR2_LEGAL_MULTIPLIERS.at(-1)!;
const NO_MULTIPLIER_PARTS = 32_767;
const CONTROL_MULTIPLIER_PARTS = new Int16Array(THOR2_MAX_CONTROL_MULTIPLIER_TOTAL + 1);
const CONTROL_MULTIPLIER_CHOICE = new Int16Array(THOR2_MAX_CONTROL_MULTIPLIER_TOTAL + 1);
CONTROL_MULTIPLIER_PARTS.fill(NO_MULTIPLIER_PARTS);
CONTROL_MULTIPLIER_PARTS[0] = 0;
for (let total = 1; total <= THOR2_MAX_CONTROL_MULTIPLIER_TOTAL; total += 1) {
  for (const value of [...THOR2_LEGAL_MULTIPLIERS].reverse()) {
    if (value > total) continue;
    const previous = CONTROL_MULTIPLIER_PARTS[total - value]!;
    if (previous === NO_MULTIPLIER_PARTS || previous + 1 >= CONTROL_MULTIPLIER_PARTS[total]!) {
      continue;
    }
    CONTROL_MULTIPLIER_PARTS[total] = previous + 1;
    CONTROL_MULTIPLIER_CHOICE[total] = value;
  }
}

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

function normalizeThor2Multiplier(value: number): number {
  return Math.round((value + Number.EPSILON) * 10_000) / 10_000;
}

function sameThor2Multiplier(left: number, right: number): boolean {
  return Math.abs(left - right) < 1e-8;
}

export function splitThor2MultiplierTotal(total: number, maxParts: number): number[] | null {
  if (!Number.isInteger(total) || total < 0 || total > THOR2_MAX_CONTROL_MULTIPLIER_TOTAL) {
    return null;
  }
  if (CONTROL_MULTIPLIER_PARTS[total]! > maxParts) return null;
  const values: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const value = CONTROL_MULTIPLIER_CHOICE[remaining]!;
    if (!(THOR2_LEGAL_MULTIPLIERS as readonly number[]).includes(value)) return null;
    values.push(value);
    remaining -= value;
  }
  return values.sort((left, right) => right - left);
}

function controlledRoundPlans(
  factor: number,
  lucky: boolean,
  maxMultiplierParts = THOR2_REELS * THOR2_ROWS,
): Thor2ControlledRoundPlan[] {
  const normalized = normalizeThor2Multiplier(factor);
  const plans: Thor2ControlledRoundPlan[] = [];
  for (const pattern of CONTROL_PAY_PATTERNS) {
    const room = Math.min(THOR2_REELS * THOR2_ROWS - pattern.count, maxMultiplierParts);
    if (!lucky && sameThor2Multiplier(normalized, pattern.payMultiplier)) {
      plans.push({ ...pattern, multiplierValues: [] });
    }
    const multiplierTotal = normalized / pattern.payMultiplier;
    const roundedTotal = Math.round(multiplierTotal);
    if (!sameThor2Multiplier(multiplierTotal, roundedTotal) || roundedTotal < 2) continue;
    const values = lucky
      ? roundedTotal % 1_000 === 0 && roundedTotal / 1_000 <= room
        ? Array.from({ length: roundedTotal / 1_000 }, () => 1_000)
        : null
      : splitThor2MultiplierTotal(roundedTotal, room);
    if (!values || values.length === 0) continue;
    plans.push({ ...pattern, multiplierValues: values });
  }
  return plans;
}

function controlledRoundTarget(totalFactor: number, options: Thor2SpinOptions): number {
  return options.buyFeature === 'regular' || options.buyFeature === 'super'
    ? normalizeThor2Multiplier(totalFactor - bonusPayForCount(4))
    : normalizeThor2Multiplier(totalFactor);
}

export function isThor2FactorRepresentable(
  totalFactor: number,
  options: Thor2SpinOptions = {},
): boolean {
  if (!Number.isFinite(totalFactor) || totalFactor < 0 || totalFactor > THOR2_MAX_WIN_MULTIPLIER) {
    return false;
  }
  const roundTarget = controlledRoundTarget(totalFactor, options);
  if (roundTarget < 0) return false;
  if (roundTarget === 0) return true;
  const maxMultiplierParts =
    options.buyFeature === 'regular' || options.buyFeature === 'super'
      ? THOR2_MAX_FEATURE_MULTIPLIER_BALLS
      : THOR2_REELS * THOR2_ROWS;
  return (
    controlledRoundPlans(roundTarget, options.buyFeature === 'lucky', maxMultiplierParts).length > 0
  );
}

/**
 * Return legal visible Thor II factors close to a control-system target.
 * The service still applies every shared min/max/payout bound; this helper is
 * only responsible for the game's paytable and board-capacity constraints.
 */
export function thor2ControlFactorCandidates(
  targetFactor: number,
  options: Thor2SpinOptions = {},
): number[] {
  if (!Number.isFinite(targetFactor)) return [];
  const entryFactor =
    options.buyFeature === 'regular' || options.buyFeature === 'super' ? bonusPayForCount(4) : 0;
  const targetRound = Math.max(0, targetFactor - entryFactor);
  const maxMultiplierParts =
    options.buyFeature === 'regular' || options.buyFeature === 'super'
      ? THOR2_MAX_FEATURE_MULTIPLIER_BALLS
      : THOR2_REELS * THOR2_ROWS;
  const factors = new Set<number>();
  const add = (roundFactor: number) => {
    const total = normalizeThor2Multiplier(entryFactor + roundFactor);
    if (total >= 0 && total <= THOR2_MAX_WIN_MULTIPLIER) factors.add(total);
  };
  add(0);
  for (const pattern of CONTROL_PAY_PATTERNS) {
    if (options.buyFeature !== 'lucky') add(pattern.payMultiplier);
    if (options.buyFeature === 'lucky') {
      const room = Math.min(THOR2_REELS * THOR2_ROWS - pattern.count, maxMultiplierParts);
      for (let count = 1; count <= room; count += 1) {
        add(pattern.payMultiplier * count * 1_000);
      }
      continue;
    }
    const center = Math.round(targetRound / pattern.payMultiplier);
    for (let offset = -16; offset <= 16; offset += 1) {
      const multiplierTotal = center + offset;
      if (multiplierTotal < 2) continue;
      if (!splitThor2MultiplierTotal(multiplierTotal, maxMultiplierParts)) {
        continue;
      }
      add(pattern.payMultiplier * multiplierTotal);
    }
  }
  return [...factors]
    .filter((factor) => factor >= 0 && factor <= THOR2_MAX_WIN_MULTIPLIER)
    .sort(
      (left, right) =>
        Math.abs(left - targetFactor) - Math.abs(right - targetFactor) || left - right,
    );
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

function rollUpgradeLevels(random: RandomSource): 0 | 1 | 2 | 3 {
  if (!random.chance(0.58)) return 0;
  if (random.chance(0.24)) return 3;
  return random.chance(0.35) ? 2 : 1;
}

function limitMultiplierBalls(
  grid: readonly Thor2Cell[],
  random: RandomSource,
  maximum: number,
): Thor2Cell[] {
  let count = 0;
  return grid.map((cell) => {
    if (!cell.multiplier) return { ...cell };
    count += 1;
    return count <= maximum ? { ...cell } : { symbol: weightedNormalSymbol(random) };
  });
}

function refillGrid(
  before: readonly Thor2Cell[],
  removed: ReadonlySet<number>,
  random: RandomSource,
  multiplierRate: number,
  lucky: boolean,
  maxMultiplierBalls: number,
): Thor2Cell[] {
  const next = Array<Thor2Cell>(THOR2_REELS * THOR2_ROWS);
  let multiplierCount = before.reduce(
    (count, cell, position) => count + (!removed.has(position) && cell.multiplier ? 1 : 0),
    0,
  );
  for (let reel = 0; reel < THOR2_REELS; reel += 1) {
    const survivors: Thor2Cell[] = [];
    for (let row = THOR2_ROWS - 1; row >= 0; row -= 1) {
      const position = reel * THOR2_ROWS + row;
      if (!removed.has(position)) survivors.unshift(before[position] ?? { symbol: 13 });
    }
    const missing = THOR2_ROWS - survivors.length;
    const column = Array.from({ length: missing }, () => {
      const cell = randomCell(random, {
        bonusRate: 0,
        superBonusRate: 0,
        multiplierRate: multiplierCount < maxMultiplierBalls ? multiplierRate : 0,
        lucky,
      });
      if (cell.multiplier) multiplierCount += 1;
      return cell;
    }).concat(survivors);
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
  maxMultiplierBalls = THOR2_REELS * THOR2_ROWS,
  refillMultiplierRate = lucky ? 0 : featureBallCellRate(superMode),
): { round: Thor2Round; finalGrid: Thor2Cell[] } {
  const initialGrid = limitMultiplierBalls(grid, random, maxMultiplierBalls);
  const cascades: Thor2Cascade[] = [];
  let current = initialGrid.map((cell) => ({ ...cell }));

  for (let cascadeIndex = 0; cascadeIndex < THOR2_MAX_CASCADES; cascadeIndex += 1) {
    const wins = evaluateThor2AnywherePays(current);
    if (wins.length === 0) break;
    const before = current.map((cell) => ({ ...cell }));
    const baseWinMultiplier = wins.reduce((sum, win) => sum + win.payMultiplier, 0);
    const removed = new Set(wins.flatMap((win) => win.positions));
    current = refillGrid(before, removed, random, refillMultiplierRate, lucky, maxMultiplierBalls);
    cascades.push({
      before,
      after: current.map((cell) => ({ ...cell })),
      wins,
      baseWinMultiplier,
      collectedMultiplier: 0,
      accumulatedMultiplier,
      payoutMultiplier: 0,
      upgrades: [],
    });
  }

  let runningMultiplier = accumulatedMultiplier;
  let roundPayout = 0;
  if (cascades.length > 0) {
    const upgrades: Thor2MultiplierEvent[] = [];
    // The original resolves multiplier balls after the complete tumble chain.
    // Every ball on the final screen participates, including a ball introduced
    // by the last refill. Upgrade animation also happens at this final collect
    // stage, with one shared number of legal ladder steps for the whole screen.
    const multiplierBallCount = current.filter((cell) => Boolean(cell.multiplier)).length;
    // In the captured feature variants, regular free games only collect the
    // balls. Thor's hammer belongs to Super Free Games and begins at 3 balls.
    const upgradeLevels =
      superMode && multiplierBallCount >= THOR2_MAX_FEATURE_MULTIPLIER_BALLS
        ? rollUpgradeLevels(random)
        : 0;
    current = current.map((cell, position) => {
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
    const collectedMultiplier = current.reduce((sum, cell) => sum + (cell.multiplier ?? 0), 0);
    runningMultiplier += collectedMultiplier;
    const baseRoundMultiplier = cascades.reduce(
      (sum, cascade) => sum + cascade.baseWinMultiplier,
      0,
    );
    const effectiveMultiplier = lucky
      ? Math.max(1, collectedMultiplier)
      : Math.max(1, runningMultiplier);
    roundPayout = baseRoundMultiplier * effectiveMultiplier;

    const finalCascade = cascades[cascades.length - 1];
    if (finalCascade) {
      finalCascade.after = current.map((cell) => ({ ...cell }));
      finalCascade.collectedMultiplier = collectedMultiplier;
      finalCascade.accumulatedMultiplier = runningMultiplier;
      finalCascade.payoutMultiplier = roundPayout;
      finalCascade.upgrades = upgrades;
    }
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
  // A paid feature entry is always exactly the four-symbol award shown by the
  // purchase flow. Remove accidental BONUS variants before selecting it.
  const next = grid.map((cell) =>
    cell.symbol === 1 || cell.symbol === 20
      ? { symbol: weightedNormalSymbol(random) }
      : { ...cell },
  );
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

function shuffleThor2Cells(values: Thor2Cell[], random: RandomSource): Thor2Cell[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = random.nextInt(index + 1);
    const current = values[index]!;
    values[index] = values[swapIndex]!;
    values[swapIndex] = current;
  }
  return values;
}

function controlledSafeCells(count: number, random: RandomSource, excludedSymbol = 0): Thor2Cell[] {
  const symbols = NORMAL_SYMBOLS.filter((symbol) => symbol !== excludedSymbol);
  const offset = random.nextInt(symbols.length);
  return Array.from({ length: count }, (_, index) => ({
    symbol: symbols[(offset + index) % symbols.length] ?? 13,
  }));
}

function shapeControlledLossGrid(grid: readonly Thor2Cell[], lucky: boolean): Thor2Cell[] {
  const next = grid.map((current) =>
    lucky && current.multiplier ? { symbol: 19, multiplier: 1_000 } : { ...current },
  );
  const counts = new Map<number, number>();
  for (let position = 0; position < next.length; position += 1) {
    const current = next[position] ?? { symbol: 13 };
    if (current.multiplier || !PAYTABLE[current.symbol]) continue;
    const count = (counts.get(current.symbol) ?? 0) + 1;
    if (count <= 7) {
      counts.set(current.symbol, count);
      continue;
    }
    const replacement = NORMAL_SYMBOLS.find((symbol) => (counts.get(symbol) ?? 0) < 7) ?? 13;
    next[position] = { symbol: replacement };
    counts.set(replacement, (counts.get(replacement) ?? 0) + 1);
  }
  return next;
}

function controlledLossRound(
  random: RandomSource,
  index: number,
  accumulatedMultiplier: number,
  multiplierRate: number,
  lucky: boolean,
  maxMultiplierBalls = THOR2_REELS * THOR2_ROWS,
): Thor2Round {
  const grid = shapeControlledLossGrid(
    limitMultiplierBalls(
      buildGrid(random, {
        bonusRate: 0,
        superBonusRate: 0,
        multiplierRate: lucky ? 0 : multiplierRate,
        lucky,
      }),
      random,
      maxMultiplierBalls,
    ),
    lucky,
  );
  return {
    index,
    grid,
    finalGrid: grid.map((current) => ({ ...current })),
    cascades: [],
    payoutMultiplier: 0,
    accumulatedMultiplier,
    retriggeredSpins: 0,
    superBonusMultiplier: 0,
  };
}

function controlledRefillGrid(
  before: readonly Thor2Cell[],
  removed: ReadonlySet<number>,
  winningSymbol: number,
  random: RandomSource,
): Thor2Cell[] {
  const next = Array<Thor2Cell>(THOR2_REELS * THOR2_ROWS);
  const counts = new Map<number, number>();
  before.forEach((current, position) => {
    if (removed.has(position) || current.multiplier || !PAYTABLE[current.symbol]) return;
    counts.set(current.symbol, (counts.get(current.symbol) ?? 0) + 1);
  });
  const allowed = NORMAL_SYMBOLS.filter((symbol) => symbol !== winningSymbol);
  const chooseSafeSymbol = (): Thor2Cell => {
    const minimum = Math.min(...allowed.map((symbol) => counts.get(symbol) ?? 0));
    const choices = allowed.filter((symbol) => (counts.get(symbol) ?? 0) === minimum);
    const symbol = choices[random.nextInt(choices.length)] ?? allowed[0] ?? 13;
    counts.set(symbol, (counts.get(symbol) ?? 0) + 1);
    return { symbol };
  };
  for (let reel = 0; reel < THOR2_REELS; reel += 1) {
    const survivors: Thor2Cell[] = [];
    for (let row = THOR2_ROWS - 1; row >= 0; row -= 1) {
      const position = reel * THOR2_ROWS + row;
      if (!removed.has(position)) survivors.unshift({ ...(before[position] ?? { symbol: 13 }) });
    }
    const column = Array.from({ length: THOR2_ROWS - survivors.length }, chooseSafeSymbol).concat(
      survivors,
    );
    for (let row = 0; row < THOR2_ROWS; row += 1) {
      next[reel * THOR2_ROWS + row] = column[row] ?? { symbol: 13 };
    }
  }
  return next;
}

function controlledWinningRound(
  random: RandomSource,
  index: number,
  factor: number,
  accumulatedMultiplier: number,
  lucky: boolean,
  maxMultiplierParts = THOR2_REELS * THOR2_ROWS,
): Thor2Round {
  const plans = controlledRoundPlans(factor, lucky, maxMultiplierParts);
  const plan = plans[random.nextInt(plans.length)];
  if (!plan) throw new Error(`Thor II factor ${factor} is not representable`);
  const fixed = [
    ...Array.from({ length: plan.count }, () => ({ symbol: plan.symbol })),
    ...plan.multiplierValues.map((value) => multiplierCell(random, value)),
  ];
  const before = shuffleThor2Cells(
    fixed.concat(controlledSafeCells(THOR2_REELS * THOR2_ROWS - fixed.length, random, plan.symbol)),
    random,
  );
  const wins = evaluateThor2AnywherePays(before);
  const removed = new Set(wins.flatMap((win) => win.positions));
  const after = controlledRefillGrid(before, removed, plan.symbol, random);
  const collectedMultiplier = plan.multiplierValues.reduce((total, value) => total + value, 0);
  const nextAccumulatedMultiplier = accumulatedMultiplier + collectedMultiplier;
  const effectiveMultiplier = lucky
    ? Math.max(1, collectedMultiplier)
    : Math.max(1, nextAccumulatedMultiplier);
  const baseWinMultiplier = wins.reduce((total, win) => total + win.payMultiplier, 0);
  const payoutMultiplier = normalizeThor2Multiplier(baseWinMultiplier * effectiveMultiplier);
  if (!sameThor2Multiplier(payoutMultiplier, factor)) {
    throw new Error(`Thor II factor ${factor} produced ${payoutMultiplier}`);
  }
  const cascade: Thor2Cascade = {
    before: before.map((current) => ({ ...current })),
    after: after.map((current) => ({ ...current })),
    wins,
    baseWinMultiplier,
    collectedMultiplier,
    accumulatedMultiplier: nextAccumulatedMultiplier,
    payoutMultiplier,
    upgrades: [],
  };
  return {
    index,
    grid: before,
    finalGrid: after,
    cascades: [cascade],
    payoutMultiplier,
    accumulatedMultiplier: nextAccumulatedMultiplier,
    retriggeredSpins: 0,
    superBonusMultiplier: 0,
  };
}

function controlledFeatureEntryGrid(random: RandomSource): Thor2Cell[] {
  return shuffleThor2Cells(
    [
      ...Array.from({ length: 4 }, () => ({ symbol: 1 })),
      ...controlledSafeCells(THOR2_REELS * THOR2_ROWS - 4, random),
    ],
    random,
  );
}

/**
 * Generate a deterministic, fully visible result for a control-system target.
 * Unlike re-rolling natural outcomes, every returned payout is constructed
 * from the real Thor paytable, legal multiplier balls and the displayed tumble.
 */
export function thor2SpinForFactor(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  totalFactor: number,
  options: Thor2SpinOptions = {},
): Thor2EngineResult {
  const target = normalizeThor2Multiplier(totalFactor);
  if (!isThor2FactorRepresentable(target, options)) {
    throw new Error(`Thor II factor ${totalFactor} is not representable`);
  }
  const random = randomSource(serverSeed, `${clientSeed}:thor2-factor:${target}`, nonce);
  const kind = options.buyFeature;
  if (kind === 'regular' || kind === 'super') {
    const entryGrid = controlledFeatureEntryGrid(random);
    const roundTarget = normalizeThor2Multiplier(target - bonusPayForCount(4));
    const winningIndex = roundTarget > 0 ? random.nextInt(15) : -1;
    const rounds: Thor2Round[] = [];
    let accumulatedMultiplier = 0;
    for (let index = 0; index < 15; index += 1) {
      const round =
        index === winningIndex
          ? controlledWinningRound(
              random,
              index + 1,
              roundTarget,
              accumulatedMultiplier,
              false,
              THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
            )
          : controlledLossRound(
              random,
              index + 1,
              accumulatedMultiplier,
              featureBallCellRate(kind === 'super'),
              false,
              THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
            );
      accumulatedMultiplier = round.accumulatedMultiplier;
      rounds.push(round);
    }
    return {
      grid: entryGrid,
      cascades: [],
      feature: {
        kind,
        spinsAwarded: 15,
        spinsPlayed: 15,
        rounds,
        accumulatedMultiplier,
        totalMultiplier: target,
        maxWinReached: target >= THOR2_MAX_WIN_MULTIPLIER,
      },
      totalMultiplier: target,
      maxWinReached: target >= THOR2_MAX_WIN_MULTIPLIER,
    };
  }
  if (kind === 'lucky') {
    const round =
      target > 0
        ? controlledWinningRound(random, 1, target, 0, true)
        : controlledLossRound(random, 1, 0, 0, true);
    return {
      grid: round.finalGrid,
      cascades: round.cascades,
      feature: {
        kind: 'lucky',
        spinsAwarded: 1,
        spinsPlayed: 1,
        rounds: [round],
        accumulatedMultiplier: round.accumulatedMultiplier,
        totalMultiplier: target,
        maxWinReached: target >= THOR2_MAX_WIN_MULTIPLIER,
      },
      totalMultiplier: target,
      maxWinReached: target >= THOR2_MAX_WIN_MULTIPLIER,
    };
  }
  const round =
    target > 0
      ? controlledWinningRound(random, 0, target, 0, false)
      : controlledLossRound(random, 0, 0, 0.008, false);
  return {
    grid: round.finalGrid,
    cascades: round.cascades,
    totalMultiplier: target,
    maxWinReached: target >= THOR2_MAX_WIN_MULTIPLIER,
  };
}

/**
 * Build a legal presentation at (or immediately below) the site cap.
 *
 * Purchased/natural free games always show the three-multiplier BONUS entry,
 * so exactly 5,000x is not necessarily representable for those modes. In that
 * case use the nearest lower legal factor instead of showing a board above the
 * cap and silently reducing settlement afterward.
 */
function cappedThor2Presentation(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  options: Thor2SpinOptions,
  naturalFeature = false,
): Thor2EngineResult {
  const constructionOptions: Thor2SpinOptions = naturalFeature
    ? { buyFeature: 'regular' }
    : options;
  const cappedFactor =
    thor2ControlFactorCandidates(THOR2_MAX_WIN_MULTIPLIER, constructionOptions).find(
      (factor) => factor <= THOR2_MAX_WIN_MULTIPLIER,
    ) ?? 0;
  const result = thor2SpinForFactor(
    serverSeed,
    `${clientSeed}:site-cycle-cap`,
    nonce,
    cappedFactor,
    constructionOptions,
  );
  if (!naturalFeature || !result.feature) return result;
  return {
    ...result,
    feature: { ...result.feature, kind: 'natural' },
  };
}

function capResultMultiplier(value: number): number {
  return Math.min(THOR2_MAX_WIN_MULTIPLIER, Math.max(0, Math.round(value * 10_000) / 10_000));
}

export function thor2Spin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  options: Thor2SpinOptions = {},
): Thor2EngineResult {
  const random = randomSource(serverSeed, clientSeed, nonce);
  const kind = options.buyFeature;
  const isLucky = kind === 'lucky';
  const luckyMaxWin = isLucky && random.chance(1 / 6.44);
  let grid = buildGrid(random, {
    bonusRate: kind ? 0 : 0.002,
    // SUPER BONUS is a base-game companion to the free-game trigger and must
    // not appear on a purchased entry screen.
    superBonusRate: kind ? 0 : 0.0012,
    // Lucky Strike already applies its dedicated 32% all-1000x roll in
    // randomCell. Reusing 32% as the generic multiplier rate gave every cell
    // a second chance and inflated the effective density to roughly 54%.
    multiplierRate: isLucky ? 0 : 0.008,
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
  const base = playRound(
    random,
    grid,
    0,
    kind === 'super',
    isLucky,
    kind === 'regular' || kind === 'super'
      ? THOR2_MAX_FEATURE_MULTIPLIER_BALLS
      : THOR2_REELS * THOR2_ROWS,
  );
  const naturalFeature = initialBonusCount >= 4 && !isLucky;
  if (!kind && !naturalFeature) {
    if (base.round.payoutMultiplier > THOR2_MAX_WIN_MULTIPLIER) {
      return cappedThor2Presentation(serverSeed, clientSeed, nonce, options);
    }
    const totalMultiplier = capResultMultiplier(base.round.payoutMultiplier);
    return {
      grid: base.finalGrid,
      cascades: base.round.cascades,
      totalMultiplier,
      maxWinReached: totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER,
    };
  }
  if (isLucky) {
    if (base.round.payoutMultiplier > THOR2_MAX_WIN_MULTIPLIER) {
      return cappedThor2Presentation(serverSeed, clientSeed, nonce, options);
    }
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
    const multiplierRate = featureBallCellRate(featureKind === 'super');
    const freeGrid = maybeForceFeatureWin(
      buildGrid(random, {
        bonusRate: 0.004,
        superBonusRate: 0,
        multiplierRate,
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
      THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
      multiplierRate,
    );
    accumulatedMultiplier = played.round.accumulatedMultiplier;
    const retrigger = Math.min(played.round.retriggeredSpins, THOR2_MAX_FREE_SPINS - awarded);
    awarded += retrigger;
    totalMultiplier += played.round.payoutMultiplier;
    rounds.push({ ...played.round, index: index + 1, retriggeredSpins: retrigger });
    grid = played.finalGrid;
    if (totalMultiplier >= THOR2_MAX_WIN_MULTIPLIER) break;
  }
  if (totalMultiplier > THOR2_MAX_WIN_MULTIPLIER) {
    return cappedThor2Presentation(
      serverSeed,
      clientSeed,
      nonce,
      options,
      featureKind === 'natural',
    );
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
