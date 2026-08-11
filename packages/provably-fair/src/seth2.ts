import { hmacFloatStream } from './hmac.js';

export const SETH2_PAYTABLE = {
  1: { eight: 200, ten: 500, twelve: 1000 },
  2: { eight: 50, ten: 200, twelve: 500 },
  3: { eight: 40, ten: 100, twelve: 300 },
  4: { eight: 30, ten: 40, twelve: 240 },
  5: { eight: 20, ten: 30, twelve: 200 },
  6: { eight: 16, ten: 24, twelve: 160 },
  7: { eight: 10, ten: 20, twelve: 100 },
  8: { eight: 8, ten: 18, twelve: 80 },
  9: { eight: 5, ten: 15, twelve: 40 },
} as const;

export const SETH2_SCATTER_PAYTABLE = { four: 50, five: 100, six: 2000 } as const;
export const SETH2_SKILL_SYMBOL_PAY = 5;
export const SETH2_GRID_SIZE = 30;
export const SETH2_MAX_SYMBOL_MULTIPLIER = 500;
/** Every value that can be shown by a multiplier ball, including upgrade-only 6x and 8x. */
export const SETH2_MULTIPLIER_VALUES = [
  2, 3, 4, 5, 6, 8, 10, 15, 25, 50, 100, 200, 300, 500,
] as const;
/** Values that can land directly, matching the source game's colour/value table. */
export const SETH2_MULTIPLIER_DROP_VALUES = [
  2, 3, 4, 5, 10, 15, 25, 50, 100, 200, 300, 500,
] as const;
export const SETH2_RETRIGGER_SPINS = 5;
export const SETH2_FREE_RETRIGGER_PROBABILITY = 0.01;
export type Seth2SpinMode = 'base' | 'standard_free' | 'awakening_free' | 'bought_standard_free';
export type Seth2FeatureMode = 'none' | 'standard' | 'awakening';
export type Seth2RandomSource = () => number;

function isFreeGameMode(mode: Seth2SpinMode): boolean {
  return mode !== 'base';
}

export interface Seth2Cell {
  type: number;
  mul: number;
  mul_type?: number;
}

export interface Seth2CascadeRound {
  start_data: Seth2Cell[];
  remove_type: number[];
  round_data: Seth2Cell[];
  scoreList: number[];
  upgrade_mul_list: Array<{ mul: number; new_mul: number }>;
  total_mul: number;
  score: number;
  total_gold: number;
  remove_count: number;
  is_over: number;
}

export interface Seth2ReturnData {
  list: Seth2CascadeRound[];
  featureMode: Seth2FeatureMode;
  gameModelType: 0 | 1;
  is_sjc: 0 | 1;
  freeGameCount: number;
  addGameCiShu: number;
  type17_mul_list: Seth2Cell[];
  type17_beishu: { mul: number };
  type18_start_mul_list: Array<{ mul: number }>;
  type18_mul_count: number;
  JPtype: number;
  JPGold: number;
  score: number;
  total_gold: number;
  multiplierBankBefore: number;
  multiplierBankAdded: number;
  multiplierBankAfter: number;
}

export interface Seth2Outcome {
  payoutFactor: number;
  triggeredFreeSpins: boolean;
  featureMode: Seth2FeatureMode;
  returnData: Seth2ReturnData;
}

interface WeightedOutcome {
  probability: number;
  factor?: number;
  trigger?: boolean;
  retrigger?: boolean;
}

interface WinPattern {
  type: number;
  count: 8 | 10 | 12;
  factor: number;
}

interface MultiplierPlan {
  cells: Seth2Cell[];
  upgrades: Array<{ mul: number; new_mul: number }>;
  finalTotal: number;
}

interface Seth2WinPlan {
  patterns: WinPattern[];
  /** Multiplier contributed by balls on the current board. */
  multiplier: number;
  /** Multiplier shown after the saved free-game bank is collected. */
  effectiveMultiplier: number;
}

interface MaleMultiplierPlan extends MultiplierPlan {
  source: Seth2Cell;
  copies: Seth2Cell[];
}

interface FemaleMultiplierPlan extends MultiplierPlan {
  locked: Seth2Cell[];
}

const TARGET_RTP = 0.9689;
const FREE_SPIN_SCALE = 1 - SETH2_FREE_RETRIGGER_PROBABILITY * SETH2_RETRIGGER_SPINS;
const GOLDEN_FEATURE_SHARE = 0.01;
export const SETH2_BOUGHT_AWAKENING_SHARE = 0.3;
const NON_WINNING_MULTIPLIER_PROBABILITY = 0.2;
const SCATTER_EXPECTED_FACTOR = 3;
const BASE_NON_FEATURE_EV = 0.3389;
const SETH2_MAX_BOARD_MULTIPLIER = SETH2_GRID_SIZE * SETH2_MAX_SYMBOL_MULTIPLIER;
const NO_MULTIPLIER_PARTS = 32_767;
const MULTIPLIER_SPLITS = new Map<number, { parts: Int16Array; choice: Int16Array }>();

