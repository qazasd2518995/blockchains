import bcrypt from 'bcrypt';
import { PrismaClient } from '@prisma/client';
import type { AgentPublic } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { canManageAgent } from '../../../utils/hierarchy.js';
import { writeAudit } from '../audit/audit.service.js';
import { toPublic } from '../agents/agent.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type {
  CreateSubAccountInput,
  ResetSubAccountPasswordInput,
  UpdateSubAccountStatusInput,
} from './subaccount.schema.js';
import type { FastifyRequest } from 'fastify';

const BCRYPT_ROUNDS = 12;
const MAX_SUB_ACCOUNTS_PER_AGENT = 5;

/**
 * 子帳號 = 同層從屬的唯讀員工帳號。
 * level 與 parent 相同（不是下一層）。
 * rebatePercentage / baccaratRebatePercentage = 0（子帳號不分退水）。
 * maxRebatePercentage / maxBaccaratRebatePercentage / marketType 繼承 parent；占成欄位保留但固定 0。
 */
export class SubAccountService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * 解析「當前操作者」想操作的 parentAgent：
   * - SUPER_ADMIN：可帶 parentAgentId 指定任一代理；省略則建立在自己底下
   * - AGENT：一律以自己為 parent，忽略 body.parentAgentId
   * - SUB_ACCOUNT：不允許建立（寫操作已被全域 preHandler 擋住，這裡雙重保險）
   */
  private async resolveParent(
    operator: AdminCurrent,
    requestedParentId: string | undefined,
  ): Promise<{ id: string; username: string; level: number; rebatePercentage: import('@prisma/client').Prisma.Decimal; maxRebatePercentage: import('@prisma/client').Prisma.Decimal; baccaratRebatePercentage: import('@prisma/client').Prisma.Decimal; maxBaccaratRebatePercentage: import('@prisma/client').Prisma.Decimal; marketType: 'D' | 'A'; bettingLimitLevel: string; role: 'SUPER_ADMIN' | 'AGENT' | 'SUB_ACCOUNT'; status: 'ACTIVE' | 'FROZEN' | 'DISABLED' | 'DELETED' }> {
    if (operator.role === 'SUB_ACCOUNT') {
      throw new ApiError('FORBIDDEN', 'Sub-account cannot manage sub-accounts');
    }

    let parentId: string;
    if (operator.role === 'SUPER_ADMIN') {
      parentId = requestedParentId ?? operator.id;
    } else {
      parentId = operator.id;
    }

    const parent = await this.prisma.agent.findUnique({ where: { id: parentId } });
    if (!parent) throw new ApiError('AGENT_NOT_FOUND', 'Parent agent not found');
    if (parent.role === 'SUB_ACCOUNT') {
      throw new ApiError('INVALID_ACTION', 'Cannot attach sub-account to a sub-account');
    }
    if (parent.status !== 'ACTIVE') throw new ApiError('AGENT_FROZEN', 'Parent is not active');

    // operator 必須能管理 parent（SUPER_ADMIN 自動通過；AGENT 只能是自己）
    const ok = await canManageAgent(this.prisma, operator, parent.id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot manage this parent agent');

    return {
      id: parent.id,
      username: parent.username,
      level: parent.level,
      rebatePercentage: parent.rebatePercentage,
      maxRebatePercentage: parent.maxRebatePercentage,
      baccaratRebatePercentage: parent.baccaratRebatePercentage,
      maxBaccaratRebatePercentage: parent.maxBaccaratRebatePercentage,
      marketType: parent.marketType,
      bettingLimitLevel: parent.bettingLimitLevel,
      role: parent.role,
      status: parent.status,
    };
  }

  async list(
    operator: AdminCurrent,
    requestedParentId: string | undefined,
  ): Promise<{ items: AgentPublic[]; parentUsername: string | null }> {
    let parentId: string;
    if (operator.role === 'SUPER_ADMIN') {
      parentId = requestedParentId ?? operator.id;
    } else if (operator.role === 'AGENT') {
      parentId = operator.id;
    } else {
      // SUB_ACCOUNT 看自己所屬代理的兄弟子帳號（list 為讀權限）
      const me = await this.prisma.agent.findUnique({
        where: { id: operator.id },
        select: { parentId: true },
      });
      if (!me?.parentId) return { items: [], parentUsername: null };
      parentId = me.parentId;
    }

    // 權限檢查：非 SUPER_ADMIN 只能查自己管轄範圍
    if (operator.role !== 'SUPER_ADMIN') {
      const ok = await canManageAgent(this.prisma, operator, parentId);
      if (!ok) throw new ApiError('FORBIDDEN', 'Cannot list sub-accounts of this agent');
    }

    const parent = await this.prisma.agent.findUnique({
      where: { id: parentId },
      select: { username: true },
    });

    const rows = await this.prisma.agent.findMany({
      where: {
        parentId,
        role: 'SUB_ACCOUNT',
        status: { not: 'DELETED' },
      },
      orderBy: { createdAt: 'desc' },
    });

    return {
      items: rows.map(toPublic),
      parentUsername: parent?.username ?? null,
    };
  }

  async create(
    operator: AdminCurrent,
    input: CreateSubAccountInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const parent = await this.resolveParent(operator, input.parentAgentId);

    const existingSubAccountCount = await this.prisma.agent.count({
      where: {
        parentId: parent.id,
        role: 'SUB_ACCOUNT',
        status: { not: 'DELETED' },
      },
    });
    if (existingSubAccountCount >= MAX_SUB_ACCOUNTS_PER_AGENT) {
      throw new ApiError(
        'INVALID_ACTION',
        `Each agent can create at most ${MAX_SUB_ACCOUNTS_PER_AGENT} sub-accounts`,
      );
    }

    // username 唯一
    const existing = await this.prisma.agent.findUnique({
      where: { username: input.username },
    });
    if (existing) throw new ApiError('USERNAME_TAKEN', 'Username taken');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

    const created = await this.prisma.agent.create({
      data: {
        username: input.username,
        passwordHash,
        displayName: input.displayName ?? null,
        parentId: parent.id,
        level: parent.level,
        marketType: parent.marketType,
        commissionRate: '0',
        rebateMode: 'NONE',
        rebatePercentage: '0',
        maxRebatePercentage: parent.maxRebatePercentage,
        baccaratRebateMode: 'NONE',
        baccaratRebatePercentage: '0',
        maxBaccaratRebatePercentage: parent.maxBaccaratRebatePercentage,
        bettingLimitLevel: parent.bettingLimitLevel,
        notes: input.notes ?? null,
        role: 'SUB_ACCOUNT',
        status: 'ACTIVE',
      },
    });

    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'subaccount.create',
      targetType: 'agent',
      targetId: created.id,
      newValues: {
        username: created.username,
        parentId: created.parentId,
        level: created.level,
        role: created.role,
      },
      req,
    });

    return toPublic(created);
  }

  async updateStatus(
    operator: AdminCurrent,
    id: string,
    input: UpdateSubAccountStatusInput,
    req?: FastifyRequest,
  ): Promise<AgentPublic> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Sub-account not found');
    if (existing.role !== 'SUB_ACCOUNT') {
      throw new ApiError('INVALID_ACTION', 'Target is not a sub-account');
    }

    // 操作者必須能管 parent（即擁有這個子帳號）
    if (!existing.parentId) throw new ApiError('HIERARCHY_VIOLATION', 'Sub-account has no parent');
    const ok = await canManageAgent(this.prisma, operator, existing.parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot change status of this sub-account');

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
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'subaccount.status.update',
      targetType: 'agent',
      targetId: id,
      oldValues: { status: existing.status },
      newValues: { status: updated.status },
      req,
    });

    return toPublic(updated);
  }

  async resetPassword(
    operator: AdminCurrent,
    id: string,
    input: ResetSubAccountPasswordInput,
    req?: FastifyRequest,
  ): Promise<void> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Sub-account not found');
    if (existing.role !== 'SUB_ACCOUNT') {
      throw new ApiError('INVALID_ACTION', 'Target is not a sub-account');
    }
    if (!existing.parentId) throw new ApiError('HIERARCHY_VIOLATION', 'Sub-account has no parent');
    const ok = await canManageAgent(this.prisma, operator, existing.parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot reset password of this sub-account');

    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.agent.update({ where: { id }, data: { passwordHash } });

    // 撤銷所有 refresh tokens
    await this.prisma.agentRefreshToken.updateMany({
      where: { agentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'subaccount.password.reset',
      targetType: 'agent',
      targetId: id,
      req,
    });
  }

  /**
   * 軟刪除子帳號 — username 加前綴、status=DELETED、frozenAt 借由 refresh token 撤銷。
   */
  async softDelete(
    operator: AdminCurrent,
    id: string,
    req?: FastifyRequest,
  ): Promise<void> {
    const existing = await this.prisma.agent.findUnique({ where: { id } });
    if (!existing) throw new ApiError('AGENT_NOT_FOUND', 'Sub-account not found');
    if (existing.role !== 'SUB_ACCOUNT') {
      throw new ApiError('INVALID_ACTION', 'Target is not a sub-account');
    }
    if (!existing.parentId) throw new ApiError('HIERARCHY_VIOLATION', 'Sub-account has no parent');
    const ok = await canManageAgent(this.prisma, operator, existing.parentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot delete this sub-account');

    const stamp = Date.now().toString(36);
    const deletedUsername = `__del_${stamp}_${existing.username}`.slice(0, 64);

    await this.prisma.agent.update({
      where: { id },
      data: {
        username: deletedUsername,
        status: 'DELETED',
        notes: `[deleted by ${operator.username}] ${existing.notes ?? ''}`.slice(0, 500),
      },
    });

    await this.prisma.agentRefreshToken.updateMany({
      where: { agentId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });

    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'subaccount.delete',
      targetType: 'agent',
      targetId: id,
      oldValues: { username: existing.username, status: existing.status },
      newValues: { username: deletedUsername, status: 'DELETED' },
      req,
    });
  }
}
