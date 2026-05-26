import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import { calculateAutoDetectionBitePlan, findApplicableBurstControl } from './controls.runtime.js';

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

describe('findApplicableBurstControl', () => {
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
