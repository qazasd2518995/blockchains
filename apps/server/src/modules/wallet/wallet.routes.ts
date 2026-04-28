import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BalanceResponse, TransactionListResponse } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  cursor: z.string().optional(),
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
      const items = await fastify.prisma.transaction.findMany({
        where: { userId: req.userId },
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
      });
      const nextCursor = items.length > q.limit ? (items.pop()?.id ?? null) : null;
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
      };
    },
  );
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
