export interface HotlineBetRequest {
  amount: number;
  clientSeed?: string;
  gameId?: string;
}

export interface HotlineWinLine {
  row: number;
  symbol: number;
  count: number;
  payout: number;
}

export interface HotlineBetResult {
  betId: string;
  grid: number[][];
  lines: HotlineWinLine[];
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
