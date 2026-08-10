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
export const SETH2_RETRIGGER_SPINS = 5;
export const SETH2_FREE_RETRIGGER_PROBABILITY = 0.01;
export type Seth2SpinMode = 'base' | 'standard_free' | 'awakening_free' | 'bought_standard_free';
export type Seth2FeatureMode = 'none' | 'standard' | 'awakening';
export type Seth2RandomSource = () => number;

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
const SCATTER_EXPECTED_FACTOR = 3;
const BASE_NON_FEATURE_EV = 0.3389;

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

function baseReturnData(roundOrRounds: Seth2CascadeRound | Seth2CascadeRound[]): Seth2ReturnData {
  const rounds = Array.isArray(roundOrRounds) ? roundOrRounds : [roundOrRounds];
  const finalRound = rounds.at(-1)!;
  return {
    list: rounds,
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
  };
}

function buildLoss(rng: Seth2RandomSource): Seth2Outcome {
  const round = emptyRound(safeFill(SETH2_GRID_SIZE, new Set(), rng));
  return {
    payoutFactor: 0,
    triggeredFreeSpins: false,
    featureMode: 'none',
    returnData: baseReturnData(round),
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
  returnData.is_sjc = 1;
  returnData.freeGameCount = 15;
  return {
    payoutFactor: factor,
    triggeredFreeSpins: true,
    featureMode,
    returnData,
  };
}

function buildRetrigger(rng: Seth2RandomSource): Seth2Outcome {
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
  const returnData = baseReturnData(round);
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

function splitMultiplierTotal(total: number, maxParts: number): number[] | null {
  if (total === 1) return [];
  const partCount = Math.ceil(total / SETH2_MAX_SYMBOL_MULTIPLIER);
  if (partCount > maxParts) return null;
  const part = Math.floor(total / partCount);
  if (part < 2) return null;
  const remainder = total - part * partCount;
  return Array.from({ length: partCount }, (_, index) => part + (index < remainder ? 1 : 0));
}

function regularMultiplierPlan(
  total: number,
  maxParts: number,
  rng: Seth2RandomSource,
): MultiplierPlan | null {
  const values = splitMultiplierTotal(total, maxParts);
  if (!values) return null;
  const useRare = values.length > 0 && values[0]! >= 4 && rng() < 0.25;
  const upgrades: Array<{ mul: number; new_mul: number }> = [];
  const cells = values.map((value, index) => {
    if (index !== 0 || !useRare) return cell(10, value, 1);
    const displayed = Math.max(2, Math.floor(value / 2));
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
  const minimumPartCount = Math.ceil(total / SETH2_MAX_SYMBOL_MULTIPLIER);
  const skillRoll = rng();
  const requestedLockCount = skillRoll < 0.2 ? 1 : skillRoll < 0.85 ? 2 + Math.floor(rng() * 4) : 6;
  const lockCount = Math.max(1, Math.min(requestedLockCount, 6, maxParts, Math.floor(total / 2)));
  const partCount = Math.max(minimumPartCount, lockCount);
  if (partCount > maxParts || partCount > Math.floor(total / 2)) return null;

  const baseValue = Math.floor(total / partCount);
  const remainder = total - baseValue * partCount;
  const values = Array.from(
    { length: partCount },
    (_, index) => baseValue + (index < remainder ? 1 : 0),
  );
  if (values.some((value) => value < 2 || value > SETH2_MAX_SYMBOL_MULTIPLIER)) return null;

  const useRare = values[0]! >= 4 && rng() < 0.25;
  const upgrades: Array<{ mul: number; new_mul: number }> = [];
  const cells = values.map((value, index) => {
    if (index !== 0 || !useRare) return cell(10, value, 1);
    const displayed = Math.max(2, Math.floor(value / 2));
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
  let sourceValue = Math.min(SETH2_MAX_SYMBOL_MULTIPLIER, Math.floor(total / (splitCount + 1)));
  let extras: number[] | null = null;
  while (sourceValue >= 2) {
    const remainder = total - sourceValue * (splitCount + 1);
    const candidate =
      remainder === 1
        ? null
        : remainder > 0
          ? splitMultiplierTotal(remainder, maxInitialParts - 1)
          : [];
    // The imported client locates the split source by multiplier value only.
    // Keep that value unique so it cannot animate a different multiplier ball.
    if (candidate && !candidate.includes(sourceValue)) {
      extras = candidate;
      break;
    }
    sourceValue -= 1;
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
  rng: Seth2RandomSource,
): { patterns: WinPattern[]; multiplier: number } | null {
  const candidates = WIN_PATTERNS.flatMap((pattern) => {
    const multiplier = exactMultiplier(factor, pattern.factor + extraScoreFactor);
    if (multiplier === null) return [];
    const multiplierParts = multiplier === 1 ? 0 : Math.ceil(multiplier / 500);
    if (pattern.count + multiplierParts + reservedCells > SETH2_GRID_SIZE) return [];
    return [{ patterns: [pattern], multiplier }];
  });
  return choosePattern(candidates, rng);
}

function chooseRegularWinPlan(
  factor: number,
  reservedCells: number,
  rng: Seth2RandomSource,
): { patterns: WinPattern[]; multiplier: number } {
  const cascadeCandidates: Array<{ patterns: WinPattern[]; multiplier: number }> = [];
  for (const first of WIN_PATTERNS) {
    for (const second of WIN_PATTERNS) {
      if (first.type === second.type || first.count !== second.count) continue;
      const multiplier = exactMultiplier(factor, first.factor + second.factor);
      if (multiplier === null) continue;
      const multiplierParts = multiplier === 1 ? 0 : Math.ceil(multiplier / 500);
      if (first.count + multiplierParts + reservedCells > SETH2_GRID_SIZE) continue;
      cascadeCandidates.push({ patterns: [first, second], multiplier });
    }
  }
  if (cascadeCandidates.length > 0 && rng() < 0.35) {
    return choosePattern(cascadeCandidates, rng)!;
  }
  return chooseSinglePattern(factor, 0, reservedCells, rng)!;
}

function buildWin(
  bet: number,
  factor: number,
  mode: Seth2SpinMode,
  rng: Seth2RandomSource,
): Seth2Outcome {
  const jackpot = jackpotForFactor(factor, mode);
  const jackpotCells = jackpot ? jackpot.count : 0;
  const awakening = mode === 'awakening_free';
  let skill: 'male' | 'female' | null = null;
  let selected = null as { patterns: WinPattern[]; multiplier: number } | null;

  if (awakening && factor >= 20 && rng() < 0.7) {
    const proposedSkill = rng() < 0.5 ? 'male' : 'female';
    const skillPlan = chooseSinglePattern(factor, SETH2_SKILL_SYMBOL_PAY / 20, 3, rng);
    if (skillPlan && skillPlan.multiplier >= 4) {
      skill = proposedSkill;
      selected = skillPlan;
    }
  }

  selected ??= chooseRegularWinPlan(factor, jackpotCells, rng);
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
  const skillType = skill === 'male' ? 17 : skill === 'female' ? 18 : null;
  const skillScoreFactor = skill ? SETH2_SKILL_SYMBOL_PAY / 20 : 0;
  const rawScoreFactor =
    selected.patterns.reduce((total, pattern) => total + pattern.factor, 0) + skillScoreFactor;
  const payout = money(bet * factor);
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
    total_mul: multiplierTotal > 1 ? multiplierTotal : 0,
    score: firstScore,
    total_gold: secondPattern ? money(firstScore * multiplierTotal) : payout,
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
      total_mul: multiplierTotal > 1 ? multiplierTotal : 0,
      score: secondScore,
      total_gold: payout,
      remove_count: 1,
      is_over: 1,
    });
  }

  const returnData = baseReturnData(rounds);
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
    payoutFactor: factor,
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
): Seth2Outcome {
  if (!Number.isFinite(bet) || bet <= 0) throw new Error('Bet must be a positive number');
  const rng = randomSource(serverSeed, clientSeed, nonce);
  const table =
    mode === 'base'
      ? BASE_OUTCOMES
      : mode === 'standard_free' || mode === 'bought_standard_free'
        ? STANDARD_FREE_OUTCOMES
        : AWAKENING_FREE_OUTCOMES;
  const selection = pickWeighted(table, rng);
  if (selection.trigger) return buildScatterTrigger(bet, rng);
  if (selection.retrigger) return buildRetrigger(rng);
  if (!selection.factor) return buildLoss(rng);
  return buildWin(bet, selection.factor, mode, rng);
}

export function seth2SpinForFactor(
  serverSeed: string,
  clientSeed: string,
  nonce: number,
  bet: number,
  factor: number,
  mode: Seth2SpinMode = 'base',
): Seth2Outcome {
  const rng = randomSource(serverSeed, clientSeed, nonce);
  return factor > 0 ? buildWin(bet, factor, mode, rng) : buildLoss(rng);
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
  standardFeatureTotal: expectedValue(STANDARD_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS,
  awakeningFeatureTotal: expectedValue(AWAKENING_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS,
  expectedFeatureSpins: EXPECTED_FEATURE_SPINS,
  baseFeatureProbability: BASE_FEATURE_TRIGGER_PROBABILITY,
  goldenFeatureShare: GOLDEN_FEATURE_SHARE,
  theoreticalRtp:
    expectedValue(BASE_OUTCOMES) + BASE_FEATURE_TRIGGER_PROBABILITY * NATURAL_FEATURE_TOTAL_EV,
  buyFeatureRtp: (expectedValue(AWAKENING_FREE_OUTCOMES) * EXPECTED_FEATURE_SPINS) / 200,
} as const;
