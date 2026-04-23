import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { AgentPublic, AgentTreeNode } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { canManageAgent } from '../../../utils/hierarchy.js';
import { writeAudit } from '../audit/audit.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type {
  CreateAgentInput,
  UpdateAgentInput,
  UpdateAgentRebateInput,
  UpdateAgentStatusInput,
  ResetPasswordInput,
  UpdateBettingLimitInput,
} from './agent.schema.js';
import type { FastifyRequest } from 'fastify';

const BCRYPT_ROUNDS = 12;

/**
 * 平台退水硬上限（電子系列） — 2.5%（fraction 表示：0.025）。
 * 任何代理／子代理的 rebatePercentage 都不得超過此值，
 * 即使其上級設定得更高，仍會在此 cap 住。
 */
const PLATFORM_REBATE_CAP = new Prisma.Decimal('0.025');
type RebateMode = 'PERCENTAGE' | 'ALL' | 'NONE';
type RebateCarrier = {
  rebateMode: RebateMode;
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
};

function clampRebateToPlatform(value: Prisma.Decimal): Prisma.Decimal {
  if (value.lessThan(0)) return new Prisma.Decimal(0);
  return value.greaterThan(PLATFORM_REBATE_CAP) ? PLATFORM_REBATE_CAP : value;
}

function effectiveDownlineRebate(agent: RebateCarrier): Prisma.Decimal {
  if (agent.rebateMode === 'ALL') return new Prisma.Decimal(0);
  if (agent.rebateMode === 'NONE') return clampRebateToPlatform(agent.maxRebatePercentage);
  return clampRebateToPlatform(agent.rebatePercentage);
}

function normalizeRebateForMode(
  mode: RebateMode,
  requestedPct: string | undefined,
  maxAllowed: Prisma.Decimal,
): Prisma.Decimal {
  if (mode === 'ALL') return new Prisma.Decimal(0);
  if (mode === 'NONE') return maxAllowed;
  return new Prisma.Decimal(requestedPct ?? '0');
}

function assertRebateWithinBounds(rebatePct: Prisma.Decimal, maxAllowed: Prisma.Decimal): void {
  if (rebatePct.lessThan(0)) {
    throw new ApiError('REBATE_VIOLATION', 'rebatePercentage cannot be negative');
  }
  if (rebatePct.greaterThan(maxAllowed)) {
    throw new ApiError('REBATE_VIOLATION', 'rebatePercentage exceeds parent');
  }
  if (rebatePct.greaterThan(PLATFORM_REBATE_CAP)) {
    throw new ApiError(
      'REBATE_VIOLATION',
      `rebatePercentage exceeds platform cap ${PLATFORM_REBATE_CAP.mul(100).toFixed(2)}%`,
    );
  }
}

export class AgentService {
  constructor(private readonly prisma: PrismaClient) {}

  async listDirectChildren(parentId: string): Promise<AgentPublic[]> {
    const rows = await this.prisma.agent.findMany({
      where: { parentId, status: { not: 'DELETED' } },
      orderBy: { createdAt: 'desc' },
    });
    return rows.map(toPublic);
  }

  async getById(operator: AdminCurrent, id: string): Promise<AgentPublic> {
    const agent = await this.prisma.agent.findUnique({ where: { id } });
    if (!agent) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot access this agent');
    return toPublic(agent);
  }

  async getTree(rootId: string): Promise<AgentTreeNode> {
    const all = await this.prisma.agent.findMany({
      where: { status: { not: 'DELETED' } },
      orderBy: { level: 'asc' },
    });
    const memberCounts = await this.prisma.user.groupBy({
      by: ['agentId'],
      _count: { _all: true },
    });
    const memberMap = new Map<string, number>(
      memberCounts.map((m) => [m.agentId ?? '', m._count._all]),
    );
    const byParent = new Map<string | null, typeof all>();
    for (const a of all) {
      const key = a.parentId ?? null;
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(a);
    }
    const build = (node: (typeof all)[number]): AgentTreeNode => {
      const children = (byParent.get(node.id) ?? []).map(build);
      return {
        ...toPublic(node),
        childCount: children.length,
        memberCount: memberMap.get(node.id) ?? 0,
        children,
      };
    };
    const root = all.find((a) => a.id === rootId);
    if (!root) throw new ApiError('AGENT_NOT_FOUND', 'Root agent not found');
    return build(root);
  }

