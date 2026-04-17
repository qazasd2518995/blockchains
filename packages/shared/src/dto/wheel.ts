export type WheelRisk = 'low' | 'medium' | 'high';
export type WheelSegmentCount = 10 | 20 | 30 | 40 | 50;

export interface WheelBetRequest {
  amount: number;
  risk: WheelRisk;
  segments: WheelSegmentCount;
  clientSeed?: string;
}

export interface WheelBetResult {
  betId: string;
  segmentIndex: number;
  multiplier: number;
  risk: WheelRisk;
  segments: WheelSegmentCount;
  segmentMultipliers: number[];
  amount: string;
  payout: string;
  profit: string;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