const NON_WINNING_MULTIPLIERS = [
  { value: 2, weight: 42 },
  { value: 3, weight: 25 },
  { value: 4, weight: 8 },
  { value: 5, weight: 5 },
  { value: 10, weight: 7 },
  { value: 15, weight: 4 },
  { value: 25, weight: 2 },
  { value: 50, weight: 3 },
  { value: 100, weight: 2 },
  { value: 200, weight: 1 },
  { value: 300, weight: 0.7 },
  { value: 500, weight: 0.3 },
] as const;

const OFFICIAL_MULTIPLIER_EXPANSIONS = new Map<number, readonly [number, number]>([
  [500, [300, 200]],
  [300, [200, 100]],
  [200, [100, 100]],
  [100, [50, 50]],
  [50, [25, 25]],
  [25, [15, 10]],
  [15, [10, 5]],
  [10, [5, 5]],
  [5, [3, 2]],
  [4, [2, 2]],
]);

const STANDARD_FREE_BASE_OUTCOMES: WeightedOutcome[] = [
  { probability: 0.2, factor: 0.5 },
  { probability: 0.1, factor: 1 },
  { probability: 0.05, factor: 2 },
  { probability: 0.025, factor: 5 },
  { probability: 0.012, factor: 10 },
  { probability: 0.006, factor: 20 },
  { probability: 0.003, factor: 50 },
  { probability: 0.002, factor: 100 },
  { probability: 0.001, factor: 45 },
];

const AWAKENING_FREE_BASE_OUTCOMES: WeightedOutcome[] = [
  { probability: 0.2, factor: 1 },
  { probability: 0.12, factor: 2 },
  { probability: 0.08, factor: 5 },
  { probability: 0.05, factor: 10 },
  { probability: 0.035, factor: 20 },
  { probability: 0.025, factor: 50 },
  { probability: 0.015, factor: 100 },
  { probability: 0.008, factor: 200 },
  { probability: 0.005, factor: 500 },
  { probability: 0.0019993383, factor: 2015 },
];

function weightedFactorEv(outcomes: WeightedOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) => total + outcome.probability * (outcome.factor ?? 0),
    0,
  );
}

const STANDARD_FEATURE_TOTAL_EV = 15 * weightedFactorEv(STANDARD_FREE_BASE_OUTCOMES);
const AWAKENING_FEATURE_TOTAL_EV = 15 * weightedFactorEv(AWAKENING_FREE_BASE_OUTCOMES);
const NATURAL_FEATURE_TOTAL_EV =
  STANDARD_FEATURE_TOTAL_EV * (1 - GOLDEN_FEATURE_SHARE) +
  AWAKENING_FEATURE_TOTAL_EV * GOLDEN_FEATURE_SHARE;
const BASE_FEATURE_TRIGGER_PROBABILITY =
  (TARGET_RTP - BASE_NON_FEATURE_EV) / (SCATTER_EXPECTED_FACTOR + NATURAL_FEATURE_TOTAL_EV);

const BASE_OUTCOMES: WeightedOutcome[] = [
  { probability: BASE_FEATURE_TRIGGER_PROBABILITY, trigger: true },
  { probability: 0.16, factor: 0.5 },
  { probability: 0.08, factor: 1 },
  { probability: 0.04, factor: 2 },
  { probability: 0.015, factor: 4 },
  { probability: 0.004, factor: 8 },
  { probability: 0.000345, factor: 20 },
];

function withRetriggers(outcomes: WeightedOutcome[]): WeightedOutcome[] {
  return [
    { probability: SETH2_FREE_RETRIGGER_PROBABILITY, retrigger: true },
    ...outcomes.map((outcome) => ({
      ...outcome,
      probability: outcome.probability * FREE_SPIN_SCALE,
    })),
  ];
}

const STANDARD_FREE_OUTCOMES = withRetriggers(STANDARD_FREE_BASE_OUTCOMES);
const AWAKENING_FREE_OUTCOMES = withRetriggers(AWAKENING_FREE_BASE_OUTCOMES);

const WIN_PATTERNS: WinPattern[] = Object.entries(SETH2_PAYTABLE).flatMap(([type, pays]) => [
  { type: Number(type), count: 8 as const, factor: pays.eight / 20 },
  { type: Number(type), count: 10 as const, factor: pays.ten / 20 },
  { type: Number(type), count: 12 as const, factor: pays.twelve / 20 },
]);

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function randomSource(serverSeed: string, clientSeed: string, nonce: number): Seth2RandomSource {
  const stream = hmacFloatStream(serverSeed, clientSeed, nonce);
  return () => stream.next().value ?? 0;
}

