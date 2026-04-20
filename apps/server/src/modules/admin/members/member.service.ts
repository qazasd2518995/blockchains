import bcrypt from 'bcrypt';
import { PrismaClient, Prisma } from '@prisma/client';
import type { MemberPublic, MemberBetEntry } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { canManageAgent, canManageMember, listAgentDescendants } from '../../../utils/hierarchy.js';
import { runSerializable } from '../../games/_common/BaseGameService.js';
import { createPlayerSeeds } from '../../auth/player-seeds.js';
import { writeAudit } from '../audit/audit.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type {
  CreateMemberInput,
  UpdateMemberNotesInput,
  UpdateMemberStatusInput,
  AdjustMemberBalanceInput,
  ResetMemberPasswordInput,
  MemberListQuery,
  MemberBetQuery,
} from './member.schema.js';
import type { FastifyRequest } from 'fastify';

const BCRYPT_ROUNDS = 12;

export class MemberService {
  constructor(private readonly prisma: PrismaClient) {}

  async create(
    operator: AdminCurrent,
    input: CreateMemberInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const targetAgent = await this.prisma.agent.findUnique({ where: { id: input.agentId } });
    if (!targetAgent) throw new ApiError('AGENT_NOT_FOUND', 'Target agent not found');
    if (targetAgent.status !== 'ACTIVE') {
      throw new ApiError('AGENT_FROZEN', 'Target agent is not active');
    }
    const ok = await canManageAgent(this.prisma, operator, input.agentId);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot create member under this agent');

    const existing = await this.prisma.user.findUnique({ where: { email: input.email } });
    if (existing) throw new ApiError('EMAIL_TAKEN', 'Email already in use');

    const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
    const initialBalance = input.initialBalance
      ? new Prisma.Decimal(input.initialBalance)
      : new Prisma.Decimal(0);

    const { member, agentAfter } = await runSerializable(this.prisma, async (tx) => {
      let balanceForMember = new Prisma.Decimal(0);
      let agentAfterBalance = targetAgent.balance;

      // 若需從代理餘額扣款
      if (initialBalance.greaterThan(0)) {
        const locked = await tx.agent.findUnique({
          where: { id: targetAgent.id },
          select: { balance: true },
        });
        if (!locked || locked.balance.lessThan(initialBalance)) {
          throw new ApiError('INSUFFICIENT_FUNDS', 'Agent balance insufficient');
        }
        agentAfterBalance = locked.balance.sub(initialBalance);
        await tx.agent.update({
          where: { id: targetAgent.id },
          data: { balance: agentAfterBalance },
        });
        balanceForMember = initialBalance;
      } else if (targetAgent.role === 'SUPER_ADMIN') {
        // super admin 建會員不扣代理餘額，改用 SIGNUP_BONUS 直接給會員
        balanceForMember = new Prisma.Decimal(config.SIGNUP_BONUS);
      }

      const created = await tx.user.create({
        data: {
          email: input.email,
          passwordHash,
          displayName: input.displayName ?? null,
          balance: balanceForMember,
          role: 'PLAYER',
          agentId: targetAgent.id,
          marketType: targetAgent.marketType,
          notes: input.notes ?? null,
        },
      });

      // 初始點數來源：若來自代理，寫 PointTransfer；若來自 SIGNUP_BONUS，寫 Transaction SIGNUP_BONUS
      if (initialBalance.greaterThan(0)) {
        await tx.pointTransfer.create({
          data: {
            type: 'AGENT_TO_MEMBER',
            fromType: 'agent',
            fromId: targetAgent.id,
            toType: 'member',
            toId: created.id,
            amount: initialBalance,
            fromBeforeBalance: targetAgent.balance,
            fromAfterBalance: agentAfterBalance,
            toBeforeBalance: new Prisma.Decimal(0),
            toAfterBalance: balanceForMember,
            description: 'Initial balance from agent',
            operatorId: operator.id,
            operatorType: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
            ipAddress: req?.ip ?? null,
          },
        });
        await tx.transaction.create({
          data: {
            userId: created.id,
            type: 'TRANSFER_IN',
            amount: initialBalance,
            balanceAfter: balanceForMember,
            meta: { from: 'agent', agentId: targetAgent.id, reason: 'Initial balance' },
          },
        });
      } else if (balanceForMember.greaterThan(0)) {
        await tx.transaction.create({
          data: {
            userId: created.id,
            type: 'SIGNUP_BONUS',
            amount: balanceForMember,
            balanceAfter: balanceForMember,
            meta: { reason: 'Member created by super admin' },
          },
        });
      }

      await createPlayerSeeds(tx, created.id);

      return { member: created, agentAfter: agentAfterBalance };
    });

    void agentAfter;

    await writeAudit(this.prisma, {
      actor: {
        id: operator.id,
        type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
        username: operator.username,
      },
      action: 'member.create',
      targetType: 'member',
      targetId: member.id,
      newValues: {
        email: member.email,
        agentId: member.agentId,
        initialBalance: initialBalance.toFixed(2),
      },
      req,
    });

    return toMemberPublic(member, targetAgent.username);
  }

