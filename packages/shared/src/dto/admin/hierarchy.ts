export type HierarchyItem =
  | {
      kind: 'agent';
      id: string;
      username: string;
      displayName: string | null;
      level: number;
      marketType: 'D' | 'A';
      balance: string;
      rebatePercentage: string;
      baccaratRebatePercentage?: string;
      bettingLimitLevel: string;
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
      role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
      createdAt: string;
      childCount: number;
      memberCount: number;
      notes: string | null;
    }
  | {
      kind: 'member';
      id: string;
      username: string;
      displayName: string | null;
      level: null;
      marketType: 'D' | 'A';
      balance: string;
      bettingLimitLevel: string;
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED';
      frozenAt: string | null;
      disabledAt: string | null;
      notes: string | null;
      createdAt: string;
    };

export interface HierarchyResponse {
  parent: {
    id: string;
    username: string;
    displayName: string | null;
    level: number;
    marketType: 'D' | 'A';
    balance: string;
    rebatePercentage: string;
    maxRebatePercentage: string;
    rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
    baccaratRebatePercentage: string;
    maxBaccaratRebatePercentage: string;
    baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
    bettingLimitLevel: string;
    role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
    status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
    parentId: string | null;
  } | null;
  breadcrumb: { id: string; username: string; level: number }[];
  items: HierarchyItem[];
  stats: { agentCount: number; memberCount: number };
}

export interface HierarchyReportCommon {
  notes: string | null;
  balance: string;
  memberCount: number;
  betCount: number;
  betAmount: string;
  validAmount: string;
  memberWinLoss: string;
  payout: string;
  totalRebatePercentage: string;
  totalRebateAmount: string;
  memberProfitLossResult: string;
  receivableFromDownline: string;
  commissionPercentage: string;
  commissionAmount: string;
  commissionResult: string;
  earnedRebatePercentage: string;
  earnedRebateAmount: string;
  profitLossResult: string;
  volumeRemitted: string;
  uplineSettlement: string;
}

export type HierarchyReportItem =
  | (HierarchyReportCommon & {
      kind: 'agent';
      id: string;
      username: string;
      displayName: string | null;
      level: number;
      rebatePercentage: string;
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
      role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
    })
  | (HierarchyReportCommon & {
      kind: 'member';
      id: string;
      username: string;
      displayName: string | null;
      level: null;
      rebatePercentage: string;
      status: 'ACTIVE' | 'FROZEN' | 'DISABLED';
    });

export interface HierarchyReportResponse {
  parent: {
    id: string;
    username: string;
    level: number;
    rebatePercentage: string;
    commissionRate: string;
    balance: string;
    parentId: string | null;
  };
  breadcrumb: { id: string; username: string; level: number }[];
  items: HierarchyReportItem[];
  totals: {
    betCount: number;
    betAmount: string;
    validAmount: string;
    memberWinLoss: string;
    totalRebateAmount: string;
    memberProfitLossResult: string;
    receivableFromDownline: string;
    commissionAmount: string;
    commissionResult: string;
    earnedRebateAmount: string;
    profitLossResult: string;
    volumeRemitted: string;
    uplineSettlement: string;
  };
}
