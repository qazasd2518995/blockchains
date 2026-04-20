export interface BetReportRow {
  id: string;
  gameId: string;
  memberEmail: string;
  agentUsername: string | null;
  amount: string;
  multiplier: string;
  payout: string;
  profit: string;
  createdAt: string;
}

export interface ReportResponse {
  items: BetReportRow[];
  nextCursor: string | null;
  totals: {
    betCount: number;
    betAmount: string;
    memberWinLoss: string;
  };
}

export interface AgentAnalysisRow {
  agentId: string;
  username: string;
  level: number;
  rebatePercentage: string;
  balance: string;
  betCount: number;
  betAmount: string;
  memberWinLoss: string;
  payout: string;
  earnedRebatePercentage: string;
  earnedRebateAmount: string;
  uplineSettlement: string;
  memberCount: number;
}

export interface AgentAnalysisResponse {
  root: AgentAnalysisRow;
  children: AgentAnalysisRow[];
}
