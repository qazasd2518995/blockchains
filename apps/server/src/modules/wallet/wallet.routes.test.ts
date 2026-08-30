import type { FastifyInstance } from 'fastify';
import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { walletRoutes } from './wallet.routes.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);

function registrar() {
  const handlers = new Map<string, (request: unknown) => Promise<unknown>>();
  const betRow = {
    id: 'bet-1',
    userId: 'member-1',
    gameId: 'storm-of-seth-2',
    amount: decimal('10'),
    multiplier: decimal('3.5'),
    payout: decimal('35'),
    profit: decimal('25'),
    status: 'SETTLED',
    createdAt: new Date('2026-08-31T10:00:00.000Z'),
    settledAt: new Date('2026-08-31T10:00:01.000Z'),
    nonce: 7,
    clientSeedUsed: 'client-seed',
    minesRoundId: null,
    hiloRoundId: null,
    towerRoundId: null,
    blackjackRoundId: null,
    resultData: { visible: true, controlled: true },
    transactions: [
      { balanceAfter: decimal('1025'), createdAt: new Date('2026-08-31T10:00:01.000Z') },
    ],
    serverSeed: { seedHash: 'public-seed-hash' },
  };
  const prisma = {
    user: { findUnique: vi.fn(async () => ({ balance: decimal('1025') })) },
    bet: {
      findMany: vi.fn(async () => [betRow]),
      count: vi.fn(async () => 1),
      aggregate: vi.fn(async () => ({ _sum: { amount: decimal('10'), profit: decimal('25') } })),
      findFirst: vi.fn(async () => betRow),
    },
    crashBet: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      aggregate: vi.fn(async () => ({ _sum: { amount: decimal('0'), payout: decimal('0') } })),
      findFirst: vi.fn(async () => null),
    },
    $queryRaw: vi.fn(async () => []),
  };
  const fastify = {
    authenticate: vi.fn(),
    prisma,
    get: vi.fn((path: string, _options: unknown, handler: (request: unknown) => Promise<unknown>) => {
      handlers.set(path, handler);
    }),
  } as unknown as FastifyInstance;
  return { fastify, handlers, prisma, betRow };
}

describe('wallet game history routes', () => {
  it('returns only the authenticated member ledger with settled amounts', async () => {
    const registration = registrar();
    await walletRoutes(registration.fastify);

    const result = (await registration.handlers.get('/transactions')?.({
      userId: 'member-1',
      query: { limit: '20' },
    })) as {
      items: Array<Record<string, unknown>>;
      summary: Record<string, unknown>;
    };

    expect(registration.prisma.bet.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'member-1' } }),
    );
    expect(result.items).toEqual([
      expect.objectContaining({
        id: 'bet-1',
        gameId: 'storm-of-seth-2',
        betAmount: '10.00',
        payout: '35.00',
        profit: '25.00',
        balanceAfter: '1025.00',
      }),
    ]);
    expect(result.summary).toEqual(
      expect.objectContaining({ validAmount: '10.00', net: '25.00', totalCount: 1 }),
    );
  });

  it('scopes single-bet details to the authenticated member and strips control metadata', async () => {
    const registration = registrar();
    await walletRoutes(registration.fastify);

    const result = (await registration.handlers.get('/bets/:betId')?.({
      userId: 'member-1',
      params: { betId: 'bet-1' },
    })) as { resultData: Record<string, unknown> };

    expect(registration.prisma.bet.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'bet-1', userId: 'member-1' } }),
    );
    expect(result).toEqual(
      expect.objectContaining({
        id: 'bet-1',
        amount: '10.00',
        payout: '35.00',
        profit: '25.00',
        status: 'SETTLED',
      }),
    );
    expect(result.resultData).toEqual({ visible: true });
  });
});
