export type CrashStatus = 'BETTING' | 'RUNNING' | 'CRASHED';

export interface CrashRoundSnapshot {
  gameId: string;
  roundId: string;
  roundNumber: number;
  status: CrashStatus;
  serverSeedHash: string;
  bettingEndsAt?: string;
  startedAt?: string;
  crashedAt?: string;
  crashPoint?: number; // only revealed after crash
  serverSeed?: string; // only revealed after crash
}

export interface CrashBetRequest {
  gameId?: string;
  amount: number;
  clientSeed?: string;
}

export interface CrashCashOutResponse {
  multiplier: number;
  payout: string;
  newBalance: string;
}

export interface CrashSoloRoundState extends CrashRoundSnapshot {
  betId: string;
  amount: string;
  autoCashOut?: number;
  cashedOutAt?: number;
  payout: string;
  currentMultiplier: number;
  elapsedMs: number;
  newBalance?: string;
}

export interface CrashBetStartResponse extends CrashSoloRoundState {
  newBalance: string;
}

export interface CrashPlayerBet {
  userId: string;
  displayName?: string;
  amount: string;
  autoCashOut?: number;
  cashedOutAt?: number;
  payout?: string;
}

export interface CrashTickEvent {
  multiplier: number;
  elapsedMs: number;
}
