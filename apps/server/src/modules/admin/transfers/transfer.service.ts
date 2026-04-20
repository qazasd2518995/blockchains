import { PrismaClient, Prisma } from '@prisma/client';
import type { TransferEntry } from '@bg/shared';
import { ApiError } from '../../../utils/errors.js';
import { canManageAgent, canManageMember } from '../../../utils/hierarchy.js';
import { runSerializable } from '../../games/_common/BaseGameService.js';
import { writeAudit } from '../audit/audit.service.js';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import type {
  AgentToAgentInput,
  AgentToMemberInput,
  CsTransferInput,
  TransferListQuery,
} from './transfer.schema.js';
import type { FastifyRequest } from 'fastify';

export class TransferService {
  constructor(private readonly prisma: PrismaClient) {}

  async agentToAgent(
    operator: AdminCurrent,
    input: AgentToAgentInput,
    req?: FastifyRequest,
  ): Promise<TransferEntry> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.lessThanOrEqualTo(0)) throw new ApiError('INVALID_TRANSFER', 'amount must be > 0');
    if (input.fromId === input.toId) throw new ApiError('INVALID_TRANSFER', 'from == to');

    const [canFrom, canTo] = await Promise.all([
      canManageAgent(this.prisma, operator, input.fromId),
      canManageAgent(this.prisma, operator, input.toId),
    ]);
    if (!canFrom || !canTo) throw new ApiError('FORBIDDEN', 'Cannot transfer between these agents');

    const result = await runSerializable(this.prisma, async (tx) => {
      const from = await tx.agent.findUnique({ where: { id: input.fromId } });
      const to = await tx.agent.findUnique({ where: { id: input.toId } });
      if (!from || !to) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
      if (from.balance.lessThan(amount)) throw new ApiError('INSUFFICIENT_FUNDS', 'From agent insufficient');

      const fromAfter = from.balance.sub(amount);
      const toAfter = to.balance.add(amount);
      await tx.agent.update({ where: { id: from.id }, data: { balance: fromAfter } });
      await tx.agent.update({ where: { id: to.id }, data: { balance: toAfter } });
      const transfer = await tx.pointTransfer.create({
        data: {
          type: 'AGENT_TO_AGENT',
          fromType: 'agent',
          fromId: from.id,
          toType: 'agent',
          toId: to.id,
          amount,
          fromBeforeBalance: from.balance,
          fromAfterBalance: fromAfter,
          toBeforeBalance: to.balance,
          toAfterBalance: toAfter,
          description: input.description ?? null,
          operatorId: operator.id,
          operatorType: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
          ipAddress: req?.ip ?? null,
        },
      });
      return transfer;
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: 'transfer.agent_to_agent',
      targetType: 'transfer',
      targetId: result.id,
      newValues: { fromId: input.fromId, toId: input.toId, amount: amount.toFixed(2) },
      req,
    });
    return toEntry(result);
  }

  async agentToMember(
    operator: AdminCurrent,
    input: AgentToMemberInput,
    req?: FastifyRequest,
  ): Promise<TransferEntry> {
    const amount = new Prisma.Decimal(input.amount);
    if (amount.isZero()) throw new ApiError('INVALID_TRANSFER', 'amount cannot be zero');

    const [canAg, canMem] = await Promise.all([
      canManageAgent(this.prisma, operator, input.agentId),
      canManageMember(this.prisma, operator, input.memberId),
    ]);
    if (!canAg || !canMem) throw new ApiError('FORBIDDEN', 'Cannot transfer between these accounts');

    const result = await runSerializable(this.prisma, async (tx) => {
      const agent = await tx.agent.findUnique({ where: { id: input.agentId } });
      const member = await tx.user.findUnique({ where: { id: input.memberId } });
      if (!agent || !member) throw new ApiError('AGENT_NOT_FOUND', 'Agent or member not found');
      if (member.agentId !== agent.id) throw new ApiError('FORBIDDEN', 'Member does not belong to this agent');

      const isDeposit = amount.greaterThan(0);    // 代理→會員
      const absAmount = amount.abs();

      if (isDeposit && agent.balance.lessThan(absAmount)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Agent balance insufficient');
      }
      if (!isDeposit && member.balance.lessThan(absAmount)) {
        throw new ApiError('INSUFFICIENT_FUNDS', 'Member balance insufficient');
      }

      const agentAfter = isDeposit ? agent.balance.sub(absAmount) : agent.balance.add(absAmount);
      const memberAfter = isDeposit ? member.balance.add(absAmount) : member.balance.sub(absAmount);

      await tx.agent.update({ where: { id: agent.id }, data: { balance: agentAfter } });
      await tx.user.update({ where: { id: member.id }, data: { balance: memberAfter } });

      const transfer = await tx.pointTransfer.create({
        data: {
          type: isDeposit ? 'AGENT_TO_MEMBER' : 'MEMBER_TO_AGENT',
          fromType: isDeposit ? 'agent' : 'member',
          fromId: isDeposit ? agent.id : member.id,
          toType: isDeposit ? 'member' : 'agent',
          toId: isDeposit ? member.id : agent.id,
          amount: absAmount,
          fromBeforeBalance: isDeposit ? agent.balance : member.balance,
          fromAfterBalance: isDeposit ? agentAfter : memberAfter,
          toBeforeBalance: isDeposit ? member.balance : agent.balance,
          toAfterBalance: isDeposit ? memberAfter : agentAfter,
          description: input.description ?? null,
          operatorId: operator.id,
          operatorType: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
          ipAddress: req?.ip ?? null,
        },
      });

      await tx.transaction.create({
        data: {
          userId: member.id,
          type: isDeposit ? 'TRANSFER_IN' : 'TRANSFER_OUT',
          amount: isDeposit ? absAmount : absAmount.neg(),
          balanceAfter: memberAfter,
          meta: { from: 'agent', agentId: agent.id, operatorId: operator.id },
        },
      });
      return transfer;
    });

    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent', username: operator.username },
      action: amount.greaterThan(0) ? 'transfer.agent_to_member' : 'transfer.member_to_agent',
      targetType: 'transfer',
      targetId: result.id,
      newValues: { agentId: input.agentId, memberId: input.memberId, amount: input.amount },
      req,
    });
    return toEntry(result);
  }

  async csAgent(operator: AdminCurrent, input: CsTransferInput, req?: FastifyRequest): Promise<TransferEntry> {
    if (operator.role !== 'SUPER_ADMIN') throw new ApiError('FORBIDDEN', 'CS transfer requires super admin');
    const amount = new Prisma.Decimal(input.amount);
    if (amount.isZero()) throw new ApiError('INVALID_TRANSFER', 'amount cannot be zero');

    const result = await runSerializable(this.prisma, async (tx) => {
      const agent = await tx.agent.findUnique({ where: { id: input.targetId } });
      if (!agent) throw new ApiError('AGENT_NOT_FOUND', 'Agent not found');
      const after = agent.balance.add(amount);
      if (after.isNegative()) throw new ApiError('INSUFFICIENT_FUNDS', 'Would go negative');
      await tx.agent.update({ where: { id: agent.id }, data: { balance: after } });
      const transfer = await tx.pointTransfer.create({
        data: {
          type: 'CS_AGENT_TRANSFER',
          fromType: 'cs',
          fromId: operator.id,
          toType: 'agent',
          toId: agent.id,
          amount: amount.abs(),
          fromBeforeBalance: new Prisma.Decimal(0),
          fromAfterBalance: new Prisma.Decimal(0),
          toBeforeBalance: agent.balance,
          toAfterBalance: after,
          description: input.description ?? null,
          operatorId: operator.id,
          operatorType: 'super_admin',
          ipAddress: req?.ip ?? null,
        },
      });
      return transfer;
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: 'super_admin', username: operator.username },
      action: 'transfer.cs_agent',
      targetType: 'transfer',
      targetId: result.id,
      newValues: { targetId: input.targetId, amount: input.amount },
      req,
    });
    return toEntry(result);
  }

  async csMember(operator: AdminCurrent, input: CsTransferInput, req?: FastifyRequest): Promise<TransferEntry> {
    if (operator.role !== 'SUPER_ADMIN') throw new ApiError('FORBIDDEN', 'CS transfer requires super admin');
    const amount = new Prisma.Decimal(input.amount);
    if (amount.isZero()) throw new ApiError('INVALID_TRANSFER', 'amount cannot be zero');

    const result = await runSerializable(this.prisma, async (tx) => {
      const member = await tx.user.findUnique({ where: { id: input.targetId } });
      if (!member) throw new ApiError('MEMBER_NOT_FOUND', 'Member not found');
      const after = member.balance.add(amount);
      if (after.isNegative()) throw new ApiError('INSUFFICIENT_FUNDS', 'Would go negative');
      await tx.user.update({ where: { id: member.id }, data: { balance: after } });
      const transfer = await tx.pointTransfer.create({
        data: {
          type: 'CS_MEMBER_TRANSFER',
          fromType: 'cs',
          fromId: operator.id,
          toType: 'member',
          toId: member.id,
          amount: amount.abs(),
          fromBeforeBalance: new Prisma.Decimal(0),
          fromAfterBalance: new Prisma.Decimal(0),
          toBeforeBalance: member.balance,
          toAfterBalance: after,
          description: input.description ?? null,
          operatorId: operator.id,
          operatorType: 'super_admin',
          ipAddress: req?.ip ?? null,
        },
      });
      await tx.transaction.create({
        data: {
          userId: member.id,
          type: amount.greaterThan(0) ? 'TRANSFER_IN' : 'TRANSFER_OUT',
          amount,
          balanceAfter: after,
          meta: { from: 'cs', operatorId: operator.id },
        },
      });
      return transfer;
    });
    await writeAudit(this.prisma, {
      actor: { id: operator.id, type: 'super_admin', username: operator.username },
      action: 'transfer.cs_member',
      targetType: 'transfer',
      targetId: result.id,
      newValues: { targetId: input.targetId, amount: input.amount },
      req,
    });
    return toEntry(result);
  }

  async list(operator: AdminCurrent, query: TransferListQuery): Promise<{ items: TransferEntry[]; nextCursor: string | null }> {
    const limit = query.limit ?? 50;
    const where: Prisma.PointTransferWhereInput = {};
    if (query.fromId) where.fromId = query.fromId;
    if (query.toId) where.toId = query.toId;
    if (query.type) where.type = query.type as Prisma.PointTransferWhereInput['type'];

    // 非 super 限定 operator 自己是 operator 的轉帳
    if (operator.role !== 'SUPER_ADMIN') {
      where.operatorId = operator.id;
    }

    const rows = await this.prisma.pointTransfer.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
      ...(query.cursor ? { cursor: { id: query.cursor }, skip: 1 } : {}),
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    return { items: page.map(toEntry), nextCursor: hasMore ? page[page.length - 1]!.id : null };
  }
}

function toEntry(t: {
  id: string;
  type: string;
  fromType: string;
  fromId: string;
  toType: string;
  toId: string;
  amount: Prisma.Decimal;
  fromBeforeBalance: Prisma.Decimal;
  fromAfterBalance: Prisma.Decimal;
  toBeforeBalance: Prisma.Decimal;
  toAfterBalance: Prisma.Decimal;
  description: string | null;
  operatorId: string | null;
  operatorType: string | null;
  createdAt: Date;
}): TransferEntry {
  return {
    id: t.id,
    type: t.type as TransferEntry['type'],
    fromType: t.fromType,
    fromId: t.fromId,
    toType: t.toType,
    toId: t.toId,
    amount: t.amount.toFixed(2),
    fromBeforeBalance: t.fromBeforeBalance.toFixed(2),
    fromAfterBalance: t.fromAfterBalance.toFixed(2),
    toBeforeBalance: t.toBeforeBalance.toFixed(2),
    toAfterBalance: t.toAfterBalance.toFixed(2),
    description: t.description,
    operatorId: t.operatorId,
    operatorType: t.operatorType,
    createdAt: t.createdAt.toISOString(),
  };
}