function pickWeighted(outcomes: WeightedOutcome[], rng: Seth2RandomSource): WeightedOutcome {
  let cursor = rng();
  for (const outcome of outcomes) {
    if (cursor < outcome.probability) return outcome;
    cursor -= outcome.probability;
  }
  return { probability: 1, factor: 0 };
}

function pickNonWinningMultiplier(rng: Seth2RandomSource): number {
  const totalWeight = NON_WINNING_MULTIPLIERS.reduce((sum, entry) => sum + entry.weight, 0);
  let cursor = rng() * totalWeight;
  for (const entry of NON_WINNING_MULTIPLIERS) {
    if (cursor < entry.weight) return entry.value;
    cursor -= entry.weight;
  }
  return SETH2_MULTIPLIER_VALUES[0];
}

export function isSeth2MultiplierValue(value: number): boolean {
  return (SETH2_MULTIPLIER_VALUES as readonly number[]).includes(value);
}

function multiplierSplitTable(excludedValue = 0): {
  parts: Int16Array;
  choice: Int16Array;
} {
  const cached = MULTIPLIER_SPLITS.get(excludedValue);
  if (cached) return cached;

  const parts = new Int16Array(SETH2_MAX_BOARD_MULTIPLIER + 1);
  const choice = new Int16Array(SETH2_MAX_BOARD_MULTIPLIER + 1);
  parts.fill(NO_MULTIPLIER_PARTS);
  parts[0] = 0;
  const values = [...SETH2_MULTIPLIER_DROP_VALUES].reverse();
  for (let total = 1; total <= SETH2_MAX_BOARD_MULTIPLIER; total += 1) {
    for (const value of values) {
      if (value === excludedValue || value > total) continue;
      const previous = parts[total - value]!;
      if (previous === NO_MULTIPLIER_PARTS || previous + 1 >= parts[total]!) continue;
      parts[total] = previous + 1;
      choice[total] = value;
    }
  }
  const table = { parts, choice };
  MULTIPLIER_SPLITS.set(excludedValue, table);
  return table;
}

function minimumMultiplierPartCount(total: number, excludedValue = 0): number {
  if (total === 0 || total === 1) return 0;
  if (!Number.isInteger(total) || total < 0 || total > SETH2_MAX_BOARD_MULTIPLIER) {
    return Number.POSITIVE_INFINITY;
  }
  const count = multiplierSplitTable(excludedValue).parts[total]!;
  return count === NO_MULTIPLIER_PARTS ? Number.POSITIVE_INFINITY : count;
}

export function splitSeth2MultiplierTotal(
  total: number,
  maxParts: number,
  excludedValue = 0,
): number[] | null {
  if (total === 1 || total === 0) return [];
  const table = multiplierSplitTable(excludedValue);
  const required = minimumMultiplierPartCount(total, excludedValue);
  if (!Number.isFinite(required) || required > maxParts) return null;

  const values: number[] = [];
  let remaining = total;
  while (remaining > 0) {
    const value = table.choice[remaining]!;
    if (!isSeth2MultiplierValue(value) || value === excludedValue) return null;
    values.push(value);
    remaining -= value;
  }
  return values.sort((left, right) => right - left);
}

function expandMultiplierParts(values: number[], minimumParts: number, maxParts: number): number[] {
  const expanded = [...values];
  while (expanded.length < minimumParts && expanded.length < maxParts) {
    const index = expanded.findIndex((value) => OFFICIAL_MULTIPLIER_EXPANSIONS.has(value));
    if (index < 0) break;
    const replacement = OFFICIAL_MULTIPLIER_EXPANSIONS.get(expanded[index]!)!;
    expanded.splice(index, 1, ...replacement);
  }
  return expanded.sort((left, right) => right - left);
}

function previousMultiplierValue(value: number): number | null {
  const index = SETH2_MULTIPLIER_VALUES.indexOf(value as (typeof SETH2_MULTIPLIER_VALUES)[number]);
  return index > 0 ? SETH2_MULTIPLIER_VALUES[index - 1]! : null;
}

function cell(type: number, mul = 0, mulType = 0): Seth2Cell {
  return mul > 0 ? { type, mul, mul_type: mulType } : { type, mul };
}

function shuffle<T>(values: T[], rng: Seth2RandomSource): T[] {
  for (let index = values.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(rng() * (index + 1));
    const current = values[index];
    values[index] = values[swapIndex]!;
    values[swapIndex] = current!;
  }
  return values;
}

function safeFill(count: number, excluded: Set<number>, rng: Seth2RandomSource): Seth2Cell[] {
  const types = [1, 2, 3, 4, 5, 6, 7, 8, 9].filter((type) => !excluded.has(type));
  const values: Seth2Cell[] = [];
  for (let index = 0; index < count; index += 1) {
    values.push(cell(types[index % types.length]!));
  }
  return shuffle(values, rng);
}

function emptyRound(startData: Seth2Cell[]): Seth2CascadeRound {
  return {
    start_data: startData,
    remove_type: [],
    round_data: [],
    scoreList: [],
    upgrade_mul_list: [],
    total_mul: 0,
    score: 0,
    total_gold: 0,
    remove_count: 0,
    is_over: 1,
  };
}

