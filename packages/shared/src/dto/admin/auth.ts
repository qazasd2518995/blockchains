export interface AdminLoginRequest {
  username: string;
  password: string;
  captchaCode: string;
  captchaToken: string;
  twoFactorCode?: string;
}

export interface AdminCaptchaResponse {
  captchaCode: string;
  captchaToken: string;
  expiresAt: string;
}

export type AdminRoleDto = 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
export type AgentStatusDto = 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
export type MarketTypeDto = 'D' | 'A';
export type RebateModeDto = 'PERCENTAGE' | 'ALL' | 'NONE';
export type BettingLimitsByGameDto = Record<string, string>;

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
  bettingLimits: BettingLimitsByGameDto;
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

export interface AdminTwoFactorChallengeResponse {
  requiresTwoFactor: true;
  setupRequired: boolean;
  manualKey: string | null;
  otpauthUrl: string | null;
  message: string;
}

export type AdminLoginResponse = AdminAuthResponse | AdminTwoFactorChallengeResponse;

export interface AdminRefreshRequest {
  refreshToken: string;
}
