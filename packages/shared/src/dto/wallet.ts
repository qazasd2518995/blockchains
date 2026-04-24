export interface BalanceResponse {
  balance: string;
}

export type TransactionType =
  | 'SIGNUP_BONUS'
  | 'BET_PLACE'
  | 'BET_WIN'
  | 'CASHOUT'
  | 'ADJUSTMENT'
  | 'REBATE'
  | 'TRANSFER_IN'
  | 'TRANSFER_OUT';

export interface TransactionEntry {
  id: string;
  type: TransactionType;
  amount: string;
  balanceAfter: string;
  betId: string | null;
  gameId: string | null;
  createdAt: string;
}

export interface TransactionListResponse {
  items: TransactionEntry[];
  nextCursor: string | null;
}
