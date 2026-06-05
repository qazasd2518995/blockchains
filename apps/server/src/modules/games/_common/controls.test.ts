import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameId } from '@bg/shared';
import {
  __controlsTestHooks,
  isBurstControlEligible,
  passesControlInterventionRate,
  rankWinLossControls,
} from './controls.js';

const prediction = (multiplier: number) => ({
  multiplier: new Prisma.Decimal(multiplier),
});

const winLossControl = (over: {
  id: string;
  controlMode: string;
  targetId: string | null;
  winControl?: boolean;
  lossControl?: boolean;
  createdAt?: Date;
}) => ({
  winControl: false,
  lossControl: false,
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
  it('applies regular deposit controls before manual detection and auto balance', async () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.2);

    const depositControl = {
      id: 'deposit-1',
      startBalance: new Prisma.Decimal(100),
      targetProfit: new Prisma.Decimal(200),
      controlWinRate: new Prisma.Decimal(0.7),
      notes: null,
    };
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
