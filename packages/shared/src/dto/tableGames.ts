import type { LocalTableGameIdType } from '../games.js';

export type LocalTableKind = 'twenty-one-half' | 'tui-tongzi' | 'black-dot' | 'card-war';
export type LocalTableOutcome = 'WIN' | 'LOSE' | 'PUSH';

export interface LocalTableCard {
  kind: 'card';
  rank: string;
  suit: 'spades' | 'hearts' | 'diamonds' | 'clubs';
  label: string;
  valueLabel: string;
}

export interface LocalTableTubeTile {
  kind: 'tube';
  id: string;
  label: string;
  value: number;
  isWhite?: boolean;
}

export interface LocalTableDominoTile {
  kind: 'domino';
  id: string;
  name: string;
  pips: [number, number];
}

export type LocalTablePiece = LocalTableCard | LocalTableTubeTile | LocalTableDominoTile;

export interface LocalTableHand {
  title: string;
  pieces: LocalTablePiece[];
  scoreLabel: string;
  rankLabel: string;
  detail?: string;
}

export interface LocalTableBetRequest {
  gameId: LocalTableGameIdType;
  amount: number;
  clientSeed?: string;
}

export interface LocalTableBetResult {
  betId: string;
  gameId: LocalTableGameIdType;
  kind: LocalTableKind;
  roomName: string;
  outcome: LocalTableOutcome;
  outcomeLabel: string;
  amount: string;
  payout: string;
  profit: string;
  multiplier: number;
  player: LocalTableHand;
  banker: LocalTableHand;
  extraHands?: LocalTableHand[];
  summary: string;
  ruleSummary: string[];
  controlled: boolean;
  flipReason?: string | null;
  newBalance: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}

export type LocalTableRoundStatus = 'ACTIVE' | 'SETTLED';
export type LocalTableRoundStage =
  | 'AWAIT_FIRST_REVEAL'
  | 'AWAIT_FINAL_REVEAL'
  | 'AWAIT_PLAYER_REVEAL'
  | 'AWAIT_BANKER_REVEAL'
  | 'AWAIT_SPLIT'
  | 'SETTLED';

export interface LocalTableSplitOption {
  id: string;
  label: string;
  lowIndexes: number[];
  highIndexes: number[];
  low: LocalTableHand;
  high: LocalTableHand;
}

export interface LocalTableRoundState {
  roundId: string;
  gameId: LocalTableGameIdType;
  kind: Exclude<LocalTableKind, 'twenty-one-half'>;
  roomName: string;
  status: LocalTableRoundStatus;
  stage: LocalTableRoundStage;
  amount: string;
  payout: string;
  profit: string;
  multiplier: number;
  player: LocalTableHand;
  banker: LocalTableHand;
  extraHands?: LocalTableHand[];
  outcome?: LocalTableOutcome | null;
  outcomeLabel?: string | null;
  summary: string;
  ruleSummary: string[];
  canReveal: boolean;
  revealLabel?: string | null;
  revealedPlayerIndexes?: number[];
  revealablePlayerIndexes?: number[];
  canSplit: boolean;
  splitOptions?: LocalTableSplitOption[];
  controlled?: boolean;
  flipReason?: string | null;
  newBalance?: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}

export type TwentyOneHalfRoundStatus = 'ACTIVE' | 'SETTLED';
export type TwentyOneHalfRoundPhase = 'PLAYER_TURN' | 'BANKER_TURN';
export type TwentyOneHalfForcedAction = 'hit' | 'stand' | null;

export interface TwentyOneHalfRoundState {
  roundId: string;
  gameId: LocalTableGameIdType;
  kind: 'twenty-one-half';
  roomName: string;
  status: TwentyOneHalfRoundStatus;
  phase: TwentyOneHalfRoundPhase;
  amount: string;
  payout: string;
  profit: string;
  multiplier: number;
  player: LocalTableHand;
  banker: LocalTableHand;
  outcome?: LocalTableOutcome | null;
  outcomeLabel?: string | null;
  summary: string;
  ruleSummary: string[];
  canHit: boolean;
  canStand: boolean;
  canBankerDraw: boolean;
  forcedAction: TwentyOneHalfForcedAction;
  controlled?: boolean;
  flipReason?: string | null;
  newBalance?: string;
  nonce: number;
  serverSeedHash: string;
  clientSeed: string;
}
