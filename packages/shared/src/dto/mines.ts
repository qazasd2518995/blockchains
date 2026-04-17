export interface MinesStartRequest {
  amount: number;
  mineCount: number;
  clientSeed?: string;
}

export type MinesRoundStatus = 'ACTIVE' | 'CASHED_OUT' | 'BUSTED';

export interface MinesRoundState {
  roundId: string;
  status: MinesRoundStatus;
  mineCount: number;
  gridSize: number;
  revealed: number[];
  currentMultiplier: string;
  nextMultiplier: string | null;
  amount: string;
  potentialPayout: string;
  minePositions?: number[];
  serverSeedHash: string;
  nonce: number;
  createdAt: string;
}

export interface MinesRevealRequest {
  roundId: string;
  cellIndex: number;
}

export interface MinesRevealResult {
  state: MinesRoundState;
  hitMine: boolean;
  newBalance?: string;
}

export interface MinesCashoutRequest {
  roundId: string;
}

export interface MinesCashoutResult {
  state: MinesRoundState;
  payout: string;
  newBalance: string;
}
