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
 * 回傳 agentId 自己 + 所有下級代理，但排除被標記為控制排除線的整條樹。
 * 這讓帶牌線保留報表可見性，但不納入控制交收與全盤控制判斷。
 */
export async function listControlIncludedAgentDescendants(
  db: Db,
  agentId: string,
): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE
      excluded_tree AS (
        SELECT id FROM "Agent"
        WHERE "excludeFromControlSettlement" = true
        UNION ALL
        SELECT a.id FROM "Agent" a
        JOIN excluded_tree e ON a."parentId" = e.id
      ),
      tree AS (
        SELECT id FROM "Agent"
        WHERE id = ${agentId}
          AND id NOT IN (SELECT id FROM excluded_tree)
        UNION ALL
        SELECT a.id FROM "Agent" a
        JOIN tree t ON a."parentId" = t.id
        WHERE a.id NOT IN (SELECT id FROM excluded_tree)
      )
    SELECT id FROM tree
  `;
  return rows.map((r) => r.id);
}

export async function listControlIncludedAgentIds(db: Db): Promise<string[]> {
  const rows = await db.$queryRaw<{ id: string }[]>`
    WITH RECURSIVE excluded_tree AS (
      SELECT id FROM "Agent"
      WHERE "excludeFromControlSettlement" = true
      UNION ALL
      SELECT a.id FROM "Agent" a
      JOIN excluded_tree e ON a."parentId" = e.id
    )
    SELECT id
    FROM "Agent"
    WHERE id NOT IN (SELECT id FROM excluded_tree)
  `;
  return rows.map((r) => r.id);
}

export async function isAgentInControlExcludedLine(db: Db, agentId: string): Promise<boolean> {
  const rows = await db.$queryRaw<{ exists: boolean }[]>`
    WITH RECURSIVE excluded_tree AS (
      SELECT id FROM "Agent"
      WHERE "excludeFromControlSettlement" = true
      UNION ALL
      SELECT a.id FROM "Agent" a
      JOIN excluded_tree e ON a."parentId" = e.id
    )
    SELECT EXISTS (
      SELECT 1 FROM excluded_tree WHERE id = ${agentId}
    ) AS "exists"
  `;
  return rows[0]?.exists === true;
}

export async function isMemberInControlExcludedLine(
  db: Db,
  member: { username?: string | null; agentId?: string | null },
): Promise<boolean> {
  let agentId = member.agentId ?? null;
  if (!agentId && member.username) {
    const row = await db.user.findUnique({
      where: { username: member.username },
      select: { agentId: true },
    });
    agentId = row?.agentId ?? null;
  }
  if (!agentId) return false;
  return isAgentInControlExcludedLine(db, agentId);
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

export async function listPlatformSuperAdminIds(db: Db): Promise<string[]> {
  const admins = await db.agent.findMany({
    where: { role: 'SUPER_ADMIN', status: { not: 'DELETED' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  return admins.map((admin) => admin.id);
}

export async function resolvePlatformRootAgentId(db: Db, fallbackId: string): Promise<string> {
  const [root] = await db.agent.findMany({
    where: { role: 'SUPER_ADMIN', status: { not: 'DELETED' } },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
    take: 1,
  });
  return root?.id ?? fallbackId;
}
