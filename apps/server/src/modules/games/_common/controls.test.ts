import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameId } from '@bg/shared';
import {
  __controlsTestHooks,
  applyControls,
  isBurstControlEligible,
  multiplierExceedsControlCeiling,
  passesControlInterventionRate,
  rankWinLossControls,
  resolveGameMatchedCashoutControl,
} from './controls.js';

const prediction = (multiplier: number) => ({
  multiplier: new Prisma.Decimal(multiplier),
});

const predictedResult = (amount: string | number, payout: string | number, multiplier = 1) => {
  const amountDecimal = new Prisma.Decimal(amount);
  const payoutDecimal = new Prisma.Decimal(payout);
  return {
    won: payoutDecimal.greaterThan(amountDecimal),
    amount: amountDecimal,
    multiplier: new Prisma.Decimal(multiplier),
    payout: payoutDecimal,
  };
};

const controlledLossLog = (
  amount: string | number,
  reason = 'loss_control',
  payout: string | number = 0,
) => ({
  flipReason: reason,
  finalResult: {
    won: false,
    amount: new Prisma.Decimal(amount).toFixed(2),
    multiplier: '0.0000',
    payout: new Prisma.Decimal(payout).toFixed(2),
  },
});

const winLossControl = (over: {
  id: string;
  controlMode: string;
  targetId: string | null;
  winControl?: boolean;
  lossControl?: boolean;
  controlPercentage?: Prisma.Decimal;
  targetLossAmount?: Prisma.Decimal | null;
  currentLossAmount?: Prisma.Decimal;
  createdAt?: Date;
}) => ({
  winControl: false,
  lossControl: false,
  controlPercentage: new Prisma.Decimal(100),
  targetLossAmount: null,
  currentLossAmount: new Prisma.Decimal(0),
  createdAt: new Date('2026-01-01T00:00:00Z'),
  ...over,
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('passesControlInterventionRate', () => {
  it('treats the percentage as an intervention gate, not a forced result rate', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.49).mockReturnValueOnce(0.5);

    expect(passesControlInterventionRate(50)).toBe(true);
    expect(passesControlInterventionRate(50)).toBe(false);
  });

  it('always passes 100 percent and always skips 0 percent', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.999999).mockReturnValueOnce(0);

    expect(passesControlInterventionRate(new Prisma.Decimal(100))).toBe(true);
    expect(passesControlInterventionRate(0)).toBe(false);
  });

  it('applies auto-balance bite intervention about 30 percent of the time', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.29).mockReturnValueOnce(0.3);

    expect(__controlsTestHooks.passesAutoBalanceLossInterventionRate()).toBe(true);
    expect(__controlsTestHooks.passesAutoBalanceLossInterventionRate()).toBe(false);
  });

  it('keeps auto-balance drain intervention at 40 percent', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39).mockReturnValueOnce(0.4);

    expect(__controlsTestHooks.passesAutoBalanceLossInterventionRate('auto_balance_drain')).toBe(
      true,
    );
    expect(__controlsTestHooks.passesAutoBalanceLossInterventionRate('auto_balance_drain')).toBe(
      false,
    );
  });
});

describe('isBurstControlEligible', () => {
  it('keeps burst control enabled only for slot games', () => {
    expect(isBurstControlEligible(GameId.DRAGON_MEGA_SLOT, prediction(0))).toBe(true);
    expect(isBurstControlEligible(GameId.HOTLINE, prediction(0))).toBe(true);
    expect(isBurstControlEligible(GameId.FRUIT_SLOT, prediction(0))).toBe(true);
  });

  it('does not apply burst control to non-slot games', () => {
    expect(isBurstControlEligible(GameId.BLACKJACK, prediction(2.5))).toBe(false);
    expect(isBurstControlEligible(GameId.MINI_ROULETTE, prediction(12))).toBe(false);
    expect(isBurstControlEligible(GameId.CARNIVAL, prediction(12))).toBe(false);
    expect(isBurstControlEligible(GameId.DICE, prediction(24.125))).toBe(false);
    expect(
      isBurstControlEligible(GameId.WHEEL, prediction(0), { burstPotentialMultiplier: 80 }),
    ).toBe(false);
    expect(isBurstControlEligible(GameId.PLINKO, prediction(100))).toBe(false);
    expect(isBurstControlEligible(GameId.MINES, prediction(0))).toBe(false);
    expect(isBurstControlEligible(GameId.ROCKET, prediction(1))).toBe(false);
  });

  it('does not let non-slot paths opt in explicitly', () => {
    expect(
      isBurstControlEligible(GameId.MINI_ROULETTE, prediction(1), { burstEligible: true }),
    ).toBe(false);
    expect(isBurstControlEligible(GameId.HOTLINE, prediction(100), { burstEligible: false })).toBe(
      false,
    );
  });
});

describe('multiplierExceedsControlCeiling', () => {
  it('ignores lower-bound win preferences and only checks hard ceilings', () => {
    const amount = new Prisma.Decimal(100);

    expect(
      multiplierExceedsControlCeiling(new Prisma.Decimal('0.5'), amount, {
        maxMultiplier: new Prisma.Decimal(2),
      }),
    ).toBe(false);
    expect(
      multiplierExceedsControlCeiling(new Prisma.Decimal('1.4'), amount, {
        maxPayout: new Prisma.Decimal(150),
      }),
    ).toBe(false);
    expect(
      multiplierExceedsControlCeiling(new Prisma.Decimal(2), amount, {
        maxPayout: new Prisma.Decimal(150),
      }),
    ).toBe(true);
    expect(
      multiplierExceedsControlCeiling(new Prisma.Decimal(3), amount, {
        maxMultiplier: new Prisma.Decimal(2),
      }),
    ).toBe(true);
  });
});