function baseReturnData(
  roundOrRounds: Seth2CascadeRound | Seth2CascadeRound[],
  multiplierBankBefore = 0,
  multiplierBankAdded = 0,
): Seth2ReturnData {
  const rounds = Array.isArray(roundOrRounds) ? roundOrRounds : [roundOrRounds];
  const finalRound = rounds.at(-1)!;
  return {
    list: rounds,
    featureMode: 'none',
    gameModelType: 0,
    is_sjc: 0,
    freeGameCount: 0,
    addGameCiShu: 0,
    type17_mul_list: [],
    type17_beishu: { mul: 0 },
    type18_start_mul_list: [],
    type18_mul_count: 0,
    JPtype: 0,
    JPGold: 0,
    score: rounds.reduce((total, round) => total + round.score, 0),
    total_gold: finalRound.total_gold,
    multiplierBankBefore,
    multiplierBankAdded,
    multiplierBankAfter: multiplierBankBefore + multiplierBankAdded,
  };
}

function buildLoss(
  rng: Seth2RandomSource,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
): Seth2Outcome {
  const multiplierCells: Seth2Cell[] = [];
  if (rng() < NON_WINNING_MULTIPLIER_PROBABILITY) {
    const count = rng() < 0.12 ? 2 : 1;
    for (let index = 0; index < count; index += 1) {
      const multiplier = pickNonWinningMultiplier(rng);
      multiplierCells.push(cell(10, multiplier, rng() < 0.2 ? 0 : 1));
    }
  }
  const startData = [
    ...multiplierCells,
    ...safeFill(SETH2_GRID_SIZE - multiplierCells.length, new Set(), rng),
  ];
  const round = emptyRound(shuffle(startData, rng));
  return {
    payoutFactor: 0,
    triggeredFreeSpins: false,
    featureMode: 'none',
    returnData: baseReturnData(round, isFreeGameMode(mode) ? multiplierBank : 0),
  };
}

function buildBoughtFeatureEntry(
  featureMode: Exclude<Seth2FeatureMode, 'none'>,
  rng: Seth2RandomSource,
): Seth2Outcome {
  const awakening = featureMode === 'awakening';
  const scatterCells = [
    ...Array.from({ length: awakening ? 3 : 4 }, () => cell(15)),
    ...(awakening ? [cell(16)] : []),
  ];
  const startData = [
    ...scatterCells,
    ...safeFill(SETH2_GRID_SIZE - scatterCells.length, new Set([15, 16]), rng),
  ];
  shuffle(startData, rng);
  const removeTypes = awakening ? [15, 16] : [15];
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: removeTypes,
    round_data: safeFill(scatterCells.length, new Set([15, 16]), rng),
    scoreList: removeTypes.map(() => 0),
    upgrade_mul_list: [],
    total_mul: 0,
    score: 0,
    total_gold: 0,
    remove_count: 0,
    is_over: 1,
  };
  const returnData = baseReturnData(round);
  returnData.featureMode = featureMode;
  returnData.gameModelType = awakening ? 1 : 0;
  returnData.is_sjc = 1;
  returnData.freeGameCount = 15;
  return {
    payoutFactor: 0,
    triggeredFreeSpins: true,
    featureMode,
    returnData,
  };
}

function scatterCount(rng: Seth2RandomSource): 4 | 5 | 6 {
  const roll = rng();
  if (roll < 1 / 390) return 6;
  if (roll < 1 / 390 + 0.1) return 5;
  return 4;
}

function scatterFactor(count: 4 | 5 | 6): number {
  if (count === 6) return SETH2_SCATTER_PAYTABLE.six / 20;
  if (count === 5) return SETH2_SCATTER_PAYTABLE.five / 20;
  return SETH2_SCATTER_PAYTABLE.four / 20;
}

function buildScatterTrigger(bet: number, rng: Seth2RandomSource): Seth2Outcome {
  const count = scatterCount(rng);
  const featureMode: Seth2FeatureMode = rng() < GOLDEN_FEATURE_SHARE ? 'awakening' : 'standard';
  const golden = featureMode === 'awakening';
  const startData = [
    ...Array.from({ length: count - (golden ? 1 : 0) }, () => cell(15)),
    ...(golden ? [cell(16)] : []),
    ...safeFill(SETH2_GRID_SIZE - count, new Set([15, 16]), rng),
  ];
  shuffle(startData, rng);
  const factor = scatterFactor(count);
  const payout = money(bet * factor);
  const removeTypes = golden ? [15, 16] : [15];
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: removeTypes,
    round_data: safeFill(count, new Set([15, 16]), rng),
    scoreList: removeTypes.map((_, index) => (index === 0 ? payout : 0)),
    upgrade_mul_list: [],
    total_mul: 0,
    score: payout,
    total_gold: payout,
    remove_count: 0,
    is_over: 1,
  };
  const returnData = baseReturnData(round);
  returnData.featureMode = featureMode;
  returnData.gameModelType = golden ? 1 : 0;
  returnData.is_sjc = 1;
  returnData.freeGameCount = 15;
  return {
    payoutFactor: factor,
    triggeredFreeSpins: true,
    featureMode,
    returnData,
  };
}

