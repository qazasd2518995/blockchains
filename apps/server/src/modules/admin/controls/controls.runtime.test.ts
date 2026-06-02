import { Prisma } from '@prisma/client';
import { describe, expect, it, vi } from 'vitest';
import {
  calculateAutoDetectionBitePlan,
  checkAndCompleteManualDetectionControls,
  distributeAutoDetectionRedistribution,
  findApplicableBurstControl,
  findApplicableManualDetectionControl,
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
