import { Prisma } from '@prisma/client';
import {
  seth2BuyFeature,
  seth2BuyFeatureEntry,
  seth2SpinForFactor,
  seth2SuperMainSpinForFactor,
} from '@bg/provably-fair';
import type { Seth2Cell, Seth2ReturnData } from '@bg/shared';
import { describe, expect, it, vi } from 'vitest';
import {
  advanceSession,
  applySeth2JackpotAward,
  applyFemaleLockState,
  chooseControlledSethFactor,
  chooseControlledSethFeatureFactor,
  generateFeatureRun,
  machineDisplayRate,
  machineInfo,
  machineList,
  mergeSeth2PlayerSettings,
  normalizeFemaleLockAccounting,
  settlementSession,
  splitSeth2FeatureFactor,
  SETH2_DEFERRED_PAYOUT_SEQUENCE_VERSION,
  Seth2Service,
} from './seth2.service.js';
import { seth2ProtocolSchema, seth2SourceSchema } from './seth2.schema.js';
import { seth2SourceGameStates } from './seth2.source.js';

const MACHINE_RATE_TIME = 1_800_000_000_000;

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

  it('diversifies a controlled 1.01x Eternal Rise win without leaving its bounds', () => {
    const factors = new Set<number>();
    for (let entropy = 0; entropy < 24; entropy += 1) {
      const factor = chooseControlledSethFactor(
        new Prisma.Decimal(10),
        new Prisma.Decimal(20_000),
        {
          won: true,
          multiplier: new Prisma.Decimal('1.01'),
          minMultiplier: new Prisma.Decimal('1.01'),
          maxMultiplier: new Prisma.Decimal('1.35'),
          maxPayout: new Prisma.Decimal(27_000),
        },
        'awakening_free',
        0,
        false,
        entropy,
      );
      expect(factor).not.toBeNull();
      expect(factor!).toBeGreaterThanOrEqual(2_020);
      expect(factor!).toBeLessThanOrEqual(2_700);
      const outcome = seth2SuperMainSpinForFactor(
        'controlled-diverse-win',
        'client',
        entropy,
        10,
        factor!,
      );
      expect(outcome.returnData.total_gold).toBe(10 * factor!);
      expect(
        outcome.returnData.list.some((round) =>
          round.start_data.some((cell) => cell.type === 10 && cell.mul === 500),
        ),
      ).toBe(true);
      factors.add(factor!);
    }

    expect(factors.size).toBeGreaterThanOrEqual(6);
    expect(factors.size).toBeLessThan(24);
  });

  it('diversifies controlled Eternal Rise losses while every result remains a net loss', () => {
    const factors = new Set<number>();
    for (let entropy = 0; entropy < 18; entropy += 1) {
      const factor = chooseControlledSethFactor(
        new Prisma.Decimal(10),
        new Prisma.Decimal(20_000),
        { won: false, multiplier: new Prisma.Decimal(0) },
        'awakening_free',
        0,
        false,
        entropy,
      );
      expect(factor).not.toBeNull();
      expect(factor!).toBeGreaterThanOrEqual(0);
      expect(factor!).toBeLessThanOrEqual(2_000);
      const outcome = seth2SuperMainSpinForFactor(
        'controlled-diverse-loss',
        'client',
        entropy,
        10,
        factor!,
      );
      expect(outcome.returnData.total_gold).toBe(10 * factor!);
      expect(
        outcome.returnData.list.some((round) =>
          round.start_data.some((cell) => cell.type === 10 && cell.mul === 500),
        ),
      ).toBe(true);
      factors.add(factor!);
    }

    expect(factors.size).toBeGreaterThanOrEqual(4);
  });

  it('keeps exact control bounds exact even when diversity entropy is supplied', () => {
    const factors = Array.from({ length: 20 }, (_, entropy) =>
      chooseControlledSethFactor(
        new Prisma.Decimal(10),
        new Prisma.Decimal(20_000),
        {
          won: true,
          multiplier: new Prisma.Decimal(2),
          minMultiplier: new Prisma.Decimal(2),
          maxMultiplier: new Prisma.Decimal(2),
        },
        'awakening_free',
        0,
        false,
        entropy,
      ),
    );

    expect(new Set(factors)).toEqual(new Set([4_000]));
  });

  it('reports when no legal controlled win exists so settlement can safely downgrade it', () => {
    const factor = chooseControlledSethFactor(new Prisma.Decimal(18), new Prisma.Decimal(3600), {
      won: true,
      multiplier: new Prisma.Decimal(2),
      maxPayout: new Prisma.Decimal(3600),
    });
    expect(factor).toBeNull();
  });

  it('uses diverse legal small wins inside a narrow principal or deposit recovery cap', () => {
    const factors = Array.from({ length: 24 }, (_, entropy) =>
      chooseControlledSethFactor(
        new Prisma.Decimal(10),
        new Prisma.Decimal(10),
        {
          won: true,
          multiplier: new Prisma.Decimal('1.01'),
          minMultiplier: new Prisma.Decimal('1.01'),
          maxPayout: new Prisma.Decimal('13.50'),
        },
        'base',
        0,
        false,
        entropy,
      ),
    );

    expect(factors.every((factor) => factor !== null)).toBe(true);
    expect(new Set(factors)).toEqual(new Set([1.05, 1.2, 1.25, 1.3]));
    for (const factor of factors) {
      const outcome = seth2SpinForFactor('small-recovery', 'client', 1, 10, factor!, 'base');
      expect(outcome.payoutFactor).toBe(factor);
      expect(outcome.returnData.total_gold).toBeCloseTo(10 * factor!, 2);
      expect(outcome.returnData.total_gold).toBeGreaterThan(10);
      expect(outcome.returnData.total_gold).toBeLessThanOrEqual(13.5);
    }
  });

  it('fails closed only below the smallest legal ordinary-spin win', () => {
    const factor = chooseControlledSethFactor(new Prisma.Decimal(10), new Prisma.Decimal(10), {
      won: true,
      multiplier: new Prisma.Decimal('1.01'),
      minMultiplier: new Prisma.Decimal('1.01'),
      maxPayout: new Prisma.Decimal('10.49'),
    });

    expect(factor).toBeNull();
  });

  it('keeps a 1.01x recovery target representable across all three feature purchases', () => {
    const baseAmount = new Prisma.Decimal(10);
    const controlFor = (buyRate: number) => ({
      won: true,
      multiplier: new Prisma.Decimal('1.01'),
      minMultiplier: new Prisma.Decimal('1.01'),
      maxPayout: baseAmount.mul(buyRate).mul('1.05'),
    });

    expect(
      chooseControlledSethFeatureFactor(
        baseAmount,
        baseAmount.mul(200),
        controlFor(200),
        'bought_standard_free',
      ),
    ).toBe(202);
    expect(
      chooseControlledSethFeatureFactor(
        baseAmount,
        baseAmount.mul(500),
        controlFor(500),
        'awakening_free',
      ),
    ).toBe(505);
    expect(
      chooseControlledSethFactor(
        baseAmount,
        baseAmount.mul(2_000),
        controlFor(2_000),
        'awakening_free',
      ),
    ).toBe(2_020);
  });

  it('selects only factors representable by a visible persistent lock', () => {
    const factor = chooseControlledSethFactor(
      new Prisma.Decimal(18),
      new Prisma.Decimal(18),
      {
        won: true,
        multiplier: new Prisma.Decimal(20),
        minMultiplier: new Prisma.Decimal(20),
        maxMultiplier: new Prisma.Decimal(20),
      },
      'awakening_free',
      10,
      true,
    );
    expect(factor).toBe(20);
  });

  it('maps control accounting to a complete feature total instead of one free round', () => {
    expect(
      chooseControlledSethFeatureFactor(
        new Prisma.Decimal(2),
        new Prisma.Decimal(400),
        {
          won: true,
          multiplier: new Prisma.Decimal(2),
          minMultiplier: new Prisma.Decimal(2),
          maxMultiplier: new Prisma.Decimal(2),
        },
        'bought_standard_free',
      ),
    ).toBe(400);
    const parts = splitSeth2FeatureFactor(19_997, 'awakening_free')!;
    expect(parts.filter((factor) => factor > 0).length).toBeGreaterThanOrEqual(5);
    expect(parts.reduce((total, factor) => total + factor, 0)).toBe(19_997);
  });

  it('varies controlled feature win amounts as well as their spin positions', () => {
    const amountCompositions = new Set<string>();
    const winningRoundCounts = new Set<number>();

    for (let entropy = 0; entropy < 120; entropy += 1) {
      const parts = splitSeth2FeatureFactor(397, 'awakening_free', entropy)!;
      const winningParts = parts.filter((factor) => factor > 0);
      expect(parts.reduce((total, factor) => total + factor, 0)).toBe(397);
      amountCompositions.add([...winningParts].sort((left, right) => left - right).join(','));
      winningRoundCounts.add(winningParts.length);
    }

    expect(amountCompositions.size).toBeGreaterThanOrEqual(30);
    expect([...winningRoundCounts].sort()).toEqual([5, 6, 7, 8, 9]);
  });

  it.each([
    [200, 10, 2_000],
    [500, 1.5, 750],
    [500, 5, 2_500],
    [500, 50, 25_000],
  ])(
    'represents a %sx purchase controlled to %sx as exactly %sx base bet',
    (rate, target, factor) => {
      expect(
        chooseControlledSethFeatureFactor(
          new Prisma.Decimal(2),
          new Prisma.Decimal(2 * rate),
          {
            won: true,
            multiplier: new Prisma.Decimal(target),
            minMultiplier: new Prisma.Decimal(target),
            maxMultiplier: new Prisma.Decimal(target),
          },
          'awakening_free',
        ),
      ).toBe(factor);
    },
  );

  it.each([3, 200, 400, 20_000, 81_000])(
    'builds an atomic 15-game sequence whose visible total is exactly %s x',
    (totalFactor) => {
      const entryOutcome = seth2BuyFeatureEntry('atomic-entry', 'client', 1, 'awakening', 2);
      const seeds = Array.from({ length: 100 }, (_, index) => ({
        serverSeedId: 'server-seed-id',
        serverSeed: 'atomic-feature-seed',
        serverSeedHash: 'hash',
        clientSeed: 'client',
        nonce: index + 2,
      }));
      const run = generateFeatureRun({
        entryOutcome,
        seeds,
        baseBet: 2,
        buying: true,
        featureIndex: 1,
        featureMode: 'awakening',
        forcedTotalFactor: totalFactor,
      });

      expect(run.rounds).toHaveLength(15);
      expect(entryOutcome.payoutFactor + run.totalPayoutFactor).toBe(totalFactor);
      expect(run.finalSession.freeSpinsRemaining).toBe(0);
      expect(run.finalSession.featureWinnings).toBe(0);
    },
  );

  it('keeps controlled awakening features distributed and preserves both character skills', () => {
    const seenSkills = new Set<number>();
    for (let runIndex = 0; runIndex < 200; runIndex += 1) {
      const entryOutcome = seth2BuyFeatureEntry(
        `controlled-character-entry-${runIndex}`,
        'client',
        runIndex,
        'awakening',
        2,
      );
      const seeds = Array.from({ length: 100 }, (_, index) => ({
        serverSeedId: `controlled-character-${runIndex}-${index}`,
        serverSeed: `controlled-character-seed-${runIndex}`,
        serverSeedHash: 'hash',
        clientSeed: 'client',
        nonce: runIndex * 100 + index + 1,
      }));
      const run = generateFeatureRun({
        entryOutcome,
        seeds,
        baseBet: 2,
        buying: true,
        featureIndex: 1,
        featureMode: 'awakening',
        forcedTotalFactor: 400,
      });
      expect(run.rounds.filter((round) => round.payoutFactor > 0).length).toBeGreaterThanOrEqual(5);
      expect(entryOutcome.payoutFactor + run.totalPayoutFactor).toBe(400);
      for (const round of run.rounds) {
        if (round.returnData.type17_mul_list.length > 0) seenSkills.add(17);
        if (round.returnData.type18_start_mul_list.length > 0) seenSkills.add(18);
      }
    }
    expect(seenSkills).toEqual(new Set([17, 18]));
  });
});