function buildRetrigger(
  rng: Seth2RandomSource,
  mode: Seth2SpinMode,
  multiplierBank: number,
): Seth2Outcome {
  const scatterCells = Array.from({ length: 3 }, () => cell(15));
  const startData = [
    ...scatterCells,
    ...safeFill(SETH2_GRID_SIZE - scatterCells.length, new Set([15, 16]), rng),
  ];
  shuffle(startData, rng);
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: [15],
    round_data: safeFill(scatterCells.length, new Set([15, 16]), rng),
    scoreList: [0],
    upgrade_mul_list: [],
    total_mul: 0,
    score: 0,
    total_gold: 0,
    remove_count: 0,
    is_over: 1,
  };
  const returnData = baseReturnData(round, isFreeGameMode(mode) ? multiplierBank : 0);
  returnData.addGameCiShu = SETH2_RETRIGGER_SPINS;
  return {
    payoutFactor: 0,
    triggeredFreeSpins: false,
    featureMode: 'none',
    returnData,
  };
}

function exactMultiplier(factor: number, scoreFactor: number): number | null {
  const multiplier = factor / scoreFactor;
  const rounded = Math.round(multiplier);
  if (Math.abs(multiplier - rounded) > 1e-9) return null;
  return rounded === 1 || rounded >= 2 ? rounded : null;
}

function multiplierTargetForScore(
  factor: number,
  scoreFactor: number,
  multiplierBank: number,
): { current: number; effective: number } | null {
  const effective = exactMultiplier(factor, scoreFactor);
  if (effective === null) return null;
  // A 1x result contains no multiplier ball, so the saved bank is not used.
  if (effective === 1) return { current: 1, effective: 1 };
  const current = effective - multiplierBank;
  // Source multiplier balls start at 2x. Without a current ball the original
  // client never collects the right-side bank for this round.
  if (current < 2 || !Number.isInteger(current)) return null;
  return { current, effective };
}

function regularMultiplierPlan(
  total: number,
  maxParts: number,
  rng: Seth2RandomSource,
): MultiplierPlan | null {
  const directValues = splitSeth2MultiplierTotal(total, maxParts);
  if (!directValues) return null;
  const forceUpgradeStep = (total === 6 || total === 8) && maxParts >= 1;
  const values = forceUpgradeStep ? [total] : directValues;
  const upgradeIndex = forceUpgradeStep
    ? 0
    : values.length > 0 && rng() < 0.25
      ? values.findIndex((value) => previousMultiplierValue(value) !== null)
      : -1;
  const upgrades: Array<{ mul: number; new_mul: number }> = [];
  const cells = values.map((value, index) => {
    if (index !== upgradeIndex) return cell(10, value, 1);
    const displayed = previousMultiplierValue(value)!;
    upgrades.push({ mul: displayed, new_mul: value });
    return cell(10, displayed, 0);
  });
  return { cells, upgrades, finalTotal: total };
}

function femaleMultiplierPlan(
  total: number,
  maxParts: number,
  rng: Seth2RandomSource,
): FemaleMultiplierPlan | null {
  const skillRoll = rng();
  const requestedLockCount = skillRoll < 0.2 ? 1 : skillRoll < 0.85 ? 2 + Math.floor(rng() * 4) : 6;
  const lockCount = Math.max(1, Math.min(requestedLockCount, 6, maxParts, Math.floor(total / 2)));
  const compactValues = splitSeth2MultiplierTotal(total, maxParts);
  if (!compactValues) return null;
  const values = expandMultiplierParts(compactValues, lockCount, maxParts);
  if (values.length < lockCount) return null;

  const upgradeIndex =
    values.length > 0 && rng() < 0.25
      ? values.findIndex((value) => previousMultiplierValue(value) !== null)
      : -1;
  const upgrades: Array<{ mul: number; new_mul: number }> = [];
  const cells = values.map((value, index) => {
    if (index !== upgradeIndex) return cell(10, value, 1);
    const displayed = previousMultiplierValue(value)!;
    upgrades.push({ mul: displayed, new_mul: value });
    return cell(10, displayed, 0);
  });
  return {
    cells,
    upgrades,
    finalTotal: total,
    locked: cells.slice(0, lockCount),
  };
}

