import type { AgentPublic, MarketTypeDto, RebateModeDto, AgentStatusDto } from './auth.js';

export interface CreateAgentRequest {
  parentId: string;
  username: string;
  password: string;
  displayName?: string;
  level: number;
  marketType?: MarketTypeDto;
  commissionRate?: string;
  rebateMode?: RebateModeDto;
  rebatePercentage?: string;
  baccaratRebateMode?: RebateModeDto;
  baccaratRebatePercentage?: string;
  bettingLimitLevel?: string;
  bettingLimits?: Record<string, string[]>;
  notes?: string;
}

export interface UpdateAgentRequest {
  displayName?: string | null;
  notes?: string | null;
}

export interface UpdateAgentRebateRequest {
  rebateMode: RebateModeDto;
  rebatePercentage: string;
  baccaratRebateMode?: RebateModeDto;
  baccaratRebatePercentage?: string;
}

export interface UpdateAgentStatusRequest {
  status: AgentStatusDto;
}

export interface ResetPasswordRequest {
  newPassword: string;
}

export interface AgentListResponse {
  items: AgentPublic[];
}

export interface AgentTreeNode extends AgentPublic {
  childCount: number;
  memberCount: number;
  children: AgentTreeNode[];
}

export interface AgentTreeResponse {
  root: AgentTreeNode;
}
