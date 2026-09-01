import { randomBytes } from 'node:crypto';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
import { ApiError } from '../../../utils/errors.js';
import {
  isAgentInControlExcludedLine,
  listAgentDescendants,
  listControlIncludedAgentIds,
} from '../../../utils/hierarchy.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';

type Db = PrismaClient | Prisma.TransactionClient;

export interface ControlAccessContext {
  allowed: boolean;
  role: 'central' | 'delegated' | 'none';
  zoneRootAgentId: string | null;
}

export function resolveControlAccessContext(
  operator: Pick<AdminCurrent, 'id' | 'role' | 'canManageControlZone'>,
): ControlAccessContext {
  if (operator.role === 'SUPER_ADMIN') {
    return { allowed: true, role: 'central', zoneRootAgentId: null };
  }
  if (operator.role === 'AGENT' && operator.canManageControlZone === true) {
    return { allowed: true, role: 'delegated', zoneRootAgentId: operator.id };
  }
  return { allowed: false, role: 'none', zoneRootAgentId: null };
}

export function requireControlAccessContext(operator: AdminCurrent): ControlAccessContext {
  const context = resolveControlAccessContext(operator);
  if (!context.allowed) {
    throw new ApiError('FORBIDDEN', 'Control-zone permission required');
  }
  return context;
}

