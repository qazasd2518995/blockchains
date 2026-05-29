import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateAutoDetectionBitePlan,
  checkAndCompleteManualDetectionControls,
  distributeAutoDetectionRedistribution,
  findApplicableBurstControl,
  findApplicableManualDetectionControl,
  maybeCreateStarterConfidenceManualDetectionControl,
  STARTER_CONFIDENCE_OPERATOR,
} from './controls.runtime.js';

describe('calculateAutoDetectionBitePlan', () => {
  it('turns bite percentage into the next superior-settlement target', async () => {
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'a1' }]),
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
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'a1' }]),
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

describe('findApplicableManualDetectionControl no-count lines', () => {
  it('does not apply global manual detection to a control-excluded agent line', async () => {
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'global',
            scope: 'ALL',
            targetAgentId: null,
            targetMemberUsername: null,
            createdAt: new Date('2026-01-01T00:00:00.000Z'),
          },
        ]),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ exists: true }]),
    };

    const applicable = await findApplicableManualDetectionControl(db as never, {
      username: 'demo',
      agentId: 'test111-agent',
    });

    expect(applicable).toBeNull();
  });

  it('still applies manual detection when the excluded line is directly targeted', async () => {
    const lineControl = {
      id: 'line',
      scope: 'AGENT_LINE',
      targetAgentId: 'test111-agent',
      targetMemberUsername: null,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    };
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([
          {
            id: 'global',
            scope: 'ALL',
            targetAgentId: null,
            targetMemberUsername: null,
            createdAt: new Date('2026-01-03T00:00:00.000Z'),
          },
          lineControl,
        ]),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'test111-agent', depth: 0 }]),
    };

    const applicable = await findApplicableManualDetectionControl(db as never, {
      username: 'demo',
      agentId: 'test111-agent',
    });

    expect(applicable?.control.id).toBe('line');
    expect(applicable?.depth).toBe(0);
  });
});

describe('maybeCreateStarterConfidenceManualDetectionControl', () => {
  it('creates a member manual-detection win target 2000 points below current superior settlement', async () => {
    const db = {
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', agentId: null }),
      },
      manualDetectionControl: {
        findFirst: vi.fn().mockResolvedValue(null),
        create: vi.fn().mockResolvedValue({ id: 'control-1' }),
      },
    };

    const result = await maybeCreateStarterConfidenceManualDetectionControl(db as never, {
      memberId: 'u1',
      memberUsername: 'newbie',
      operatorId: 'admin-1',
    });

    expect(result.created).toBe(true);
    expect(result.targetPlayerWin.toFixed(2)).toBe('2000.00');
    expect(result.targetSettlement.toFixed(2)).toBe('-2000.00');
    expect(db.manualDetectionControl.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        scope: 'MEMBER',
        targetMemberId: 'u1',
        targetMemberUsername: 'newbie',
        targetSettlement: new Prisma.Decimal(-2000),
        controlPercentage: 100,
        startSettlement: new Prisma.Decimal(0),
        operatorUsername: STARTER_CONFIDENCE_OPERATOR,
      }),
    });
  });

  it('deactivates starter confidence controls after the 2000 point target is reached', async () => {
    const starter = {
      id: 'starter-1',
      scope: 'MEMBER',
      targetAgentId: null,
      targetMemberUsername: 'newbie',
      targetSettlement: new Prisma.Decimal(-2000),
      startSettlement: new Prisma.Decimal(0),
      bitePercentage: null,
      isCompleted: false,
      operatorUsername: STARTER_CONFIDENCE_OPERATOR,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    };
    const agentProfile = {
      id: 'a1',
      parentId: null,
      rebateMode: 'PERCENTAGE',
      rebatePercentage: new Prisma.Decimal(0),
      maxRebatePercentage: new Prisma.Decimal(0),
      baccaratRebateMode: 'PERCENTAGE',
      baccaratRebatePercentage: new Prisma.Decimal(0),
      maxBaccaratRebatePercentage: new Prisma.Decimal(0),
    };
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([starter]),
        update: vi.fn().mockResolvedValue({}),
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', agentId: 'a1' }),
      },
      agent: {
        findUnique: vi.fn().mockResolvedValue(agentProfile),
      },
      bet: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _count: { _all: 1 },
            _sum: {
              amount: new Prisma.Decimal(10),
              payout: new Prisma.Decimal(2510),
              profit: new Prisma.Decimal(2500),
            },
          })
          .mockResolvedValueOnce({ _sum: { amount: new Prisma.Decimal(0) } }),
        findMany: vi.fn().mockResolvedValue([{ userId: 'u1' }]),
      },
      crashBet: {
        aggregate: vi
          .fn()
          .mockResolvedValue({ _count: { _all: 0 }, _sum: { amount: null, payout: null } }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await checkAndCompleteManualDetectionControls(db as never);

    expect(result.completedCount).toBe(1);
    expect(db.manualDetectionControl.update).toHaveBeenCalledWith({
      where: { id: 'starter-1' },
      data: expect.objectContaining({
        isActive: false,
        isCompleted: true,
        completionSettlement: new Prisma.Decimal(-2500),
      }),
    });
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
