export type PlinkoRisk = 'low' | 'medium' | 'high';

export interface PlinkoBetRequest {
  amount: number;
  rows: number;
  risk: PlinkoRisk;
  clientSeed?: string;
}

export interface PlinkoBetResult {
  betId: string;
  path: ('left' | 'right')[];
  bucket: number;
  rows: number;
  risk: PlinkoRisk;
  multiplier: number;
  multipliers: number[];
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
