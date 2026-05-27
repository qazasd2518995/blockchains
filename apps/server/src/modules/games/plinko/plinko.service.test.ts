import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { plinkoTable } from '@bg/provably-fair';
import { __plinkoServiceTestHooks } from './plinko.service.js';

describe('plinko controlled loss shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does not always force single-ball losses to the lowest multiplier', () => {
    const table = plinkoTable('medium', 12);
    const amount = new Prisma.Decimal(10);
    const picks = new Set<number>();

    for (let index = 0; index < 20; index += 1) {
      picks.add(__plinkoServiceTestHooks.chooseControlledLossBucket(table, amount, 6));
    }

    expect(picks.size).toBeGreaterThan(1);
    expect([...picks].every((bucket) => table[bucket]! <= 1)).toBe(true);
  });

  it('allows distributed batch losses while keeping the batch below stake', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.7)
      .mockReturnValueOnce(0.33)
      .mockReturnValueOnce(0.55);

    const table = plinkoTable('low', 8);
    const amount = new Prisma.Decimal(10);
    const context = {
      totalStake: new Prisma.Decimal(50),
      totalPayout: new Prisma.Decimal(0),
      settledBalls: 0,
      totalBalls: 5,
    };
    const buckets: number[] = [];

    for (let index = 0; index < context.totalBalls; index += 1) {
      const bucket = __plinkoServiceTestHooks.chooseControlledLossBucket(table, amount, 4, context);
      buckets.push(bucket);
      context.totalPayout = context.totalPayout.add(amount.mul(table[bucket]!));
      context.settledBalls += 1;
    }

    expect(new Set(buckets).size).toBeGreaterThan(1);
    expect(buckets.some((bucket) => table[bucket]! >= 1)).toBe(true);
    expect(context.totalPayout.lessThan(context.totalStake)).toBe(true);
  });
});
