import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateDefaultManualTargetBand,
  calculateAutoDetectionBitePlan,
  checkAndCompleteManualDetectionControls,
  distributeAutoDetectionRedistribution,
  findApplicableBurstControl,
  findApplicableManualDetectionControl,
  getDefaultManualDetectionCompletionBehavior,
  normalizeManualDetectionCompletionBehavior,
  resetMemberAutoBalanceControl,
} from './controls.runtime.js';
import { __controlsTestHooks } from '../../games/_common/controls.js';

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

describe('resetMemberAutoBalanceControl', () => {
  it('uses 20 percent bite target and 40 percent revive target for each new balance cycle', async () => {
    const upsert = vi.fn().mockResolvedValue({});
    const db = {
      $queryRaw: vi.fn().mockResolvedValue([{ exists: false }]),
      memberDepositControl: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      manualDetectionControl: { updateMany: vi.fn().mockResolvedValue({ count: 0 }) },
      memberAutoBalanceControl: { upsert },
    };

    await resetMemberAutoBalanceControl(db as never, {
      memberId: 'member-1',
      memberUsername: 'top3666',
      agentId: 'agent-1',
      balanceAfter: new Prisma.Decimal(50000),
      reason: 'test_deposit',
    });

    const create = upsert.mock.calls[0]?.[0]?.create;
    expect(create.baselineBalance.toFixed(2)).toBe('50000.00');
    expect(create.biteTargetBalance.toFixed(2)).toBe('10000.00');
    expect(create.reviveTargetBalance.toFixed(2)).toBe('20000.00');
    expect(create.phase).toBe('BITE_TO_30');
    expect(create.isActive).toBe(true);
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

describe('manual detection hold target behavior', () => {
  it('defaults to returning to the parent scope unless hold target is selected', () => {
    const defaultBehavior = getDefaultManualDetectionCompletionBehavior('AGENT_LINE');
    const holdBehavior = normalizeManualDetectionCompletionBehavior(
      'AGENT_LINE',
      null,
      'hold_target',
    );
    const memberHoldBehavior = normalizeManualDetectionCompletionBehavior(
      'MEMBER',
      null,
      'hold_target',
    );

    expect(defaultBehavior).toBe('stop_on_target');
    expect(holdBehavior).toBe('hold_target');
    expect(memberHoldBehavior).toBe('hold_target');
    expect(
      normalizeManualDetectionCompletionBehavior('ALL', null, 'hold_target'),
    ).toBe('stop_on_target');
    expect(calculateDefaultManualTargetBand('AGENT_LINE', '10000', holdBehavior).toFixed(2)).toBe(
      '1000.00',
    );
    expect(calculateDefaultManualTargetBand('MEMBER', '20000', memberHoldBehavior).toFixed(2)).toBe(
      '1000.00',
    );
    expect(calculateDefaultManualTargetBand('AGENT_LINE', '-300000', holdBehavior).toFixed(2)).toBe(
      '10000.00',
    );
    expect(calculateDefaultManualTargetBand('AGENT_LINE', '10000', defaultBehavior).toFixed(2)).toBe(
      '0.00',
    );
  });

  it('keeps hold-target agent-line controls active after reaching the target', async () => {
    const control = {
      id: 'line-hold',
      scope: 'AGENT_LINE',
      targetAgentId: 'line-a',
      targetMemberUsername: null,
      targetSettlement: new Prisma.Decimal(10000),
      startSettlement: new Prisma.Decimal(0),
      bitePercentage: null,
      completionBehavior: 'hold_target',
      targetBand: new Prisma.Decimal(1000),
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    };
    const update = vi.fn();
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([control]),
        update,
      },
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'line-a',
          parentId: null,
          rebateMode: 'NONE',
          rebatePercentage: new Prisma.Decimal(0),
          maxRebatePercentage: new Prisma.Decimal(0),
          baccaratRebateMode: 'NONE',
          baccaratRebatePercentage: new Prisma.Decimal(0),
          maxBaccaratRebatePercentage: new Prisma.Decimal(0),
        }),
      },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'line-a' }]),
      user: {
        findMany: vi.fn().mockResolvedValue([{ id: 'u1' }]),
      },
      bet: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _count: { _all: 1 },
            _sum: {
              amount: new Prisma.Decimal(10000),
              payout: new Prisma.Decimal(0),
              profit: new Prisma.Decimal(-10000),
            },
          })
          .mockResolvedValueOnce({
            _sum: { amount: new Prisma.Decimal(0) },
          }),
        findMany: vi.fn().mockResolvedValue([{ userId: 'u1' }]),
      },
      crashBet: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { amount: null, payout: null },
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await checkAndCompleteManualDetectionControls(db as never);

    expect(result.completedCount).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps hold-target member controls visible when current settlement equals target', async () => {
    const control = {
      id: 'member-hold',
      scope: 'MEMBER',
      targetAgentId: null,
      targetMemberUsername: 'demo',
      targetSettlement: new Prisma.Decimal(0),
      startSettlement: new Prisma.Decimal(0),
      bitePercentage: null,
      completionBehavior: 'hold_target',
      targetBand: new Prisma.Decimal(0),
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    };
    const update = vi.fn();
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([control]),
        update,
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', agentId: 'agent-a' }),
      },
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'agent-a',
          parentId: null,
          rebateMode: 'NONE',
          rebatePercentage: new Prisma.Decimal(0),
          maxRebatePercentage: new Prisma.Decimal(0),
          baccaratRebateMode: 'NONE',
          baccaratRebatePercentage: new Prisma.Decimal(0),
          maxBaccaratRebatePercentage: new Prisma.Decimal(0),
        }),
      },
      bet: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _count: { _all: 0 },
            _sum: { amount: null, payout: null, profit: null },
          })
          .mockResolvedValueOnce({
            _sum: { amount: null },
          }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      crashBet: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { amount: null, payout: null },
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await checkAndCompleteManualDetectionControls(db as never);

    expect(result.completedCount).toBe(0);
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps stop-on-target member controls visible when created at the target', async () => {
    const control = {
      id: 'member-stop-at-target',
      scope: 'MEMBER',
      targetAgentId: null,
      targetMemberUsername: 'demo',
      targetSettlement: new Prisma.Decimal(0),
      startSettlement: new Prisma.Decimal(0),
      bitePercentage: null,
      completionBehavior: 'stop_on_target',
      targetBand: new Prisma.Decimal(0),
      createdAt: new Date('2026-01-05T00:00:00.000Z'),
    };
    const update = vi.fn();
    const db = {
      manualDetectionControl: {
        findMany: vi.fn().mockResolvedValue([control]),
        update,
      },
      user: {
        findUnique: vi.fn().mockResolvedValue({ id: 'u1', agentId: 'agent-a' }),
      },
      agent: {
        findUnique: vi.fn().mockResolvedValue({
          id: 'agent-a',
          parentId: null,
          rebateMode: 'NONE',
          rebatePercentage: new Prisma.Decimal(0),
          maxRebatePercentage: new Prisma.Decimal(0),
          baccaratRebateMode: 'NONE',
          baccaratRebatePercentage: new Prisma.Decimal(0),
          maxBaccaratRebatePercentage: new Prisma.Decimal(0),
        }),
      },
      bet: {
        aggregate: vi
          .fn()
          .mockResolvedValueOnce({
            _count: { _all: 0 },
            _sum: { amount: null, payout: null, profit: null },
          })
          .mockResolvedValueOnce({
            _sum: { amount: null },
          }),
        findMany: vi.fn().mockResolvedValue([]),
      },
      crashBet: {
        aggregate: vi.fn().mockResolvedValue({
          _count: { _all: 0 },
          _sum: { amount: null, payout: null },
        }),
        findMany: vi.fn().mockResolvedValue([]),
      },
    };

    const result = await checkAndCompleteManualDetectionControls(db as never);

    expect(result.completedCount).toBe(0);
    expect(update).not.toHaveBeenCalled();
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
      $queryRaw: vi.fn().mockResolvedValueOnce([{ id: 'test111-agent', depth: 0 }]),
    };

    const applicable = await findApplicableManualDetectionControl(db as never, {
      username: 'demo',
      agentId: 'test111-agent',
    });

    expect(applicable?.control.id).toBe('line');
    expect(applicable?.depth).toBe(0);
  });
});

