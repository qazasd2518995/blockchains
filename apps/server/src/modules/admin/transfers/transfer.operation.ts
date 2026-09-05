import { createHash } from 'node:crypto';
import { Prisma, type PrismaClient, type PointTransfer } from '@prisma/client';
import type { FastifyRequest } from 'fastify';
import type { AdminCurrent } from '../../../plugins/adminAuth.js';
import { ApiError } from '../../../utils/errors.js';
import { runSerializable } from '../../games/_common/BaseGameService.js';
import { writeAudit } from '../audit/audit.service.js';

type Kind = 'agent_to_agent' | 'agent_to_member' | 'cs_agent' | 'cs_member';
interface Input {
  requestId?: string;
  amount: string;
  description?: string;
  fromId?: string;
  toId?: string;
  agentId?: string;
  memberId?: string;
  targetId?: string;
}

/** Reuses PointTransfer's durable primary key; no in-memory dedupe or migration. */
export async function commitTransfer(
  prisma: PrismaClient,
  operator: AdminCurrent,
  kind: Kind,
  input: Input,
  req: FastifyRequest | undefined,
  work: (tx: Prisma.TransactionClient, id: string | undefined) => Promise<PointTransfer>,
): Promise<PointTransfer> {
  const id = input.requestId
    ? `op_${createHash('sha256').update(`${operator.id}:${input.requestId}`).digest('hex')}`
    : undefined;
  const amount = new Prisma.Decimal(input.amount);
  const deposit = amount.isPositive();
  const type =
    kind === 'agent_to_member'
      ? deposit
        ? 'AGENT_TO_MEMBER'
        : 'MEMBER_TO_AGENT'
      : kind === 'agent_to_agent'
        ? 'AGENT_TO_AGENT'
        : kind === 'cs_agent'
          ? 'CS_AGENT_TRANSFER'
          : 'CS_MEMBER_TRANSFER';
  const fromType = kind.startsWith('cs_')
    ? 'cs'
    : kind === 'agent_to_member' && !deposit
      ? 'member'
      : 'agent';
  const toType =
    kind === 'cs_member' || (kind === 'agent_to_member' && deposit) ? 'member' : 'agent';
  const fromId = kind.startsWith('cs_')
    ? operator.id
    : kind === 'agent_to_agent'
      ? input.fromId
      : deposit
        ? input.agentId
        : input.memberId;
  const toId = kind.startsWith('cs_')
    ? input.targetId
    : kind === 'agent_to_agent'
      ? input.toId
      : deposit
        ? input.memberId
        : input.agentId;
  const validateReplay = (row: PointTransfer): PointTransfer => {
    if (
      row.operatorId !== operator.id ||
      row.type !== type ||
      row.fromType !== fromType ||
      row.toType !== toType ||
      row.fromId !== fromId ||
      row.toId !== toId ||
      !row.amount.equals(amount.abs()) ||
      row.description !== (input.description ?? null) ||
      (kind.startsWith('cs_') && !row.toAfterBalance.sub(row.toBeforeBalance).equals(amount))
    ) {
      throw new ApiError('INVALID_TRANSFER', '同一操作識別碼不能用於不同轉帳內容');
    }
    return row;
  };
  try {
    return await runSerializable(prisma, async (tx) => {
      if (id) {
        const existing = await tx.pointTransfer.findUnique({ where: { id } });
        if (existing) return validateReplay(existing);
      }
      const transfer = await work(tx, id);
      await writeAudit(tx, {
        actor: {
          id: operator.id,
          type: operator.role === 'SUPER_ADMIN' ? 'super_admin' : 'agent',
          username: operator.username,
        },
        action: `transfer.${kind === 'agent_to_member' && !deposit ? 'member_to_agent' : kind}`,
        targetType: 'transfer',
        targetId: transfer.id,
        newValues: { ...input, amount: amount.toFixed(2) },
        req,
      });
      return transfer;
    });
  } catch (error) {
    // A concurrent identical request may have won the unique primary-key race.
    // Its loser transaction (including all balance changes) was rolled back.
    if (id && error && typeof error === 'object' && 'code' in error && error.code === 'P2002') {
      const existing = await prisma.pointTransfer.findUnique({ where: { id } });
      if (existing) return validateReplay(existing);
    }
    throw error;
  }
}
