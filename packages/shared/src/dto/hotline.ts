export const HOTLINE_JACKPOT_RESET_VALUE = '1000';

export const HOTLINE_JACKPOT_SIMULATION_EPOCH = '2026-01-01T00:00:00.000Z';

export const HOTLINE_JACKPOT_PASSIVE_GROWTH_PER_SECOND = {
  grand: '42',
  major: '28',
  minor: '7.5',
  mini: '2.2',
} as const;

export const HOTLINE_JACKPOT_RESET_INTERVAL_SECONDS = {
  grand: '21600',
  major: '7200',
  minor: '2700',
  mini: '900',
} as const;

export const HOTLINE_JACKPOT_RESET_OFFSET_SECONDS = {
  grand: '1370',
  major: '611',
  minor: '233',
  mini: '97',
} as const;

export interface HotlineBetRequest {
  amount: number;
  clientSeed?: string;
  gameId?: string;
  buyFeature?: boolean;
}

export interface HotlineJackpotSnapshot {
  gameId: string;
  grand: string;
  major: string;
  minor: string;
  mini: string;
  updatedAt: string;
  asOf?: string;
}

export interface HotlineWinLine {
  lineId?: string;
  path?: number[];
  positions?: HotlineWinPosition[];
  startReel?: number;
  direction?: 'ltr' | 'rtl';
  row: number;
  symbol: number;
  count: number;
  payout: number;
  ways?: number;
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

export interface HotlineBetResult {
  betId: string;
  grid: number[][];
  lines: HotlineWinLine[];
  cascades?: HotlineCascadeStep[];
  features?: HotlineMegaFeatureResult;
  buyFeature?: boolean;
  baseAmount?: string;
  stakeAmount?: string;
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  jackpot?: HotlineJackpotSnapshot;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