export async function resolveDelegatedControlZoneForAgent(
  db: Db,
  agentId: string | null,
): Promise<string | null> {
  if (!agentId) return null;
  const queryRaw = db.$queryRaw?.bind(db);
  if (!queryRaw) return null;
  const rows = await queryRaw<{ id: string }[]>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId", "canManageControlZone", 0 AS depth
      FROM "Agent"
      WHERE id = ${agentId}
      UNION ALL
      SELECT a.id, a."parentId", a."canManageControlZone", ancestors.depth + 1
      FROM "Agent" a
      JOIN ancestors ON ancestors."parentId" = a.id
    )
    SELECT id
    FROM ancestors
    WHERE "canManageControlZone" = true
    ORDER BY depth ASC
    LIMIT 1
  `);
  return rows[0]?.id ?? null;
}

export async function listAccessibleControlAgentIds(
  db: Db,
  context: ControlAccessContext,
): Promise<string[]> {
  if (!context.allowed) return [];
  if (context.role === 'delegated' && context.zoneRootAgentId) {
    return listAgentDescendants(db, context.zoneRootAgentId);
  }

  const includedIds = await listControlIncludedAgentIds(db);
  const delegatedRoots = await db.agent.findMany({
    where: { canManageControlZone: true, role: 'AGENT', status: { not: 'DELETED' } },
    select: { id: true },
  });
  if (delegatedRoots.length === 0) return includedIds;

  const delegatedIds = new Set<string>();
  for (const root of delegatedRoots) {
    for (const id of await listAgentDescendants(db, root.id)) delegatedIds.add(id);
  }
  return includedIds.filter((id) => !delegatedIds.has(id));
}

export async function requireAccessibleControlAgent(
  db: Db,
  context: ControlAccessContext,
  agentId: string | null | undefined,
) {
  if (!agentId) throw new ApiError('INVALID_ACTION', 'Control target agent is required');
  const accessibleIds = await listAccessibleControlAgentIds(db, context);
  if (!accessibleIds.includes(agentId)) {
    throw new ApiError('FORBIDDEN', 'Cannot control an agent outside this control zone');
  }
  const agent = await db.agent.findUnique({
    where: { id: agentId },
    select: { id: true, username: true, role: true, status: true },
  });
  if (!agent || agent.role === 'SUB_ACCOUNT' || agent.status === 'DELETED') {
    throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
  }
  return agent;
}

export async function requireAccessibleControlMember(
  db: Db,
  context: ControlAccessContext,
  memberId: string | null | undefined,
) {
  if (!memberId) throw new ApiError('INVALID_ACTION', 'Control target member is required');
  const member = await db.user.findUnique({
    where: { id: memberId },
    select: {
      id: true,
      username: true,
      role: true,
      disabledAt: true,
      agentId: true,
      balance: true,
    },
  });
  if (!member || member.role !== 'PLAYER' || member.disabledAt || !member.agentId) {
    throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
  }
  const accessibleIds = await listAccessibleControlAgentIds(db, context);
  if (!accessibleIds.includes(member.agentId)) {
    throw new ApiError('FORBIDDEN', 'Cannot control a member outside this control zone');
  }
  return member;
}

export async function grantControlZone(
  prisma: PrismaClient,
  operator: AdminCurrent,
  targetAgentId: string,
) {
  if (operator.role !== 'SUPER_ADMIN') {
    throw new ApiError('FORBIDDEN', 'Only the super admin can delegate control zones');
  }
  const target = await prisma.agent.findUnique({
    where: { id: targetAgentId },
    select: {
      id: true,
      username: true,
      role: true,
      status: true,
      canManageControlZone: true,
    },
  });
  if (!target || target.role !== 'AGENT' || target.status !== 'ACTIVE') {
    throw new ApiError(
      'INVALID_ACTION',
      'Control can only be delegated to an active agent account',
    );
  }
  if (target.canManageControlZone) {
    throw new ApiError('INVALID_ACTION', 'This agent already owns a delegated control zone');
  }
  if (await isAgentInControlExcludedLine(prisma, target.id)) {
    throw new ApiError(
      'INVALID_ACTION',
      'A settlement-excluded line cannot receive control rights',
    );
  }

  const descendants = await listAgentDescendants(prisma, target.id);
  const ancestors = await prisma.$queryRaw<{ id: string }[]>(Prisma.sql`
    WITH RECURSIVE ancestors AS (
      SELECT id, "parentId" FROM "Agent" WHERE id = ${target.id}
      UNION ALL
      SELECT a.id, a."parentId"
      FROM "Agent" a
      JOIN ancestors ON ancestors."parentId" = a.id
    )
    SELECT id FROM ancestors
  `);
  const overlapIds = Array.from(new Set([...descendants, ...ancestors.map((row) => row.id)]));
  const overlap = await prisma.agent.findFirst({
    where: { id: { in: overlapIds }, canManageControlZone: true },
    select: { username: true },
  });
  if (overlap) {
    throw new ApiError(
      'INVALID_ACTION',
      `Control zones cannot overlap; ${overlap.username} already owns this branch`,
    );
  }

  return prisma.agent.update({
    where: { id: target.id },
    data: {
      canManageControlZone: true,
      controlZoneGrantedBy: operator.id,
      controlZoneGrantedAt: new Date(),
    },
    select: {
      id: true,
      username: true,
      canManageControlZone: true,
      controlZoneGrantedAt: true,
    },
  });
}

export async function revokeControlZone(
  prisma: PrismaClient,
  operator: AdminCurrent,
  targetAgentId: string,
) {
  if (operator.role !== 'SUPER_ADMIN') {
    throw new ApiError('FORBIDDEN', 'Only the super admin can revoke control zones');
  }
  const target = await prisma.agent.findUnique({
    where: { id: targetAgentId },
    select: { id: true, username: true, role: true, canManageControlZone: true },
  });
  if (!target || target.role !== 'AGENT' || !target.canManageControlZone) {
    throw new ApiError('INVALID_ACTION', 'This agent does not own a delegated control zone');
  }

  await prisma.$transaction(async (tx) => {
    await tx.winLossControl.updateMany({
      where: { controlZoneRootAgentId: target.id, isActive: true },
      data: { isActive: false },
    });
    await tx.agent.update({
      where: { id: target.id },
      data: {
        canManageControlZone: false,
        controlZoneGrantedBy: null,
        controlZoneGrantedAt: null,
        activeSessionId: `revoked:${randomBytes(18).toString('hex')}`,
        activeSessionAt: new Date(),
      },
    });
    await tx.agentRefreshToken.updateMany({
      where: { agentId: target.id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  });

  return { id: target.id, username: target.username, canManageControlZone: false };
}
