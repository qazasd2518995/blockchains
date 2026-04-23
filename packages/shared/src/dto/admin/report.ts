export interface BetReportRow {
  id: string;
  gameId: string;
  memberUsername: string;
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

export interface DashboardTrendPoint {
  date: string;
  label: string;
  betAmount: string;
  betCount: number;
  activeMembers: number;
}

export interface DashboardGameBreakdown {
  gameId: string;
  betAmount: string;
  betCount: number;
}

export interface DashboardSummaryResponse {
  range: {
    startDate: string;
    endDate: string;
  };
  totals: {
    downlineAgentCount: number;
    memberCount: number;
    newMembers7d: number;
    activeMembers24h: number;
    activeMembers7d: number;
    betCount7d: number;
    betAmount7d: string;
    payout7d: string;
    platformNet7d: string;
    avgBetAmount7d: string;
  };
  trend: DashboardTrendPoint[];
  gameBreakdown: DashboardGameBreakdown[];
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
