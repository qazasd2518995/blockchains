export interface HotlineBetRequest {
  amount: number;
  clientSeed?: string;
  gameId?: string;
}

export interface HotlineWinLine {
  lineId?: string;
  path?: number[];
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

export interface HotlineBetResult {
  betId: string;
  grid: number[][];
  lines: HotlineWinLine[];
  cascades?: HotlineCascadeStep[];
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