describe('Seth2 three buy-feature contracts', () => {
  const baseBet = 2;
  const seeds = Array.from({ length: 100 }, (_, index) => ({
    serverSeedId: `feature-seed-${index}`,
    serverSeed: 'three-feature-run',
    serverSeedHash: 'hash',
    clientSeed: 'client',
    nonce: index + 10,
  }));

  function assertFeatureRun(
    entryOutcome: ReturnType<typeof seth2BuyFeatureEntry>,
    featureIndex: 0 | 1,
  ) {
    const run = generateFeatureRun({
      entryOutcome,
      seeds,
      baseBet,
      buying: true,
      featureIndex,
      featureMode: entryOutcome.featureMode,
    });
    expect(run.rounds.length).toBeGreaterThanOrEqual(15);
    expect(run.rounds.length).toBeLessThanOrEqual(100);
    for (const round of run.rounds) {
      const states = seth2SourceGameStates(round.returnData, {
        action: 'freeSpin',
        spinId: 'three-feature-run',
        totalStake: baseBet,
        freeGameCount: round.sessionAfter.freeSpinsRemaining,
        featureWinningsBefore: round.featureWinningsBefore,
        isGoldenFg: entryOutcome.featureMode === 'awakening',
      });
      expect(round.returnData.total_gold).toBeCloseTo(baseBet * round.payoutFactor, 2);
      expect(states.at(-1)!.totalWinnings).toBeCloseTo(
        round.featureWinningsBefore + round.returnData.total_gold,
        2,
      );
    }
    expect(run.finalSession.freeSpinsRemaining).toBe(0);
  }

  it('keeps the 200x purchase random between normal and awakening entries', () => {
    const entries = Array.from({ length: 500 }, (_, nonce) =>
      seth2BuyFeature('feature-zero', 'client', nonce, baseBet),
    );
    const standard = entries.find((entry) => entry.featureMode === 'standard')!;
    const awakening = entries.find((entry) => entry.featureMode === 'awakening')!;
    expect(standard.returnData.list[0]!.start_data.filter((cell) => cell.type === 15)).toHaveLength(
      4,
    );
    expect(standard.returnData.list[0]!.start_data.some((cell) => cell.type === 16)).toBe(false);
    expect(
      awakening.returnData.list[0]!.start_data.filter((cell) => cell.type === 15),
    ).toHaveLength(3);
    expect(
      awakening.returnData.list[0]!.start_data.filter((cell) => cell.type === 16),
    ).toHaveLength(1);
    assertFeatureRun(standard, 0);
    assertFeatureRun(awakening, 0);
  });

  it('keeps the 500x purchase in awakening mode for all 15+ games', () => {
    const entry = seth2BuyFeatureEntry('feature-one', 'client', 1, 'awakening', baseBet);
    expect(entry.featureMode).toBe('awakening');
    expect(entry.returnData.gameModelType).toBe(1);
    assertFeatureRun(entry, 1);
  });

  it('keeps the 2,000x purchase as super-main cycles without a free-game session', () => {
    const outcome = seth2SuperMainSpinForFactor('feature-two', 'client', 1, baseBet, 5_000);
    const states = seth2SourceGameStates(outcome.returnData, {
      action: 'superSpin',
      spinId: 'feature-two',
      totalStake: baseBet,
      freeGameCount: 0,
      featureWinningsBefore: 0,
      isGoldenFg: false,
    });
    expect(outcome.returnData.freeGameCount).toBe(0);
    expect(outcome.returnData.list.some((round) => round.collect_gold !== undefined)).toBe(true);
    expect(states.every((state) => state.startFreeGame === false)).toBe(true);
    expect(states.at(-1)!.totalWinnings).toBe(outcome.returnData.total_gold);
    expect(outcome.returnData.total_gold).toBe(baseBet * 5_000);
  });
});