function maleMultiplierPlan(
  total: number,
  maxInitialParts: number,
  rng: Seth2RandomSource,
): MaleMultiplierPlan | null {
  const splitCount = total >= 1000 ? 6 : total >= 100 ? 2 : 1;
  const maxSourceValue = Math.min(
    SETH2_MAX_SYMBOL_MULTIPLIER,
    Math.floor(total / (splitCount + 1)),
  );
  let sourceValue = 0;
  let extras: number[] | null = null;
  for (const candidateSource of [...SETH2_MULTIPLIER_DROP_VALUES].reverse()) {
    if (candidateSource > maxSourceValue) continue;
    const remainder = total - candidateSource * (splitCount + 1);
    const candidate =
      remainder === 1
        ? null
        : remainder > 0
          ? splitSeth2MultiplierTotal(remainder, maxInitialParts - 1, candidateSource)
          : [];
    // The imported client locates the split source by multiplier value only.
    // Keep that value unique so it cannot animate a different multiplier ball.
    if (candidate) {
      sourceValue = candidateSource;
      extras = candidate;
      break;
    }
  }
  if (sourceValue < 2 || !extras) return null;
  const mulType = rng() < 0.25 ? 0 : 1;
  const source = cell(10, sourceValue, mulType);
  const copies = Array.from({ length: splitCount }, () => cell(10, sourceValue, mulType));
  return {
    source,
    copies,
    cells: [source, ...extras.map((value) => cell(10, value, 1))],
    upgrades: [],
    finalTotal: total,
  };
}

function jackpotForFactor(
  factor: number,
  mode: Seth2SpinMode,
): { count: number; type: number } | null {
  if (mode !== 'base' || factor < 20) return null;
  if (factor >= 500) return { count: 5, type: 11 };
  if (factor >= 100) return { count: 4, type: 12 };
  if (factor >= 45) return { count: 3, type: 13 };
  return { count: 2, type: 14 };
}

function choosePattern<T>(values: T[], rng: Seth2RandomSource): T | null {
  if (values.length === 0) return null;
  return values[Math.floor(rng() * values.length)]!;
}

function chooseSinglePattern(
  factor: number,
  extraScoreFactor: number,
  reservedCells: number,
  multiplierBank: number,
  rng: Seth2RandomSource,
): Seth2WinPlan | null {
  const candidates = WIN_PATTERNS.flatMap((pattern) => {
    const target = multiplierTargetForScore(
      factor,
      pattern.factor + extraScoreFactor,
      multiplierBank,
    );
    if (!target) return [];
    const multiplierParts = target.current === 1 ? 0 : minimumMultiplierPartCount(target.current);
    if (!Number.isFinite(multiplierParts)) return [];
    if (pattern.count + multiplierParts + reservedCells > SETH2_GRID_SIZE) return [];
    return [
      {
        patterns: [pattern],
        multiplier: target.current,
        effectiveMultiplier: target.effective,
      },
    ];
  });
  return choosePattern(candidates, rng);
}

function chooseRegularWinPlan(
  factor: number,
  reservedCells: number,
  multiplierBank: number,
  rng: Seth2RandomSource,
): Seth2WinPlan | null {
  const cascadeCandidates: Seth2WinPlan[] = [];
  for (const first of WIN_PATTERNS) {
    for (const second of WIN_PATTERNS) {
      if (first.type === second.type || first.count !== second.count) continue;
      const target = multiplierTargetForScore(factor, first.factor + second.factor, multiplierBank);
      if (!target) continue;
      const multiplierParts = target.current === 1 ? 0 : minimumMultiplierPartCount(target.current);
      if (!Number.isFinite(multiplierParts)) continue;
      if (first.count + multiplierParts + reservedCells > SETH2_GRID_SIZE) continue;
      cascadeCandidates.push({
        patterns: [first, second],
        multiplier: target.current,
        effectiveMultiplier: target.effective,
      });
    }
  }
  if (cascadeCandidates.length > 0 && rng() < 0.35) {
    return choosePattern(cascadeCandidates, rng)!;
  }
  return chooseSinglePattern(factor, 0, reservedCells, multiplierBank, rng);
}

export function isSeth2FactorRepresentable(
  factor: number,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
): boolean {
  if (factor === 0) return true;
  if (!Number.isFinite(factor) || factor < 0) return false;
  const activeMultiplierBank = isFreeGameMode(mode) ? multiplierBank : 0;
  const reservedCells = jackpotForFactor(factor, mode)?.count ?? 0;
  const fits = (patterns: WinPattern[]) => {
    const target = multiplierTargetForScore(
      factor,
      patterns.reduce((total, pattern) => total + pattern.factor, 0),
      activeMultiplierBank,
    );
    if (!target) return false;
    const multiplierParts = target.current === 1 ? 0 : minimumMultiplierPartCount(target.current);
    if (!Number.isFinite(multiplierParts)) return false;
    return patterns[0]!.count + multiplierParts + reservedCells <= SETH2_GRID_SIZE;
  };

  if (WIN_PATTERNS.some((pattern) => fits([pattern]))) return true;
  return WIN_PATTERNS.some((first) =>
    WIN_PATTERNS.some(
      (second) =>
        first.type !== second.type && first.count === second.count && fits([first, second]),
    ),
  );
}

