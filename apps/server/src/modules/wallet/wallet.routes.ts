import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import type { PrismaClient } from '@prisma/client';
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

type LedgerCursor = {
  createdAt: Date;
  id: string;
};

type StandardLedgerBet = Prisma.BetGetPayload<{
  include: {
    transactions: {
      select: {
        balanceAfter: true;
        createdAt: true;
      };
    };
  };
}>;

type CrashLedgerBet = Prisma.CrashBetGetPayload<{
  include: {
    round: {
      select: {
        gameId: true;
      };
    };
  };
}>;

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

      const betCreatedAt: Prisma.DateTimeFilter = {};
      if (from) betCreatedAt.gte = from;
      if (to) betCreatedAt.lte = to;

      const cursor = parseLedgerCursor(q.cursor);
      const standardWhere: Prisma.BetWhereInput = {
        userId: req.userId,
        ...(Object.keys(betCreatedAt).length > 0 ? { createdAt: betCreatedAt } : {}),
      };
      const crashWhere: Prisma.CrashBetWhereInput = {
        userId: req.userId,
        round: { status: 'CRASHED' },
        ...(Object.keys(betCreatedAt).length > 0 ? { createdAt: betCreatedAt } : {}),
      };

      const [
        standardRows,
        crashRows,
        standardCount,
        crashCount,
        standardAgg,
        crashAgg,
        fallbackUser,
      ] = await Promise.all([
        fastify.prisma.bet.findMany({
          where: withLedgerCursor(standardWhere, cursor),
          include: {
            transactions: {
              select: {
                balanceAfter: true,
                createdAt: true,
              },
              orderBy: { createdAt: 'desc' },
              take: 1,
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: q.limit + 1,
        }),
        fastify.prisma.crashBet.findMany({
          where: withLedgerCursor(crashWhere, cursor),
          include: {
            round: {
              select: {
                gameId: true,
              },
            },
          },
          orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
          take: q.limit + 1,
        }),
        fastify.prisma.bet.count({ where: standardWhere }),
        fastify.prisma.crashBet.count({ where: crashWhere }),
        fastify.prisma.bet.aggregate({
          where: standardWhere,
          _sum: { amount: true, profit: true },
        }),
        fastify.prisma.crashBet.aggregate({
          where: crashWhere,
          _sum: { amount: true, payout: true },
        }),
        fastify.prisma.user.findUnique({
          where: { id: req.userId },
          select: { balance: true },
        }),
      ]);

      if (!fallbackUser) throw new ApiError('USER_NOT_FOUND', 'User not found');

      const crashBalanceAfterByBetId = await loadCrashBalanceAfterByBetId(
        fastify.prisma,
        req.userId,
        crashRows.map((row) => row.id),
      );

      const mergedItems = [
        ...standardRows.map((bet) => toStandardLedgerEntry(bet, fallbackUser.balance)),
        ...crashRows.map((bet) =>
          toCrashLedgerEntry(bet, fallbackUser.balance, crashBalanceAfterByBetId),
        ),
      ].sort(compareLedgerEntries);

      const hasMore = mergedItems.length > q.limit;
      const pageItems = mergedItems.slice(0, q.limit);
      const nextCursor = hasMore ? buildLedgerCursor(pageItems[pageItems.length - 1]!) : null;
      const standardProfit = standardAgg._sum.profit ?? ZERO;
      const crashAmount = crashAgg._sum.amount ?? ZERO;
      const crashPayout = crashAgg._sum.payout ?? ZERO;
      const crashProfit = crashPayout.sub(crashAmount);
      const net = standardProfit.add(crashProfit);
      const validAmount = (standardAgg._sum.amount ?? ZERO).add(crashAmount);
      const totalCount = standardCount + crashCount;
      return {
        items: pageItems,
        nextCursor,
        summary: {
          totalIn: net.greaterThan(0) ? net.toFixed(2) : ZERO.toFixed(2),
          totalOut: net.lessThan(0) ? net.toFixed(2) : ZERO.toFixed(2),
          validAmount: validAmount.toFixed(2),
          net: net.toFixed(2),
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

function parseLedgerCursor(value: string | undefined): LedgerCursor | undefined {
  if (!value) return undefined;
  const [createdAtRaw = '', id = ''] = value.split('__');
  if (!id) return undefined;
  const createdAt = new Date(createdAtRaw);
  if (!Number.isFinite(createdAt.getTime())) return undefined;
  return { createdAt, id };
}

function buildLedgerCursor(item: TransactionListResponse['items'][number]): string {
  return `${item.createdAt}__${item.id}`;
}

function withLedgerCursor<T extends Prisma.BetWhereInput | Prisma.CrashBetWhereInput>(
  where: T,
  cursor: LedgerCursor | undefined,
): T {
  if (!cursor) return where;
  return {
    AND: [
      where,
      {
        OR: [
          { createdAt: { lt: cursor.createdAt } },
          { createdAt: cursor.createdAt, id: { lt: cursor.id } },
        ],
      },
    ],
  } as T;
}

function compareLedgerEntries(
  a: TransactionListResponse['items'][number],
  b: TransactionListResponse['items'][number],
): number {
  const byDate = new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  if (byDate !== 0) return byDate;
  return b.id.localeCompare(a.id);
}

function toStandardLedgerEntry(
  bet: StandardLedgerBet,
  fallbackBalance: Prisma.Decimal,
): TransactionListResponse['items'][number] {
  return {
    id: bet.id,
    type: 'BET_WIN',
    amount: bet.profit.toFixed(2),
    balanceAfter: (bet.transactions[0]?.balanceAfter ?? fallbackBalance).toFixed(2),
    betId: bet.id,
    gameId: bet.gameId,
    betAmount: bet.amount.toFixed(2),
    payout: bet.payout.toFixed(2),
    profit: bet.profit.toFixed(2),
    createdAt: bet.createdAt.toISOString(),
  };
}

function toCrashLedgerEntry(
  bet: CrashLedgerBet,
  fallbackBalance: Prisma.Decimal,
  balanceAfterByBetId: Map<string, Prisma.Decimal>,
): TransactionListResponse['items'][number] {
  const profit = bet.payout.sub(bet.amount);
  return {
    id: bet.id,
    type: 'CASHOUT',
    amount: profit.toFixed(2),
    balanceAfter: (balanceAfterByBetId.get(bet.id) ?? fallbackBalance).toFixed(2),
    betId: bet.id,
    gameId: bet.round.gameId,
    betAmount: bet.amount.toFixed(2),
    payout: bet.payout.toFixed(2),
    profit: profit.toFixed(2),
    createdAt: bet.createdAt.toISOString(),
  };
}

async function loadCrashBalanceAfterByBetId(
  prisma: Prisma.TransactionClient | PrismaClient,
  userId: string,
  crashBetIds: string[],
): Promise<Map<string, Prisma.Decimal>> {
  if (crashBetIds.length === 0) return new Map();

  const rows = await prisma.$queryRaw<
    Array<{
      crashBetId: string;
      balanceAfter: Prisma.Decimal;
    }>
  >`
    SELECT DISTINCT ON ("crashBetId")
      "crashBetId",
      "balanceAfter"
    FROM (
      SELECT
        COALESCE(meta->>'crashBetId', meta#>>'{payload,crashBetId}') AS "crashBetId",
        "balanceAfter",
        "createdAt"
      FROM "Transaction"
      WHERE "userId" = ${userId}
        AND COALESCE(meta->>'crashBetId', meta#>>'{payload,crashBetId}') IN (${Prisma.join(crashBetIds)})
    ) tx
    WHERE "crashBetId" IS NOT NULL
    ORDER BY "crashBetId", "createdAt" DESC
  `;

  return new Map(rows.map((row) => [row.crashBetId, row.balanceAfter]));
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