describe('rankWinLossControls priority', () => {
  const MEMBER = 'member-1';
  const PARENT = 'agent-parent';
  const ancestors = [PARENT, 'agent-grandparent'];

  it('lets an agent-line WIN override a member-level LOSS like the legacy priority system', () => {
    const memberLoss = winLossControl({
      id: 'm-loss',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      lossControl: true,
    });
    const agentWin = winLossControl({
      id: 'a-win',
      controlMode: 'AGENT_LINE',
      targetId: PARENT,
      winControl: true,
    });

    const selected = rankWinLossControls([agentWin, memberLoss], MEMBER, ancestors);
    expect(selected?.control.id).toBe('a-win');
    expect(selected?.desired).toBe('WIN');
  });

  it('still favors WIN over LOSS at the same specificity (member level)', () => {
    const memberWin = winLossControl({
      id: 'm-win',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      winControl: true,
    });
    const memberLoss = winLossControl({
      id: 'm-loss',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      lossControl: true,
    });

    const selected = rankWinLossControls([memberLoss, memberWin], MEMBER, ancestors);
    expect(selected?.control.id).toBe('m-win');
  });

  it('ranks a nearer ancestor above a deeper one, and agent-line above global', () => {
    const nearWin = winLossControl({
      id: 'near',
      controlMode: 'AGENT_LINE',
      targetId: PARENT,
      winControl: true,
    });
    const farWin = winLossControl({
      id: 'far',
      controlMode: 'AGENT_LINE',
      targetId: 'agent-grandparent',
      winControl: true,
    });
    const globalLoss = winLossControl({
      id: 'global',
      controlMode: 'NORMAL',
      targetId: null,
      lossControl: true,
    });

    const selected = rankWinLossControls([globalLoss, farWin, nearWin], MEMBER, ancestors);
    expect(selected?.control.id).toBe('near');
  });

  it('agent-line WIN/LOSS bands never overlap regardless of depth', () => {
    const deepAncestors = Array.from({ length: 20 }, (_, i) => `agent-${i}`);
    const shallowLoss = winLossControl({
      id: 'shallow-loss',
      controlMode: 'AGENT_LINE',
      targetId: 'agent-0',
      lossControl: true,
    });
    const deepWin = winLossControl({
      id: 'deep-win',
      controlMode: 'AGENT_LINE',
      targetId: 'agent-19',
      winControl: true,
    });

    // 即使 deep WIN 在很深的層級，它的 priority(10-39) 仍應高於 shallow LOSS(60)，
    // 故 deep WIN 勝出——WIN 帶永遠在 LOSS 帶之前，不因 depth 交錯。
    const selected = rankWinLossControls([shallowLoss, deepWin], MEMBER, deepAncestors);
    expect(selected?.control.id).toBe('deep-win');
  });

  it('keeps member-level LOSS above agent-line LOSS', () => {
    const memberLoss = winLossControl({
      id: 'member-loss',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      lossControl: true,
    });
    const agentLoss = winLossControl({
      id: 'agent-loss',
      controlMode: 'AGENT_LINE',
      targetId: PARENT,
      lossControl: true,
    });

    const selected = rankWinLossControls([agentLoss, memberLoss], MEMBER, ancestors);
    expect(selected?.control.id).toBe('member-loss');
    expect(selected?.desired).toBe('LOSS');
  });

  it('keeps nearer-ancestor-wins precise even past depth 10 (no band collapse)', () => {
    const deepAncestors = Array.from({ length: 18 }, (_, i) => `agent-${i}`);
    // 兩個都在深層、同為 WIN，但 agent-11 比 agent-15 更近，應勝出。
    // 舊版把 depth 夾在 9 會讓兩者同優先序、退回 createdAt 決勝(較遠的較新者反而贏)。
    const nearerButOlder = winLossControl({
      id: 'nearer',
      controlMode: 'AGENT_LINE',
      targetId: 'agent-11',
      winControl: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const fartherButNewer = winLossControl({
      id: 'farther',
      controlMode: 'AGENT_LINE',
      targetId: 'agent-15',
      winControl: true,
      createdAt: new Date('2026-03-01T00:00:00Z'),
    });

    const selected = rankWinLossControls([fartherButNewer, nearerButOlder], MEMBER, deepAncestors);
    expect(selected?.control.id).toBe('nearer');
  });

  it('breaks ties by most recently created', () => {
    const older = winLossControl({
      id: 'older',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      winControl: true,
      createdAt: new Date('2026-01-01T00:00:00Z'),
    });
    const newer = winLossControl({
      id: 'newer',
      controlMode: 'SINGLE_MEMBER',
      targetId: MEMBER,
      winControl: true,
      createdAt: new Date('2026-02-01T00:00:00Z'),
    });

    const selected = rankWinLossControls([older, newer], MEMBER, ancestors);
    expect(selected?.control.id).toBe('newer');
  });

  it('returns null when no control matches the member or its ancestors', () => {
    const unrelated = winLossControl({
      id: 'other',
      controlMode: 'SINGLE_MEMBER',
      targetId: 'someone-else',
      winControl: true,
    });
    expect(rankWinLossControls([unrelated], MEMBER, ancestors)).toBeNull();
  });

  it('targeted scope ignores global controls for no-count agent lines', () => {
    const globalLoss = winLossControl({
      id: 'global-loss',
      controlMode: 'NORMAL',
      targetId: null,
      lossControl: true,
    });
    const agentWin = winLossControl({
      id: 'line-win',
      controlMode: 'AGENT_LINE',
      targetId: PARENT,
      winControl: true,
    });

    const selected = rankWinLossControls([globalLoss, agentWin], MEMBER, ancestors, 'targeted');
    expect(selected?.control.id).toBe('line-win');
    expect(selected?.desired).toBe('WIN');
  });
});

describe('resolveGameMatchedCashoutControl', () => {
  it('falls back to the actual game multiplier when a controlled loss cannot be represented by cashout state', () => {
    const resolved = resolveGameMatchedCashoutControl(
      new Prisma.Decimal('1.35'),
      new Prisma.Decimal(200),
      {
        won: false,
        multiplier: new Prisma.Decimal('0.33'),
        payout: new Prisma.Decimal(66),
        controlled: true,
        flipReason: 'auto_balance_drain',
        controlId: 'auto-1',
      },
    );

    expect(resolved.controlled).toBe(false);
    expect(resolved.won).toBe(true);
    expect(resolved.multiplier.toFixed(4)).toBe('1.3500');
    expect(resolved.payout.toFixed(2)).toBe('270.00');
    expect(resolved.flipReason).toBeUndefined();
  });

  it('uses the actual game multiplier when a controlled win is still inside the control bounds', () => {
    const resolved = resolveGameMatchedCashoutControl(
      new Prisma.Decimal('1.35'),
      new Prisma.Decimal(200),
      {
        won: true,
        multiplier: new Prisma.Decimal('1.01'),
        payout: new Prisma.Decimal(202),
        controlled: true,
        flipReason: 'auto_balance_revive',
        controlId: 'auto-1',
        maxPayout: new Prisma.Decimal(300),
      },
    );

    expect(resolved.won).toBe(true);
    expect(resolved.multiplier.toFixed(4)).toBe('1.3500');
    expect(resolved.payout.toFixed(2)).toBe('270.00');
  });

  it('falls back to the actual game multiplier when a controlled win ceiling cannot be represented', () => {
    const resolved = resolveGameMatchedCashoutControl(
      new Prisma.Decimal('1.35'),
      new Prisma.Decimal(200),
      {
        won: true,
        multiplier: new Prisma.Decimal('1.01'),
        payout: new Prisma.Decimal(202),
        controlled: true,
        flipReason: 'global_member_daily_win_cap',
        controlId: 'global-member-daily-win-cap',
        maxPayout: new Prisma.Decimal(250),
      },
    );

    expect(resolved.controlled).toBe(false);
    expect(resolved.won).toBe(true);
    expect(resolved.multiplier.toFixed(4)).toBe('1.3500');
    expect(resolved.payout.toFixed(2)).toBe('270.00');
  });
});

describe('control decision priority', () => {
  const depositControl = {
    id: 'deposit-1',
    startBalance: new Prisma.Decimal(100),
    targetProfit: new Prisma.Decimal(200),
    controlWinRate: new Prisma.Decimal(0.7),
    notes: null,
  };

  const createDepositTx = () => ({
    user: {
      findUnique: vi.fn(async () => ({ balance: new Prisma.Decimal(110) })),
    },
    memberDepositControl: {
      findFirst: vi.fn(async () => depositControl),
      update: vi.fn(),
    },
  });

  const createLossReleaseTx = (
    logs: Array<{ flipReason: string; finalResult: Record<string, unknown> }>,
  ) => ({
    user: {
      findUnique: vi.fn(async () => ({
        id: 'member-1',
        username: 'bbb',
        agentId: null,
      })),
    },
    bet: {
      aggregate: vi.fn(async () => ({
        _count: { _all: 0 },
        _sum: { profit: new Prisma.Decimal(0) },
      })),
    },
    crashBet: {
      aggregate: vi.fn(async () => ({
        _count: { _all: 0 },
        _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
      })),
    },
    winLossControl: {
      findMany: vi.fn(async () => [
        winLossControl({
          id: 'loss-1',
          controlMode: 'NORMAL',
          targetId: null,
          lossControl: true,
        }),
      ]),
    },
    memberDepositControl: { findFirst: vi.fn(async () => null) },
    memberWinCapControl: { findFirst: vi.fn(async () => null) },
    agentLineWinCap: { findMany: vi.fn(async () => []) },
    winLossControlLogs: { findMany: vi.fn(async () => logs) },
  });

  const createAutoReviveTx = (
    manualFindMany = vi.fn(async () => []),
    over: {
      balance?: Prisma.Decimal;
      phase?: string;
      agentId?: string | null;
      excluded?: boolean;
      baselineBalance?: Prisma.Decimal;
      lifecycleSteps?: number[] | null;
      currentStageIndex?: number;
      lastBalance?: Prisma.Decimal | null;
      controlPercentage?: number | null;
    } = {},
  ) => {
    const baselineBalance = over.baselineBalance ?? new Prisma.Decimal(50000);
    const biteTargetBalance = baselineBalance
      .mul('0.20')
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    const reviveTargetBalance = baselineBalance
      .mul('0.40')
      .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
    return {
      $queryRaw: vi.fn(async () => [{ exists: over.excluded === true }]),
      user: {
        findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
          if (args.select?.balance) {
            return {
              id: 'member-1',
              username: 'top3666',
              agentId: over.agentId ?? null,
              balance: over.balance ?? new Prisma.Decimal(100),
            };
          }
          return { id: 'member-1', username: 'top3666', agentId: over.agentId ?? null };
        }),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      burstControl: { findMany: vi.fn(async () => []) },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => ({
          id: 'auto-1',
          memberId: 'member-1',
          memberUsername: 'top3666',
          agentId: null,
          baselineBalance,
          biteTargetBalance,
          reviveTargetBalance,
          phase: over.phase ?? 'REVIVE_TO_70',
          templateKey: 'SEVEN_NO_RECOVERY',
          lifecycleSteps: over.lifecycleSteps,
          currentStageIndex: over.currentStageIndex ?? 0,
          lifecycleCompletedAt: null,
          lastBalance: over.lastBalance ?? null,
          secondLineAmount: new Prisma.Decimal(50000),
          controlPercentage: over.controlPercentage ?? null,
          isActive: true,
        })),
        update: vi.fn(async (args: { data?: Record<string, unknown> }) => ({
          id: 'auto-1',
          memberId: 'member-1',
          memberUsername: 'top3666',
          agentId: over.agentId ?? null,
          baselineBalance,
          biteTargetBalance,
          reviveTargetBalance,
          phase: String(args.data?.phase ?? over.phase ?? 'REVIVE_TO_70'),
          templateKey: 'SEVEN_NO_RECOVERY',
          lifecycleSteps: over.lifecycleSteps,
          currentStageIndex:
            typeof args.data?.currentStageIndex === 'number'
              ? args.data.currentStageIndex
              : (over.currentStageIndex ?? 0),
          lifecycleCompletedAt:
            (args.data?.lifecycleCompletedAt as Date | null | undefined) ?? null,
          lastBalance:
            (args.data?.lastBalance as Prisma.Decimal | null | undefined) ??
            over.lastBalance ??
            null,
          secondLineAmount: new Prisma.Decimal(50000),
          controlPercentage: over.controlPercentage ?? null,
          isActive: typeof args.data?.isActive === 'boolean' ? args.data.isActive : true,
        })),
        updateMany: vi.fn(),
      },
      manualDetectionControl: { findMany: manualFindMany },
    };
  };

  it('lets regular deposit controls fall back to the natural result when the rate misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.8);

    const decision = await __controlsTestHooks.findDepositControlDecision(
      createDepositTx() as never,
      { id: 'member-1', username: 'vip0666', agentId: null },
      {
        won: true,
        amount: new Prisma.Decimal(100),
        multiplier: new Prisma.Decimal(2),
        payout: new Prisma.Decimal(200),
      },
    );

    expect(decision).toBeNull();
  });

  it('drives member deposit lifecycle toward the next principal target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.49);
    const state = {
      id: 'state-1',
      controlId: 'deposit-life-1',
      memberId: 'member-1',
      memberUsername: 'vip0666',
      startBalance: new Prisma.Decimal(1000),
      currentStageIndex: 0,
      isCompleted: false,
      lastBalance: new Prisma.Decimal(1000),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: 'agent-1',
          balance: new Prisma.Decimal(1000),
        })),
      },
      memberDepositControl: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            id: 'deposit-life-1',
            scope: 'MEMBER',
            memberId: 'member-1',
            memberUsername: 'vip0666',
            targetAgentId: null,
            startBalance: new Prisma.Decimal(1000),
            targetProfit: new Prisma.Decimal(0),
            controlWinRate: new Prisma.Decimal('0.5'),
            lifecycleSteps: [120, 80],
            notes: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      },
      memberDepositLifecycleState: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => state),
        update: vi.fn(async (args: { data: { currentStageIndex: number } }) => ({
          ...state,
          currentStageIndex: args.data.currentStageIndex,
        })),
      },
    };

    const decision = await __controlsTestHooks.findDepositControlDecision(
      tx as never,
      { id: 'member-1', username: 'vip0666', agentId: 'agent-1' },
      predictedResult(100, 0, 0),
    );

    expect(decision).toBeTruthy();
    expect(decision?.desired).toBe('WIN');
    expect(decision?.reason).toBe('deposit_control');
    expect(decision?.maxPayout?.toFixed(2)).toBe('300.00');
  });

  it('applies agent-line deposit lifecycle to downline members', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);
    const state = {
      id: 'state-1',
      controlId: 'deposit-line-1',
      memberId: 'member-1',
      memberUsername: 'vip0666',
      startBalance: new Prisma.Decimal(1000),
      currentStageIndex: 0,
      isCompleted: false,
      lastBalance: new Prisma.Decimal(1000),
    };
    const tx = {
      $queryRaw: vi.fn(async () => [
        { id: 'agent-child', depth: 0 },
        { id: 'agent-line', depth: 1 },
      ]),
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: 'agent-child',
          balance: new Prisma.Decimal(1000),
        })),
      },
      memberDepositControl: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            id: 'deposit-line-1',
            scope: 'AGENT_LINE',
            memberId: null,
            memberUsername: null,
            targetAgentId: 'agent-line',
            startBalance: new Prisma.Decimal(0),
            targetProfit: new Prisma.Decimal(0),
            controlWinRate: new Prisma.Decimal('0.5'),
            lifecycleSteps: [80, 100],
            notes: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      },
      memberDepositLifecycleState: {
        findUnique: vi.fn(async () => null),
        create: vi.fn(async () => state),
        update: vi.fn(async (args: { data: { currentStageIndex: number } }) => ({
          ...state,
          currentStageIndex: args.data.currentStageIndex,
        })),
      },
    };

    const decision = await __controlsTestHooks.findDepositControlDecision(
      tx as never,
      { id: 'member-1', username: 'vip0666', agentId: 'agent-child' },
      predictedResult(100, 200, 2),
    );

    expect(decision).toBeTruthy();
    expect(decision?.desired).toBe('LOSS');
    expect(decision?.reason).toBe('deposit_control');
  });

  it('caps deposit lifecycle natural burst wins at the active path band when intervention misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = {
      id: 'state-1',
      controlId: 'deposit-life-1',
      memberId: 'member-1',
      memberUsername: 'vip0666',
      startBalance: new Prisma.Decimal(10000),
      currentStageIndex: 1,
      isCompleted: false,
      lastBalance: new Prisma.Decimal(3000),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: null,
          balance: new Prisma.Decimal(3000),
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      burstControl: { findMany: vi.fn(async () => []) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberDepositControl: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            id: 'deposit-life-1',
            scope: 'MEMBER',
            memberId: 'member-1',
            memberUsername: 'vip0666',
            targetAgentId: null,
            startBalance: new Prisma.Decimal(10000),
            targetProfit: new Prisma.Decimal(0),
            controlWinRate: new Prisma.Decimal(0),
            lifecycleSteps: [30, 100],
            notes: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      },
      memberDepositLifecycleState: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async (args: { data?: Record<string, unknown> }) => ({
          ...state,
          ...(args.data ?? {}),
        })),
      },
      manualDetectionControl: {
        findMany: vi.fn(async () => {
          throw new Error('manual detection should not run during an active deposit path');
        }),
      },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => {
          throw new Error('auto balance should not run during an active deposit path');
        }),
      },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(5000, 30000, 6),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.flipReason).toBe('deposit_lifecycle_path_guard');
    expect(outcome.controlId).toBe('deposit-life-1');
    expect(outcome.maxPayout?.toFixed(2)).toBe('12500.00');
    expect(outcome.payout.toFixed(2)).toBe('12500.00');
  });

  it('lets deposit lifecycle natural wins stay inside the path band without accidental-burst takeover', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const state = {
      id: 'state-1',
      controlId: 'deposit-life-1',
      memberId: 'member-1',
      memberUsername: 'vip0666',
      startBalance: new Prisma.Decimal(100000),
      currentStageIndex: 1,
      isCompleted: false,
      lastBalance: new Prisma.Decimal(30000),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: null,
          balance: new Prisma.Decimal(30000),
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      burstControl: { findMany: vi.fn(async () => []) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberDepositControl: {
        findFirst: vi.fn(async () => null),
        findMany: vi.fn(async () => [
          {
            id: 'deposit-life-1',
            scope: 'MEMBER',
            memberId: 'member-1',
            memberUsername: 'vip0666',
            targetAgentId: null,
            startBalance: new Prisma.Decimal(100000),
            targetProfit: new Prisma.Decimal(0),
            controlWinRate: new Prisma.Decimal(0),
            lifecycleSteps: [30, 100],
            notes: null,
            createdAt: new Date('2026-01-01T00:00:00Z'),
          },
        ]),
      },
      memberDepositLifecycleState: {
        findUnique: vi.fn(async () => state),
        update: vi.fn(async (args: { data?: Record<string, unknown> }) => ({
          ...state,
          ...(args.data ?? {}),
        })),
      },
      manualDetectionControl: { findMany: vi.fn(async () => []) },
      memberAutoBalanceControl: { findUnique: vi.fn(async () => null) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(5000, 25000, 5),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.payout.toFixed(2)).toBe('25000.00');
  });

  it('applies regular deposit controls before manual detection and auto balance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const userFindUnique = vi.fn(async (args: { select?: Record<string, boolean> }) => {
      if (args.select?.agentId) return { agentId: null };
      if (args.select?.balance) return { balance: new Prisma.Decimal(110) };
      return null;
    });
    const manualFindMany = vi.fn(async () => {
      throw new Error('manual detection should not run after a matching deposit control');
    });
    const tx = {
      user: { findUnique: userFindUnique },
      winLossControl: { findMany: vi.fn(async () => []) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberDepositControl: {
        findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
          const where = args.where as {
            notes?: { contains?: string };
            NOT?: { notes?: { contains?: string } };
            OR?: unknown[];
          };
          if (where.notes?.contains === 'online_reward') return null;
          if (where.OR) return depositControl;
          if (where.NOT?.notes?.contains === 'online_reward') return depositControl;
          return null;
        }),
        update: vi.fn(),
      },
      manualDetectionControl: { findMany: manualFindMany },
    };

    const decision = await __controlsTestHooks.findControlDecision(
      tx as never,
      { id: 'member-1', username: 'vip0666', agentId: null },
      GameId.DICE,
      {
        won: false,
        amount: new Prisma.Decimal(100),
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
      },
      {},
    );

    expect(decision).toBeTruthy();
    expect(typeof decision).toBe('object');
    if (!decision || typeof decision !== 'object') throw new Error('expected control decision');
    expect(decision.reason).toBe('deposit_control');
    expect(decision.controlId).toBe('deposit-1');
    expect(manualFindMany).not.toHaveBeenCalled();
  });

  it('stops at natural result when an applicable win/loss control misses its intervention roll', async () => {
    const memberWinCapFindFirst = vi.fn(async () => {
      throw new Error('member cap should not run after a win/loss intervention miss');
    });
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: null,
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: {
        findMany: vi.fn(async () => [
          winLossControl({
            id: 'loss-1',
            controlMode: 'SINGLE_MEMBER',
            targetId: 'member-1',
            lossControl: true,
            controlPercentage: new Prisma.Decimal(0),
          }),
        ]),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: memberWinCapFindFirst },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => null),
      },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.won).toBe(true);
    expect(memberWinCapFindFirst).not.toHaveBeenCalled();
  });

  it('stops at natural result when a regular deposit control misses its intervention roll', async () => {
    const missedDepositControl = {
      ...depositControl,
      controlWinRate: new Prisma.Decimal(0),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
          if (args.select?.balance) return { balance: new Prisma.Decimal(110) };
          return { id: 'member-1', username: 'vip0666', agentId: null };
        }),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberDepositControl: {
        findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
          const where = args.where as {
            notes?: { contains?: string };
            OR?: unknown[];
            AND?: unknown[];
          };
          if (where.notes?.contains === 'online_reward') return null;
          if (where.OR || where.AND) return missedDepositControl;
          return null;
        }),
        update: vi.fn(),
      },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => null),
      },
      manualDetectionControl: {
        findMany: vi.fn(async () => {
          throw new Error('manual detection should not run after a deposit intervention miss');
        }),
      },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.won).toBe(true);
    expect(tx.memberDepositControl.update).not.toHaveBeenCalled();
  });

  it('lets an active deposit control miss stay natural instead of falling through to the daily cap', async () => {
    const missedDepositControl = {
      ...depositControl,
      controlWinRate: new Prisma.Decimal(0),
    };
    const tx = {
      user: {
        findUnique: vi.fn(async (args: { select?: Record<string, boolean> }) => {
          if (args.select?.balance) return { balance: new Prisma.Decimal(110) };
          return { id: 'member-1', username: 'vip0666', agentId: null };
        }),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(9950) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      memberDepositControl: {
        findFirst: vi.fn(async (args: { where?: Record<string, unknown> }) => {
          const where = args.where as {
            notes?: { contains?: string };
            OR?: unknown[];
            AND?: unknown[];
          };
          if (where.notes?.contains === 'online_reward') return null;
          if (where.OR || where.AND) return missedDepositControl;
          return null;
        }),
        update: vi.fn(),
      },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => null),
      },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.won).toBe(true);
    expect(outcome.payout.toFixed(2)).toBe('200.00');
  });

  it('stops at natural result when an applicable burst control misses all intervention rolls', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'vip0666',
          agentId: null,
        })),
      },
      burstControl: {
        findMany: vi.fn(async () => {
          const control = {
            id: 'burst-1',
            scope: 'MEMBER',
            targetMemberUsername: 'vip0666',
            targetAgentId: null,
            gameIds: [],
            dailyBudget: new Prisma.Decimal(30000),
            todayBurstAmount: new Prisma.Decimal(0),
            memberDailyCap: new Prisma.Decimal(30000),
            singlePayoutCap: new Prisma.Decimal(30000),
            singleMultiplierCap: new Prisma.Decimal(100),
            minBurstMultiplier: new Prisma.Decimal(8),
            smallWinMultiplier: new Prisma.Decimal('1.5'),
            burstRate: new Prisma.Decimal(0),
            smallWinRate: new Prisma.Decimal(0),
            lossRate: new Prisma.Decimal(0),
            compensationLoss: new Prisma.Decimal(0),
            capitalRetentionRatio: new Prisma.Decimal(0),
            minEligibilityLoss: new Prisma.Decimal(0),
            riskWinLimit: new Prisma.Decimal(999999),
            currentGameDay: today,
            createdAt: new Date(),
          };
          return [control];
        }),
        update: vi.fn(async (args: { data?: Record<string, unknown> }) => ({
          id: 'burst-1',
          scope: 'MEMBER',
          targetMemberUsername: 'vip0666',
          targetAgentId: null,
          gameIds: [],
          dailyBudget: new Prisma.Decimal(30000),
          todayBurstAmount: new Prisma.Decimal(0),
          memberDailyCap: new Prisma.Decimal(30000),
          singlePayoutCap: new Prisma.Decimal(30000),
          singleMultiplierCap: new Prisma.Decimal(100),
          minBurstMultiplier: new Prisma.Decimal(8),
          smallWinMultiplier: new Prisma.Decimal('1.5'),
          burstRate: new Prisma.Decimal(0),
          smallWinRate: new Prisma.Decimal(0),
          lossRate: new Prisma.Decimal(0),
          compensationLoss: new Prisma.Decimal(0),
          capitalRetentionRatio: new Prisma.Decimal(0),
          minEligibilityLoss: new Prisma.Decimal(0),
          riskWinLimit: new Prisma.Decimal(999999),
          currentGameDay: String(args.data?.currentGameDay ?? today),
          todayBurstCount: Number(args.data?.todayBurstCount ?? 0),
          createdAt: new Date(),
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
        count: vi.fn(async () => 0),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControlLogs: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
      },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => null),
      },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.won).toBe(true);
  });

  it('does not turn auto-balance revive intervention misses into forced losses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const manualFindMany = vi.fn(async () => []);
    const tx = createAutoReviveTx(manualFindMany);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.TOWER,
      { ...predictedResult(5000, 2500, 0.5), won: true },
      { forceLossOnProgress: true },
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.flipReason).toBeUndefined();
    expect(manualFindMany).toHaveBeenCalled();
  });

  it('uses auto-balance revive wins when no manual detection applies', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.59);
    const manualFindMany = vi.fn(async () => []);
    const tx = createAutoReviveTx(manualFindMany);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.TOWER,
      predictedResult(5000, 10000, 2),
      { forceLossOnProgress: true },
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(true);
    expect(outcome.flipReason).toBe('auto_balance_revive');
    expect(outcome.payout.toFixed(2)).toBe('10000.00');
    expect(manualFindMany).toHaveBeenCalled();
  });

  it('uses auto-balance principal lifecycle stages instead of the legacy fixed targets', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.29);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(50000),
        baselineBalance: new Prisma.Decimal(50000),
        lifecycleSteps: [80, 90],
        currentStageIndex: 0,
        lastBalance: new Prisma.Decimal(50000),
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('auto_balance_bite');
    expect(tx.memberAutoBalanceControl.update).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ currentStageIndex: 1 }),
      }),
    );
  });

  it('advances auto-balance lifecycle to the next principal target when reached', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.59);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(40000),
        baselineBalance: new Prisma.Decimal(50000),
        lifecycleSteps: [80, 100],
        currentStageIndex: 0,
        lastBalance: new Prisma.Decimal(50000),
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(tx.memberAutoBalanceControl.update).toHaveBeenCalledWith({
      where: { id: 'auto-1' },
      data: expect.objectContaining({
        currentStageIndex: 1,
        lastBalance: new Prisma.Decimal(40000),
      }),
    });
    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(true);
    expect(outcome.flipReason).toBe('auto_balance_revive');
  });

  it('advances high recovery targets once the balance enters the target band', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(8890),
        baselineBalance: new Prisma.Decimal(10000),
        lifecycleSteps: [80, 90, 10, 30, 0],
        currentStageIndex: 1,
        lastBalance: new Prisma.Decimal(8000),
        controlPercentage: 50,
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 120, 1.2),
    );

    expect(tx.memberAutoBalanceControl.update).toHaveBeenCalledWith({
      where: { id: 'auto-1' },
      data: expect.objectContaining({
        currentStageIndex: 2,
        lastBalance: new Prisma.Decimal(8890),
      }),
    });
    expect(outcome.controlled).toBe(false);
    expect(outcome.payout.toFixed(2)).toBe('120.00');
  });

  it('does not skip an initial 100 to 90 loss stage just because 100 is near the target band', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(10000),
        baselineBalance: new Prisma.Decimal(10000),
        lifecycleSteps: [90, 20, 0],
        currentStageIndex: 0,
        lastBalance: new Prisma.Decimal(10000),
        controlPercentage: 50,
      },
    );

    await applyControls(tx as never, 'member-1', GameId.DICE, predictedResult(100, 120, 1.2));

    expect(tx.memberAutoBalanceControl.update).not.toHaveBeenCalled();
  });

  it('caps auto-balance lifecycle natural burst wins at the active path band when revive misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(3000),
        baselineBalance: new Prisma.Decimal(10000),
        lifecycleSteps: [30, 100],
        currentStageIndex: 1,
        lastBalance: new Prisma.Decimal(3000),
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(5000, 30000, 6),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.flipReason).toBe('auto_balance_path_guard');
    expect(outcome.controlId).toBe('auto-1');
    expect(outcome.maxPayout?.toFixed(2)).toBe('12500.00');
    expect(outcome.payout.toFixed(2)).toBe('12500.00');
  });

  it('simulates lifecycle-path control rate, natural misses, and path guard caps', async () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.49)
      .mockReturnValueOnce(0.5)
      .mockReturnValueOnce(0.5);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(10000),
        baselineBalance: new Prisma.Decimal(10000),
        lifecycleSteps: [80, 100, 0],
        currentStageIndex: 0,
        lastBalance: new Prisma.Decimal(10000),
        controlPercentage: 50,
      },
    );

    const controlledLoss = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 120, 1.2),
    );
    const naturalSmallWin = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 120, 1.2),
    );
    const cappedNaturalBurst = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(1000, 3000, 3),
    );

    expect(controlledLoss.controlled).toBe(true);
    expect(controlledLoss.won).toBe(false);
    expect(controlledLoss.flipReason).toBe('auto_balance_bite');

    expect(naturalSmallWin.controlled).toBe(false);
    expect(naturalSmallWin.won).toBe(true);
    expect(naturalSmallWin.payout.toFixed(2)).toBe('120.00');

    expect(cappedNaturalBurst.controlled).toBe(true);
    expect(cappedNaturalBurst.flipReason).toBe('auto_balance_path_guard');
    expect(cappedNaturalBurst.maxPayout?.toFixed(2)).toBe('1500.00');
    expect(cappedNaturalBurst.payout.toFixed(2)).toBe('1500.00');
  });

  it('prioritizes global manual detection over active auto-balance cycles', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const autoFindUnique = vi.fn(async () => null);
    const manualFindMany = vi.fn(async () => [
      {
        id: 'manual-all-1',
        scope: 'ALL',
        targetAgentId: null,
        targetAgentUsername: null,
        targetMemberUsername: null,
        targetSettlement: new Prisma.Decimal(1000),
        startSettlement: new Prisma.Decimal(0),
        controlPercentage: new Prisma.Decimal(100),
        bitePercentage: null,
        houseTakePercentage: null,
        completionBehavior: 'stop_on_target',
        targetBand: new Prisma.Decimal(0),
        isActive: true,
        isCompleted: false,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    ]);
    const tx = {
      $queryRaw: vi.fn(async () => [{ exists: false }]),
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'top3666',
          agentId: null,
        })),
        findMany: vi.fn(async () => []),
      },
      agent: {
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: {
            amount: new Prisma.Decimal(0),
            payout: new Prisma.Decimal(0),
            profit: new Prisma.Decimal(0),
          },
        })),
        findMany: vi.fn(async () => []),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
        findMany: vi.fn(async () => []),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      burstControl: { findMany: vi.fn(async () => []) },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      winLossControlLogs: { findMany: vi.fn(async () => []) },
      manualDetectionControl: { findMany: manualFindMany },
      memberAutoBalanceControl: { findUnique: autoFindUnique },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('manual_detection');
    expect(manualFindMany).toHaveBeenCalled();
  });

  it('switches auto-balance to post-40 loss control after the member returns to 40 percent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.39);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(20000),
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(10, 20, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('auto_balance_drain');
    expect(tx.memberAutoBalanceControl.update).toHaveBeenCalledWith({
      where: { id: 'auto-1' },
      data: { phase: 'DRAIN_TO_ZERO' },
    });
  });

  it('keeps post-40 auto-balance drain at the same 40 percent intervention rate', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39).mockReturnValueOnce(0.4);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(21000),
        phase: 'DRAIN_TO_ZERO',
      },
    );

    const controlled = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(10, 20, 2),
    );
    const natural = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(10, 20, 2),
    );

    expect(controlled.controlled).toBe(true);
    expect(controlled.won).toBe(false);
    expect(controlled.flipReason).toBe('auto_balance_drain');
    expect(natural.controlled).toBe(false);
    expect(natural.won).toBe(true);
  });

  it('does not restart revive after post-40 drain falls below the 20 percent target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.39);
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        balance: new Prisma.Decimal(10000),
        phase: 'DRAIN_TO_ZERO',
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(10, 20, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('auto_balance_drain');
    expect(tx.memberAutoBalanceControl.update).not.toHaveBeenCalledWith({
      where: { id: 'auto-1' },
      data: { phase: 'REVIVE_TO_70' },
    });
  });

  it('disables auto-balance for the excluded 8000DG credit line', async () => {
    const tx = createAutoReviveTx(
      vi.fn(async () => []),
      {
        agentId: 'agent-under-8000dg',
        excluded: true,
      },
    );

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(10, 20, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(tx.memberAutoBalanceControl.updateMany).toHaveBeenCalledWith({
      where: { memberId: 'member-1', isActive: true },
      data: { isActive: false, resetReason: 'auto_balance_excluded' },
    });
  });

  it('freezes the triggering member line and pauses its path guard after banker guard trips', async () => {
    const autoBalanceUpdate = vi.fn();
    const memberUpdateMany = vi.fn();
    const agentUpdateMany = vi.fn();
    const tx = {
      $queryRaw: vi.fn(async () => [{ id: 'agent-1' }, { id: 'agent-child-1' }]),
      user: {
        findUnique: vi.fn(async () => ({ id: 'member-1', agentId: 'agent-1' })),
        updateMany: memberUpdateMany,
      },
      agent: {
        findUnique: vi.fn(async () => ({
          id: 'agent-1',
          parentId: null,
          rebateMode: 'NONE',
          rebatePercentage: new Prisma.Decimal(0),
          maxRebatePercentage: new Prisma.Decimal(0),
          baccaratRebateMode: 'NONE',
          baccaratRebatePercentage: new Prisma.Decimal(0),
          maxBaccaratRebatePercentage: new Prisma.Decimal(0),
        })),
        updateMany: agentUpdateMany,
      },
      bet: {
        aggregate: vi.fn(async (args?: { where?: { gameId?: unknown } }) => ({
          _count: { _all: args?.where?.gameId ? 0 : 12 },
          _sum: args?.where?.gameId
            ? { amount: new Prisma.Decimal(0), payout: null, profit: null }
            : {
                amount: new Prisma.Decimal(10000),
                payout: new Prisma.Decimal(70000),
                profit: new Prisma.Decimal(60000),
              },
        })),
        findMany: vi.fn(async () => [{ userId: 'member-1' }]),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
        findMany: vi.fn(async () => []),
      },
      memberAutoBalanceControl: {
        findUnique: vi.fn(async () => ({
          id: 'auto-guard-1',
          secondLineAmount: new Prisma.Decimal(50000),
        })),
        update: autoBalanceUpdate,
      },
    };

    await __controlsTestHooks.enforceAutoBalanceBankerGuard(
      tx as never,
      { id: 'member-1', username: 'top3666', agentId: 'agent-1' },
      {
        won: false,
        multiplier: new Prisma.Decimal(0),
        payout: new Prisma.Decimal(0),
        controlled: true,
        flipReason: 'auto_balance_drain',
      },
    );

    expect(memberUpdateMany).toHaveBeenCalledWith({
      where: { agentId: { in: ['agent-1', 'agent-child-1'] }, disabledAt: null, frozenAt: null },
      data: { frozenAt: expect.any(Date) },
    });
    expect(agentUpdateMany).toHaveBeenCalledWith({
      where: {
        id: { in: ['agent-1', 'agent-child-1'] },
        status: 'ACTIVE',
        role: { not: 'SUPER_ADMIN' },
      },
      data: { status: 'FROZEN' },
    });
    expect(autoBalanceUpdate).toHaveBeenCalledWith({
      where: { id: 'auto-guard-1' },
      data: expect.objectContaining({
        isActive: false,
        resetReason: 'banker_guard_frozen',
        lifecycleCompletedAt: expect.any(Date),
      }),
    });
  });

  it('lets crash-style probes force an active loss control at game start', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'bbb',
          agentId: null,
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: {
        findMany: vi.fn(async () => [
          winLossControl({
            id: 'loss-1',
            controlMode: 'NORMAL',
            targetId: null,
            lossControl: true,
          }),
        ]),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      winLossControlLogs: { findMany: vi.fn(async () => []) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.ROCKET,
      predictedResult(100, 200, 2),
      { forceControlOnMatch: true },
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('loss_control');
  });

  it('lets crash-style probes force an active win control even when the probe is already winning', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'bbb',
          agentId: null,
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: {
        findMany: vi.fn(async () => [
          winLossControl({
            id: 'win-1',
            controlMode: 'NORMAL',
            targetId: null,
            winControl: true,
          }),
        ]),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      winLossControlLogs: { findMany: vi.fn(async () => []) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.ROCKET,
      predictedResult(100, 200, 2),
      { forceControlOnMatch: true },
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(true);
    expect(outcome.flipReason).toBe('win_control');
  });

  it('forces loss controls on multi-step progress even before the step is a net win', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.01);
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'bbb',
          agentId: null,
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { profit: new Prisma.Decimal(0) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: {
        findMany: vi.fn(async () => [
          winLossControl({
            id: 'loss-1',
            controlMode: 'NORMAL',
            targetId: null,
            lossControl: true,
          }),
        ]),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      winLossControlLogs: { findMany: vi.fn(async () => []) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.TOWER,
      { ...predictedResult(100, 50, 0.5), won: true },
      { forceLossOnProgress: true },
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('loss_control');
  });

  it('does not release on a fixed count when the randomized release roll misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0.99);
    const tx = createLossReleaseTx([
      controlledLossLog(100),
      controlledLossLog(100),
      controlledLossLog(100),
      controlledLossLog(100),
    ]);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('loss_control');
  });

  it('does not let a progression bet trigger the anti-loss release', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0);
    const tx = createLossReleaseTx([
      controlledLossLog(100),
      controlledLossLog(100),
      controlledLossLog(100),
      controlledLossLog(100),
    ]);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(1000, 2000, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('loss_control');
  });

  it('caps anti-loss release profit by recent controlled losses instead of the natural payout', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.01).mockReturnValueOnce(0);
    const tx = createLossReleaseTx([
      controlledLossLog(1000),
      controlledLossLog(1000),
      controlledLossLog(1000),
      controlledLossLog(1000),
    ]);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.DICE,
      predictedResult(1000, 9000, 9),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(true);
    expect(outcome.flipReason).toBe('loss_control_release');
    expect(outcome.payout.toFixed(2)).toBe('1350.00');
  });

  it('soft-drains multi-step progress once the member is already over cap', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
    const tx = {
      user: {
        findUnique: vi.fn(async () => ({
          id: 'member-1',
          username: 'bbb',
          agentId: null,
        })),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 1 },
          _sum: { profit: new Prisma.Decimal(10000) },
        })),
      },
      crashBet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 0 },
          _sum: { amount: new Prisma.Decimal(0), payout: new Prisma.Decimal(0) },
        })),
      },
      winLossControl: { findMany: vi.fn(async () => []) },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      manualDetectionControl: { findMany: vi.fn(async () => []) },
      winLossControlLogs: { findMany: vi.fn(async () => []) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.TOWER,
      { ...predictedResult(100, 50, 0.5), won: true },
      { forceLossOnProgress: true },
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('global_member_daily_win_cap');
  });
});

