import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { GameId } from '@bg/shared';
import { __crashServiceTestHooks, CrashSoloService } from './crash.service.js';
import type { ControlOutcome, GlobalMemberDailyWinCapGuard } from '../_common/controls.js';

const decimal = (value: string | number) => new Prisma.Decimal(value);

describe('CrashSoloService controlled losses', () => {
  it('does not turn auto-balance drain losses into fixed relief wins', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.5);
    const service = new CrashSoloService({} as never) as unknown as {
      tuneCrashPoint: (
        naturalCrashPoint: number,
        amount: Prisma.Decimal,
        control: ControlOutcome,
        recentControlledLosses: number,
      ) => { crashPoint: number; control: ControlOutcome };
    };
    const control: ControlOutcome = {
      won: false,
      multiplier: decimal(0),
      payout: decimal(0),
      controlled: true,
      flipReason: 'auto_balance_drain',
      controlId: 'auto-1',
    };

    const tuned = service.tuneCrashPoint(10, decimal(5000), control, 10);

    expect(tuned.control.won).toBe(false);
    expect(tuned.control.flipReason).toBe('auto_balance_drain');
    expect(tuned.control.payout.toFixed(2)).toBe('0.00');
    expect(tuned.crashPoint).toBeGreaterThanOrEqual(1.0001);
    expect(tuned.crashPoint).toBeLessThan(1.01);
  });

  it('puts controlled losses before a 1.1x auto-cashout can settle', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.9999);
    const service = new CrashSoloService({} as never) as unknown as {
      tuneCrashPoint: (
        naturalCrashPoint: number,
        amount: Prisma.Decimal,
        control: ControlOutcome,
        recentControlledLosses: number,
      ) => { crashPoint: number; control: ControlOutcome };
    };
    const control: ControlOutcome = {
      won: false,
      multiplier: decimal(0),
      payout: decimal(0),
      controlled: true,
      flipReason: 'loss_control',
      controlId: 'loss-1',
    };

    const tuned = service.tuneCrashPoint(20, decimal(5000), control, 0);

    expect(tuned.crashPoint).toBeLessThan(1.01);
    expect(1.1 < tuned.crashPoint).toBe(false);
  });
});

describe('CrashSoloService global member win cap', () => {
  const guard = (overrides: {
    exhausted?: boolean;
    maxPayout?: string | number;
    maxMultiplier?: string | number;
  }): GlobalMemberDailyWinCapGuard => ({
    exhausted: overrides.exhausted ?? false,
    controlId: 'global-member-daily-win-cap',
    reason: 'global_member_daily_win_cap',
    maxPayout: decimal(overrides.maxPayout ?? 10000),
    maxMultiplier: decimal(overrides.maxMultiplier ?? 100),
  });

  it('crashes immediately when even the minimum crash cashout would exceed the 10000 cap', () => {
    const capGuard = guard({ maxPayout: '100.50', maxMultiplier: '1.0050' });

    expect(
      __crashServiceTestHooks.shouldCrashImmediatelyForGlobalCap(capGuard, decimal(100)),
    ).toBe(true);
  });

  it('does not use the start guard as a hard loss after the daily cap is already exhausted', () => {
    const capGuard = guard({ exhausted: true, maxPayout: 0, maxMultiplier: 0 });

    expect(
      __crashServiceTestHooks.shouldCrashImmediatelyForGlobalCap(capGuard, decimal(100)),
    ).toBe(false);
  });

  it('caps crash points before a cashout can exceed the remaining global win cap', () => {
    const capGuard = guard({ maxPayout: '150.00', maxMultiplier: '1.5000' });

    const tuned = __crashServiceTestHooks.capCrashPointForGlobalWinCap(
      {
        crashPoint: 10,
        control: {
          won: false,
          multiplier: decimal(0),
          payout: decimal(0),
          controlled: false,
        },
      },
      capGuard,
    );

    expect(tuned.crashPoint).toBe(1.5001);
    expect(tuned.control.controlled).toBe(true);
    expect(tuned.control.flipReason).toBe('global_member_daily_win_cap');
  });

  it('soft-drains a bbb-style over-cap cashout to zero when the drain gate hits', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
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

  it('does not synthesize a partial cap payout when cashout multiplier is not under the cap', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
    const round = {
      id: 'round-2',
      gameId: GameId.ROCKET,
      roundNumber: 2,
      serverSeedHash: 'hash',
      serverSeed: 'seed',
      crashPoint: decimal(10),
      status: 'RUNNING',
      bettingEndsAt: null,
      startedAt: new Date('2026-06-08T02:00:00Z'),
      crashedAt: null,
      createdAt: new Date('2026-06-08T02:00:00Z'),
    };
    type Round = typeof round;
    let storedBet = {
      id: 'crash-bet-2',
      roundId: round.id,
      round,
      userId: 'near-cap',
      amount: decimal(100),
      autoCashOut: null,
      cashedOutAt: null as Prisma.Decimal | null,
      payout: decimal(0),
      controlOriginal: null,
      controlOutcome: null,
      controlFinalizedAt: null as Date | null,
      createdAt: new Date('2026-06-08T02:00:01Z'),
    };
    type StoredBet = typeof storedBet;
    const user = {
      id: 'near-cap',
      username: 'near-cap',
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
          _sum: { profit: decimal('9950') },
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
    expect(tx.user.update).not.toHaveBeenCalled();
    expect(tx.winLossControlLogs.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          controlId: 'global-member-daily-win-cap',
          userId: 'near-cap',
          gameId: GameId.ROCKET,
          flipReason: 'global_member_daily_win_cap',
        }),
      }),
    );
  });
});