describe('Seth2 progressive jackpot settlement', () => {
  it('replaces the display and authoritative payout with the same locked pool value', () => {
    const outcome = seth2SpinForFactor('jp', 'client', 1, 18, 20, 'base');
    expect(outcome.returnData.JPtype).toBe(14);
    applySeth2JackpotAward(outcome, new Prisma.Decimal(18), {
      grand: new Prisma.Decimal(200_000),
      major: new Prisma.Decimal(70_000),
      minor: new Prisma.Decimal(13_000),
      mini: new Prisma.Decimal('1600.02'),
    });

    expect(outcome.returnData.JPGold).toBe(1_600.02);
    expect(outcome.returnData.total_gold).toBe(1_600.02);
    expect(
      new Prisma.Decimal(18)
        .mul(outcome.payoutFactor)
        .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN)
        .toFixed(2),
    ).toBe('1600.02');
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
        operationId: 'formal-play-test-operation',
      }),
    ).rejects.toMatchObject({ code: 'INVALID_ACTION' });
  });
});

describe('Seth2 event contracts', () => {
  it('rejects money requests without an idempotency key or explicit stake fields', () => {
    expect(
      seth2SourceSchema.safeParse({
        event: 'spin',
        data: { action: 'spin', stakeValue: 1, ratioValue: 0.1, machineId: 1 },
      }).success,
    ).toBe(false);
    expect(
      seth2SourceSchema.safeParse({
        event: 'spin',
        data: { action: 'spin', operationId: 'schema-operation-id', machineId: 1 },
      }).success,
    ).toBe(false);
    expect(
      seth2SourceSchema.safeParse({
        event: 'spin',
        data: {
          action: 'spin',
          stakeValue: 1,
          ratioValue: 0.1,
          machineId: 1,
          operationId: 'schema-operation-id',
        },
      }).success,
    ).toBe(true);
  });

  it('requires a durable sequence id instead of trusting a free-spin stake from the client', () => {
    expect(
      seth2SourceSchema.safeParse({
        event: 'collectFeatureSequence',
        data: { stakeValue: 1, ratioValue: 0.1, machineId: 1 },
      }).success,
    ).toBe(false);
    expect(
      seth2SourceSchema.safeParse({
        event: 'collectFeatureSequence',
        data: { sequenceId: 'settled-feature-sequence' },
      }).success,
    ).toBe(true);
  });

  it('accepts the source turbo patch and merges it without discarding persisted audio settings', () => {
    const request = {
      event: 'updateSettings',
      data: { settings: { type: 'game', data: { turbo: true } } },
    } as const;
    expect(seth2SourceSchema.safeParse(request).success).toBe(true);
    expect(
      mergeSeth2PlayerSettings(
        {
          stakeIndex: 2,
          advancedSettings: {
            sounds: { background: false, backgroundVolume: 0.25 },
            turbo: false,
          },
        },
        request.data.settings,
      ),
    ).toEqual({
      stakeIndex: 2,
      advancedSettings: {
        sounds: { background: false, backgroundVolume: 0.25 },
        turbo: true,
      },
    });
  });

  it('accepts original stake controls and persists both indices without changing turbo', () => {
    const request = {
      event: 'updateSettings',
      data: {
        settings: {
          type: 'game',
          data: {
            stakeIndex: 3,
            ratioIndex: 2,
            backgroundVolume: 0.4,
            effectVolume: 0.7,
            notify: false,
            stopOnJackpot: true,
          },
        },
      },
    } as const;
    expect(seth2SourceSchema.safeParse(request).success).toBe(true);
    expect(
      mergeSeth2PlayerSettings(
        {
          advancedSettings: { sounds: { background: true, effect: true }, turbo: true },
          autoPlay: { numberOfPlays: [10] },
          stakeIndex: 0,
          ratioIndex: 0,
        },
        request.data.settings,
      ),
    ).toEqual({
      advancedSettings: {
        sounds: {
          background: true,
          effect: true,
          backgroundVolume: 0.4,
          effectVolume: 0.7,
        },
        turbo: true,
        notify: false,
      },
      autoPlay: { numberOfPlays: [10], stopOnJackpot: true },
      stakeIndex: 3,
      ratioIndex: 2,
    });
  });
});

