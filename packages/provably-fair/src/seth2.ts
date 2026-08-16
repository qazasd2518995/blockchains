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

export const SETH2_SCATTER_PAYTABLE = { four: 60, five: 100, six: 2000 } as const;
export const SETH2_SKILL_SYMBOL_PAY = 5;
export const SETH2_GRID_SIZE = 30;
export const SETH2_MAX_SYMBOL_MULTIPLIER = 500;
/** Every value that can be shown by a multiplier ball, including upgrade-only steps. */
export const SETH2_MULTIPLIER_VALUES = [
  2, 3, 4, 5, 6, 8, 10, 12, 15, 18, 25, 50, 100, 200, 300, 500,
] as const;
/** Values that can land directly, matching the source game's colour/value table. */
export const SETH2_MULTIPLIER_DROP_VALUES = [
  2, 3, 4, 5, 10, 15, 25, 50, 100, 200, 300, 500,
] as const;
export const SETH2_RETRIGGER_SPINS = 5;
export const SETH2_FREE_SPINS = 15;
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
  code?: number;
}

export interface Seth2MultiplierUpgrade {
  mul: number;
  new_mul: number;
  mul_type?: number;
  type?: number;
  code?: number;
}

export interface Seth2CascadeRound {
  start_data: Seth2Cell[];
  remove_type: number[];
  round_data: Seth2Cell[];
  scoreList: number[];
  upgrade_mul_list: Seth2MultiplierUpgrade[];
  total_mul: number;
  score: number;
  total_gold: number;
  remove_count: number;
  is_over: number;
  /**
   * Eternal Rise can contain several independent tumble/collect cycles in one
   * protocol response.  The source client shows the raw tumble winnings first
   * and then a no-win collection view with this authoritative segment payout.
   */
  collect_gold?: number;
  /** Female-lock state carried into a later Eternal Rise main-game segment. */
  locked_mul_list?: Seth2Cell[];
  locked_mul_count?: number;
  /** Character metadata scoped to this Eternal Rise segment. */
  male_mul_list?: Seth2Cell[];
  male_source?: Seth2Cell | null;
  female_start_mul_list?: Seth2Cell[];
  female_mul_count?: number;
}

export interface Seth2ReturnData {
  list: Seth2CascadeRound[];
  featureMode: Seth2FeatureMode;
  gameModelType: 0 | 1;
  is_sjc: 0 | 1;
  freeGameCount: number;
  addGameCiShu: number;
  type17_mul_list: Seth2Cell[];
  type17_beishu: Seth2Cell | null;
  type18_start_mul_list: Seth2Cell[];
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
  upgrades: Seth2MultiplierUpgrade[];
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
  lockDuration: 2 | 4 | 6;
}

const TARGET_RTP = 0.9689;
const FREE_SPIN_SCALE = 1 - SETH2_FREE_RETRIGGER_PROBABILITY * SETH2_RETRIGGER_SPINS;
const GOLDEN_FEATURE_SHARE = 0.01;
export const SETH2_BOUGHT_AWAKENING_SHARE = 0.3;
const NON_WINNING_MULTIPLIER_PROBABILITY = 0.2;
const SCATTER_EXPECTED_FACTOR = 3;
const BASE_NON_FEATURE_EV = 0.3389;
// The v1.1.5 source opens a feature with fifteen games.
const FREE_GAME_OUTCOME_SCALE = 15 / SETH2_FREE_SPINS;
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

// The 2,000x purchase is one high-volatility super main-game round rather
// than a free-game session. These weights produce a 96.89% theoretical RTP
// against the 2,000x purchase price while keeping every visible result in the
// same representable multiplier set used by the reel animator.
const SUPER_MAIN_OUTCOMES: WeightedOutcome[] = [
  { probability: 0.48264, factor: 0 },
  { probability: 0.12, factor: 500 },
  { probability: 0.1, factor: 1000 },
  { probability: 0.13, factor: 2000 },
  { probability: 0.11736, factor: 5000 },
  { probability: 0.04, factor: 10_000 },
  { probability: 0.009, factor: 50_000 },
  { probability: 0.001, factor: 81_000 },
];

function weightedFactorEv(outcomes: WeightedOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) => total + outcome.probability * (outcome.factor ?? 0),
    0,
  );
}

