import type { PrismaClient, Prisma } from '@prisma/client';

type Db = PrismaClient | Prisma.TransactionClient;

/**
 * 回傳 agentId 自己 + 所有下級代理（遞迴）的 id 陣列。
 * 使用 PostgreSQL recursive CTE。
 */
export async function listAgentDescendants(db: Db, agentId: string): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE tree AS (
      SELECT id FROM "Agent" WHERE id = ${agentId}
      UNION ALL
      SELECT a.id FROM "Agent" a
      JOIN tree t ON a."parentId" = t.id
    )
    SELECT id FROM tree
  `;
  return rows.map((r) => r.id);
}

/**
 * 檢查 operator 是否可管理 target（operator 為 target 的祖先，或 SUPER_ADMIN）。
 */
export async function canManageAgent(
  db: Db,
  operator: { id: string; role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT' },
  targetAgentId: string,
): Promise<boolean> {
  if (operator.role === 'SUPER_ADMIN') return true;

  const scopeRootId = await resolveAgentScopeRootId(db, operator);
  if (!scopeRootId) return false;
  if (scopeRootId === targetAgentId || operator.id === targetAgentId) return true;
  const descendants = await listAgentDescendants(db, scopeRootId);
  return descendants.includes(targetAgentId);
}

/**
 * 檢查 operator 是否可管理 member（member.agentId 在 operator 的下級樹內，或 SUPER_ADMIN）。
 */
export async function canManageMember(
  db: Db,
  operator: { id: string; role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT' },
  memberId: string,
): Promise<boolean> {
  if (operator.role === 'SUPER_ADMIN') return true;
  const scopeRootId = await resolveAgentScopeRootId(db, operator);
  if (!scopeRootId) return false;
  const member = await db.user.findUnique({
    where: { id: memberId },
    select: { agentId: true },
  });
  if (!member?.agentId) return false;
  const descendants = await listAgentDescendants(db, scopeRootId);
  return descendants.includes(member.agentId);
}

export async function resolveAgentScopeRootId(
  db: Db,
  operator: { id: string; role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT' },
): Promise<string | null> {
  if (operator.role !== 'SUB_ACCOUNT') return operator.id;
  const subAccount = await db.agent.findUnique({
    where: { id: operator.id },
    select: { parentId: true },
  });
  return subAccount?.parentId ?? null;
}
