export interface AdminLoginRequest {
  username: string;
  password: string;
}

export type AdminRoleDto = 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
export type AgentStatusDto = 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
export type MarketTypeDto = 'D' | 'A';
export type RebateModeDto = 'PERCENTAGE' | 'ALL' | 'NONE';

export interface AgentPublic {
  id: string;
  username: string;
  displayName: string | null;
  parentId: string | null;
  level: number;
  marketType: MarketTypeDto;
  balance: string;
  commissionBalance: string;
  commissionRate: string;
  rebateMode: RebateModeDto;
  rebatePercentage: string;
  maxRebatePercentage: string;
  baccaratRebateMode: RebateModeDto;
  baccaratRebatePercentage: string;
  maxBaccaratRebatePercentage: string;
  bettingLimitLevel: string;
  status: AgentStatusDto;
  role: AdminRoleDto;
  notes: string | null;
  lastLoginAt: string | null;
  createdAt: string;
}

export interface AdminAuthResponse {
  agent: AgentPublic;
  accessToken: string;
  refreshToken: string;
}

export interface AdminRefreshRequest {
  refreshToken: string;
}
