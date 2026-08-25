export const THOR2_ROWS = 5;
export const THOR2_REELS = 6;
export const THOR2_FREE_SPINS = 15;
export const THOR2_MAX_FREE_SPINS = 100;
export const THOR2_MAX_WIN_MULTIPLIER = 25_000;
export const THOR2_BUY_COST_MULTIPLIERS = {
  regular: 100,
  super: 500,
  lucky: 4_000,
} as const;

export type Thor2FeatureKind = keyof typeof THOR2_BUY_COST_MULTIPLIERS;
export type Thor2SpinAction = 'spin' | 'extra' | Thor2FeatureKind;

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
  kind: Thor2FeatureKind | 'natural';
  spinsAwarded: number;
  spinsPlayed: number;
  rounds: Thor2Round[];
  accumulatedMultiplier: number;
  totalMultiplier: number;
  maxWinReached: boolean;
}

export interface Thor2SpinResult {
  betId: string;
  operationId: string;
  modelVersion: string;
  action: Thor2SpinAction;
  baseBet: string;
  chargedAmount: string;
  payout: string;
  multiplier: number;
  newBalance: string;
  grid: Thor2Cell[];
  cascades: Thor2Cascade[];
  feature?: Thor2FeatureResult;
  payoutDeferred: boolean;
  featureCursor?: number;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}

export interface Thor2SessionResult {
  balance: string;
  pendingFeature: Thor2SpinResult | null;
}