  async list(operator: AdminCurrent, query: MemberListQuery): Promise<{ items: MemberPublic[]; nextCursor: string | null }> {
    const limit = query.limit ?? 50;
    const scopedAgentIds = operator.role === 'SUPER_ADMIN'
      ? null
      : await listAgentDescendants(this.prisma, operator.id);

    const where: Prisma.UserWhereInput = {};
    if (query.agentId) {
      if (scopedAgentIds && !scopedAgentIds.includes(query.agentId)) {
        throw new ApiError('FORBIDDEN', 'Cannot list members of this agent');
      }
      where.agentId = query.agentId;
    } else if (scopedAgentIds) {
      where.agentId = { in: scopedAgentIds };
    }
    if (query.status === 'FROZEN') where.frozenAt = { not: null };
    if (query.status === 'ACTIVE') where.frozenAt = null;
    if (query.keyword) {
      where.OR = [
        { email: { contains: query.keyword, mode: 'insensitive' } },
        { displayName: { contains: query.keyword, mode: 'insensitive' } },
      ];
    }

    const items = await this.prisma.user.findMany({
      where,
      include: { agent: { select: { username: true } } },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = items.length > limit;
    const page = hasMore ? items.slice(0, limit) : items;
    return {
      items: page.map((u) => toMemberPublic(u, u.agent?.username ?? null)),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }

  async getById(operator: AdminCurrent, id: string): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view this member');
    const member = await this.prisma.user.findUnique({
      where: { id },
      include: { agent: { select: { username: true } } },
    });
    if (!member) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    return toMemberPublic(member, member.agent?.username ?? null);
  }

  async updateNotes(
    operator: AdminCurrent,
    id: string,
    input: UpdateMemberNotesInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot update this member');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const updated = await this.prisma.user.update({
      where: { id },
      data: { notes: input.notes },
      include: { agent: { select: { username: true } } },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.notes.update',
      targetType: 'member',
      targetId: id,
      oldValues: { notes: existing.notes },
      newValues: { notes: updated.notes },
      req,
    });
    return toMemberPublic(updated, updated.agent?.username ?? null);
  }

  async updateStatus(
    operator: AdminCurrent,
    id: string,
    input: UpdateMemberStatusInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot freeze this member');
    const existing = await this.prisma.user.findUnique({ where: { id } });
    if (!existing) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
    const frozenAt = input.status === 'FROZEN' ? new Date() : null;
    const updated = await this.prisma.user.update({
      where: { id },
      data: { frozenAt },
      include: { agent: { select: { username: true } } },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: `member.${input.status === 'FROZEN' ? 'freeze' : 'unfreeze'}`,
      targetType: 'member',
      targetId: id,
      oldValues: { frozenAt: existing.frozenAt },
      newValues: { frozenAt: updated.frozenAt },
      req,
    });
    return toMemberPublic(updated, updated.agent?.username ?? null);
  }

