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

  it('applies auto-balance bite intervention about 60 percent of the time', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.59).mockReturnValueOnce(0.6);

    expect(__controlsTestHooks.passesAutoBalanceBiteInterventionRate()).toBe(true);
    expect(__controlsTestHooks.passesAutoBalanceBiteInterventionRate()).toBe(false);
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
    over: { balance?: Prisma.Decimal; phase?: string; agentId?: string | null; excluded?: boolean } = {},
  ) => ({
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
    memberDepositControl: { findFirst: vi.fn(async () => null) },
    memberWinCapControl: { findFirst: vi.fn(async () => null) },
    agentLineWinCap: { findMany: vi.fn(async () => []) },
    memberAutoBalanceControl: {
      findUnique: vi.fn(async () => ({
        id: 'auto-1',
        memberId: 'member-1',
        memberUsername: 'top3666',
        agentId: null,
        baselineBalance: new Prisma.Decimal(50000),
        biteTargetBalance: new Prisma.Decimal(15000),
        reviveTargetBalance: new Prisma.Decimal(35000),
        phase: over.phase ?? 'REVIVE_TO_70',
        isActive: true,
      })),
      update: vi.fn(async (args: { data?: { phase?: string } }) => ({
        id: 'auto-1',
        memberId: 'member-1',
        memberUsername: 'top3666',
        agentId: over.agentId ?? null,
        baselineBalance: new Prisma.Decimal(50000),
        biteTargetBalance: new Prisma.Decimal(15000),
        reviveTargetBalance: new Prisma.Decimal(35000),
        phase: args.data?.phase ?? over.phase ?? 'REVIVE_TO_70',
        isActive: true,
      })),
      updateMany: vi.fn(),
    },
    manualDetectionControl: { findMany: manualFindMany },
  });

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

    expect(decision?.reason).toBe('deposit_control');
    expect(decision?.controlId).toBe('deposit-1');
    expect(manualFindMany).not.toHaveBeenCalled();
  });

  it('does not turn auto-balance revive intervention misses into forced losses', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const manualFindMany = vi.fn(async () => {
      throw new Error('manual detection should not run during auto-balance revive');
    });
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
    expect(manualFindMany).not.toHaveBeenCalled();
  });

  it('prioritizes auto-balance revive wins over manual detection without filling the full gap', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.69);
    const manualFindMany = vi.fn(async () => {
      throw new Error('manual detection should not run during auto-balance revive');
    });
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
    expect(manualFindMany).not.toHaveBeenCalled();
  });

  it('switches auto-balance to post-70 loss control after the member returns to 70 percent', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.59);
    const tx = createAutoReviveTx(vi.fn(async () => []), {
      balance: new Prisma.Decimal(35000),
    });

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

  it('keeps post-70 auto-balance drain at the same 60 percent intervention rate', async () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.59).mockReturnValueOnce(0.6);
    const tx = createAutoReviveTx(vi.fn(async () => []), {
      balance: new Prisma.Decimal(36000),
      phase: 'DRAIN_TO_ZERO',
    });

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

  it('does not restart revive after post-70 drain falls below the 30 percent target', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.59);
    const tx = createAutoReviveTx(vi.fn(async () => []), {
      balance: new Prisma.Decimal(10000),
      phase: 'DRAIN_TO_ZERO',
    });

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
    const tx = createAutoReviveTx(vi.fn(async () => []), {
      agentId: 'agent-under-8000dg',
      excluded: true,
    });

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

  it('forces the global 10000 cap on multi-step progress once the member is already over cap', async () => {
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
      findUnique: vi.fn(async () => ({ id: 'bbb' })),
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
  });

  it('forces bbb-style members that are already above 10000 daily net win to lose every next win', async () => {
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

  it('blocks a winning result that would push any member over the 10000 daily cap', async () => {
    const tx = createGlobalCapTx('9950');

    const outcome = await __controlsTestHooks.applyGlobalMemberDailyWinCap(
      tx as never,
      'member-1',
      predictedResult(100, 200, 2),
    );

    expect(outcome?.controlled).toBe(true);
    expect(outcome?.payout.toFixed(2)).toBe('0.00');
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
