export interface MemberPublic {
  id: string;
  username: string;
  displayName: string | null;
  agentId: string | null;
  agentUsername: string | null;
  balance: string;
  marketType: 'D' | 'A';
  bettingLimitLevel: string;
  status: 'ACTIVE' | 'FROZEN' | 'DISABLED';
  frozenAt: string | null;
  disabledAt: string | null;
  notes: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface CreateMemberRequest {
  agentId: string;              // 目標代理（操作者必須能 manage）
  username: string;
  password: string;
  displayName?: string;
  initialBalance?: string;      // 若設，從代理 balance 扣除轉到 member
  bettingLimitLevel?: string;
  notes?: string;
}

export interface UpdateMemberNotesRequest {
  notes: string | null;
}

export interface UpdateMemberStatusRequest {
  status: 'ACTIVE' | 'FROZEN' | 'DISABLED';
}

export interface AdjustMemberBalanceRequest {
  delta: string;                // 正=加、負=扣（不透過 agent balance，純系統調整）
  description?: string;
}

export interface MemberListResponse {
  items: MemberPublic[];
  nextCursor: string | null;
}

export interface MemberBetEntry {
  id: string;
  gameId: string;
  amount: string;
  multiplier: string;
  payout: string;
  profit: string;
  createdAt: string;
}

export interface MemberBetListResponse {
  items: MemberBetEntry[];
  nextCursor: string | null;
  pagination?: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
}