const STANDARD_FEATURE_TOTAL_EV =
  SETH2_FREE_SPINS * FREE_GAME_OUTCOME_SCALE * weightedFactorEv(STANDARD_FREE_BASE_OUTCOMES);
const AWAKENING_FEATURE_TOTAL_EV =
  SETH2_FREE_SPINS * FREE_GAME_OUTCOME_SCALE * weightedFactorEv(AWAKENING_FREE_BASE_OUTCOMES);
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

function scaleFeatureOutcomes(outcomes: WeightedOutcome[]): WeightedOutcome[] {
  return outcomes.map((outcome) => ({
    ...outcome,
    probability: outcome.probability * FREE_GAME_OUTCOME_SCALE,
  }));
}

const STANDARD_FREE_OUTCOMES = withRetriggers(scaleFeatureOutcomes(STANDARD_FREE_BASE_OUTCOMES));
const AWAKENING_FREE_OUTCOMES = withRetriggers(scaleFeatureOutcomes(AWAKENING_FREE_BASE_OUTCOMES));

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

function previousMultiplierValue(value: number): number | null {
  const index = SETH2_MULTIPLIER_VALUES.indexOf(value as (typeof SETH2_MULTIPLIER_VALUES)[number]);
  return index > 0 ? SETH2_MULTIPLIER_VALUES[index - 1]! : null;
}

function cell(type: number, mul = 0, mulType = 0): Seth2Cell {
  return mul > 0 ? { type, mul, mul_type: mulType } : { type, mul };
}

function animatedMultiplierCell(value: Seth2Cell, code: number): Seth2Cell {
  return {
    type: 10,
    mul: value.mul,
    mul_type: value.mul_type ?? 0,
    code,
  };
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
    type17_beishu: null,
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
  bet: number,
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
  const payoutFactor = SETH2_SCATTER_PAYTABLE.four / 20;
  const payout = money(bet * payoutFactor);
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: removeTypes,
    round_data: safeFill(scatterCells.length, new Set([15, 16]), rng),
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
  returnData.gameModelType = awakening ? 1 : 0;
  returnData.is_sjc = 1;
  returnData.freeGameCount = SETH2_FREE_SPINS;
  return {
    payoutFactor,
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
  returnData.freeGameCount = SETH2_FREE_SPINS;
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
  // Captured v1.1.5 rules use normal SCATTERs in the regular feature, while
  // awakening retriggers are made from three or four golden SCATTERs.
  const awakening = mode === 'awakening_free';
  const scatterType = awakening ? 16 : 15;
  const scatterCount = awakening && rng() < 0.2 ? 4 : 3;
  const scatterCells = Array.from({ length: scatterCount }, () => cell(scatterType));
  const startData = [
    ...scatterCells,
    ...safeFill(SETH2_GRID_SIZE - scatterCells.length, new Set([15, 16]), rng),
  ];
  shuffle(startData, rng);
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: [scatterType],
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
  hasPersistentMultiplier = false,
): { current: number; effective: number } | null {
  const effective = exactMultiplier(factor, scoreFactor);
  if (effective === null) return null;
  // A 1x result contains no multiplier ball, so the saved bank is not used.
  // Once a female lock is active, however, that locked ball cannot be hidden;
  // candidates below the visible bank are therefore not representable.
  if (effective === 1 && !hasPersistentMultiplier) return { current: 1, effective: 1 };
  const current = effective - multiplierBank;
  // A locked female-skill ball is already visible on the board. It can collect
  // the saved bank without requiring a newly dropped multiplier ball.
  if (current === 0 && hasPersistentMultiplier) return { current: 0, effective };
  // Source multiplier balls start at 2x. Without a current ball the original
  // client never collects the right-side bank for this round.
  if (current < 2 || !Number.isInteger(current)) return null;
  return { current, effective };
}

function multiplierFitsBoard(total: number, maxParts: number, requiredValue = 0): boolean {
  if (requiredValue > 0) {
    if (total < requiredValue || maxParts < 1) return false;
    const remainder = total - requiredValue;
    if (remainder === 1) return false;
    return splitSeth2MultiplierTotal(remainder, maxParts - 1) !== null;
  }
  return minimumMultiplierPartCount(total) <= maxParts;
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
  const upgrades: Seth2MultiplierUpgrade[] = [];
  const cells = values.map((value, index) => {
    if (index !== upgradeIndex) return cell(10, value, 1);
    const displayed = previousMultiplierValue(value)!;
    upgrades.push({ mul: displayed, new_mul: value });
    return cell(10, displayed, 0);
  });
  return { cells, upgrades, finalTotal: total };
}

function requiredMultiplierPlan(
  total: number,
  maxParts: number,
  requiredValue: number,
): MultiplierPlan | null {
  if (!multiplierFitsBoard(total, maxParts, requiredValue)) return null;
  const remainder = splitSeth2MultiplierTotal(total - requiredValue, maxParts - 1);
  if (!remainder) return null;
  return {
    // A required super-main 500x object must visibly land as 500x.  Do not
    // turn it into a 300x rare ball that only upgrades after the win.
    cells: [cell(10, requiredValue, 1), ...remainder.map((value) => cell(10, value, 1))],
    upgrades: [],
    finalTotal: total,
  };
}

function femaleMultiplierPlan(
  total: number,
  maxParts: number,
  rng: Seth2RandomSource,
): FemaleMultiplierPlan | null {
  const durationRoll = rng();
  const values = splitSeth2MultiplierTotal(total, maxParts);
  if (!values || values.length === 0) return null;

  // Captured v1.1.5 responses tie the woman's three levels to both the number
  // of selected multiplier objects and their lifetime: 1/2/3 balls for
  // 2/4/6 games.  Do not persist every visible ball; unselected balls keep a
  // zero lock value in the official response.
  const requestedLevel = durationRoll < 0.2 ? 1 : durationRoll < 0.85 ? 2 : 3;
  const level = Math.min(requestedLevel, values.length, 3) as 1 | 2 | 3;
  const lockDuration = (level * 2) as 2 | 4 | 6;

  const upgradeIndex =
    values.length > 0 && rng() < 0.25
      ? values.findIndex((value) => previousMultiplierValue(value) !== null)
      : -1;
  const upgrades: Seth2MultiplierUpgrade[] = [];
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
    locked: shuffle(
      cells.map((current) => ({ ...current })),
      rng,
    ).slice(0, level),
    lockDuration,
  };
}