describe('Seth2 idempotent settlement replay', () => {
  it('returns the stored wallet result before any second Bet or wallet mutation', async () => {
    const returnData = seth2SpinForFactor('stored', 'client', 1, 18, 10, 'base').returnData;
    let createdBets = 0;
    const tx = {
      $queryRaw: async () => [
        {
          id: 'user-1',
          username: 'player',
          agentId: null,
          balance: new Prisma.Decimal('999.00'),
          displayName: 'Player',
          disabledAt: null,
          frozenAt: null,
          bettingLimits: {},
          bettingLimitLevel: 'range_10_5000',
        },
      ],
      bet: {
        findFirst: async () => ({
          id: 'stored-bet',
          resultData: {
            mode: 'base',
            machineId: 1,
            buying: false,
            featureIndex: null,
            baseAmount: '18.00',
            balanceAfter: '1161.00',
            atomicFeature: true,
            featureWinningsBefore: 0,
            returnData,
          },
        }),
        create: async () => {
          createdBets += 1;
          throw new Error('duplicate must not create a Bet');
        },
      },
    };
    const service = new Seth2Service({
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as never);

    const settlement = await (
      service as unknown as {
        settle: (...args: unknown[]) => Promise<{ spinId: string; balance: number }>;
      }
    ).settle('user-1', 18, 1, false, null, false, 'same-operation-id', true);

    expect(settlement).toMatchObject({ spinId: 'stored-bet', balance: 1_161 });
    expect(createdBets).toBe(0);
  });
});

describe('Seth2 v1.1.5 feature-purchase handshake', () => {
  const returnData = seth2BuyFeatureEntry('server', 'client', 7, 'awakening', 2).returnData;
  const settlement = {
    returnData,
    balance: 12_345,
    spinId: 'purchase-spin-1',
    session: {
      freeSpinsRemaining: 15,
      featureMode: 'awakening' as const,
      betAmount: '2.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    },
    freeSpin: false,
    buying: true,
    featureIndex: 1 as const,
    totalStake: 2,
    featureWinningsBefore: 0,
  };

  it('returns only a spinId from the purchase request, matching the source client callback', async () => {
    const service = new Seth2Service({} as never);
    (service as unknown as { settle: () => Promise<typeof settlement> }).settle = async () =>
      settlement;

    const result = await service.source('user-1', {
      event: 'spin',
      data: {
        action: 'buyFeature',
        featureIndex: 1,
        stakeValue: 1,
        ratioValue: 0.1,
        machineId: 1,
        operationId: 'feature-purchase-operation',
      },
    });

    expect(result).toMatchObject({
      status: 200,
      engine: { gameState: { spinId: 'purchase-spin-1' }, spinId: 'purchase-spin-1' },
      platform: { player: { balance: { amount: 12_345 } } },
    });
    expect(Array.isArray((result.engine as { gameState: unknown }).gameState)).toBe(false);
  });

  it('returns the reserved visual result without settling or debiting a second time', async () => {
    const service = new Seth2Service({} as never);
    let replayCount = 0;
    (
      service as unknown as { replayPurchasedSpin: () => Promise<typeof settlement> }
    ).replayPurchasedSpin = async () => {
      replayCount += 1;
      return settlement;
    };
    (service as unknown as { settle: () => never }).settle = () => {
      throw new Error('follow-up visual request must not settle again');
    };

    const result = await service.source('user-1', {
      event: 'spin',
      data: { spinId: 'purchase-spin-1', machineId: 1 },
    });

    const states = (result.engine as { gameState: Array<Record<string, unknown>> }).gameState;
    expect(replayCount).toBe(1);
    expect(states.length).toBeGreaterThan(0);
    expect(states[0]).toMatchObject({
      spinId: 'purchase-spin-1',
      startFreeGame: true,
      freeGameCount: 15,
      isGoldenFg: true,
    });
  });
});

describe('Seth2 atomic source session recovery', () => {
  const staleLegacyResult = {
    session: {
      freeSpinsRemaining: 15,
      featureMode: 'standard',
      betAmount: '18.00',
      multiplierBank: 20,
      femaleLock: null,
      featureWinnings: 50,
    },
  } as Prisma.JsonObject;

  it('does not let an obsolete per-spin session block a new atomic feature purchase', () => {
    expect(settlementSession(staleLegacyResult, true)).toEqual({
      freeSpinsRemaining: 0,
      featureMode: 'none',
      betAmount: '0.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it('preserves the same session for the legacy per-spin protocol', () => {
    expect(settlementSession(staleLegacyResult, false)).toMatchObject({
      freeSpinsRemaining: 15,
      featureMode: 'standard',
      betAmount: '18.00',
    });
  });
});

describe('Seth2 v1.1.5 source loading', () => {
  it('resumes the exact already-settled sequence after reload without rerunning math', async () => {
    const baseState = {
      view: Array.from({ length: 5 }, () => [1, 2, 3, 4, 5, 6]),
      spinId: 'resume-bet',
      currentView: 0,
      totalViews: 1,
      startFreeGame: true,
    };
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('888.00'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2PlayerState: {
        findUnique: async () => ({
          selectedMachineId: 77,
          settings: { stakeIndex: 2, ratioIndex: 3 },
        }),
      },
      seth2FeatureSequence: {
        findFirst: async () => ({
          betId: 'resume-bet',
          resumeCursor: 2,
          entryGameStates: [baseState],
          featureGameStates: [
            { ...baseState, action: 'freeSpin', startFreeGame: false },
            { ...baseState, action: 'freeSpin', startFreeGame: false },
          ],
        }),
      },
      seth2JackpotPool: { findUnique: async () => null },
    } as never);

    const result = await service.source('user-1', { event: 'initial', data: {} });
    const engine = result.engine as {
      spinId: string;
      gameState: Array<{ currentView: number; totalViews: number; startFreeGame: boolean }>;
    };
    const platform = result.platform as {
      table: { roomId: number };
      player: { settings: { stakeIndex: number; ratioIndex: number } };
    };

    expect(result.isResuming).toBe(true);
    expect(result.resumeCursor).toBe(1);
    expect(result.resumeTotalViews).toBe(3);
    expect(engine.spinId).toBe('resume-bet');
    expect(engine.gameState).toHaveLength(2);
    expect(engine.gameState.map((state) => [state.currentView, state.totalViews])).toEqual([
      [0, 2],
      [1, 2],
    ]);
    expect(engine.gameState.every((state) => state.startFreeGame === false)).toBe(true);
    expect(platform.table.roomId).toBe(77);
    expect(platform.player.settings).toMatchObject({ stakeIndex: 2, ratioIndex: 3 });
  });

  it('resumes one-round Eternal Rise from entry states without fake free-game states', async () => {
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('80000.00'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2PlayerState: { findUnique: async () => null },
      seth2FeatureSequence: {
        findFirst: async () => ({
          betId: 'super-main-bet',
          entryGameStates: [
            {
              view: Array.from({ length: 5 }, () => [1, 2, 3, 4, 5, 6]),
              spinId: 'super-main-bet',
              action: 'superSpin',
              freeGameCount: 0,
              startFreeGame: false,
            },
          ],
          featureGameStates: [],
        }),
      },
      seth2JackpotPool: { findUnique: async () => null },
    } as never);

    const result = await service.source('user-1', { event: 'initial', data: {} });
    const states = (result.engine as { gameState: Array<Record<string, unknown>> }).gameState;

    expect(result.isResuming).toBe(true);
    expect(states).toHaveLength(1);
    expect(states[0]).toMatchObject({
      action: 'superSpin',
      spinId: 'super-main-bet',
      currentView: 0,
      totalViews: 1,
      startFreeGame: false,
    });
  });

  it('replays a recent interrupted ordinary tumble without charging it again', async () => {
    const outcome = seth2SpinForFactor('resume-ordinary', 'client', 1, 10, 20, 'base');
    let betLookups = 0;
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('1234.50'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2PlayerState: { findUnique: async () => null },
      seth2FeatureSequence: { findFirst: async () => null },
      seth2JackpotPool: { findUnique: async () => null },
      bet: {
        findFirst: async () => {
          betLookups += 1;
          return {
            id: 'ordinary-bet',
            seth2FeatureSequence: null,
            resultData: {
              mode: 'base',
              machineId: 28,
              buying: false,
              featureIndex: null,
              baseAmount: '10.00',
              balanceAfter: '900.00',
              atomicFeature: true,
              displaySession: {
                freeSpinsRemaining: 0,
                featureMode: 'none',
                betAmount: '0.00',
                multiplierBank: 0,
                femaleLock: null,
                featureWinnings: 0,
              },
              featureWinningsBefore: 0,
              returnData: outcome.returnData,
            },
          };
        },
      },
    } as never);

    const result = await service.source('user-1', {
      event: 'initial',
      data: { resumeSpinId: 'ordinary-bet' },
    });
    const engine = result.engine as {
      spinId: string;
      gameState: Array<{ action: string; spinId: string }>;
    };

    expect(betLookups).toBe(1);
    expect(result).toMatchObject({
      isResuming: true,
      resumeKind: 'spin',
      platform: { player: { balance: { amount: 1234.5 } } },
    });
    expect(engine.spinId).toBe('ordinary-bet');
    expect(engine.gameState.length).toBeGreaterThan(0);
    expect(engine.gameState.every((state) => state.action === 'spin')).toBe(true);
    expect(engine.gameState.every((state) => state.spinId === 'ordinary-bet')).toBe(true);
  });

  it('fails closed when a durable feature sequence is corrupt instead of showing a blank game', async () => {
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('888.00'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2PlayerState: { findUnique: async () => null },
      seth2FeatureSequence: {
        findFirst: async () => ({
          betId: 'corrupt-feature',
          entryGameStates: { invalid: true },
          featureGameStates: [],
        }),
      },
      seth2JackpotPool: { findUnique: async () => null },
    } as never);

    await expect(service.source('user-1', { event: 'initial', data: {} })).rejects.toMatchObject({
      code: 'INTERNAL',
    });
  });

  it('keeps the 30-day machine aggregate out of the initial game boot', async () => {
    let aggregateQueries = 0;
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('123.45'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2PlayerState: { findUnique: async () => null },
      seth2FeatureSequence: { findFirst: async () => null },
      seth2JackpotPool: { findUnique: async () => null },
      $queryRaw: async () => {
        aggregateQueries += 1;
        return [];
      },
    } as never);

    const result = await service.source('user-1', { event: 'initial', data: {} });
    const platform = result.platform as { tables: unknown[]; tableMeta: Record<string, number> };

    expect(aggregateQueries).toBe(0);
    expect(platform.tables).toHaveLength(500);
    expect(platform.tableMeta).toMatchObject({
      currentPage: 1,
      tablePerPage: 500,
      totalPages: 8,
      totalTableCount: 4_000,
    });
  });

  it('keeps an empty machine detail rate aligned with its table-list rate', async () => {
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('123.45'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      $queryRaw: async () => [],
    } as never);
    const now = vi.spyOn(Date, 'now').mockReturnValue(MACHINE_RATE_TIME);

    try {
      const detailResult = await service.source('user-1', {
        event: 'getSlotTableDetail',
        data: { roomId: 15 },
      });
      const tableResult = await service.source('user-1', {
        event: 'getSlotTables',
        data: { page: 1, machineId: 1 },
      });
      const detail = (
        detailResult as {
          data: {
            detail: {
              dayBet: number;
              dayWin: number;
              hourBet: number;
              hourWin: number;
              todayBet: number;
              todayWin: number;
              mgCounts: number[];
            };
          };
        }
      ).data.detail;
      const table = (
        tableResult as {
          data: { tables: Array<{ roomId: number; today: { bet: number; win: number } }> };
        }
      ).data.tables.find((candidate) => candidate.roomId === 15);

      expect(detailResult).toMatchObject({
        status: 200,
        data: {
          detail: {
            mgCounts: expect.arrayContaining([
              expect.any(Number),
              expect.any(Number),
              expect.any(Number),
            ]),
          },
          lock: { roomId: 15 },
        },
      });
      expect(detail.todayBet).toBeGreaterThan(100);
      expect(detail.dayBet).toBeGreaterThan(detail.todayBet);
      expect(detail.todayWin).toBeGreaterThan(0);
      expect(detail.hourWin).toBe(detail.todayWin);
      expect(detail.dayWin).toBeGreaterThan(0);
      expect(detail.mgCounts.every((count) => count > 0)).toBe(true);
      expect(table).toMatchObject({
        today: {
          bet: detail.todayBet,
          win: detail.todayWin,
        },
      });
      expect(detailResult).not.toHaveProperty('detail');
      expect(detailResult).not.toHaveProperty('lock');
    } finally {
      now.mockRestore();
    }
  });

  it('wraps paged machine tables in the source data envelope', async () => {
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal('123.45'),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      $queryRaw: async () => [],
    } as never);

    const result = await service.source('user-1', {
      event: 'getSlotTables',
      data: { page: 2, machineId: 15 },
    });

    expect(result).toMatchObject({
      status: 200,
      data: {
        lock: { roomId: 15 },
        tableMeta: {
          currentPage: 2,
          tablePerPage: 500,
          totalPages: 8,
          totalTableCount: 4_000,
        },
      },
    });
    expect((result as { data: { tables: unknown[] } }).data.tables).toHaveLength(500);
    expect(result).not.toHaveProperty('tables');
    expect(result).not.toHaveProperty('lock');
    expect(result).not.toHaveProperty('tableMeta');
  });

  it('collects an entire free-game sequence in one source request', async () => {
    const outcome = seth2SpinForFactor('feature-sequence', 'client', 1, 2, 20, 'awakening_free');
    const states = [
      {
        view: Array.from({ length: 5 }, () => [1, 2, 3, 4, 5, 6]),
        spinId: 'feature-parent',
        action: 'freeSpin',
        freeGameCount: 0,
        totalWinnings: outcome.returnData.total_gold,
      },
    ];
    const service = new Seth2Service({
      user: {
        findUnique: async () => ({
          id: 'user-1',
          username: 'player',
          displayName: 'Player',
          balance: new Prisma.Decimal(600),
          frozenAt: null,
          disabledAt: null,
        }),
      },
      seth2FeatureSequence: {
        findFirst: async () => ({
          id: 'sequence-1',
          betId: 'feature-parent',
          finalBalance: new Prisma.Decimal(1_020),
          featureGameStates: states,
        }),
      },
    } as never);

    const result = await service.source('user-1', {
      event: 'collectFeatureSequence',
      data: { sequenceId: 'feature-parent' },
    });
    const engine = result.engine as {
      spinId: string;
      gameState: Array<{ action: string; freeGameCount: number; totalWinnings: number }>;
    };

    expect(engine.spinId).toBe('feature-parent');
    expect(engine.gameState.every((state) => state.action === 'freeSpin')).toBe(true);
    expect(engine.gameState.at(-1)).toMatchObject({
      freeGameCount: 0,
      totalWinnings: outcome.returnData.total_gold,
    });
    expect(result).toMatchObject({
      platform: { player: { balance: { amount: 600 } } },
    });
  });

  it('checkpoints feature playback monotonically without touching the wallet', async () => {
    let updateArgs: unknown;
    const service = new Seth2Service({
      seth2FeatureSequence: {
        updateMany: async (args: unknown) => {
          updateArgs = args;
          return { count: 1 };
        },
      },
    } as never);

    const result = await service.source('user-1', {
      event: 'updateFeatureProgress',
      data: { sequenceId: 'feature-parent', completedViews: 7 },
    });

    expect(result).toEqual({
      status: 200,
      sequenceId: 'feature-parent',
      completedViews: 7,
    });
    expect(updateArgs).toEqual({
      where: {
        userId: 'user-1',
        status: 'READY',
        resumeCursor: { lt: 7 },
        OR: [{ id: 'feature-parent' }, { betId: 'feature-parent' }],
      },
      data: { resumeCursor: 7 },
    });
  });

  it('credits a deferred feature exactly once when closeSpin finishes the game', async () => {
    let walletBalance = new Prisma.Decimal(600);
    let sequenceStatus: 'READY' | 'CONSUMED' = 'READY';
    let winCredits = 0;
    const tx = {
      $queryRaw: async () => [
        {
          id: 'user-1',
          username: 'player',
          agentId: null,
          balance: walletBalance,
          displayName: 'Player',
          disabledAt: null,
          frozenAt: null,
          bettingLimits: {},
          bettingLimitLevel: 'range_10_5000',
        },
      ],
      user: {
        update: async ({ data }: { data: { balance: { increment: Prisma.Decimal } } }) => {
          walletBalance = walletBalance.add(data.balance.increment);
          return { balance: walletBalance };
        },
      },
      transaction: {
        create: async ({ data }: { data: { type: string } }) => {
          if (data.type === 'BET_WIN') winCredits += 1;
          return data;
        },
      },
      seth2FeatureSequence: {
        findFirst: async () => ({
          id: 'sequence-1',
          betId: 'feature-parent',
          machineId: 7,
          finalPayout: new Prisma.Decimal(125),
          definitionVersion: SETH2_DEFERRED_PAYOUT_SEQUENCE_VERSION,
          status: sequenceStatus,
        }),
        updateMany: async () => {
          sequenceStatus = 'CONSUMED';
          return { count: 1 };
        },
      },
    };
    const service = new Seth2Service({
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as never);

    const first = await service.source('user-1', {
      event: 'closeSpin',
      data: { spinId: 'feature-parent' },
    });
    const repeated = await service.source('user-1', {
      event: 'closeSpin',
      data: { spinId: 'feature-parent' },
    });

    expect(first).toMatchObject({ platform: { player: { balance: { amount: 725 } } } });
    expect(repeated).toMatchObject({ platform: { player: { balance: { amount: 725 } } } });
    expect(winCredits).toBe(1);
  });

  it('consumes legacy feature sequences without paying their already-credited result again', async () => {
    const walletBalance = new Prisma.Decimal(900);
    let sequenceStatus: 'READY' | 'CONSUMED' = 'READY';
    let walletUpdates = 0;
    const tx = {
      $queryRaw: async () => [
        {
          id: 'user-1',
          username: 'player',
          agentId: null,
          balance: walletBalance,
          displayName: 'Player',
          disabledAt: null,
          frozenAt: null,
          bettingLimits: {},
          bettingLimitLevel: 'range_10_5000',
        },
      ],
      user: {
        update: async () => {
          walletUpdates += 1;
          return { balance: walletBalance };
        },
      },
      transaction: { create: async () => ({}) },
      seth2FeatureSequence: {
        findFirst: async () => ({
          id: 'legacy-sequence',
          betId: 'legacy-feature',
          machineId: 2,
          finalPayout: new Prisma.Decimal(300),
          definitionVersion: 'seth2-v1.1.5-sequence-v1',
          status: sequenceStatus,
        }),
        updateMany: async () => {
          sequenceStatus = 'CONSUMED';
          return { count: 1 };
        },
      },
    };
    const service = new Seth2Service({
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as never);

    const result = await service.source('user-1', {
      event: 'closeSpin',
      data: { spinId: 'legacy-feature' },
    });

    expect(result).toMatchObject({ platform: { player: { balance: { amount: 900 } } } });
    expect(sequenceStatus).toBe('CONSUMED');
    expect(walletUpdates).toBe(0);
  });
});

