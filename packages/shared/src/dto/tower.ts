export type TowerDifficulty = 'easy' | 'medium' | 'hard' | 'expert' | 'master';
export type TowerStatus = 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';

export interface TowerStartRequest {
  amount: number;
  difficulty: TowerDifficulty;
  clientSeed?: string;
}

export interface TowerPickRequest {
  roundId: string;
  col: number;
}

export interface TowerCashoutRequest {
  roundId: string;
}

export interface TowerRoundState {
  roundId: string;
  status: TowerStatus;
  difficulty: TowerDifficulty;
  cols: number;
  totalLevels: number;
  currentLevel: number;
  picks: number[]; // col index per completed level
  currentMultiplier: string;
  nextMultiplier: string | null;
  amount: string;
  potentialPayout: string;
  revealedLayout?: number[][]; // expose when done
  serverSeedHash: string;
  nonce: number;
}

export interface TowerPickResult {
  state: TowerRoundState;
  hitTrap: boolean;
  newBalance?: string;
}

export interface TowerCashoutResult {
  state: TowerRoundState;
  payout: string;
  newBalance: string;
}