describe('findApplicableManualDetectionControl priority fallback', () => {
  const activeControls = [
    {
      id: 'member-done',
      scope: 'MEMBER',
      targetAgentId: null,
      targetMemberUsername: 'demo',
      isCompleted: true,
      createdAt: new Date('2026-01-04T00:00:00.000Z'),
    },
    {
      id: 'line-active',
      scope: 'AGENT_LINE',
      targetAgentId: 'line-a',
      targetMemberUsername: null,
      isCompleted: false,
      createdAt: new Date('2026-01-03T00:00:00.000Z'),
    },
    {
      id: 'global-active',
      scope: 'ALL',
      targetAgentId: null,
      targetMemberUsername: null,
      isCompleted: false,
      createdAt: new Date('2026-01-02T00:00:00.000Z'),
    },
  ];

  it('falls back from completed member control to agent-line control', async () => {
    const findMany = vi.fn(({ where }) =>
      Promise.resolve(activeControls.filter((control) => control.isCompleted === where.isCompleted)),
    );
    const db = {
      manualDetectionControl: { findMany },
      $queryRaw: vi.fn().mockResolvedValue([{ id: 'member-agent', depth: 0 }, { id: 'line-a', depth: 1 }]),
    };

    const applicable = await findApplicableManualDetectionControl(db as never, {
      username: 'demo',
      agentId: 'member-agent',
    });

    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isActive: true, isCompleted: false }),
      }),
    );
    expect(applicable?.control.id).toBe('line-active');
  });

  it('falls back from completed member and line controls to global control', async () => {
    const controls = activeControls.map((control) =>
      control.id === 'line-active' ? { ...control, isCompleted: true } : control,
    );
    const db = {
      manualDetectionControl: {
        findMany: vi.fn(({ where }) =>
          Promise.resolve(controls.filter((control) => control.isCompleted === where.isCompleted)),
        ),
      },
      $queryRaw: vi
        .fn()
        .mockResolvedValueOnce([{ id: 'member-agent', depth: 0 }, { id: 'line-a', depth: 1 }])
        .mockResolvedValueOnce([{ exists: false }]),
    };

    const applicable = await findApplicableManualDetectionControl(db as never, {
      username: 'demo',
      agentId: 'member-agent',
    });

    expect(applicable?.control.id).toBe('global-active');
  });
});

