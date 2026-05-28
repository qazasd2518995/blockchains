import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateAutoDetectionBitePlan,
  distributeAutoDetectionRedistribution,
  findApplicableBurstControl,
} from './controls.runtime.js';

describe('calculateAutoDetectionBitePlan', () => {
  it('turns bite percentage into the next superior-settlement target', async () => {
    const db = {
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u1' }, { id: 'u2' }]),
        aggregate: vi.fn().mockResolvedValue({
          _sum: { balance: new Prisma.Decimal(10000) },
        }),
      },
    };

    const plan = await calculateAutoDetectionBitePlan(db as never, {
      scope: 'ALL',
      bitePercentage: '10',
      houseTakePercentage: '10',
      currentSettlement: '0',
    });

    expect(plan.capitalAmount.toFixed(2)).toBe('10000.00');
    expect(plan.biteAmount.toFixed(2)).toBe('1000.00');
    expect(plan.platformTake.toFixed(2)).toBe('100.00');
    expect(plan.redistributionAmount.toFixed(2)).toBe('900.00');
    expect(plan.targetSettlement.toFixed(2)).toBe('100.00');
  });
});

describe('distributeAutoDetectionRedistribution', () => {
  it('credits the redistribution pool to funded members only', async () => {
    const db = {
      user: {
        findMany: vi
          .fn()
          .mockResolvedValueOnce([{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }])
          .mockResolvedValueOnce([
            { id: 'u1', username: 'alice', balance: new Prisma.Decimal(1000) },
            { id: 'u3', username: 'cindy', balance: new Prisma.Decimal(3000) },
          ]),
        update: vi.fn().mockResolvedValue({ balance: new Prisma.Decimal(550) }),
      },
      transaction: {
        findMany: vi.fn().mockResolvedValue([{ userId: 'u1' }, { userId: 'u3' }]),
        create: vi.fn().mockResolvedValue({}),
      },
    };

    const result = await distributeAutoDetectionRedistribution(
      db as never,
      {
        id: 'control-1',
        scope: 'ALL',
        cycleCount: 0,
      },
      {
        gameDay: '2026-05-26',
        bitePercentage: new Prisma.Decimal(10),
        houseTakePercentage: new Prisma.Decimal(10),
        capitalAmount: new Prisma.Decimal(10000),
        biteAmount: new Prisma.Decimal(1000),
        platformTake: new Prisma.Decimal(100),
        redistributionAmount: new Prisma.Decimal(900),
        currentSettlement: new Prisma.Decimal(0),
        targetSettlement: new Prisma.Decimal(100),
      },
    );

    expect(result.memberCount).toBe(2);
    expect(result.distributedAmount.toFixed(2)).toBe('900.00');
    expect(db.user.update).toHaveBeenCalledTimes(4);
    expect(db.transaction.create).toHaveBeenCalledTimes(4);
  });
});

describe('findApplicableBurstControl', () => {
  it('ignores global and agent-line burst controls', async () => {
    const db = {
      burstControl: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'global',
            scope: 'ALL',
            targetMemberUsername: null,
            targetAgentId: null,
            gameIds: [],
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
          },
          {
            id: 'line',
            scope: 'AGENT_LINE',
            targetMemberUsername: null,
            targetAgentId: 'a1',
            gameIds: [],
            createdAt: new Date('2026-01-04T00:00:00.000Z'),
          },
        ]),
      },
    };

    const applicable = await findApplicableBurstControl(
      db as never,
      { username: 'demo', agentId: 'a1' },
      'rocket',
    );

    expect(applicable).toBeNull();
  });

  it('skips burst controls that are scoped to a different game id', async () => {
    const matchingControl = {
      id: 'matching',
      scope: 'MEMBER',
      targetMemberUsername: 'demo',
      targetAgentId: null,
      gameIds: ['rocket'],
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const db = {
      burstControl: {
        findMany: vi.fn().mockResolvedValue([
          {
            ...matchingControl,
            id: 'other-game',
            gameIds: ['keno'],
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
          },
          matchingControl,
        ]),
      },
    };

    const applicable = await findApplicableBurstControl(
      db as never,
      { username: 'demo', agentId: null },
      'rocket',
    );

    expect(applicable?.control.id).toBe('matching');
  });
});
