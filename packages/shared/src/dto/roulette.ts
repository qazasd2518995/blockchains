export type RouletteBetType =
  | 'straight'
  | 'red'
  | 'black'
  | 'odd'
  | 'even'
  | 'low'
  | 'high'
  | 'column';

export interface RouletteLineBet {
  type: RouletteBetType;
  value?: number;
  amount: number;
}

export interface RouletteBetRequest {
  bets: RouletteLineBet[];
  clientSeed?: string;
}

export interface RouletteBetResult {
  betId: string;
  slot: number;
  totalAmount: string;
  totalPayout: string;
  profit: string;
  winningBets: { type: RouletteBetType; value?: number; payout: string }[];
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
