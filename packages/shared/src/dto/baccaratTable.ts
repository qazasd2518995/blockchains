import type { BaccaratTableGameIdType } from '../games.js';

export type BaccaratTableBetSide = 'player' | 'banker' | 'tie';
export type BaccaratTableOutcome = 'PLAYER' | 'BANKER' | 'TIE';
export type BaccaratTableRoundResult = 'WIN' | 'LOSE' | 'PUSH';

export interface BaccaratTableCard {
  rank: number;
  suit: number;
  label: string;
  value: number;
}

export interface BaccaratTableHand {
  cards: BaccaratTableCard[];
  points: number;
  drewThirdCard: boolean;
}

export interface BaccaratTableBetRequest {
  gameId: BaccaratTableGameIdType;
  amount: number;
  side: BaccaratTableBetSide;
  clientSeed?: string;
}

export interface BaccaratTableBetResult {
  betId: string;
  gameId: BaccaratTableGameIdType;
  kind: 'baccarat';
  roomName: string;
  betSide: BaccaratTableBetSide;
  betLabel: string;
  outcome: BaccaratTableOutcome;
  outcomeLabel: string;
  result: BaccaratTableRoundResult;
  resultLabel: string;
  natural: boolean;
  amount: string;
  payout: string;
  profit: string;
  multiplier: number;
  player: BaccaratTableHand;
  banker: BaccaratTableHand;
  playerCards: BaccaratTableCard[];
  bankerCards: BaccaratTableCard[];
  playerPoints: number;
  bankerPoints: number;
  summary: string;
  ruleSummary: string[];
  controlled: boolean;
  flipReason?: string | null;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