function buildWin(
  bet: number,
  factor: number,
  mode: Seth2SpinMode,
  rng: Seth2RandomSource,
  multiplierBank = 0,
  targetIncludesMultiplierBank = false,
): Seth2Outcome {
  const jackpot = jackpotForFactor(factor, mode);
  const jackpotCells = jackpot ? jackpot.count : 0;
  const awakening = mode === 'awakening_free';
  let skill: 'male' | 'female' | null = null;
  let selected: Seth2WinPlan | null = null;
  const activeMultiplierBank = isFreeGameMode(mode) ? multiplierBank : 0;
  const selectionBank = targetIncludesMultiplierBank ? activeMultiplierBank : 0;

  if (awakening && factor >= 20 && rng() < 0.7) {
    const proposedSkill = rng() < 0.5 ? 'male' : 'female';
    const skillPlan = chooseSinglePattern(
      factor,
      SETH2_SKILL_SYMBOL_PAY / 20,
      3,
      selectionBank,
      rng,
    );
    if (skillPlan && skillPlan.multiplier >= 4) {
      skill = proposedSkill;
      selected = skillPlan;
    }
  }

  selected ??= chooseRegularWinPlan(factor, jackpotCells, selectionBank, rng);
  if (!selected) return buildLoss(rng, mode, activeMultiplierBank);
  const multiplierTotal = selected.multiplier;
  const firstPattern = selected.patterns[0]!;
  const secondPattern = selected.patterns[1];
  const multiplierRoom = SETH2_GRID_SIZE - firstPattern.count - jackpotCells - (skill ? 3 : 0);
  const malePlan =
    skill === 'male' ? maleMultiplierPlan(multiplierTotal, multiplierRoom, rng) : null;
  if (skill === 'male' && !malePlan) skill = 'female';
  const femalePlan =
    skill === 'female' ? femaleMultiplierPlan(multiplierTotal, multiplierRoom, rng) : null;
  const multiplierPlan =
    malePlan ?? femalePlan ?? regularMultiplierPlan(multiplierTotal, multiplierRoom, rng)!;
  const currentMultiplierContribution =
    multiplierPlan.cells.length > 0 ? multiplierPlan.finalTotal : 0;
  const effectiveMultiplier =
    currentMultiplierContribution > 0 ? currentMultiplierContribution + activeMultiplierBank : 1;
  const skillType = skill === 'male' ? 17 : skill === 'female' ? 18 : null;
  const skillScoreFactor = skill ? SETH2_SKILL_SYMBOL_PAY / 20 : 0;
  const rawScoreFactor =
    selected.patterns.reduce((total, pattern) => total + pattern.factor, 0) + skillScoreFactor;
  const actualPayoutFactor = money(rawScoreFactor * effectiveMultiplier);
  const payout = money(bet * actualPayoutFactor);
  const fixedCells = [
    ...Array.from({ length: firstPattern.count }, () => cell(firstPattern.type)),
    ...multiplierPlan.cells,
    ...(skillType ? Array.from({ length: 3 }, () => cell(skillType)) : []),
    ...(jackpot ? Array.from({ length: jackpot.count }, () => cell(jackpot.type)) : []),
  ];
  const excluded = new Set(selected.patterns.map((pattern) => pattern.type));
  const startData = [
    ...fixedCells,
    ...safeFill(SETH2_GRID_SIZE - fixedCells.length, excluded, rng),
  ];
  shuffle(startData, rng);

  const firstRemoveTypes = [firstPattern.type, ...(skillType ? [skillType] : [])];
  const firstScore = money(bet * (firstPattern.factor + skillScoreFactor));
  const firstRemovedCount = firstPattern.count + (skillType ? 3 : 0);
  const maleCopies = malePlan?.copies ?? [];
  const firstRefill = secondPattern
    ? Array.from({ length: secondPattern.count }, () => cell(secondPattern.type))
    : safeFill(firstRemovedCount - maleCopies.length, new Set(firstRemoveTypes), rng);
  const firstRound: Seth2CascadeRound = {
    start_data: startData,
    remove_type: firstRemoveTypes,
    round_data: firstRefill,
    scoreList: firstRemoveTypes.map((_, index) =>
      index === 0 ? money(bet * firstPattern.factor) : money(bet * skillScoreFactor),
    ),
    upgrade_mul_list: secondPattern ? [] : multiplierPlan.upgrades,
    total_mul: effectiveMultiplier > 1 ? effectiveMultiplier : 0,
    score: firstScore,
    total_gold: secondPattern ? money(firstScore * effectiveMultiplier) : payout,
    remove_count: 0,
    is_over: secondPattern ? 0 : 1,
  };
  const rounds = [firstRound];
  if (secondPattern) {
    const secondScore = money(bet * secondPattern.factor);
    rounds.push({
      start_data: [],
      remove_type: [secondPattern.type],
      round_data: safeFill(secondPattern.count, new Set([secondPattern.type]), rng),
      scoreList: [secondScore],
      upgrade_mul_list: multiplierPlan.upgrades,
      total_mul: effectiveMultiplier > 1 ? effectiveMultiplier : 0,
      score: secondScore,
      total_gold: payout,
      remove_count: 1,
      is_over: 1,
    });
  }

  const returnData = baseReturnData(
    rounds,
    activeMultiplierBank,
    isFreeGameMode(mode) ? currentMultiplierContribution : 0,
  );
  if (malePlan && skill === 'male') {
    returnData.type17_beishu = { mul: malePlan.source.mul };
    returnData.type17_mul_list = malePlan.copies;
  }
  if (skill === 'female') {
    returnData.type18_start_mul_list = (femalePlan?.locked ?? [multiplierPlan.cells[0]!]).map(
      ({ mul }) => ({ mul }),
    );
    // The imported client can safely retain a lock inside the current tumble.
    // Cross-spin locks require persisting exact grid coordinates, so release at
    // the end of this settled spin instead of risking a short next start_data.
    returnData.type18_mul_count = 1;
  }
  if (jackpot) {
    returnData.JPtype = jackpot.type;
    returnData.JPGold = payout;
  }
  returnData.score = money(bet * rawScoreFactor);
  returnData.total_gold = payout;
  return {
    payoutFactor: actualPayoutFactor,
    triggeredFreeSpins: false,
    featureMode: 'none',
    returnData,
  };
}

