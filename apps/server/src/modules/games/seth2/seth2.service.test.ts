import { Prisma } from '@prisma/client';
import { seth2BuyFeatureEntry } from '@bg/provably-fair';
import type { Seth2ReturnData } from '@bg/shared';
import { describe, expect, it } from 'vitest';
import {
  advanceSession,
  applyFemaleLockState,
  chooseControlledSethFactor,
  machineDisplayRate,
  machineInfo,
  machineList,
  Seth2Service,
} from './seth2.service.js';
import { seth2ProtocolSchema } from './seth2.schema.js';

const MACHINE_RATE_TIME = 1_800_000_000_000;

describe('Seth2 controlled result selection', () => {
  it('selects a visual win matching normal-spin control bounds', () => {
    const factor = chooseControlledSethFactor(new Prisma.Decimal(18), new Prisma.Decimal(18), {
      won: true,
      multiplier: new Prisma.Decimal(2),
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal(4),
    });
    expect(factor).toBe(2);
  });

  it('maps feature-buy accounting multiplier back to the base-bet visual factor', () => {
    const factor = chooseControlledSethFactor(new Prisma.Decimal(18), new Prisma.Decimal(3600), {
      won: true,
      multiplier: new Prisma.Decimal(2),
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal(3),
    });
    expect(factor).toBe(400);
  });

  it('falls back to a loss when no legal controlled win exists', () => {
    const factor = chooseControlledSethFactor(new Prisma.Decimal(18), new Prisma.Decimal(3600), {
      won: true,
      multiplier: new Prisma.Decimal(2),
      maxPayout: new Prisma.Decimal(3600),
    });
    expect(factor).toBe(0);
  });
});

