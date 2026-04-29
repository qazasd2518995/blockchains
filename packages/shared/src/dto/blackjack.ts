export type BlackjackStatus = 'ACTIVE' | 'BUSTED' | 'CASHED_OUT';
export type BlackjackHandStatus = 'PLAYING' | 'STANDING' | 'BUSTED' | 'RESOLVED';
export type BlackjackOutcome = 'WIN' | 'LOSE' | 'PUSH' | 'BLACKJACK';

export interface BlackjackCard {
  rank: number;
  suit: number;
}

export interface BlackjackHandScore {
  total: number;
  soft: boolean;
  isBust: boolean;
  isBlackjack: boolean;
}

export interface BlackjackPlayerHand {
  id: string;
  cards: BlackjackCard[];
  bet: string;
  status: BlackjackHandStatus;
  score: BlackjackHandScore;
  doubled: boolean;
  splitAces: boolean;
  outcome?: BlackjackOutcome;
  payout?: string;
  multiplier?: string;
}

export interface BlackjackRoundState {
  roundId: string;
  status: BlackjackStatus;
  dealerCards: BlackjackCard[];
  dealerScore: BlackjackHandScore | null;
  dealerHoleHidden: boolean;
  playerHands: BlackjackPlayerHand[];
  activeHandIndex: number;
  amount: string;
  totalBetAmount: string;
  potentialPayout: string;
  canHit: boolean;
  canStand: boolean;
  canDouble: boolean;
  canSplit: boolean;
  deckIndex: number;
  serverSeedHash: string;
  nonce: number;
}

export interface BlackjackStartRequest {
  amount: number;
  clientSeed?: string;
}

export interface BlackjackRoundResult {
  state: BlackjackRoundState;
  newBalance?: string;
}

export interface BlackjackActionRequest {
  roundId: string;
}
