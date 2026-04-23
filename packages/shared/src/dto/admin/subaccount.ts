import type { AgentPublic } from './auth.js';

export interface CreateSubAccountRequest {
  parentAgentId?: string;
  username: string;
  password: string;
  displayName?: string;
  notes?: string;
}

export interface ResetSubAccountPasswordRequest {
  newPassword: string;
}

export interface UpdateSubAccountStatusRequest {
  status: 'ACTIVE' | 'FROZEN';
}

export interface SubAccountListResponse {
  items: AgentPublic[];
  parentUsername: string | null;
}
