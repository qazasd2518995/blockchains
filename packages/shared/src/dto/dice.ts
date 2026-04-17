export type DiceDirection = 'under' | 'over';

export interface DiceBetRequest {
  amount: number;
  target: number;
  direction: DiceDirection;
  clientSeed?: string;
}

export interface DiceBetResult {
  betId: string;
  roll: number;
  won: boolean;
  target: number;
  direction: DiceDirection;
  multiplier: number;
  winChance: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