  async adjustBalance(
    operator: AdminCurrent,
    id: string,
    input: AdjustMemberBalanceInput,
    req?: FastifyRequest,
  ): Promise<MemberPublic> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot adjust this member');
    const delta = new Prisma.Decimal(input.delta);
    if (delta.isZero()) throw new ApiError('INVALID_TRANSFER', 'delta cannot be zero');

    const result = await runSerializable(this.prisma, async (tx) => {
      const current = await tx.user.findUnique({ where: { id }, select: { balance: true } });
      if (!current) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
      const next = current.balance.add(delta);
      if (next.isNegative()) throw new ApiError('INSUFFICIENT_FUNDS', 'Adjustment would go negative');
      const updated = await tx.user.update({
        where: { id },
        data: { balance: next },
        include: { agent: { select: { username: true } } },
      });
      await tx.transaction.create({
        data: {
          userId: id,
          type: 'ADJUSTMENT',
          amount: delta,
          balanceAfter: next,
          meta: { operatorId: operator.id, description: input.description ?? null },
        },
      });
      return updated;
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.balance.adjust',
      targetType: 'member',
      targetId: id,
      newValues: { delta: delta.toFixed(2), description: input.description ?? null },
      req,
    });

    return toMemberPublic(result, result.agent?.username ?? null);
  }

  async resetPassword(
    operator: AdminCurrent,
    id: string,
    input: ResetMemberPasswordInput,
    req?: FastifyRequest,
  ): Promise<void> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot reset this member');
    const passwordHash = await bcrypt.hash(input.newPassword, BCRYPT_ROUNDS);
    await this.prisma.user.update({ where: { id }, data: { passwordHash } });
    await this.prisma.refreshToken.updateMany({
      where: { userId: id, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'member.password.reset',
      targetType: 'member',
      targetId: id,
      req,
    });
  }

  async getBets(
    operator: AdminCurrent,
    id: string,
    query: MemberBetQuery,
  ): Promise<{ items: MemberBetEntry[]; nextCursor: string | null }> {
    const ok = await canManageMember(this.prisma, operator, id);
    if (!ok) throw new ApiError('FORBIDDEN', 'Cannot view bets of this member');
    const limit = query.limit ?? 50;
    const where: Prisma.BetWhereInput = { userId: id };
    if (query.startDate) where.createdAt = { ...(where.createdAt as object), gte: new Date(query.startDate) };
    if (query.endDate)   where.createdAt = { ...(where.createdAt as object), lte: new Date(query.endDate) };
    if (query.gameId) where.gameId = query.gameId;
    const rows = await this.prisma.bet.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return {
      items: page.map((b) => ({
        id: b.id,
        gameId: b.gameId,
        amount: b.amount.toFixed(2),
        multiplier: b.multiplier.toFixed(4),
        payout: b.payout.toFixed(2),
        profit: b.profit.toFixed(2),
        createdAt: b.createdAt.toISOString(),
      })),
      nextCursor: hasMore ? page[page.length - 1]!.id : null,
    };
  }
}

function toMemberPublic(
  user: {
    id: string;
    email: string;
    displayName: string | null;
    agentId: string | null;
    balance: Prisma.Decimal;
    marketType: 'D' | 'A';
    frozenAt: Date | null;
    notes: string | null;
    createdAt: Date;
  },
  agentUsername: string | null,
): MemberPublic {
  return {
    id: user.id,
    email: user.email,
    displayName: user.displayName,
    agentId: user.agentId,
    agentUsername,
    balance: user.balance.toFixed(2),
    marketType: user.marketType,
    status: user.frozenAt ? 'FROZEN' : 'ACTIVE',
    frozenAt: user.frozenAt?.toISOString() ?? null,
    notes: user.notes,
    lastLoginAt: null,
    createdAt: user.createdAt.toISOString(),
  };
}
