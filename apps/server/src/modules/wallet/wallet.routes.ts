import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { BalanceResponse, TransactionListResponse } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const ZERO = new Prisma.Decimal(0);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
  cursor: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

export async function walletRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.get(
    '/balance',
    { preHandler: [fastify.authenticate] },
    async (req): Promise<BalanceResponse> => {
      const user = await fastify.prisma.user.findUnique({ where: { id: req.userId } });
      if (!user) throw new ApiError('USER_NOT_FOUND', 'User not found');
      return { balance: user.balance.toFixed(2) };
    },
  );

  fastify.get(
    '/transactions',
    { preHandler: [fastify.authenticate] },
    async (req): Promise<TransactionListResponse> => {
      const q = listQuerySchema.parse(req.query);
      const from = parseDateParam(q.from, 'from');
      const to = parseDateParam(q.to, 'to');
      if (from && to && from > to) {
        throw new ApiError('INVALID_BET', 'from must be before to');
      }

      const createdAt: Prisma.DateTimeFilter = {};
      if (from) createdAt.gte = from;
      if (to) createdAt.lte = to;

      const where: Prisma.TransactionWhereInput = {
        userId: req.userId,
        ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
      };

      const [items, totalIn, totalOut, totalCount] = await Promise.all([
        fastify.prisma.transaction.findMany({
          where,
          include: {
            bet: {
              select: {
                gameId: true,
                amount: true,
                payout: true,
                profit: true,
              },
            },
          },
          orderBy: { createdAt: 'desc' },
          take: q.limit + 1,
          ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
        }),
        fastify.prisma.transaction.aggregate({
          where: { ...where, amount: { gt: ZERO } },
          _sum: { amount: true },
        }),
        fastify.prisma.transaction.aggregate({
          where: { ...where, amount: { lt: ZERO } },
          _sum: { amount: true },
        }),
        fastify.prisma.transaction.count({ where }),
      ]);

      const nextCursor = items.length > q.limit ? (items.pop()?.id ?? null) : null;
      const totalInAmount = totalIn._sum.amount ?? ZERO;
      const totalOutAmount = totalOut._sum.amount ?? ZERO;
      return {
        items: items.map((tx) => ({
          id: tx.id,
          type: tx.type,
          amount: tx.amount.toFixed(2),
          balanceAfter: tx.balanceAfter.toFixed(2),
          betId: tx.betId,
          gameId: resolveTransactionGameId(tx.bet?.gameId ?? null, tx.meta),
          betAmount: tx.bet?.amount.toFixed(2) ?? null,
          payout: tx.bet?.payout.toFixed(2) ?? null,
          profit: tx.bet?.profit.toFixed(2) ?? null,
          createdAt: tx.createdAt.toISOString(),
        })),
        nextCursor,
        summary: {
          totalIn: totalInAmount.toFixed(2),
          totalOut: totalOutAmount.toFixed(2),
          net: totalInAmount.add(totalOutAmount).toFixed(2),
          totalCount,
        },
      };
    },
  );
}

function parseDateParam(value: string | undefined, field: string): Date | undefined {
  if (!value) return undefined;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new ApiError('INVALID_BET', `Invalid ${field} date`);
  }
  return date;
}

function resolveTransactionGameId(
  betGameId: string | null,
  meta: unknown,
): string | null {
  if (betGameId) return betGameId;
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return null;

  const record = meta as Record<string, unknown>;
  if (typeof record.gameId === 'string' && record.gameId) {
    return record.gameId;
  }

  const payload = record.payload;
  if (payload && typeof payload === 'object' && !Array.isArray(payload)) {
    const payloadRecord = payload as Record<string, unknown>;
    if (typeof payloadRecord.gameId === 'string' && payloadRecord.gameId) {
      return payloadRecord.gameId;
    }
  }

  if (
    record.source === 'baccarat_bet' ||
    record.source === 'baccarat_refund' ||
    record.source === 'baccarat_settle'
  ) {
    return 'baccarat';
  }

  return null;
}
