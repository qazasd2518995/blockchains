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

export const SETH2_GRID_SIZE = 30;
export type Seth2SpinMode = 'base' | 'standard_free' | 'awakening_free';
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
}

// 0.4389 direct EV + (1/30 * 15 * 1.06) free-game EV = 0.9689 RTP.
const BASE_OUTCOMES: WeightedOutcome[] = [
  { probability: 1 / 30, trigger: true },
  { probability: 0.16, factor: 0.5 },
  { probability: 0.08, factor: 1 },
  { probability: 0.04, factor: 2 },
  { probability: 0.015, factor: 4 },
  { probability: 0.004, factor: 8 },
  { probability: 0.000345, factor: 20 },
];

const STANDARD_FREE_OUTCOMES: WeightedOutcome[] = [
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

// Fifteen awakening spins average 193.8x against the 200x feature price.
const AWAKENING_FREE_OUTCOMES: WeightedOutcome[] = [
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

function baseReturnData(round: Seth2CascadeRound): Seth2ReturnData {
  return {
    list: [round],
    is_sjc: 0,
    freeGameCount: 0,
    addGameCiShu: 0,
    type17_mul_list: [],
    type17_beishu: { mul: 0 },
    type18_start_mul_list: [],
    type18_mul_count: 0,
    JPtype: 0,
    JPGold: 0,
    score: round.score,
    total_gold: round.total_gold,
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

function buildScatterTrigger(bet: number, rng: Seth2RandomSource): Seth2Outcome {
  const scatterCount = 4;
  const scatterPay = money(bet * 3);
  const startData = [
    ...Array.from({ length: scatterCount }, () => cell(15)),
    ...safeFill(SETH2_GRID_SIZE - scatterCount, new Set([15]), rng),
  ];
  shuffle(startData, rng);
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: [15],
    round_data: safeFill(scatterCount, new Set([15]), rng),
    scoreList: [scatterPay],
    upgrade_mul_list: [],
    total_mul: 0,
    score: scatterPay,
    total_gold: scatterPay,
    remove_count: 0,
    is_over: 1,
  };
  const returnData = baseReturnData(round);
  returnData.is_sjc = 1;
  returnData.freeGameCount = 15;
  return {
    payoutFactor: 3,
    triggeredFreeSpins: true,
    featureMode: 'standard',
    returnData,
  };
}

function splitMultiplier(multiplier: number): number[] {
  const first = Math.max(1, Math.floor(multiplier / 3));
  const second = Math.max(1, Math.floor((multiplier - first) / 2));
  return [first, second, multiplier - first - second].filter((value) => value > 0);
}

function buildWin(
  bet: number,
  factor: number,
  mode: Seth2SpinMode,
  rng: Seth2RandomSource,
): Seth2Outcome {
  const useLargeBase = factor > 500;
  const baseFactor = useLargeBase ? 5 : factor === 0.5 ? 0.5 : 1;
  const winnerType = useLargeBase || factor === 0.5 ? 7 : 5;
  const winnerCount = useLargeBase ? 12 : 8;
  const finalMultiplier = factor / baseFactor;
  const hasMultiplier = finalMultiplier > 1;
  const useMalePower = mode === 'awakening_free' && finalMultiplier >= 50;
  const showMiniJackpot = mode === 'base' && factor >= 20;
  const upgradeMultiplier = mode === 'standard_free' && finalMultiplier >= 20;
  const displayedMultiplier = upgradeMultiplier
    ? Math.max(2, Math.floor(finalMultiplier / 2))
    : finalMultiplier;

  const fixedCells = Array.from({ length: winnerCount }, () => cell(winnerType));
  if (hasMultiplier) fixedCells.push(cell(10, displayedMultiplier, 0));
  if (useMalePower) fixedCells.push(cell(17), cell(17), cell(17));
  if (showMiniJackpot) fixedCells.push(cell(11), cell(11));

  const startData = [
    ...fixedCells,
    ...safeFill(SETH2_GRID_SIZE - fixedCells.length, new Set([winnerType]), rng),
  ];
  shuffle(startData, rng);

  const removeTypes = [winnerType];
  if (useMalePower) removeTypes.push(17);
  const removeCount = winnerCount + (useMalePower ? 3 : 0);
  const baseScore = money(bet * baseFactor);
  const payout = money(bet * factor);
  const round: Seth2CascadeRound = {
    start_data: startData,
    remove_type: removeTypes,
    round_data: safeFill(removeCount, new Set(removeTypes), rng),
    scoreList: removeTypes.map((_, index) => (index === 0 ? baseScore : 0)),
    upgrade_mul_list: upgradeMultiplier
      ? [{ mul: displayedMultiplier, new_mul: finalMultiplier }]
      : [],
    total_mul: hasMultiplier ? finalMultiplier : 0,
    score: baseScore,
    total_gold: payout,
    remove_count: 0,
    is_over: 1,
  };
  const returnData = baseReturnData(round);
  if (useMalePower) {
    returnData.type17_beishu = { mul: finalMultiplier };
    returnData.type17_mul_list = splitMultiplier(finalMultiplier).map((mul) => cell(10, mul, 1));
  }
  if (showMiniJackpot) {
    returnData.JPtype = 11;
    returnData.JPGold = payout;
  }
  returnData.score = baseScore;
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
      : mode === 'standard_free'
        ? STANDARD_FREE_OUTCOMES
        : AWAKENING_FREE_OUTCOMES;
  const selection = pickWeighted(table, rng);
  if (selection.trigger) return buildScatterTrigger(bet, rng);
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
      total + outcome.probability * (outcome.trigger ? 3 : (outcome.factor ?? 0)),
    0,
  );
}

export const SETH2_MATH = {
  baseDirect: expectedValue(BASE_OUTCOMES),
  standardFree: expectedValue(STANDARD_FREE_OUTCOMES),
  awakeningFree: expectedValue(AWAKENING_FREE_OUTCOMES),
  baseFeatureProbability: 1 / 30,
  theoreticalRtp:
    expectedValue(BASE_OUTCOMES) + (1 / 30) * 15 * expectedValue(STANDARD_FREE_OUTCOMES),
  buyFeatureRtp: (15 * expectedValue(AWAKENING_FREE_OUTCOMES)) / 200,
} as const;
