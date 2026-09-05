import Fastify from 'fastify';
import { Prisma, type PrismaClient } from '@prisma/client';
import { ZodError } from 'zod';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { fruitMaryRoutes } from './fruitMary.routes.js';
import { SeedHelper } from '../_common/BaseGameService.js';
import { ApiError, errorCodeToStatus } from '../../../utils/errors.js';
import { config } from '../../../config.js';
import { applyControls, finalizeControls } from '../_common/controls.js';

vi.mock('../_common/controls.js', async (importOriginal) => ({
  ...(await importOriginal<object>()),
  applyControls: vi.fn(async (_tx, _user, _game, outcome) => ({ ...outcome, controlled: false })),
  finalizeControls: vi.fn(async () => undefined),
}));

afterEach(() => vi.restoreAllMocks());

async function harness(initialBalance: number) {
  // Exercise the actual routes, Decimal funds checks, settlement and ledger
  // helpers with an isolated transactional store, never a production wallet.
  const user = {
    id: 'member',
    username: 'custom-member',
    agentId: null,
    displayName: null,
    balance: new Prisma.Decimal(initialBalance),
    frozenAt: null,
    disabledAt: null,
    bettingLimits: { 'fruit-mary': 'range_10_5000' },
    bettingLimitLevel: 'range_10_5000',
  };
  const bets: any[] = [];
  const ledger: any[] = [];
  const tx = {
    $queryRaw: vi.fn(async () => [{ ...user }]),
    bet: {
      findUnique: vi.fn(
        async ({ where }: any) =>
          bets.find((bet) => bet.operationId === where.userId_gameId_operationId.operationId) ??
          null,
      ),
      findFirst: vi.fn(async () => bets.at(-1) ?? null),
      create: vi.fn(async ({ data }: any) => {
        const bet = { ...data, id: `bet-${bets.length + 1}` };
        bets.push(bet);
        return bet;
      }),
      findMany: vi.fn(async () =>
        bets.map((bet) => ({ ...bet, createdAt: new Date('2026-09-05T00:00:00Z') })),
      ),
      count: vi.fn(async () => bets.length),
    },
    user: {
      findUnique: vi.fn(async () => ({ ...user })),
      update: vi.fn(async ({ data }: any) => {
        user.balance = data.balance.decrement
          ? user.balance.minus(data.balance.decrement)
          : user.balance.plus(data.balance.increment);
        return { ...user };
      }),
    },
    transaction: {
      create: vi.fn(async ({ data }: any) => {
        ledger.push(data);
        return data;
      }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(async (fn) => {
      if (Array.isArray(fn)) return Promise.all(fn);
      const snapshot = { balance: user.balance, bets: bets.length, ledger: ledger.length };
      try {
        return await fn(tx);
      } catch (error) {
        user.balance = snapshot.balance;
        bets.length = snapshot.bets;
        ledger.length = snapshot.ledger;
        throw error;
      }
    }),
  } as unknown as PrismaClient;
  vi.spyOn(config, 'PLATFORM_REALM', 'get').mockReturnValue('qmoney');
  vi.spyOn(SeedHelper.prototype, 'getActiveBundle').mockResolvedValue({
    serverSeedId: 'seed',
    serverSeed: 'fruit-route-review',
    clientSeed: 'client',
    serverSeedHash: 'hash',
    nonce: 1,
  });
  const app = Fastify();
  app.decorate('prisma', prisma);
  app.decorate('authenticate', async (request) => {
    request.userId = user.id;
  });
  app.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiError)
      return reply.code(errorCodeToStatus(error.code)).send({ code: error.code });
    if (error instanceof ZodError) return reply.code(400).send({ code: 'INVALID_BET' });
    return reply.code(500).send({ message: error instanceof Error ? error.message : 'Test error' });
  });
  await app.register(fruitMaryRoutes);
  const post = async (path: string, payload: object) =>
    app.inject({ method: 'POST', url: path, payload });
  return { app, post, user, bets, ledger, tx };
}

