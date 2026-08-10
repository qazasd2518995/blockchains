import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import {
  advanceSession,
  chooseControlledSethFactor,
  machineInfo,
  Seth2Service,
} from './seth2.service.js';

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

describe('Seth2 machine statistics', () => {
  it('reports each machine from its own settled bet and payout totals', () => {
    const machine = machineInfo(7, {
      machineId: 7,
      todayBet: new Prisma.Decimal(200),
      todayPayout: new Prisma.Decimal(150),
      thirtyDayBet: new Prisma.Decimal(1_000),
      thirtyDayPayout: new Prisma.Decimal(968.95),
    });

    expect(machine).toMatchObject({
      id: 7,
      code: '007',
      totalBet: 200,
      day_rate: '75.00',
      totalBet30: 1_000,
      day_rate_30: '96.89',
    });
  });

  it('shows zero activity instead of fabricated room history', () => {
    expect(machineInfo(2)).toMatchObject({
      totalBet: 0,
      day_rate: '0.00',
      totalBet30: 0,
      day_rate_30: '0.00',
    });
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
  };

  it('starts all fifteen games after a natural standard trigger', () => {
    expect(
      advanceSession(
        { freeSpinsRemaining: 0, featureMode: 'none', betAmount: '0.00' },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'standard',
        },
      ),
    ).toEqual({ freeSpinsRemaining: 15, featureMode: 'standard', betAmount: '18.00' });
  });

  it('keeps golden-SCATTER triggers in awakening mode', () => {
    expect(
      advanceSession(
        { freeSpinsRemaining: 0, featureMode: 'none', betAmount: '0.00' },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'awakening',
        },
      ),
    ).toEqual({ freeSpinsRemaining: 15, featureMode: 'awakening', betAmount: '18.00' });
  });

  it.each(['standard', 'awakening'] as const)(
    'records the selected %s purchase mode and consumes its first game',
    (featureMode) => {
      expect(
        advanceSession(
          { freeSpinsRemaining: 0, featureMode: 'none', betAmount: '0.00' },
          { ...baseInput, buying: true, boughtFeatureMode: featureMode },
        ),
      ).toEqual({ freeSpinsRemaining: 14, featureMode, betAmount: '18.00' });
    },
  );

  it('adds five retrigger games after consuming the current game', () => {
    expect(
      advanceSession(
        { freeSpinsRemaining: 1, featureMode: 'awakening', betAmount: '18.00' },
        { ...baseInput, freeSpin: true, extraSpins: 5 },
      ),
    ).toEqual({ freeSpinsRemaining: 5, featureMode: 'awakening', betAmount: '18.00' });
  });

  it('caps accumulated free games at one hundred', () => {
    expect(
      advanceSession(
        { freeSpinsRemaining: 98, featureMode: 'standard', betAmount: '18.00' },
        { ...baseInput, freeSpin: true, extraSpins: 5 },
      ),
    ).toEqual({ freeSpinsRemaining: 100, featureMode: 'standard', betAmount: '18.00' });
  });

  it('clears the feature only after the final non-retrigger spin', () => {
    expect(
      advanceSession(
        { freeSpinsRemaining: 1, featureMode: 'standard', betAmount: '18.00' },
        { ...baseInput, freeSpin: true },
      ),
    ).toEqual({ freeSpinsRemaining: 0, featureMode: 'none', betAmount: '0.00' });
  });
});