describe('Seth2 machine statistics', () => {
  it('reports each machine from its own settled bet and payout totals', () => {
    const machine = machineInfo(
      7,
      {
        machineId: 7,
        todayBet: new Prisma.Decimal(200),
        todayPayout: new Prisma.Decimal(150),
        thirtyDayBet: new Prisma.Decimal(1_000),
        thirtyDayPayout: new Prisma.Decimal(968.95),
      },
      MACHINE_RATE_TIME,
    );

    expect(machine).toMatchObject({
      id: 7,
      code: '0007',
      totalBet: 200,
      day_rate: machineDisplayRate(7, MACHINE_RATE_TIME),
      totalBet30: 1_000,
      day_rate_30: machineDisplayRate(7, MACHINE_RATE_TIME, 1),
    });
  });

  it('keeps empty machine totals at zero while still showing the animated selection rate', () => {
    expect(machineInfo(2, undefined, MACHINE_RATE_TIME)).toMatchObject({
      totalBet: 0,
      day_rate: machineDisplayRate(2, MACHINE_RATE_TIME),
      totalBet30: 0,
      day_rate_30: machineDisplayRate(2, MACHINE_RATE_TIME, 1),
    });
  });

  it('returns eight distinct 500-machine pages covering machine 0001 through 4000', () => {
    const rates = new Set<string>();
    for (let page = 1; page <= 8; page += 1) {
      const machines = machineList(new Map(), page, MACHINE_RATE_TIME);
      expect(machines).toHaveLength(500);
      expect(machines[0]!.id).toBe((page - 1) * 500 + 1);
      expect(machines.at(-1)!.id).toBe(page * 500);
      for (const machine of machines) {
        expect(machine.day_rate).toMatch(/^\d{2,3}\.\d{2}$/);
        expect(Number(machine.day_rate)).toBeGreaterThanOrEqual(70);
        rates.add(machine.day_rate);
      }
    }
    expect(rates.size).toBeGreaterThan(2_500);
  });

  it('drifts machine rates smoothly every five seconds and accepts the complete page/id range', () => {
    const rates = Array.from({ length: 13 }, (_, index) =>
      Number(machineDisplayRate(3974, MACHINE_RATE_TIME + index * 5_000)),
    );
    expect(new Set(rates).size).toBeGreaterThan(1);
    for (let index = 1; index < rates.length; index += 1) {
      expect(Math.abs(rates[index]! - rates[index - 1]!)).toBeLessThanOrEqual(0.1);
    }
    expect(seth2ProtocolSchema.parse({ type: 'getMachineList', page: 8 })).toMatchObject({
      page: 8,
    });
    expect(seth2ProtocolSchema.parse({ type: 'useMachine', machineId: 4000 })).toMatchObject({
      machineId: 4000,
    });
    expect(() => seth2ProtocolSchema.parse({ type: 'getMachineList', page: 9 })).toThrow();
    expect(() => seth2ProtocolSchema.parse({ type: 'useMachine', machineId: 4001 })).toThrow();
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
    multiplierBankAfter: 0,
    femaleLock: null,
  };

  it('starts all fifteen source games after a natural standard trigger', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 0,
          featureMode: 'none',
          betAmount: '0.00',
          multiplierBank: 0,
          femaleLock: null,
          featureWinnings: 0,
        },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'standard',
        },
      ),
    ).toEqual({
      freeSpinsRemaining: 15,
      featureMode: 'standard',
      betAmount: '18.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it('keeps golden-SCATTER triggers in awakening mode', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 0,
          featureMode: 'none',
          betAmount: '0.00',
          multiplierBank: 0,
          femaleLock: null,
          featureWinnings: 0,
        },
        {
          ...baseInput,
          triggeredFreeSpins: true,
          triggeredFeatureMode: 'awakening',
        },
      ),
    ).toEqual({
      freeSpinsRemaining: 15,
      featureMode: 'awakening',
      betAmount: '18.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it.each(['standard', 'awakening'] as const)(
    'records the selected %s purchase mode and carries the entry SCATTER win',
    (featureMode) => {
      expect(
        advanceSession(
          {
            freeSpinsRemaining: 0,
            featureMode: 'none',
            betAmount: '0.00',
            multiplierBank: 0,
            femaleLock: null,
            featureWinnings: 0,
          },
          { ...baseInput, buying: true, boughtFeatureMode: featureMode, roundPayout: 54 },
        ),
      ).toEqual({
        freeSpinsRemaining: 15,
        featureMode,
        betAmount: '18.00',
        multiplierBank: 0,
        femaleLock: null,
        featureWinnings: 54,
      });
    },
  );

  it('adds five retrigger games after consuming the current game', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 1,
          featureMode: 'awakening',
          betAmount: '18.00',
          multiplierBank: 40,
          femaleLock: null,
          featureWinnings: 10,
        },
        { ...baseInput, freeSpin: true, extraSpins: 5, multiplierBankAfter: 52 },
      ),
    ).toEqual({
      freeSpinsRemaining: 5,
      featureMode: 'awakening',
      betAmount: '18.00',
      multiplierBank: 52,
      femaleLock: null,
      featureWinnings: 10,
    });
  });

  it('caps accumulated free games at one hundred', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 98,
          featureMode: 'standard',
          betAmount: '18.00',
          multiplierBank: 20,
          femaleLock: null,
          featureWinnings: 10,
        },
        { ...baseInput, freeSpin: true, extraSpins: 5, multiplierBankAfter: 30 },
      ),
    ).toEqual({
      freeSpinsRemaining: 100,
      featureMode: 'standard',
      betAmount: '18.00',
      multiplierBank: 30,
      femaleLock: null,
      featureWinnings: 10,
    });
  });

  it('clears the feature only after the final non-retrigger spin', () => {
    expect(
      advanceSession(
        {
          freeSpinsRemaining: 1,
          featureMode: 'standard',
          betAmount: '18.00',
          multiplierBank: 120,
          femaleLock: null,
          featureWinnings: 25,
        },
        { ...baseInput, freeSpin: true, multiplierBankAfter: 140 },
      ),
    ).toEqual({
      freeSpinsRemaining: 0,
      featureMode: 'none',
      betAmount: '0.00',
      multiplierBank: 0,
      femaleLock: null,
      featureWinnings: 0,
    });
  });

  it('keeps the captured level-three woman lock for the 6 -> 5 -> ... -> 1 sequence', () => {
    const cell = { type: 10 as const, mul: 5, mul_type: 0, code: 13 };
    const start_data = Array.from({ length: 30 }, (_, code) => ({
      type: (code % 9) + 1,
      mul: 0,
    }));
    start_data[cell.code] = cell;
    const firstData = {
      list: [
        {
          start_data,
          remove_type: [1],
          upgrade_mul_list: [{ type: 10, mul: 5, new_mul: 6, mul_type: 0, code: 13 }],
        },
      ],
      type18_start_mul_list: [cell],
      type18_mul_count: 6,
    } as unknown as Seth2ReturnData;
    const first = applyFemaleLockState(firstData, null);
    expect(firstData.type18_mul_count).toBe(6);
    expect(firstData.type18_start_mul_list).toEqual([cell]);
    const upgradedCell = { ...cell, mul: 6 };
    expect(first).toEqual({ cells: [upgradedCell], gamesRemaining: 5 });

    const observed: number[] = [];
    let current = first;
    for (let index = 0; index < 5; index += 1) {
      const nextStart = Array.from({ length: 30 }, (_, code) => ({
        type: (code % 9) + 1,
        mul: 0,
      }));
      const data = {
        list: [{ start_data: nextStart, remove_type: [], upgrade_mul_list: [] }],
        type18_start_mul_list: [],
        type18_mul_count: 0,
      } as unknown as Seth2ReturnData;
      current = applyFemaleLockState(data, current);
      observed.push(data.type18_mul_count);
      expect(data.type18_start_mul_list).toEqual([upgradedCell]);
      expect(data.list[0]!.start_data[cell.code]).toEqual(upgradedCell);
    }
    expect(observed).toEqual([5, 4, 3, 2, 1]);
    expect(current).toBeNull();
  });

  it('persists only the woman-selected balls when other multiplier balls are visible', () => {
    const startData: Seth2Cell[] = Array.from({ length: 30 }, (_, code) => ({
      type: (code % 9) + 1,
      mul: 0,
    }));
    startData[2] = { type: 10, mul: 25, mul_type: 1 };
    startData[7] = { type: 10, mul: 50, mul_type: 1 };
    startData[12] = { type: 10, mul: 100, mul_type: 0 };
    startData[21] = { type: 10, mul: 500, mul_type: 1 };
    const data = {
      list: [{ start_data: startData, remove_type: [], upgrade_mul_list: [] }],
      type18_start_mul_list: [
        { type: 10, mul: 25, mul_type: 1, code: 2 },
        { type: 10, mul: 500, mul_type: 1, code: 21 },
      ],
      type18_mul_count: 4,
    } as unknown as Seth2ReturnData;

    const saved = applyFemaleLockState(data, null);
    expect(data.type18_start_mul_list.map((cell) => cell.code)).toEqual([2, 21]);
    expect(saved?.cells.map((cell) => cell.code)).toEqual([2, 21]);
    expect(saved?.cells).toHaveLength(2);
  });

  it('re-adds locked balls to the multiplier bank only on a winning free spin', () => {
    const win = {
      score: 2,
      multiplierBankBefore: 35,
      multiplierBankAdded: 10,
      multiplierBankAfter: 45,
    } as unknown as Seth2ReturnData;
    normalizeFemaleLockAccounting(win, 25, 10);
    expect(win).toMatchObject({
      multiplierBankBefore: 25,
      multiplierBankAdded: 20,
      multiplierBankAfter: 45,
    });

    const loss = {
      score: 0,
      multiplierBankBefore: 35,
      multiplierBankAdded: 0,
      multiplierBankAfter: 35,
    } as unknown as Seth2ReturnData;
    normalizeFemaleLockAccounting(loss, 25, 10);
    expect(loss).toMatchObject({
      multiplierBankBefore: 25,
      multiplierBankAdded: 0,
      multiplierBankAfter: 25,
    });
  });
});
