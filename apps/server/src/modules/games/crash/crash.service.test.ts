import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GameId } from '@bg/shared';
import { CrashSoloService } from './crash.service.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('CrashSoloService global member win cap', () => {
  it('forces a bbb-style over-cap cashout to zero before crediting balance', async () => {
    const round = {
      id: 'round-1',
      gameId: GameId.ROCKET,
      roundNumber: 1,
      serverSeedHash: 'hash',
      serverSeed: 'seed',
      crashPoint: decimal(10),
      status: 'RUNNING',
      bettingEndsAt: null,
      startedAt: new Date('2026-06-08T01:00:00Z'),
      crashedAt: null,
      createdAt: new Date('2026-06-08T01:00:00Z'),
    };
    type Round = typeof round;
    let storedBet = {
      id: 'crash-bet-1',
      roundId: round.id,
      round,
      userId: 'bbb',
      amount: decimal(100),
      autoCashOut: null,
      cashedOutAt: null as Prisma.Decimal | null,
      payout: decimal(0),
      controlOriginal: null,
      controlOutcome: null,
      controlFinalizedAt: null as Date | null,
      createdAt: new Date('2026-06-08T01:00:01Z'),
    };
    type StoredBet = typeof storedBet;
    const user = {
      id: 'bbb',
      username: 'bbb',
      agentId: null,
      balance: decimal(100000),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async () => user),
        findUniqueOrThrow: vi.fn(async () => user),
        update: vi.fn(),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 1 },
          _sum: { profit: decimal('49415.66') },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: decimal(0), payout: decimal(0) },
        })),
        updateMany: vi.fn(async ({ data }: { data: Partial<StoredBet> }) => {
          storedBet = {
            ...storedBet,
            ...data,
          };
          return { count: 1 };
        }),
        findUniqueOrThrow: vi.fn(async () => storedBet),
      },
      memberWinCapControl: {
        findFirst: vi.fn(async () => null),
      },
      memberDepositControl: {
        findMany: vi.fn(async () => []),
      },
      winLossControl: {
        findMany: vi.fn(async () => []),
      },
      winLossControlLogs: {
        create: vi.fn(),
      },
    };
    type FakeTx = typeof tx;
    const service = new CrashSoloService({} as never) as unknown as {
      finalizeCashoutInTx: (
        tx: FakeTx,
        bet: StoredBet,
        round: Round,
        multiplier: number,
        control: null,
        original: {
          won: boolean;
          amount: Prisma.Decimal;
          multiplier: Prisma.Decimal;
          payout: Prisma.Decimal;
        },
      ) => Promise<{ bet: StoredBet; payout: Prisma.Decimal; newBalance: string }>;
    };

    const result = await service.finalizeCashoutInTx(tx, storedBet, round, 3, null, {
      won: false,
      amount: decimal(100),
      multiplier: decimal(0),
      payout: decimal(0),
    });

    expect(result.payout.toFixed(2)).toBe('0.00');
    expect(storedBet.payout.toFixed(2)).toBe('0.00');
    expect(storedBet.cashedOutAt?.toFixed(4)).toBe('3.0000');
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.winLossControlLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          controlId: 'global-member-daily-win-cap',
          userId: 'bbb',
          gameId: GameId.ROCKET,
          flipReason: 'global_member_daily_win_cap',
        }),
      }),
    );
  });
});