describe('global member daily win cap', () => {
  const createGlobalCapTx = (
    standardProfit: string | number,
    crashAmount: string | number = 0,
    crashPayout: string | number = 0,
  ) => ({
    user: {
      findUnique: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
        if (args?.select?.balance) return { balance: new Prisma.Decimal(1000) };
        return { id: 'bbb', username: 'bbb', agentId: null };
      }),
    },
    bet: {
      aggregate: vi.fn(async () => ({
        _count: { _all: 1 },
        _sum: { profit: new Prisma.Decimal(standardProfit) },
      })),
    },
    crashBet: {
      aggregate: vi.fn(async () => ({
        _count: { _all: 1 },
        _sum: {
          amount: new Prisma.Decimal(crashAmount),
          payout: new Prisma.Decimal(crashPayout),
        },
      })),
    },
    winLossControl: { findMany: vi.fn(async () => []) },
    memberDepositControl: { findFirst: vi.fn(async () => null) },
    memberWinCapControl: { findFirst: vi.fn(async () => null) },
    agentLineWinCap: { findMany: vi.fn(async () => []) },
    manualDetectionControl: { findMany: vi.fn(async () => []) },
    memberAutoBalanceControl: { findUnique: vi.fn(async () => null) },
    burstControl: { findMany: vi.fn(async () => []) },
    winLossControlLogs: { findMany: vi.fn(async () => []) },
  });

  const activeDepositControl = {
    id: 'deposit-1',
    startBalance: new Prisma.Decimal(100),
    targetProfit: new Prisma.Decimal(2000),
    controlWinRate: new Prisma.Decimal(1),
    notes: null,
  };

  it('soft-drains members that are already above 10000 daily net win at the drain rate', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
    const tx = createGlobalCapTx('19415.66');

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'bbb',
      predictedResult(100, 101, 1.01),
    );

    expect(outcome?.controlled).toBe(true);
    expect(outcome?.won).toBe(false);
    expect(outcome?.payout.toFixed(2)).toBe('0.00');
    expect(outcome?.flipReason).toBe('global_member_daily_win_cap');
  });

  it('lets an already over-cap member continue naturally when the soft drain misses', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.4);
    const tx = createGlobalCapTx('19415.66');

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'bbb',
      predictedResult(100, 101, 1.01),
    );

    expect(outcome).toBeNull();
  });

  it('does not stack auto-balance after an over-cap soft drain miss', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.4);
    const memberAutoBalanceFindUnique = vi.fn(async () => null);
    const tx = {
      ...createGlobalCapTx('19415.66'),
      memberAutoBalanceControl: { findUnique: memberAutoBalanceFindUnique },
    };

    const outcome = await applyControls(
      tx as never,
      'bbb',
      GameId.DICE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(false);
    expect(outcome.won).toBe(true);
    expect(outcome.payout.toFixed(2)).toBe('200.00');
  });

  it('marks an overflow natural win as game-matched cap-bound instead of a raw natural result', async () => {
    const tx = createGlobalCapTx('9950');

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 200, 2),
    );

    expect(outcome?.controlled).toBe(true);
    expect(outcome?.won).toBe(true);
    expect(outcome?.gameMatchedPayoutOnly).toBe(true);
    expect(outcome?.maxPayout?.toFixed(2)).toBe('150.00');
    expect(outcome?.controlId).toBe('global-member-daily-win-cap');
  });

  it('includes crash cashouts in the same daily cap calculation', async () => {
    const tx = createGlobalCapTx('5000', 1000, 5950);

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 200, 2),
    );

    expect(outcome?.controlled).toBe(true);
    expect(outcome?.gameMatchedPayoutOnly).toBe(true);
    expect(outcome?.maxPayout?.toFixed(2)).toBe('150.00');
    expect(outcome?.flipReason).toBe('global_member_daily_win_cap');
  });

  it('does not add extra control when the predicted result is already a loss', async () => {
    const tx = createGlobalCapTx('20000');

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 0, 0),
    );

    expect(outcome).toBeNull();
  });

  it('returns the remaining payout and multiplier guard for crash-style game starts', async () => {
    const tx = createGlobalCapTx('9950');

    const guard = await __controlsTestHooks.getGlobalMemberDailyWinCapGuard(
      tx as never,
      'member-1',
      new Prisma.Decimal(100),
    );

    expect(guard?.exhausted).toBe(false);
    expect(guard?.maxPayout.toFixed(2)).toBe('150.00');
    expect(guard?.maxMultiplier.toFixed(4)).toBe('1.5000');
  });

  it('does not return a hard crash-start guard after the global daily cap is already exhausted', async () => {
    const tx = createGlobalCapTx('20000');

    const guard = await __controlsTestHooks.getGlobalMemberDailyWinCapGuard(
      tx as never,
      'member-1',
      new Prisma.Decimal(100),
    );

    expect(guard).toBeNull();
  });

  it('lets active deposit control bypass the global 10000 daily cap', async () => {
    const tx = {
      ...createGlobalCapTx('20000'),
      memberDepositControl: {
        findFirst: vi.fn(async () => activeDepositControl),
        update: vi.fn(),
      },
    };

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 200, 2),
      GameId.DICE,
    );

    expect(outcome).toBeNull();
    expect(tx.memberDepositControl.update).not.toHaveBeenCalled();
  });

  it('restores the global daily cap after a deposit control reaches its target', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
    const tx = {
      ...createGlobalCapTx('20000'),
      user: {
        findUnique: vi.fn(async (args?: { select?: Record<string, boolean> }) => {
          if (args?.select?.balance) return { balance: new Prisma.Decimal(2200) };
          return { id: 'member-1', username: 'vip0666', agentId: null };
        }),
      },
      memberDepositControl: {
        findFirst: vi.fn(async () => activeDepositControl),
        update: vi.fn(),
      },
    };

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 200, 2),
      GameId.DICE,
    );

    expect(tx.memberDepositControl.update).toHaveBeenCalledWith({
      where: { id: 'deposit-1' },
      data: { isActive: false, isCompleted: true },
    });
    expect(outcome?.controlled).toBe(true);
    expect(outcome?.flipReason).toBe('global_member_daily_win_cap');
  });

  it('lets active burst control bypass the global 10000 daily cap while it still has budget', async () => {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Taipei' });
    const burstControl = {
      id: 'burst-1',
      scope: 'MEMBER',
      targetAgentId: null,
      targetAgentUsername: null,
      targetMemberId: 'member-1',
      targetMemberUsername: 'bbb',
      gameIds: [],
      dailyBudget: new Prisma.Decimal(30000),
      todayBurstAmount: new Prisma.Decimal(0),
      todayBurstCount: 0,
      memberDailyCap: new Prisma.Decimal(30000),
      singlePayoutCap: new Prisma.Decimal(30000),
      singleMultiplierCap: new Prisma.Decimal(100),
      minBurstMultiplier: new Prisma.Decimal(8),
      smallWinMultiplier: new Prisma.Decimal('1.5'),
      burstRate: new Prisma.Decimal(1),
      smallWinRate: new Prisma.Decimal(0),
      lossRate: new Prisma.Decimal(0),
      compensationLoss: new Prisma.Decimal(0),
      capitalRetentionRatio: new Prisma.Decimal(0),
      minEligibilityLoss: new Prisma.Decimal(0),
      riskWinLimit: new Prisma.Decimal(999999),
      cooldownRounds: 10,
      currentGameDay: today,
      isActive: true,
      notes: null,
      operatorId: null,
      operatorUsername: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    const tx = {
      ...createGlobalCapTx('20000'),
      user: {
        findUnique: vi.fn(async () => ({ id: 'member-1', username: 'bbb', agentId: null })),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      burstControl: {
        findMany: vi.fn(async () => [burstControl]),
        update: vi.fn(async () => burstControl),
      },
      winLossControlLogs: {
        findMany: vi.fn(async () => []),
        findFirst: vi.fn(async () => null),
      },
      bet: {
        aggregate: vi.fn(async () => ({
          _count: { _all: 1 },
          _sum: { profit: new Prisma.Decimal(20000) },
        })),
        count: vi.fn(async () => 0),
      },
    };
    vi.spyOn(Math, 'random').mockReturnValue(0);

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(100, 0, 0),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(true);
    expect(outcome.flipReason).toBe('burst_win');
  });

  it('restores the global daily cap when burst control is paused', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.39);
    const tx = {
      ...createGlobalCapTx('20000'),
      user: {
        findUnique: vi.fn(async () => ({ id: 'member-1', username: 'bbb', agentId: null })),
      },
      memberDepositControl: { findFirst: vi.fn(async () => null) },
      memberWinCapControl: { findFirst: vi.fn(async () => null) },
      agentLineWinCap: { findMany: vi.fn(async () => []) },
      burstControl: { findMany: vi.fn(async () => []) },
    };

    const outcome = await applyControls(
      tx as never,
      'member-1',
      GameId.HOTLINE,
      predictedResult(100, 200, 2),
    );

    expect(outcome.controlled).toBe(true);
    expect(outcome.won).toBe(false);
    expect(outcome.flipReason).toBe('global_member_daily_win_cap');
  });
});

describe('burst cooldown', () => {
  it('stores cooldown rounds in the hard 10-20 range', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0).mockReturnValueOnce(0.999999);

    expect(__controlsTestHooks.randomBurstCooldownRounds()).toBe(10);
    expect(__controlsTestHooks.randomBurstCooldownRounds()).toBe(20);
  });

  it('falls back old burst logs to at least 10 cooldown rounds', () => {
    expect(__controlsTestHooks.getStoredBurstCooldownRounds({})).toBe(10);
    expect(__controlsTestHooks.getStoredBurstCooldownRounds({ burstCooldownRounds: 0 })).toBe(10);
    expect(__controlsTestHooks.getStoredBurstCooldownRounds({ burstCooldownRounds: 8 })).toBe(10);
    expect(__controlsTestHooks.getStoredBurstCooldownRounds({ burstCooldownRounds: 16 })).toBe(16);
    expect(__controlsTestHooks.getStoredBurstCooldownRounds({ burstCooldownRounds: 99 })).toBe(20);
  });
});
