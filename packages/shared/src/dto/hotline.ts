export interface HotlineBetRequest {
  amount: number;
  clientSeed?: string;
  gameId?: string;
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
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
