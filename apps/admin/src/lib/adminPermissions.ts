import type { AgentPublic } from '@bg/shared';

export function canWriteAdmin(agent: Pick<AgentPublic, 'role' | 'status'> | null): boolean {
  return Boolean(agent && agent.status === 'ACTIVE' && agent.role !== 'SUB_ACCOUNT');
}

export const ADMIN_READ_ONLY_MESSAGE = '目前帳號為唯讀，不能新增、修改、轉點或刪除資料。';
