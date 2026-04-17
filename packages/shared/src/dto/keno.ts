export type KenoRisk = 'low' | 'medium' | 'high';

export interface KenoBetRequest {
  amount: number;
  selected: number[];
  risk: KenoRisk;
  clientSeed?: string;
}

export interface KenoBetResult {
  betId: string;
  drawn: number[];
  selected: number[];
  hits: number[];
  hitCount: number;
  risk: KenoRisk;
  multiplier: number;
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
