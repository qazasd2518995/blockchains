export type ChickenRoadDifficulty = 'easy' | 'medium' | 'hard' | 'hardcore';
export type ChickenRoadStatus = 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';

export interface ChickenRoadStartRequest {
  amount: number;
  difficulty: ChickenRoadDifficulty;
  clientSeed?: string;
}

export interface ChickenRoadStepRequest {
  roundId: string;
}

export interface ChickenRoadCashoutRequest {
  roundId: string;
}

export interface ChickenRoadRoundState {
  roundId: string;
  status: ChickenRoadStatus;
  difficulty: ChickenRoadDifficulty;
  totalSteps: number;
  currentStep: number;
  currentMultiplier: string;
  nextMultiplier: string | null;
  amount: string;
  potentialPayout: string;
  path?: boolean[];
  hitStep?: number | null;
  serverSeedHash: string;
  nonce: number;
  createdAt: string;
}

export interface ChickenRoadStepResult {
  state: ChickenRoadRoundState;
  hit: boolean;
  autoCashedOut?: boolean;
  payout?: string;
  newBalance?: string;
}

export interface ChickenRoadCashoutResult {
  state: ChickenRoadRoundState;
  payout: string;
  newBalance: string;
}