describe('Fruit Mary real request and settlement flow', () => {
  it.each([false, true])(
    'settles and displays the same controlled result (win=%s)',
    async (won) => {
      const h = await harness(1000.37);
      vi.mocked(applyControls).mockImplementationOnce(async (_tx, _id, _game, outcome) => ({
        ...outcome,
        controlled: true,
        won,
        multiplier: new Prisma.Decimal(won ? 1.25 : 0),
        minMultiplier: new Prisma.Decimal(won ? 1.01 : 0),
        maxMultiplier: new Prisma.Decimal(won ? 2 : 1),
        maxPayout: new Prisma.Decimal(won ? 320 : 160),
      }));
      try {
        const fruits = [4, 16, 20, 8, 2, 19, 13, 5].map((id) => [id, 2]);
        const response = await h.post('/spin', { fruits, money: 16 });
        expect(response.statusCode).toBe(200);
        const payload = response.json();
        const payout = payload.data.money.reduce(
          (sum: number, units: number) => sum + units * 10,
          0,
        );
        expect(payout).toBe(won ? 200 : 0);
        expect(h.bets[0].payout.toNumber()).toBe(payout);
        expect(h.bets[0].resultData.controlled).toBe(true);
        expect(payload.balance).toBeCloseTo(1000.37 - 160 + payout, 2);
      } finally {
        await h.app.close();
      }
    },
  );

  it('rolls back the debit and bet together when settlement finalization fails', async () => {
    const h = await harness(10.37);
    vi.mocked(finalizeControls).mockRejectedValueOnce(new Error('Isolated transaction failure'));
    try {
      expect((await h.post('/spin', { fruits: [[4, 1]], money: 1 })).statusCode).toBe(500);
      expect(h.user.balance.toNumber()).toBe(10.37);
      expect(h.bets).toHaveLength(0);
      expect(h.ledger).toHaveLength(0);
    } finally {
      await h.app.close();
    }
  });
  it('requires an operation key on the retry-safe endpoints', async () => {
    const h = await harness(100);
    try {
      expect((await h.post('/operations/spin', { fruits: [[4, 1]], money: 1 })).statusCode).toBe(
        400,
      );
      expect((await h.post('/operations/gamble', { balance: 10, size: 1 })).statusCode).toBe(400);
      expect(h.bets).toHaveLength(0);
      expect(h.ledger).toHaveLength(0);
    } finally {
      await h.app.close();
    }
  });
  it.each([0, 0.37, 3, 9.99])(
    'rejects a 10-point spin with only %s, without any bet or ledger entry',
    async (balance) => {
      const h = await harness(balance);
      try {
        const res = await h.post('/spin', { fruits: [[4, 1]], money: 1 });
        expect(res.statusCode).toBe(400);
        expect(res.json().code).toBe('INSUFFICIENT_FUNDS');
        expect(h.user.balance.toNumber()).toBe(balance);
        expect(h.bets).toHaveLength(0);
        expect(h.ledger).toHaveLength(0);
      } finally {
        await h.app.close();
      }
    },
  );

  it('keeps the fractional remainder, ledger, history and lobby balance consistent', async () => {
    const h = await harness(10.37);
    try {
      const res = await h.post('/spin', { fruits: [[4, 1]], money: 1 });
      expect(res.statusCode).toBe(200);
      const payload = res.json();
      const payout = payload.data.money.reduce((sum: number, value: number) => sum + value * 10, 0);
      expect(payload.balance).toBeCloseTo(0.37 + payout, 2);
      expect(h.ledger[0].amount.toNumber()).toBe(-10);
      expect(h.ledger.at(-1).balanceAfter.toNumber()).toBe(payload.balance);
      expect((await h.app.inject('/session')).json().data.info.gold).toBe(payload.balance);
      expect((await h.post('/history', {})).json().data.data[0]).toMatchObject({
        money: 10,
        in_money: payout,
        profit: payout - 10,
      });
      expect(applyControls).toHaveBeenCalled();
      expect(finalizeControls).toHaveBeenCalled();
    } finally {
      await h.app.close();
    }
  });

  it('replays the same operation after the last whole bet, without another debit or seed', async () => {
    const h = await harness(10.37);
    try {
      const input = {
        fruits: [[4, 1]],
        money: 1,
        operationId: 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa',
      };
      const first = (await h.post('/operations/spin', input)).json();
      const second = await h.post('/operations/spin', input);
      expect(second.statusCode).toBe(200);
      expect(second.json()).toEqual(first);
      expect(h.bets).toHaveLength(1);
      expect(h.ledger.filter((entry) => entry.type === 'BET_PLACE')).toHaveLength(1);
      expect(SeedHelper.prototype.getActiveBundle).toHaveBeenCalledTimes(1);
      expect((await h.post('/operations/spin', { ...input, fruits: [[5, 1]] })).json().code).toBe(
        'INVALID_ACTION',
      );
    } finally {
      await h.app.close();
    }
  });

  it.each([
    { fruits: [[4, 0.5]], money: 1 },
    { fruits: [[4, 1]], money: 2 },
    {
      fruits: [
        [4, 1],
        [4, 1],
      ],
      money: 2,
    },
    { fruits: [[99, 1]], money: 1 },
    {
      fruits: [
        [4, 99],
        [5, 99],
        [16, 99],
        [20, 99],
        [8, 99],
        [2, 99],
      ],
      money: 594,
    },
  ])('rejects invalid allocations / account limits: %j', async (payload) => {
    const h = await harness(10000);
    try {
      expect((await h.post('/spin', payload)).statusCode).toBe(400);
      expect(h.bets).toHaveLength(0);
      expect(h.user.balance.toNumber()).toBe(10000);
    } finally {
      await h.app.close();
    }
  });

  it('rejects expired, unaffordable and sub-cent gambles and replays a valid receipt', async () => {
    const h = await harness(100.37);
    try {
      expect((await h.post('/gamble', { balance: 10, size: 1 })).json().code).toBe(
        'INVALID_ACTION',
      );
      h.bets.push({ id: 'prior-win', resultData: { gambleAmount: '40.00' } });
      expect((await h.post('/gamble', { balance: 101, size: 1 })).json().code).toBe(
        'INSUFFICIENT_FUNDS',
      );
      expect((await h.post('/gamble', { balance: 10.001, size: 1 })).statusCode).toBe(400);
      const input = { balance: 40, size: 1, operationId: 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb' };
      const first = await h.post('/operations/gamble', input);
      expect(first.statusCode).toBe(200);
      expect((await h.post('/operations/gamble', input)).json()).toEqual(first.json());
      expect(h.ledger.filter((entry) => entry.type === 'BET_PLACE')).toHaveLength(1);
      const won = first.json().data < 8;
      expect(first.json().balance).toBeCloseTo(100.37 - 40 + (won ? 80 : 0), 2);
    } finally {
      await h.app.close();
    }
  });
});
