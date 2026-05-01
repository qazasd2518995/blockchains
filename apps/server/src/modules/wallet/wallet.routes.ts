import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { z } from 'zod';
import type { BalanceResponse, BetDetailResponse, TransactionListResponse } from '@bg/shared';
import { ApiError } from '../../utils/errors.js';

const ZERO = new Prisma.Decimal(0);

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(20),
  cursor: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
});

const betParamSchema = z.object({
  betId: z.string().min(1),
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
          betId: tx.betId ?? resolveTransactionBetId(tx.meta),
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

  fastify.get(
    '/bets/:betId',
    { preHandler: [fastify.authenticate] },
    async (req): Promise<BetDetailResponse> => {
      const { betId } = betParamSchema.parse(req.params);

      const bet = await fastify.prisma.bet.findFirst({
        where: { id: betId, userId: req.userId },
        include: {
          serverSeed: {
            select: { seedHash: true },
          },
        },
      });

      if (bet) {
        return {
          id: bet.id,
          kind: 'bet',
          gameId: bet.gameId,
          amount: bet.amount.toFixed(2),
          multiplier: bet.multiplier.toFixed(4),
          payout: bet.payout.toFixed(2),
          profit: bet.profit.toFixed(2),
          status: bet.status,
          createdAt: bet.createdAt.toISOString(),
          settledAt: bet.settledAt?.toISOString() ?? null,
          nonce: bet.nonce,
          clientSeed: bet.clientSeedUsed,
          serverSeedHash: bet.serverSeed.seedHash,
          roundId:
            bet.minesRoundId ??
            bet.hiloRoundId ??
            bet.towerRoundId ??
            bet.blackjackRoundId ??
            null,
          roundNumber: null,
          resultData: sanitizePublicResult(bet.resultData),
        };
      }

      const crashBet = await fastify.prisma.crashBet.findFirst({
        where: { id: betId, userId: req.userId },
        include: {
          round: true,
        },
      });

      if (crashBet) {
        const payout = crashBet.payout ?? ZERO;
        const profit = payout.minus(crashBet.amount);
        const multiplier =
          crashBet.cashedOutAt ??
          (payout.greaterThan(0) && crashBet.amount.greaterThan(0)
            ? payout.div(crashBet.amount).toDecimalPlaces(4, Prisma.Decimal.ROUND_DOWN)
            : ZERO);
        const settled = crashBet.round.status === 'CRASHED';

        return {
          id: crashBet.id,
          kind: 'crash',
          gameId: crashBet.round.gameId,
          amount: crashBet.amount.toFixed(2),
          multiplier: multiplier.toFixed(4),
          payout: payout.toFixed(2),
          profit: profit.toFixed(2),
          status: settled ? 'SETTLED' : 'PENDING',
          createdAt: crashBet.createdAt.toISOString(),
          settledAt: crashBet.round.crashedAt?.toISOString() ?? null,
          nonce: null,
          clientSeed: null,
          serverSeedHash: crashBet.round.serverSeedHash,
          roundId: crashBet.roundId,
          roundNumber: crashBet.round.roundNumber,
          resultData: {
            roundNumber: crashBet.round.roundNumber,
            crashPoint: crashBet.round.crashPoint.toFixed(4),
            autoCashOut: crashBet.autoCashOut?.toFixed(4) ?? null,
            cashoutAt: crashBet.cashedOutAt?.toFixed(4) ?? null,
            payout: payout.toFixed(2),
            status: crashBet.round.status,
          },
        };
      }

      throw new ApiError('INVALID_BET', 'Bet detail not found');
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

function resolveTransactionBetId(meta: unknown): string | null {
  const record = asRecord(meta);
  if (!record) return null;

  const direct = getStringField(record, 'crashBetId') ?? getStringField(record, 'betId');
  if (direct) return direct;

  const payload = asRecord(record.payload);
  if (!payload) return null;
  return getStringField(payload, 'crashBetId') ?? getStringField(payload, 'betId');
}

function sanitizePublicResult(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizePublicResult(item));
  }

  const record = asRecord(value);
  if (!record) return value;

  const internalKeys = new Set([
    'raw',
    'rawRoll',
    'rawWon',
    'controlled',
    'flipReason',
    'controlId',
    'bustedByCashoutControl',
  ]);
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(record)) {
    if (internalKeys.has(key)) continue;
    output[key] = sanitizePublicResult(child);
  }
  return output;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function getStringField(record: Record<string, unknown>, key: string): string | null {
  const value = record[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}
