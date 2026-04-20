export type PointTransferTypeDto =
  | 'AGENT_TO_AGENT'
  | 'AGENT_TO_MEMBER'
  | 'MEMBER_TO_AGENT'
  | 'CS_AGENT_TRANSFER'
  | 'CS_MEMBER_TRANSFER'
  | 'REBATE_PAYOUT';

export interface TransferRequest {
  fromId: string;                       // agent id
  toId: string;                         // agent id or member id
  amount: string;
  description?: string;
}

export interface AgentToMemberTransferRequest {
  agentId: string;
  memberId: string;
  amount: string;                       // 正=代理轉給會員、負=會員轉回代理
  description?: string;
}

export interface TransferEntry {
  id: string;
  type: PointTransferTypeDto;
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  amount: string;
  fromBeforeBalance: string;
  fromAfterBalance: string;
  toBeforeBalance: string;
  toAfterBalance: string;
  description: string | null;
  operatorId: string | null;
  operatorType: string | null;
  createdAt: string;
}

export interface TransferListResponse {
  items: TransferEntry[];
  nextCursor: string | null;
}