  async create(
    operator: AdminCurrent,
    input: CreateAgentInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const parent = await this.prisma.agent.findUnique({ where: { id: input.parentId } });
    if (!parent) throw new ApiError('AGENT_NOT_FOUND', 'Parent agent not found');
    if (parent.status !== 'ACTIVE') throw new ApiError('AGENT_FROZEN', 'Parent is not active');

    // operator 必須能管理 parent
    const ok = await canManageAgent(this.prisma, operator, parent.id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot create agent under this parent');

    // level 必須是 parent.level + 1
    if (input.level !== parent.level + 1) {
      throw new ApiError('HIERARCHY_VIOLATION', `level must be ${parent.level + 1}`);
    }

    const rebateMode = input.rebateMode ?? 'PERCENTAGE';
    const maxAllowed = effectiveDownlineRebate(parent);
    const rebatePct = normalizeRebateForMode(rebateMode, input.rebatePercentage, maxAllowed);
    assertRebateWithinBounds(rebatePct, maxAllowed);
    // 平台目前不啟用占成機制，保留 DB 欄位但固定為 0。
    const commissionRate = new Prisma.Decimal(0);

    // username 唯一
    const existing = await this.prisma.agent.findUnique({ where: { username: input.username } });
    if (existing) throw new ApiError('USERNAME_TAKEN', 'Username taken');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const created = await this.prisma.agent.create({
      data: {
        username: input.username,
        passwordHash,
        displayName: input.displayName ?? null,
        parentId: parent.id,
        level: input.level,
        marketType: input.marketType ?? parent.marketType,
        commissionRate,
        rebateMode,
        rebatePercentage: rebatePct,
        maxRebatePercentage: maxAllowed,
        bettingLimitLevel: input.bettingLimitLevel ?? parent.bettingLimitLevel,
        notes: input.notes ?? null,
        role: 'AGENT',
        status: 'ACTIVE',
      },
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.create',
      targetType: 'agent',
      targetId: created.id,
      newValues: { username: created.username, level: created.level, parentId: created.parentId },
      req,
    });

    return toPublic(created);
  }

  async update(
    operator: AdminCurrent,
    id: string,
    input: UpdateAgentInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot update this agent');

    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
        ...(input.notes !== undefined ? { notes: input.notes } : {}),
      },
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.update',
      targetType: 'agent',
      targetId: id,
      oldValues: { displayName: existing.displayName, notes: existing.notes },
      newValues: { displayName: updated.displayName, notes: updated.notes },
      req,
    });
    return toPublic(updated);
  }

  async updateRebate(
    operator: AdminCurrent,
    id: string,
    input: UpdateAgentRebateInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const existing = await this.prisma.agent.findUnique({ where: { id }, include: { parent: true } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot modify rebate');
    const maxAllowed = existing.parent
      ? effectiveDownlineRebate(existing.parent)
      : clampRebateToPlatform(existing.maxRebatePercentage);
    const newPct = normalizeRebateForMode(input.rebateMode, input.rebatePercentage, maxAllowed);
    assertRebateWithinBounds(newPct, maxAllowed);

    const newEffectiveDownlineRebate = effectiveDownlineRebate({
      rebateMode: input.rebateMode,
      rebatePercentage: newPct,
      maxRebatePercentage: maxAllowed,
    });
    const directChildren = await this.prisma.agent.findMany({
      where: { parentId: id, status: { not: 'DELETED' } },
      select: {
        id: true,
        username: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
      },
    });
    const blockingChild = directChildren.find((child) =>
      effectiveDownlineRebate(child).greaterThan(newEffectiveDownlineRebate),
    );
    if (blockingChild) {
      throw new ApiError(
        'REBATE_VIOLATION',
        `下级代理 ${blockingChild.username} 的退水高于本级新设定，请先调低下级退水`,
      );
    }
    const updated = await this.prisma.agent.update({
      where: { id },
      data: { rebateMode: input.rebateMode, rebatePercentage: newPct, maxRebatePercentage: maxAllowed },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.rebate.update',
      targetType: 'agent',
      targetId: id,
      oldValues: { rebateMode: existing.rebateMode, rebatePercentage: existing.rebatePercentage.toFixed(4) },
      newValues: { rebateMode: updated.rebateMode, rebatePercentage: updated.rebatePercentage.toFixed(4) },
      req,
    });
    return toPublic(updated);
  }

  async updateStatus(
    operator: AdminCurrent,
    id: string,
    input: UpdateAgentStatusInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot change status');
    if (existing.role === 'SUPER_ADMIN' && input.status !== 'ACTIVE') {
      throw new ApiError('FORBIDDEN', 'Cannot freeze super admin');
    }
    const updated = await this.prisma.agent.update({
      where: { id },
      data: { status: input.status },
    });
    if (input.status === 'DISABLED') {
      await this.prisma.agentRefreshToken.updateMany({
        where: { agentId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.status.update',
      targetType: 'agent',
      targetId: id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status },
      req,
    });
    return toPublic(updated);
  }

  async updateBettingLimit(
    operator: AdminCurrent,
    id: string,
    input: UpdateBettingLimitInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot modify betting limit');
    const updated = await this.prisma.agent.update({
      where: { id },
      data: { bettingLimitLevel: input.bettingLimitLevel },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.betting_limit.update',
      targetType: 'agent',
      targetId: id,
      oldValues: { bettingLimitLevel: existing.bettingLimitLevel },
      newValues: { bettingLimitLevel: updated.bettingLimitLevel },
      req,
    });
    return toPublic(updated);
  }

  async resetPassword(
    operator: AdminCurrent,
    id: string,
    input: ResetPasswordInput,
    req?: FastifyRequest,
  ): Promise<void> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
    const ok = await canManageAgent(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot reset password');
    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.agent.update({ where: { id }, data: { passwordHash } });
    // 撤銷所有 refresh tokens
    await this.prisma.agentRefreshToken.updateMany({
      where: { agentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.password.reset',
      targetType: 'agent',
      targetId: id,
      req,
    });
  }
}

export function toPublic(agent: {
  id: string;
  username: string;
  displayName: string | null;
  parentId: string | null;
  level: number;
  marketType: 'D' | 'A';
  balance: Prisma.Decimal;
  commissionBalance: Prisma.Decimal;
  commissionRate: Prisma.Decimal;
  rebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  rebatePercentage: Prisma.Decimal;
  maxRebatePercentage: Prisma.Decimal;
  bettingLimitLevel: string;
  status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED';
  role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT';
  notes: string | null;
  lastLoginAt: Date | null;
  createdAt: Date;
}): AgentPublic {
  return {
    id: agent.id,
    username: agent.username,
    displayName: agent.displayName,
    parentId: agent.parentId,
    level: agent.level,
    marketType: agent.marketType,
    balance: agent.balance.toFixed(2),
    commissionBalance: agent.commissionBalance.toFixed(2),
    commissionRate: agent.commissionRate.toFixed(4),
    rebateMode: agent.rebateMode,
    rebatePercentage: agent.rebatePercentage.toFixed(4),
    maxRebatePercentage: agent.maxRebatePercentage.toFixed(4),
    bettingLimitLevel: agent.bettingLimitLevel,
    status: agent.status,
    role: agent.role,
    notes: agent.notes,
    lastLoginAt: agent.lastLoginAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
  };
}