export function seth2Spin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const table =
    mode === 'base'
      ? BASE_OUTCOMES
      : mode === 'standard_free'
        ? STANDARD_FREE_OUTCOMES
        : AWAKENING_FREE_OUTCOMES;
  const selection = pickWeighted(table, rng);
  const outcome = selection.trigger
    ? buildScatterTrigger(bet, rng)
    : selection.retrigger
      ? buildRetrigger(rng, mode, multiplierBank)
      : !selection.factor
        ? buildLoss(rng, mode, multiplierBank)
        : buildWin(bet, selection.factor, mode, rng, multiplierBank);
  return applySpinFeatureMode(outcome, mode);
}

export function seth2SpinForFactor(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
  factor: number,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
): Seth2Outcome {
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const outcome =
    factor > 0
      ? buildWin(bet, factor, mode, rng, multiplierBank, true)
      : buildLoss(rng, mode, multiplierBank);
  return applySpinFeatureMode(outcome, mode);
}

function applySpinFeatureMode(outcome: Seth2Outcome, mode: Seth2SpinMode): Seth2Outcome {
  const featureMode = outcome.triggeredFreeSpins
    ? outcome.featureMode
    : mode === 'awakening_free'
      ? 'awakening'
      : mode === 'standard_free' || mode === 'bought_standard_free'
        ? 'standard'
        : 'none';
  outcome.returnData.featureMode = featureMode;
  outcome.returnData.gameModelType = featureMode === 'awakening' ? 1 : 0;
  return outcome;
}

export function seth2BuyFeatureEntry(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  featureMode: Exclude<Seth2FeatureMode, 'none'>,
): Seth2Outcome {
  return buildBoughtFeatureEntry(featureMode, randomSource(serverSeed, clientSeed, nonce));
}

export function seth2BuyFeature(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
): Seth2Outcome {
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const featureMode = rng() < SETH2_BOUGHT_AWAKENING_SHARE ? 'awakening' : 'standard';
  return buildBoughtFeatureEntry(featureMode, rng);
}

function expectedValue(outcomes: WeightedOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) =>
      total +
      outcome.probability * (outcome.trigger ? SCATTER_EXPECTED_FACTOR : (outcome.factor ?? 0)),
    0,
  );
}

const EXPECTED_FEATURE_SPINS = 15 / FREE_SPIN_SCALE;

export const SETH2_MATH = {
  baseDirect: expectedValue(BASE_OUTCOMES),
  standardFree: expectedValue(STANDARD_FREE_OUTCOMES),
  awakeningFree: expectedValue(AWAKENING_FREE_OUTCOMES),
  boughtStandardFree: expectedValue(AWAKENING_FREE_OUTCOMES),
  standardFeatureTotal: expectedValue(STANDARD_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS,
  awakeningFeatureTotal: expectedValue(AWAKENING_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS,
  expectedFeatureSpins: EXPECTED_FEATURE_SPINS,
  baseFeatureProbability: BASE_FEATURE_TRIGGER_PROBABILITY,
  goldenFeatureShare: GOLDEN_FEATURE_SHARE,
  theoreticalRtp:
    expectedValue(BASE_OUTCOMES) + BASE_FEATURE_TRIGGER_PROBABILITY * NATURAL_FEATURE_TOTAL_EV,
  buyFeatureRtp: (expectedValue(AWAKENING_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS) / 200,
} as const;