describe('manual detection direction', () => {
  it('keeps the original target direction from start settlement to target settlement', () => {
    const { resolveManualDetectionDesired } = __controlsTestHooks;

    expect(
      resolveManualDetectionDesired(
        new Prisma.Decimal(2_000_000),
        new Prisma.Decimal(950_000),
        new Prisma.Decimal(-50_000),
      ),
    ).toBe('LOSS');

    expect(
      resolveManualDetectionDesired(
        new Prisma.Decimal(-2_000_000),
        new Prisma.Decimal(-950_000),
        new Prisma.Decimal(50_000),
      ),
    ).toBe('WIN');
  });

  it('uses current settlement to pull hold-target controls back toward target', () => {
    const { resolveHoldTargetManualDetectionDesired, isWithinManualTargetBand } =
      __controlsTestHooks;

    expect(
      resolveHoldTargetManualDetectionDesired(
        new Prisma.Decimal(8000),
        new Prisma.Decimal(10000),
      ),
    ).toBe('LOSS');
    expect(
      resolveHoldTargetManualDetectionDesired(
        new Prisma.Decimal(12000),
        new Prisma.Decimal(10000),
      ),
    ).toBe('WIN');
    expect(
      isWithinManualTargetBand(new Prisma.Decimal(10500), {
        scope: 'AGENT_LINE',
        targetSettlement: new Prisma.Decimal(10000),
        completionBehavior: 'hold_target',
        targetBand: new Prisma.Decimal(1000),
      }),
    ).toBe(true);
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