describe('Seth2 formal-play-only mode', () => {
  it('rejects legacy trial machine entry', async () => {
    const service = new Seth2Service({} as never);

    await expect(
      service.protocol('test-user', {
        type: 'useMachine',
        machineId: 1,
        isFreeModel: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });

  it('rejects legacy trial spins before settlement', async () => {
    const service = new Seth2Service({} as never);

    await expect(
      service.protocol('test-user', {
        type: 'gameToolsList',
        machineId: 1,
        yazhu: 18,
        isFreeModel: 1,
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });
});

describe('Seth2 v1.1.5 feature-purchase handshake', () => {
  const returnData = seth2BuyFeatureEntry('server', 'client', 7, 'awakening').returnData;
  const settlement = {
    returnData,
    balance: 12_345,
    spinId: 'purchase-spin-1',
    session: {
      freeSpinsRemaining: 15,
      featureMode: 'awakening' as const,
      betAmount: '2.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    },
    freeSpin: false,
    buying: true,
    featureIndex: 1 as const,
    totalStake: 2,
    featureWinningsBefore: 0,
  };

  it('returns only a spinId from the purchase request, matching the source client callback', async () => {
    const service = new Seth2Service({} as never);
    (service as unknown as { settle: () => Promise<typeof settlement> }).settle = async () =>
      settlement;

    const result = await service.source('user-1', {
      event: 'spin',
      data: {
        action: 'buyFeature',
        featureIndex: 1,
        stakeValue: 1,
        ratioValue: 0.1,
        machineId: 1,
      },
    });

    expect(result).toMatchObject({
      status: 200,
      engine: { gameState: { spinId: 'purchase-spin-1' }, spinId: 'purchase-spin-1' },
      platform: { player: { balance: { amount: 12_345 } } },
    });
    expect(Array.isArray((result.engine as { gameState: unknown }).gameState)).toBe(false);
  });

  it('returns the reserved visual result without settling or debiting a second time', async () => {
    const service = new Seth2Service({} as never);
    let replayCount = 0;
    (service as unknown as { replayPurchasedSpin: () => Promise<typeof settlement> })
      .replayPurchasedSpin = async () => {
        replayCount += 1;
        return settlement;
      };
    (service as unknown as { settle: () => never }).settle = () => {
      throw new Error('follow-up visual request must not settle again');
    };

    const result = await service.source('user-1', {
      event: 'spin',
      data: { spinId: 'purchase-spin-1', machineId: 1 },
    });

    const states = (result.engine as { gameState: Array<Record<string, unknown>> }).gameState;
    expect(replayCount).toBe(1);
    expect(states.length).toBeGreaterThan(0);
    expect(states[0]).toMatchObject({
      spinId: 'purchase-spin-1',
      startFreeGame: true,
      freeGameCount: 15,
      isGoldenFg: true,
    });
  });
});

describe('Seth2 machine statistics', () => {
  it('reports each machine from its own settled bet and payout totals', () => {
    const machine = machineInfo(
      7,
      {
        machineId: 7,
        todayBet: new Prisma.Decimal(200),
        todayPayout: new Prisma.Decimal(150),
        thirtyDayBet: new Prisma.Decimal(1_000),
        thirtyDayPayout: new Prisma.Decimal(968.95),
      },
      MACHINE_RATE_TIME,
    );

    expect(machine).toMatchObject({
      id: 7,
      code: '0007',
      totalBet: 200,
      day_rate: machineDisplayRate(7, MACHINE_RATE_TIME),
      totalBet30: 1_000,
      day_rate_30: machineDisplayRate(7, MACHINE_RATE_TIME, 1),
    });
  });

  it('keeps empty machine totals at zero while still showing the animated selection rate', () => {
    expect(machineInfo(2, undefined, MACHINE_RATE_TIME)).toMatchObject({
      totalBet: 0,
      day_rate: machineDisplayRate(2, MACHINE_RATE_TIME),
      totalBet30: 0,
      day_rate_30: machineDisplayRate(2, MACHINE_RATE_TIME, 1),
    });
  });

  it('returns eight distinct 500-machine pages covering machine 0001 through 4000', () => {
    const rates = new Set<string>();
    for (let page = 1; page <= 8; page += 1) {
      const machines = machineList(new Map(), page, MACHINE_RATE_TIME);
      expect(machines).toHaveLength(500);
      expect(machines[0]!.id).toBe((page - 1) * 500 + 1);
      expect(machines.at(-1)!.id).toBe(page * 500);
      for (const machine of machines) {
        expect(machine.day_rate).toMatch(/^\d{2,3}\.\d{2}$/);
        expect(Number(machine.day_rate)).toBeGreaterThanOrEqual(70);
        rates.add(machine.day_rate);
      }
    }
    expect(rates.size).toBe(4_000);
  });

  it('changes machine rates every 2.5 seconds and accepts the complete page/id range', () => {
    expect(machineDisplayRate(3974, MACHINE_RATE_TIME + 2_500)).not.toBe(
      machineDisplayRate(3974, MACHINE_RATE_TIME),
    );
    expect(seth2ProtocolSchema.parse({ type: 'getMachineList', page: 8 })).toMatchObject({
      page: 8,
    });
    expect(seth2ProtocolSchema.parse({ type: 'useMachine', machineId: 4000 })).toMatchObject({
      machineId: 4000,
    });
    expect(() => seth2ProtocolSchema.parse({ type: 'getMachineList', page: 9 })).toThrow();
    expect(() => seth2ProtocolSchema.parse({ type: 'useMachine', machineId: 4001 })).toThrow();
  });
});

describe('Seth2 free-game session progression', () => {
  const baseInput = {
    buying: false,
    freeSpin: false,
    betAmount: new Prisma.Decimal(18),
    triggeredFreeSpins: false,
    triggeredFeatureMode: 'none' as const,
    boughtFeatureMode: 'none' as const,
    extraSpins: 0,
    multiplierBankAfter: 0,
    femaleLock: null,
  };

  it('starts all fifteen source games after a natural standard trigger', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 0,
          featureMode: 'none',
          betAmount: '0.00',
          multiplierBank: 0,
          femaleLock: null,
          featureWinnings: 0,
        },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'standard',
        },
      ),
    ).toEqual({
      freeSpinsRemaining: 15,
      featureMode: 'standard',
      betAmount: '18.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it('keeps golden-SCATTER triggers in awakening mode', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 0,
          featureMode: 'none',
          betAmount: '0.00',
          multiplierBank: 0,
          femaleLock: null,
          featureWinnings: 0,
        },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'awakening',
        },
      ),
    ).toEqual({
      freeSpinsRemaining: 15,
      featureMode: 'awakening',
      betAmount: '18.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it.each(['standard', 'awakening'] as const)(
    'records the selected %s purchase mode without consuming the entry board as a game',
    (featureMode) => {
      expect(
        advanceSession(
          {
            freeSpinsRemaining: 0,
            featureMode: 'none',
            betAmount: '0.00',
            multiplierBank: 0,
            femaleLock: null,
            featureWinnings: 0,
          },
          { ...baseInput, buying: true, boughtFeatureMode: featureMode },
        ),
      ).toEqual({
        freeSpinsRemaining: 15,
        featureMode,
        betAmount: '18.00',
        multiplierBank: 0,
        femaleLock: null,
        featureWinnings: 0,
      });
    },
  );

  it('adds five retrigger games after consuming the current game', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 1,
          featureMode: 'awakening',
          betAmount: '18.00',
          multiplierBank: 40,
          femaleLock: null,
          featureWinnings: 10,
        },
        { ...baseInput, freeSpin: true, extraSpins: 5, multiplierBankAfter: 52 },
      ),
    ).toEqual({
      freeSpinsRemaining: 5,
      featureMode: 'awakening',
      betAmount: '18.00',
      multiplierBank: 52,
      femaleLock: null,
      featureWinnings: 10,
    });
  });

  it('caps accumulated free games at one hundred', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 98,
          featureMode: 'standard',
          betAmount: '18.00',
          multiplierBank: 20,
          femaleLock: null,
          featureWinnings: 10,
        },
        { ...baseInput, freeSpin: true, extraSpins: 5, multiplierBankAfter: 30 },
      ),
    ).toEqual({
      freeSpinsRemaining: 100,
      featureMode: 'standard',
      betAmount: '18.00',
      multiplierBank: 30,
      femaleLock: null,
      featureWinnings: 10,
    });
  });

  it('clears the feature only after the final non-retrigger spin', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 1,
          featureMode: 'standard',
          betAmount: '18.00',
          multiplierBank: 120,
          femaleLock: null,
          featureWinnings: 25,
        },
        { ...baseInput, freeSpin: true, multiplierBankAfter: 140 },
      ),
    ).toEqual({
      freeSpinsRemaining: 0,
      featureMode: 'none',
      betAmount: '0.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it('keeps the woman multiplier lock for the source 4 -> 3 -> 2 -> 1 sequence', () => {
    const cell = { type: 10 as const, mul: 5, mul_type: 0, code: 13 };
    const firstData = {
      type18_start_mul_list: [cell],
      type18_mul_count: 4,
    } as unknown as Seth2ReturnData;
    const first = applyFemaleLockState(firstData, null);
    expect(firstData.type18_mul_count).toBe(4);
    expect(first).toEqual({ cells: [cell], gamesRemaining: 3 });

    const observed: number[] = [];
    let current = first;
    for (let index = 0; index < 3; index += 1) {
      const start_data = Array.from({ length: 30 }, (_, code) => ({
        type: (code % 9) + 1,
        mul: 0,
      }));
      const data = {
        list: [{ start_data, remove_type: [] }],
        type18_start_mul_list: [],
        type18_mul_count: 0,
      } as unknown as Seth2ReturnData;
      current = applyFemaleLockState(data, current);
      observed.push(data.type18_mul_count);
      expect(data.type18_start_mul_list).toEqual([cell]);
      expect(data.list[0]!.start_data[cell.code]).toEqual(cell);
    }
    expect(observed).toEqual([3, 2, 1]);
    expect(current).toBeNull();
  });
});
