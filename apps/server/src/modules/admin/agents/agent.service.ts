import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { AgentPublic, AgentTreeNode } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { canManageAgent } from '../../../utils/hierarchy.js';
import { writeAudit } from '../audit/audit.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import {
  type RebateCategory,
  type DualRebateProfile,
  assertRebateWithinBounds,
  clampRebateToPlatform,
  effectiveDownlineRebate,
  normalizeRebateForMode,
} from '../rebate.js';
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
    const maxAllowed = effectiveDownlineRebate(parent, 'electronic');
    const rebatePct = normalizeRebateForMode(rebateMode, input.rebatePercentage, maxAllowed);
    this.assertRebateBoundsOrThrow(rebatePct, maxAllowed, 'electronic');

    const baccaratRebateMode = input.baccaratRebateMode ?? rebateMode;
    const baccaratMaxAllowed = effectiveDownlineRebate(parent, 'baccarat');
    const baccaratRebatePct = normalizeRebateForMode(
      baccaratRebateMode,
      input.baccaratRebatePercentage ?? input.rebatePercentage,
      baccaratMaxAllowed,
    );
    this.assertRebateBoundsOrThrow(baccaratRebatePct, baccaratMaxAllowed, 'baccarat');
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
        baccaratRebateMode,
        baccaratRebatePercentage: baccaratRebatePct,
        maxBaccaratRebatePercentage: baccaratMaxAllowed,
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
    const nextElectronicMode = input.rebateMode ?? existing.rebateMode;
    const maxAllowed = existing.parent
      ? effectiveDownlineRebate(existing.parent, 'electronic')
      : clampRebateToPlatform(existing.maxRebatePercentage, 'electronic');
    const newPct = normalizeRebateForMode(
      nextElectronicMode,
      input.rebatePercentage ?? existing.rebatePercentage.toFixed(4),
      maxAllowed,
    );
    this.assertRebateBoundsOrThrow(newPct, maxAllowed, 'electronic');

    const nextBaccaratMode = input.baccaratRebateMode ?? existing.baccaratRebateMode;
    const baccaratMaxAllowed = existing.parent
      ? effectiveDownlineRebate(existing.parent, 'baccarat')
      : clampRebateToPlatform(existing.maxBaccaratRebatePercentage, 'baccarat');
    const newBaccaratPct = normalizeRebateForMode(
      nextBaccaratMode,
      input.baccaratRebatePercentage ?? existing.baccaratRebatePercentage.toFixed(4),
      baccaratMaxAllowed,
    );
    this.assertRebateBoundsOrThrow(newBaccaratPct, baccaratMaxAllowed, 'baccarat');

    const nextProfile: DualRebateProfile = {
      rebateMode: nextElectronicMode,
      rebatePercentage: newPct,
      maxRebatePercentage: maxAllowed,
      baccaratRebateMode: nextBaccaratMode,
      baccaratRebatePercentage: newBaccaratPct,
      maxBaccaratRebatePercentage: baccaratMaxAllowed,
    };
    const newEffectiveDownlineRebate = effectiveDownlineRebate(nextProfile, 'electronic');
    const newEffectiveBaccaratRebate = effectiveDownlineRebate(nextProfile, 'baccarat');
    const directChildren = await this.prisma.agent.findMany({
      where: { parentId: id, status: { not: 'DELETED' } },
      select: {
        id: true,
        username: true,
        rebateMode: true,
        rebatePercentage: true,
        maxRebatePercentage: true,
        baccaratRebateMode: true,
        baccaratRebatePercentage: true,
        maxBaccaratRebatePercentage: true,
      },
    });
    const blockingElectronicChild = directChildren.find((child) =>
      effectiveDownlineRebate(child, 'electronic').greaterThan(newEffectiveDownlineRebate),
    );
    if (blockingElectronicChild) {
      throw new ApiError(
        'REBATE_VIOLATION',
        `下级代理 ${blockingElectronicChild.username} 的电子退水高于本级新设定，请先调低下级退水`,
      );
    }
    const blockingBaccaratChild = directChildren.find((child) =>
      effectiveDownlineRebate(child, 'baccarat').greaterThan(newEffectiveBaccaratRebate),
    );
    if (blockingBaccaratChild) {
      throw new ApiError(
        'REBATE_VIOLATION',
        `下级代理 ${blockingBaccaratChild.username} 的百家乐退水高于本级新设定，请先调低下级退水`,
      );
    }
    const updated = await this.prisma.agent.update({
      where: { id },
      data: {
        rebateMode: nextElectronicMode,
        rebatePercentage: newPct,
        maxRebatePercentage: maxAllowed,
        baccaratRebateMode: nextBaccaratMode,
        baccaratRebatePercentage: newBaccaratPct,
        maxBaccaratRebatePercentage: baccaratMaxAllowed,
      },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'agent.rebate.update',
      targetType: 'agent',
      targetId: id,
      oldValues: {
        rebateMode: existing.rebateMode,
        rebatePercentage: existing.rebatePercentage.toFixed(4),
        baccaratRebateMode: existing.baccaratRebateMode,
        baccaratRebatePercentage: existing.baccaratRebatePercentage.toFixed(4),
      },
      newValues: {
        rebateMode: updated.rebateMode,
        rebatePercentage: updated.rebatePercentage.toFixed(4),
        baccaratRebateMode: updated.baccaratRebateMode,
        baccaratRebatePercentage: updated.baccaratRebatePercentage.toFixed(4),
      },
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

  private assertRebateBoundsOrThrow(
    rebatePct: Prisma.Decimal,
    maxAllowed: Prisma.Decimal,
    category: RebateCategory,
  ): void {
    try {
      assertRebateWithinBounds(rebatePct, maxAllowed, category);
    } catch (error) {
      throw new ApiError('REBATE_VIOLATION', error instanceof Error ? error.message : 'Invalid rebate');
    }
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
  baccaratRebateMode: 'PERCENTAGE' | 'ALL' | 'NONE';
  baccaratRebatePercentage: Prisma.Decimal;
  maxBaccaratRebatePercentage: Prisma.Decimal;
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
    baccaratRebateMode: agent.baccaratRebateMode,
    baccaratRebatePercentage: agent.baccaratRebatePercentage.toFixed(4),
    maxBaccaratRebatePercentage: agent.maxBaccaratRebatePercentage.toFixed(4),
    bettingLimitLevel: agent.bettingLimitLevel,
    status: agent.status,
    role: agent.role,
    notes: agent.notes,
    lastLoginAt: agent.lastLoginAt?.toISOString() ?? null,
    createdAt: agent.createdAt.toISOString(),
  };
}