function maleMultiplierPlan(
  total: number,
  maxInitialParts: number,
  rng: Seth2RandomSource,
): MaleMultiplierPlan | null {
  // The man's three animation levels create 1 / 3 / 5 copies.  The previous
  // 1 / 2 / 6 mapping was inferred from payout size and does not match either
  // the rules or the captured level-2 response (one 6x source -> three 6x
  // targets). Pick a level first, then fall back only when the target total
  // cannot be represented by that many copies.
  const roll = rng();
  const preferred = roll < 0.55 ? 1 : roll < 0.88 ? 3 : 5;
  const splitCounts = [preferred, ...([1, 3, 5] as const).filter((count) => count !== preferred)];

  for (const splitCount of splitCounts) {
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
    if (sourceValue < 2 || !extras) continue;
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
  return null;
}

function jackpotForFactor(
  factor: number,
  mode: Seth2SpinMode,
): { count: number; tier: number } | null {
  if (mode !== 'base' || factor < 20) return null;
  if (factor >= 500) return { count: 5, tier: 11 };
  if (factor >= 100) return { count: 4, tier: 12 };
  if (factor >= 45) return { count: 3, tier: 13 };
  return { count: 2, tier: 14 };
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
  hasPersistentMultiplier = false,
  requiredMultiplierValue = 0,
): Seth2WinPlan | null {
  const candidates = WIN_PATTERNS.flatMap((pattern) => {
    const target = multiplierTargetForScore(
      factor,
      pattern.factor + extraScoreFactor,
      multiplierBank,
      hasPersistentMultiplier,
    );
    if (!target) return [];
    const multiplierRoom = SETH2_GRID_SIZE - pattern.count - reservedCells;
    if (!multiplierFitsBoard(target.current, multiplierRoom, requiredMultiplierValue)) return [];
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
  hasPersistentMultiplier = false,
  requiredMultiplierValue = 0,
): Seth2WinPlan | null {
  const cascadeCandidates: Seth2WinPlan[] = [];
  for (const first of WIN_PATTERNS) {
    for (const second of WIN_PATTERNS) {
      if (first.type === second.type || first.count !== second.count) continue;
      const target = multiplierTargetForScore(
        factor,
        first.factor + second.factor,
        multiplierBank,
        hasPersistentMultiplier,
      );
      if (!target) continue;
      const multiplierRoom = SETH2_GRID_SIZE - first.count - reservedCells;
      if (!multiplierFitsBoard(target.current, multiplierRoom, requiredMultiplierValue)) continue;
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
  return chooseSinglePattern(
    factor,
    0,
    reservedCells,
    multiplierBank,
    rng,
    hasPersistentMultiplier,
    requiredMultiplierValue,
  );
}

export function isSeth2FactorRepresentable(
  factor: number,
  mode: Seth2SpinMode = 'base',
  multiplierBank = 0,
  hasPersistentMultiplier = false,
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
      hasPersistentMultiplier,
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
  hasPersistentMultiplier = false,
  requiredMultiplierValue = 0,
  allowSkill = true,
  allowJackpot = true,
): Seth2Outcome {
  const jackpot = allowJackpot ? jackpotForFactor(factor, mode) : null;
  const jackpotCells = jackpot ? jackpot.count : 0;
  const awakening = mode === 'awakening_free';
  let skill: 'male' | 'female' | null = null;
  let selected: Seth2WinPlan | null = null;
  const activeMultiplierBank = isFreeGameMode(mode) ? multiplierBank : 0;
  const selectionBank = targetIncludesMultiplierBank ? activeMultiplierBank : 0;

  if (allowSkill && awakening && factor >= 20 && requiredMultiplierValue === 0 && rng() < 0.7) {
    const proposedSkill = rng() < 0.5 ? 'male' : 'female';
    const skillPlan = chooseSinglePattern(
      factor,
      SETH2_SKILL_SYMBOL_PAY / 20,
      3,
      selectionBank,
      rng,
      hasPersistentMultiplier,
    );
    if (skillPlan && skillPlan.multiplier >= 4) {
      skill = proposedSkill;
      selected = skillPlan;
    }
  }

  selected ??= chooseRegularWinPlan(
    factor,
    jackpotCells,
    selectionBank,
    rng,
    hasPersistentMultiplier,
    requiredMultiplierValue,
  );
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
    (requiredMultiplierValue > 0
      ? requiredMultiplierPlan(multiplierTotal, multiplierRoom, requiredMultiplierValue)
      : null) ??
    malePlan ??
    femalePlan ??
    regularMultiplierPlan(multiplierTotal, multiplierRoom, rng)!;
  const currentMultiplierContribution =
    multiplierPlan.cells.length > 0 ? multiplierPlan.finalTotal : 0;
  const effectiveMultiplier =
    currentMultiplierContribution > 0 || hasPersistentMultiplier
      ? currentMultiplierContribution + activeMultiplierBank
      : 1;
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
    // The paytable has one JP reel symbol (14); its repeated count chooses the
    // tier.  Values 11–13 are multiplier-ball render ids in the source client,
    // not separate jackpot reel symbols.
    ...(jackpot ? Array.from({ length: jackpot.count }, () => cell(14)) : []),
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
    upgrade_mul_list: [],
    total_mul: effectiveMultiplier > 1 ? effectiveMultiplier : 0,
    score: firstScore,
    total_gold: secondPattern ? money(firstScore * effectiveMultiplier) : payout,
    remove_count: 0,
    is_over: secondPattern ? 0 : 1,
  };
  const availableUpgradeCells = firstRound.start_data
    .map((current, code) => ({ current, code }))
    .filter(({ current }) => current.type === 10 && current.mul_type === 0);
  const animatedUpgrades = multiplierPlan.upgrades.map((upgrade) => {
    const matchIndex = availableUpgradeCells.findIndex(
      ({ current }) => current.mul === upgrade.mul,
    );
    const match = availableUpgradeCells.splice(Math.max(0, matchIndex), 1)[0];
    return {
      ...upgrade,
      type: 10,
      mul_type: 0,
      code: match?.code ?? -1,
    };
  });
  firstRound.upgrade_mul_list = secondPattern ? [] : animatedUpgrades;
  const rounds = [firstRound];
  if (secondPattern) {
    const secondScore = money(bet * secondPattern.factor);
    rounds.push({
      start_data: [],
      remove_type: [secondPattern.type],
      round_data: safeFill(secondPattern.count, new Set([secondPattern.type]), rng),
      scoreList: [secondScore],
      upgrade_mul_list: animatedUpgrades,
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
    const sourceCode = firstRound.start_data.findIndex(
      (current) => current.type === 10 && current.mul === malePlan.source.mul,
    );
    returnData.type17_beishu = animatedMultiplierCell(malePlan.source, sourceCode);
    returnData.type17_mul_list = malePlan.copies.map((copy) => ({ ...copy }));
  }
  if (skill === 'female') {
    const locked = femalePlan?.locked ?? [multiplierPlan.cells[0]!];
    const availableCodes = firstRound.start_data
      .map((current, code) => ({ current, code }))
      .filter(({ current }) => current.type === 10);
    returnData.type18_start_mul_list = locked.map((selected) => {
      const matchIndex = availableCodes.findIndex(
        ({ current }) => current.mul === selected.mul && current.mul_type === selected.mul_type,
      );
      const match = availableCodes.splice(Math.max(0, matchIndex), 1)[0];
      return animatedMultiplierCell(match?.current ?? selected, match?.code ?? -1);
    });
    returnData.type18_mul_count = femalePlan?.lockDuration ?? 2;
  }
  if (jackpot) {
    returnData.JPtype = jackpot.tier;
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
  hasPersistentMultiplier = false,
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
        : buildWin(
            bet,
            selection.factor,
            mode,
            rng,
            multiplierBank,
            false,
            hasPersistentMultiplier,
          );
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
  hasPersistentMultiplier = false,
  allowSkill = true,
  allowJackpot = true,
): Seth2Outcome {
  if (factor <= 0) {
    return applySpinFeatureMode(
      buildLoss(randomSource(serverSeed, clientSeed, nonce), mode, multiplierBank),
      mode,
    );
  }
  // A factor can have several valid score/multiplier decompositions. A single
  // random candidate may pick one that does not fit the board even though a
  // later deterministic candidate does. Controlled results must never silently
  // fall back to zero, so walk a domain-separated deterministic attempt space
  // and accept only an outcome that visibly settles the requested factor.
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const domainClientSeed =
      attempt === 0 ? clientSeed : `${clientSeed}:seth2-factor:${factor}:${attempt}`;
    const outcome = buildWin(
      bet,
      factor,
      mode,
      randomSource(serverSeed, domainClientSeed, nonce),
      multiplierBank,
      true,
      hasPersistentMultiplier,
      0,
      allowSkill,
      allowJackpot,
    );
    if (outcome.payoutFactor === factor) return applySpinFeatureMode(outcome, mode);
  }
  return applySpinFeatureMode(
    buildLoss(
      randomSource(serverSeed, `${clientSeed}:seth2-factor:fallback`, nonce),
      mode,
      multiplierBank,
    ),
    mode,
  );
}

function superMainDropRound(rng: Seth2RandomSource): Seth2CascadeRound {
  const board = [
    cell(10, 500, 1),
    ...safeFill(SETH2_GRID_SIZE - 1, new Set([10, 15, 16, 17, 18]), rng),
  ];
  return emptyRound(shuffle(board, rng));
}

function hasVisibleMultiplier(outcome: Seth2Outcome, value: number): boolean {
  return outcome.returnData.list.some((round) =>
    round.start_data.some((current) => current.type === 10 && current.mul === value),
  );
}

function hasCharacterSkill(outcome: Seth2Outcome): boolean {
  return (
    outcome.returnData.type17_mul_list.length > 0 ||
    outcome.returnData.type18_start_mul_list.length > 0
  );
}

function exactSuperWin(
  bet: number,
  factor: number,
  rng: Seth2RandomSource,
  options: {
    require500: boolean;
    preferSkill: boolean;
    multiplierBank?: number;
    hasPersistentMultiplier?: boolean;
  },
): Seth2Outcome | null {
  for (let attempt = 0; attempt < 128; attempt += 1) {
    const outcome = buildWin(
      bet,
      factor,
      'awakening_free',
      rng,
      options.multiplierBank ?? 0,
      true,
      options.hasPersistentMultiplier ?? false,
      options.require500 && !options.preferSkill ? 500 : 0,
      options.preferSkill,
      false,
    );
    if (outcome.payoutFactor !== factor) continue;
    if (options.require500 && !hasVisibleMultiplier(outcome, 500)) continue;
    if (options.preferSkill && !hasCharacterSkill(outcome)) continue;
    return outcome;
  }
  return null;
}

function placeSuperLockedCells(round: Seth2CascadeRound, cells: readonly Seth2Cell[]): void {
  if (round.start_data.length !== SETH2_GRID_SIZE) return;
  const targetCodes = new Set(cells.map((current) => Number(current.code)));
  for (const locked of cells) {
    const target = Number(locked.code);
    if (!Number.isInteger(target) || target < 0 || target >= SETH2_GRID_SIZE) continue;
    const displaced = round.start_data[target];
    if (!displaced) continue;
    if (round.remove_type.includes(displaced.type) || displaced.type === 10) {
      const swapIndex = round.start_data.findIndex(
        (candidate, index) =>
          !targetCodes.has(index) &&
          candidate.type !== 10 &&
          !round.remove_type.includes(candidate.type),
      );
      if (swapIndex >= 0) round.start_data[swapIndex] = displaced;
    }
    round.start_data[target] = { ...locked };
  }
}

function superSegmentFactors(factor: number, rng: Seth2RandomSource): number[] {
  if (factor < 1_000 || factor % 500 !== 0) return [factor];
  const units = factor / 500;
  const maxSegments = Math.min(4, units);
  const segmentCount = 1 + Math.floor(rng() * maxSegments);
  if (segmentCount === 1) return [factor];
  return [
    factor - (segmentCount - 1) * 500,
    ...Array.from({ length: segmentCount - 1 }, () => 500),
  ];
}

function buildSuperMainOutcome(bet: number, factor: number, rng: Seth2RandomSource): Seth2Outcome {
  if (factor <= 0) {
    const outcome = buildLoss(rng, 'awakening_free');
    // The guaranteed object may land without an elimination.  This is a real
    // one-view result in the captured protocol, not five duplicated idle views.
    outcome.returnData.list = [superMainDropRound(rng)];
    outcome.returnData.featureMode = 'awakening';
    outcome.returnData.gameModelType = 1;
    outcome.returnData.is_sjc = 0;
    outcome.returnData.freeGameCount = 0;
    outcome.featureMode = 'awakening';
    return outcome;
  }

  const factors = superSegmentFactors(factor, rng);
  const segmentOutcomes: Seth2Outcome[] = [];
  let activeFemaleCells: Seth2Cell[] = [];
  let activeFemaleCount = 0;
  for (let index = 0; index < factors.length; index += 1) {
    const segmentFactor = factors[index]!;
    const lockedContribution = activeFemaleCells.reduce((total, current) => total + current.mul, 0);
    const preferSkill = segmentFactor >= 500 && rng() < 0.4;
    let segment = preferSkill
      ? exactSuperWin(bet, segmentFactor, rng, {
          require500: true,
          preferSkill: true,
          multiplierBank: lockedContribution,
          hasPersistentMultiplier: activeFemaleCells.length > 0,
        })
      : null;
    segment ??= exactSuperWin(bet, segmentFactor, rng, {
      require500: true,
      preferSkill: false,
      multiplierBank: lockedContribution,
      hasPersistentMultiplier: activeFemaleCells.length > 0,
    });
    if (!segment) {
      // Controlled factors below the guaranteed object's value cannot consume
      // that 500x object without changing the payout. Show the guaranteed drop
      // as a genuine no-win super spin, then settle the requested win exactly.
      segment = exactSuperWin(bet, segmentFactor, rng, {
        require500: false,
        preferSkill: false,
        multiplierBank: lockedContribution,
        hasPersistentMultiplier: activeFemaleCells.length > 0,
      });
      if (!segment) {
        // The control selector must never request a factor outside the visual
        // paytable domain. Throwing keeps the surrounding database transaction
        // atomic; silently returning a loss would settle a different payout.
        throw new Error(`Eternal Rise factor ${segmentFactor} is not representable`);
      }
      segment.returnData.list.unshift(superMainDropRound(rng));
    }
    if (activeFemaleCells.length > 0 && activeFemaleCount > 0) {
      for (const round of segment.returnData.list) {
        if (round.start_data.length === SETH2_GRID_SIZE) {
          placeSuperLockedCells(round, activeFemaleCells);
        }
        round.locked_mul_list = activeFemaleCells.map((current) => ({ ...current }));
        round.locked_mul_count = activeFemaleCount;
      }
      activeFemaleCount -= 1;
      if (activeFemaleCount <= 0) activeFemaleCells = [];
    }
    if (segment.returnData.type18_start_mul_list.length > 0) {
      activeFemaleCells = segment.returnData.type18_start_mul_list.map((current) => ({
        ...current,
      }));
      activeFemaleCount = segment.returnData.type18_mul_count;
    }
    const maleRound = segment.returnData.list.find((round) => round.remove_type.includes(17));
    if (maleRound) {
      maleRound.male_mul_list = segment.returnData.type17_mul_list.map((current) => ({
        ...current,
      }));
      maleRound.male_source = segment.returnData.type17_beishu
        ? { ...segment.returnData.type17_beishu }
        : null;
    }
    const femaleRound = segment.returnData.list.find((round) => round.remove_type.includes(18));
    if (femaleRound) {
      femaleRound.female_start_mul_list = segment.returnData.type18_start_mul_list.map(
        (current) => ({ ...current }),
      );
      femaleRound.female_mul_count = segment.returnData.type18_mul_count;
    }
    segment.returnData.list.at(-1)!.collect_gold = money(bet * segmentFactor);
    segmentOutcomes.push(segment);
  }

  const rounds = segmentOutcomes.flatMap((segment) => segment.returnData.list);
  const returnData = baseReturnData(rounds);
  const skillOutcome = segmentOutcomes.find(hasCharacterSkill);
  if (skillOutcome) {
    returnData.type17_mul_list = skillOutcome.returnData.type17_mul_list.map((cell) => ({
      ...cell,
    }));
    returnData.type17_beishu = skillOutcome.returnData.type17_beishu
      ? { ...skillOutcome.returnData.type17_beishu }
      : null;
    returnData.type18_start_mul_list = skillOutcome.returnData.type18_start_mul_list.map(
      (cell) => ({ ...cell }),
    );
    returnData.type18_mul_count = skillOutcome.returnData.type18_mul_count;
  }
  returnData.featureMode = 'awakening';
  returnData.gameModelType = 1;
  returnData.is_sjc = 0;
  returnData.freeGameCount = 0;
  returnData.score = money(
    segmentOutcomes.reduce((total, segment) => total + segment.returnData.score, 0),
  );
  returnData.total_gold = money(bet * factor);
  returnData.multiplierBankBefore = 0;
  returnData.multiplierBankAdded = 0;
  returnData.multiplierBankAfter = 0;
  return {
    payoutFactor: factor,
    triggeredFreeSpins: false,
    featureMode: 'awakening',
    returnData,
  };
}

export function seth2SuperMainSpin(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const selection = pickWeighted(SUPER_MAIN_OUTCOMES, rng);
  return buildSuperMainOutcome(bet, selection.factor ?? 0, rng);
}

export function seth2SuperMainSpinForFactor(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
  factor: number,
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  if (!Number.isFinite(factor) || factor < 0) throw new Error('Factor must be non-negative');
  return buildSuperMainOutcome(bet, factor, randomSource(serverSeed, clientSeed, nonce));
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
  bet: number,
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  return buildBoughtFeatureEntry(featureMode, randomSource(serverSeed, clientSeed, nonce), bet);
}

export function seth2BuyFeature(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const featureMode = rng() < SETH2_BOUGHT_AWAKENING_SHARE ? 'awakening' : 'standard';
  return buildBoughtFeatureEntry(featureMode, rng, bet);
}

function expectedValue(outcomes: WeightedOutcome[]): number {
  return outcomes.reduce(
    (total, outcome) =>
      total +
      outcome.probability * (outcome.trigger ? SCATTER_EXPECTED_FACTOR : (outcome.factor ?? 0)),
    0,
  );
}

const EXPECTED_FEATURE_SPINS = SETH2_FREE_SPINS / FREE_SPIN_SCALE;

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
  superMainRtp: expectedValue(SUPER_MAIN_OUTCOMES) / 2000,
} as const;
