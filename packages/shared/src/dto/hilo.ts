export type HiLoStatus = 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';
export type HiLoGuess = 'higher' | 'lower';

export interface HiLoCard {
  rank: number; // 1..13
  suit: number; // 0..3
}

export interface HiLoStartRequest {
  amount: number;
  clientSeed?: string;
}

export interface HiLoGuessRequest {
  roundId: string;
  guess: HiLoGuess;
}

export interface HiLoSkipRequest {
  roundId: string;
}

export interface HiLoCashoutRequest {
  roundId: string;
}

export interface HiLoRoundState {
  roundId: string;
  status: HiLoStatus;
  currentCard: HiLoCard;
  history: HiLoCard[];
  currentMultiplier: string;
  higherMultiplier: string;
  lowerMultiplier: string;
  higherChance: number;
  lowerChance: number;
  amount: string;
  potentialPayout: string;
  skipsUsed: number;
  maxSkips: number;
  cardIndex: number;
  serverSeedHash: string;
  nonce: number;
}

export interface HiLoGuessResult {
  state: HiLoRoundState;
  drawn: HiLoCard;
  correct: boolean;
  newBalance?: string;
}

export interface HiLoCashoutResult {
  state: HiLoRoundState;
  payout: string;
  newBalance: string;
}
