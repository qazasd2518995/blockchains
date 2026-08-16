import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { GameId, H5_GAMES, SLOT_GAME_IDS } from '@bg/shared';
import {
  getHotlineReelCount,
  getHotlineReelRowCounts,
  getHotlineRowCount,
  hotlineEvaluate,
  hotlineSelectBountyFreeMode,
  hotlineSelectLucky777FreeMode,
} from '@bg/provably-fair';
import { __hotlineServiceTestHooks, HotlineService } from './hotline.service.js';

describe('hotline deferred feature payout', () => {
  it('credits a completed H5 free-game feature exactly once', async () => {
    let walletBalance = new Prisma.Decimal(600);
    let winCredits = 0;
    let resultData: Record<string, unknown> = {
      grid: [],
      lines: [],
      cascades: [],
      buyFeature: true,
      enhancedBet: false,
      baseAmount: '10.00',
      stakeAmount: '750.00',
      walletSettlement: {
        version: 'h5-feature-deferred-payout-v1',
        status: 'DEFERRED',
      },
    };
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
      bet: {
        findFirst: async () => ({
          id: 'gates-feature-1',
          payout: new Prisma.Decimal(125),
          resultData,
        }),
        update: async ({ data }: { data: { resultData: Record<string, unknown> } }) => {
          resultData = data.resultData;
          return { id: 'gates-feature-1' };
        },
      },
    };
    const service = new HotlineService({
      $transaction: async (callback: (client: typeof tx) => unknown) => callback(tx),
    } as never);

    const first = await service.completeDeferredFeature(
      'user-1',
      'h5-gates-of-olympus',
      'gates-feature-1',
    );
    const repeated = await service.completeDeferredFeature(
      'user-1',
      'h5-gates-of-olympus',
      'gates-feature-1',
    );

    expect(first).toBe('725.00');
    expect(repeated).toBe('725.00');
    expect(winCredits).toBe(1);
    expect(resultData.walletSettlement).toMatchObject({ status: 'PAID' });
  });
});

describe('hotline controlled round shaping', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('varies fixed-line soft-hit placement across nonces', () => {
    const signatures = new Set(
      Array.from({ length: 12 }, (_, nonce) => {
        const round = __hotlineServiceTestHooks.softLossHotlineRound(GameId.CANDY_SLOT, nonce);
        const line = round.lines[0];
        expect(line).toBeDefined();
        return `${line!.lineId}:${line!.startReel}:${line!.direction}:${line!.row}`;
      }),
    );

    expect(signatures.size).toBeGreaterThan(2);
  });

  it('returns cascade steps for mega soft-hit rounds', () => {
    const rounds = Array.from({ length: 6 }, (_, nonce) =>
      __hotlineServiceTestHooks.softLossHotlineRound(GameId.DRAGON_MEGA_SLOT, nonce),
    );

    for (const round of rounds) {
      const cascades = round.cascades ?? [];
      expect(cascades.length).toBeGreaterThan(0);
      expect(cascades[0]!.removed.length).toBeGreaterThanOrEqual(8);
      expect(cascades[0]!.grid).not.toEqual(round.grid);
      expect(hotlineEvaluate(round.grid).lines).toEqual([]);
    }

    const removalSignatures = new Set(
      rounds.map((round) => {
        const cascades = round.cascades ?? [];
        return cascades[0]!.removed.map((position) => `${position.reel}:${position.row}`).join('|');
      }),
    );
    expect(removalSignatures.size).toBeGreaterThan(1);
  });

  it('does not fall back to uncapped jackpot symbols when burst bounds are unreachable', () => {
    const amount = new Prisma.Decimal(10);
    const maxPayout = new Prisma.Decimal(3010);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.SAKURA_SLOT,
      amount,
      {
        minMultiplier: new Prisma.Decimal(21),
        maxMultiplier: new Prisma.Decimal(301),
        maxPayout,
      },
      42,
    );

    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
  });

  it('uses the highest legal 5x3 slot payout for burst wins instead of repeated small wins', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(50000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.FRUIT_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(250),
        maxMultiplier: new Prisma.Decimal(500),
        maxPayout,
      },
      88,
    );

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(250);
    expect(round.totalMultiplier).toBeLessThanOrEqual(500);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(hotlineEvaluate(round.grid).totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
  });

  it('keeps 3x3 burst wins inside the softened mini-slot paytable', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(3000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.SAKURA_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(20),
        maxMultiplier: new Prisma.Decimal(30),
        maxPayout,
      },
      99,
    );

    expect(round.totalMultiplier).toBeGreaterThan(1);
    expect(round.totalMultiplier).toBeLessThanOrEqual(30);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(hotlineEvaluate(round.grid).totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
  });

  it('does not synthesize a burst win when no legal slot payout fits the cap', () => {
    const amount = new Prisma.Decimal(100);
    const round = __hotlineServiceTestHooks.strictWinningHotlineRound(
      GameId.SAKURA_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal('1.01'),
        maxMultiplier: new Prisma.Decimal('1.20'),
        maxPayout: new Prisma.Decimal(120),
      },
      7,
    );

    expect(round).toBeNull();
  });

  it('uses true low-profit burst wins when the slot paytable can represent them', () => {
    const amount = new Prisma.Decimal(100);
    const controls = {
      flipReason: 'burst_win',
      minMultiplier: new Prisma.Decimal('1.01'),
      maxMultiplier: new Prisma.Decimal('1.20'),
      maxPayout: new Prisma.Decimal(120),
    };

    const classic = __hotlineServiceTestHooks.strictWinningHotlineRound(
      GameId.FRUIT_SLOT,
      amount,
      controls,
      7,
    );
    const mega = __hotlineServiceTestHooks.strictWinningHotlineRound(
      GameId.DRAGON_MEGA_SLOT,
      amount,
      controls,
      7,
    );

    for (const round of [classic, mega]) {
      expect(round).not.toBeNull();
      expect(round!.totalMultiplier).toBeGreaterThan(1);
      expect(round!.totalMultiplier).toBeLessThanOrEqual(1.2);
      expect(amount.mul(round!.totalMultiplier).lessThanOrEqualTo(120)).toBe(true);
    }
  });

  it('shapes normal mega-slot burst wins toward the configured cap while respecting max payout', () => {
    const amount = new Prisma.Decimal(100);
    const maxPayout = new Prisma.Decimal(50000);
    const round = __hotlineServiceTestHooks.winningHotlineRound(
      GameId.DRAGON_MEGA_SLOT,
      amount,
      {
        flipReason: 'burst_win',
        minMultiplier: new Prisma.Decimal(250),
        maxMultiplier: new Prisma.Decimal(500),
        maxPayout,
      },
      111,
    );

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(250);
    expect(round.totalMultiplier).toBeLessThanOrEqual(500);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(round.lines).toHaveLength(0);
    expect(round.cascades).toHaveLength(0);
    expect(round.features?.scatterCount).toBe(4);
    expect(round.features?.baseTotalMultiplier).toBe(0);
    expect(round.features?.freeSpinsAwarded).toBe(15);
    expect(round.features?.freeSpinWinMultiplier).toBe(round.totalMultiplier);
    expect(round.features?.totalMultiplier).toBe(round.totalMultiplier);
  });

  it('routes mega-slot bursts through varied scatter-triggered free games', () => {
    const amount = new Prisma.Decimal(100);
    const rounds = Array.from({ length: 6 }, (_, nonce) =>
      __hotlineServiceTestHooks.winningHotlineRound(
        GameId.DRAGON_MEGA_SLOT,
        amount,
        {
          flipReason: 'burst_win',
          minMultiplier: new Prisma.Decimal(250),
          maxMultiplier: new Prisma.Decimal(500),
          maxPayout: new Prisma.Decimal(50000),
        },
        nonce,
      ),
    );

    const scatterSignatures = new Set(
      rounds.map((round) =>
        round.features?.scatterSymbols
          .map((position) => `${position.reel}:${position.row}`)
          .join('|'),
      ),
    );
    const featureSignatures = new Set(
      rounds.map((round) =>
        [
          round.features?.freeSpinRounds
            .filter((freeRound) => freeRound.totalMultiplier > 0)
            .map(
              (freeRound) =>
                `${freeRound.index}:${freeRound.totalMultiplier}:${freeRound.multiplierTotal}`,
            )
            .join('|') ?? '',
        ].join('/'),
      ),
    );
    const winningBoardSignatures = new Set(
      rounds.flatMap((round) =>
        (round.features?.freeSpinRounds ?? [])
          .filter((freeRound) => freeRound.totalMultiplier > 0)
          .map((freeRound) => JSON.stringify(freeRound.initialGrid)),
      ),
    );

    expect(scatterSignatures.size).toBeGreaterThan(1);
    expect(featureSignatures.size).toBeGreaterThan(1);
    expect(winningBoardSignatures.size).toBeGreaterThan(4);
    for (const round of rounds) {
      expect(round.lines).toHaveLength(0);
      expect(round.cascades).toHaveLength(0);
      expect(round.features?.scatterCount).toBe(4);
      expect(round.features?.baseTotalMultiplier).toBe(0);
      expect(round.features?.freeSpinsAwarded).toBe(15);
      expect(
        round.features?.freeSpinRounds.some((freeRound) => freeRound.cascades.length > 0),
      ).toBe(true);
      expect(
        round.features?.freeSpinRounds.some((freeRound) => freeRound.multiplierSymbols.length > 0),
      ).toBe(true);
      expect(round.features?.totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
    }
  });

  it('keeps controlled normal mega wins out of free games while varying cascades', () => {
    const rounds = Array.from({ length: 8 }, (_, variant) =>
      __hotlineServiceTestHooks.roundFromMegaGrid(
        GameId.DRAGON_MEGA_SLOT,
        __hotlineServiceTestHooks.megaClusterHotlineGrid([4, 5], variant * 41, 10),
        variant * 41,
      ),
    );
    const cascadeSignatures = new Set(
      rounds.map((round) => JSON.stringify((round.cascades ?? [])[0]?.grid ?? round.grid)),
    );
    const finalGridSignatures = new Set(rounds.map((round) => JSON.stringify(round.grid)));

    expect(cascadeSignatures.size).toBeGreaterThan(4);
    expect(finalGridSignatures.size).toBeGreaterThan(4);
    for (const round of rounds) {
      expect(round.cascades?.length ?? 0).toBeGreaterThan(0);
      expect(round.features?.scatterCount).toBe(0);
      expect(round.features?.freeSpinsAwarded).toBe(0);
      expect(round.features?.freeSpinRounds).toHaveLength(0);
      expect(round.features?.baseTotalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
      expect(round.features?.totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
      expect(hotlineEvaluate(round.grid).lines).toHaveLength(0);
    }
  });

  it('varies controlled opening grids across slot sizes and control reasons', () => {
    const amount = new Prisma.Decimal(100);
    const normalControl = {
      minMultiplier: new Prisma.Decimal(2),
      maxMultiplier: new Prisma.Decimal(30),
      maxPayout: new Prisma.Decimal(50000),
    };
    const burstControl = {
      flipReason: 'burst_win',
      minMultiplier: new Prisma.Decimal(20),
      maxMultiplier: new Prisma.Decimal(500),
      maxPayout: new Prisma.Decimal(50000),
    };
    const openingSignature = (
      round: ReturnType<typeof __hotlineServiceTestHooks.winningHotlineRound>,
    ) => JSON.stringify(round.cascades?.[0]?.grid ?? round.grid);
    const cases = [
      {
        minUnique: 4,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.softLossHotlineRound(GameId.CANDY_SLOT, nonce),
        ),
      },
      {
        minUnique: 4,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.CANDY_SLOT,
            amount,
            normalControl,
            nonce,
          ),
        ),
      },
      {
        minUnique: 4,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.CANDY_SLOT,
            amount,
            burstControl,
            nonce,
          ),
        ),
      },
      {
        minUnique: 8,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.softLossHotlineRound(GameId.FRUIT_SLOT, nonce),
        ),
      },
      {
        minUnique: 8,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.FRUIT_SLOT,
            amount,
            normalControl,
            nonce,
          ),
        ),
      },
      {
        minUnique: 8,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.FRUIT_SLOT,
            amount,
            burstControl,
            nonce,
          ),
        ),
      },
      {
        minUnique: 12,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.softLossHotlineRound(GameId.DRAGON_MEGA_SLOT, nonce),
        ),
      },
      {
        minUnique: 12,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.DRAGON_MEGA_SLOT,
            amount,
            normalControl,
            nonce,
          ),
        ),
      },
      {
        minUnique: 12,
        rounds: Array.from({ length: 24 }, (_, nonce) =>
          __hotlineServiceTestHooks.winningHotlineRound(
            GameId.DRAGON_MEGA_SLOT,
            amount,
            burstControl,
            nonce,
          ),
        ),
      },
    ];

    for (const controlledCase of cases) {
      expect(new Set(controlledCase.rounds.map(openingSignature)).size).toBeGreaterThanOrEqual(
        controlledCase.minUnique,
      );
    }
  });

  it('keeps controlled loss slot rounds below the stake across slot sizes', () => {
    const stake = new Prisma.Decimal(5000);
    for (const gameId of SLOT_GAME_IDS) {
      for (let nonce = 0; nonce < 12; nonce += 1) {
        const round = __hotlineServiceTestHooks.lossHotlineRound(gameId, stake, nonce);
        const payout = stake.mul(round.totalMultiplier).toDecimalPlaces(2);
        expect(payout.lessThan(stake)).toBe(true);
      }
    }
  });

  it('simulates principal, deposit, manual, cap, and burst controls across every imported game', () => {
    const stake = new Prisma.Decimal(100);
    const winningControls = [
      'win_control',
      'loss_control_release',
      'deposit_control',
      'deposit_lifecycle_path_guard',
      'online_reward_next_win',
      'auto_balance_revive',
      'auto_balance_path_guard',
      'manual_detection',
      'manual_detection_release',
      'global_accidental_burst_cap',
      'burst_win',
      'burst_small_win',
      'burst_risk_cap',
    ].map((flipReason) => ({
      flipReason,
      minMultiplier: new Prisma.Decimal(flipReason === 'burst_win' ? 2 : '1.01'),
      maxMultiplier: new Prisma.Decimal(flipReason === 'burst_win' ? 500 : 20),
      maxPayout: new Prisma.Decimal(flipReason === 'burst_win' ? 50000 : 2000),
    }));
    const losingControls = [
      'loss_control',
      'deposit_control',
      'deposit_lifecycle_path_guard',
      'auto_balance_bite',
      'auto_balance_drain',
      'auto_balance_path_guard',
      'manual_detection',
      'win_cap',
      'win_cap_rate',
      'agent_line_cap',
      'agent_line_cap_rate',
      'global_member_daily_win_cap',
      'burst_loss',
      'burst_budget_guard',
      'burst_risk_guard',
    ];

    H5_GAMES.forEach((game, gameIndex) => {
      winningControls.forEach((control, controlIndex) => {
        const round = __hotlineServiceTestHooks.strictWinningHotlineRound(
          game.gameId,
          stake,
          control,
          gameIndex * 101 + controlIndex * 17,
        );
        expect(round, `${game.gameId}/${control.flipReason}`).not.toBeNull();
        expect(round!.totalMultiplier, `${game.gameId}/${control.flipReason}`).toBeGreaterThan(1);
        expect(
          round!.totalMultiplier,
          `${game.gameId}/${control.flipReason}`,
        ).toBeGreaterThanOrEqual(control.minMultiplier.toNumber());
        expect(round!.totalMultiplier, `${game.gameId}/${control.flipReason}`).toBeLessThanOrEqual(
          control.maxMultiplier.toNumber(),
        );
        expect(
          stake.mul(round!.totalMultiplier).lessThanOrEqualTo(control.maxPayout),
          `${game.gameId}/${control.flipReason}`,
        ).toBe(true);
        expectControlledRoundMatchesGameRules(game.gameId, round!);
      });

      losingControls.forEach((flipReason, controlIndex) => {
        const round = __hotlineServiceTestHooks.lossHotlineRound(
          game.gameId,
          stake,
          gameIndex * 131 + controlIndex * 19,
          {
            flipReason,
            multiplier: new Prisma.Decimal('0.72'),
            maxMultiplier: new Prisma.Decimal('0.99'),
            maxPayout: new Prisma.Decimal(99),
          },
        );
        expect(round.totalMultiplier, `${game.gameId}/${flipReason}`).toBeLessThan(1);
        expect(
          stake.mul(round.totalMultiplier).lessThan(stake),
          `${game.gameId}/${flipReason}`,
        ).toBe(true);
        expectControlledRoundMatchesGameRules(game.gameId, round);
      });
    });
  });

  it('turns unreachable imported-game win controls into bounded controlled losses', () => {
    const stake = new Prisma.Decimal(100);
    const minMultiplier = new Prisma.Decimal(1_000_001);
    const maxMultiplier = new Prisma.Decimal(1_000_002);

    H5_GAMES.forEach((game, index) => {
      const control = {
        won: true,
        multiplier: minMultiplier,
        payout: stake.mul(minMultiplier),
        controlled: true,
        flipReason: 'deposit_control',
        controlId: `deposit-${game.code}`,
        minMultiplier,
        maxMultiplier,
        maxPayout: stake.mul(maxMultiplier),
      };
      const selection = __hotlineServiceTestHooks.selectControlledHotlineRound(
        game.gameId,
        stake,
        control,
        control,
        index,
      );

      expect(selection.fellBackToLoss, game.gameId).toBe(true);
      expect(selection.effectiveControl.controlled, game.gameId).toBe(true);
      expect(selection.effectiveControl.won, game.gameId).toBe(false);
      expect(selection.effectiveControl.flipReason, game.gameId).toBe('control_bounds_guard');
      expect(selection.round.totalMultiplier, game.gameId).toBeLessThan(1);
      expectControlledRoundMatchesGameRules(game.gameId, selection.round);
    });
  });

  it('uses low-multiplier small-hit rounds for auto-balance slot losses when enabled', () => {
    vi.stubEnv('ENTERTAINMENT_SHAPER_ENABLED', 'true');
    const stake = new Prisma.Decimal(1000);

    for (const gameId of SLOT_GAME_IDS) {
      const round = __hotlineServiceTestHooks.lossHotlineRound(gameId, stake, 17, {
        flipReason: 'auto_balance_bite',
        multiplier: new Prisma.Decimal('0.72'),
      });
      const payout = stake.mul(round.totalMultiplier).toDecimalPlaces(2);
      expect(round.totalMultiplier, gameId).toBeGreaterThan(0);
      expect(payout.lessThan(stake), gameId).toBe(true);
    }
  });

  it('shapes normal mega buy-feature accounting under 1x', () => {
    const picks = [0, 1, 2].map((nonce) =>
      __hotlineServiceTestHooks.chooseMegaFreeGameAccountingMultiplier(nonce),
    );

    for (const pick of picks) {
      expect(pick).toBeGreaterThanOrEqual(0.35);
      expect(pick).toBeLessThan(1);
    }
  });

  it('allows controlled mega buy-feature accounting to reach the capped high band', () => {
    const picks = [0, 1, 2].map((nonce) =>
      __hotlineServiceTestHooks.chooseMegaFreeGameAccountingMultiplier(
        nonce,
        new Prisma.Decimal(2),
      ),
    );

    expect(picks[0]).toBeGreaterThanOrEqual(0.35);
    expect(picks[0]).toBeLessThan(1);
    expect(picks[1]).toBeGreaterThanOrEqual(0.35);
    expect(picks[1]).toBeLessThan(1);
    expect(picks[2]).toBeGreaterThanOrEqual(1.1);
    expect(picks[2]).toBeLessThanOrEqual(2);
  });

  it('caps mega buy-feature stake at 30000', () => {
    expect(
      __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(new Prisma.Decimal(200)).toNumber(),
    ).toBe(20000);
    expect(
      __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(new Prisma.Decimal(300)).toNumber(),
    ).toBe(30000);
    expect(
      __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(new Prisma.Decimal(500)).toNumber(),
    ).toBe(30000);
  });

  it('keeps Fortune Gems 50% Extra Bet accounting aligned with its fourth-reel multiplier', () => {
    expect(
      __hotlineServiceTestHooks.sourceStakeAmount(new Prisma.Decimal(10), 1.5).toNumber(),
    ).toBe(15);
    const round = __hotlineServiceTestHooks.decorateFortuneGemsRound(
      {
        grid: [
          [0, 1, 2],
          [0, 3, 4],
          [0, 5, 6],
        ],
        lines: [
          {
            lineId: 'line-1',
            path: [0, 0, 0],
            startReel: 0,
            direction: 'ltr',
            row: 0,
            symbol: 0,
            count: 3,
            payout: 0.5,
          },
        ],
        cascades: [],
        totalMultiplier: 0.5,
      },
      2,
      true,
    );
    expect(round.totalMultiplier).toBe(1);
    expect(round.lines[0]!.payout).toBe(1);
    expect(round.sourceFeature).toEqual({
      type: 'fortune-gems-multiplier',
      multiplierIndex: 1,
      multiplier: 2,
      enhancedBet: true,
      winEx: true,
    });

    const scaled = __hotlineServiceTestHooks.scaleControlForSourcePresentation(
      {
        won: true,
        multiplier: new Prisma.Decimal(2),
        payout: new Prisma.Decimal(200),
        controlled: true,
        minMultiplier: new Prisma.Decimal('1.01'),
        maxMultiplier: new Prisma.Decimal(20),
        maxPayout: new Prisma.Decimal(200),
      },
      1.5,
      2,
    );
    expect(scaled.multiplier.toNumber()).toBe(1.5);
    expect(scaled.minMultiplier?.toNumber()).toBe(0.7575);
    expect(scaled.maxMultiplier?.toNumber()).toBe(15);
    expect(scaled.maxPayout?.toNumber()).toBe(100);
  });

  it('varies controlled mega free-spin blank boards without accidental wins', () => {
    const feature = __hotlineServiceTestHooks.buildControlledMegaFeature(0, true, 12);
    const signatures = new Set(
      feature.freeSpinRounds.map((round) => JSON.stringify(round.initialGrid)),
    );

    expect(feature.freeSpinRounds).toHaveLength(15);
    expect(signatures.size).toBeGreaterThan(10);
    for (const round of feature.freeSpinRounds) {
      expect(round.initialGrid).toEqual(round.finalGrid);
      expect(hotlineEvaluate(round.initialGrid).lines).toHaveLength(0);
    }
  });

  it('varies non-winning boards inside controlled mega free games', () => {
    const feature = __hotlineServiceTestHooks.buildControlledMegaFeature(180, true, 12);
    const blankRounds = feature.freeSpinRounds.filter((round) => round.totalMultiplier === 0);
    const signatures = new Set(blankRounds.map((round) => JSON.stringify(round.initialGrid)));

    expect(blankRounds.length).toBeGreaterThan(0);
    expect(signatures.size).toBe(blankRounds.length);
    for (const round of blankRounds) {
      expect(hotlineEvaluate(round.initialGrid).lines).toHaveLength(0);
    }
  });

  it('builds controlled Yu Pu Tuan features from ten visible source-paytable rounds', () => {
    const feature = __hotlineServiceTestHooks.buildControlledMegaFeature(
      4,
      true,
      12,
      undefined,
      'h5-yu-pu-tuan',
    );

    expect(feature.freeSpinsAwarded).toBe(10);
    expect(feature.freeSpinRounds).toHaveLength(10);
    expect(feature.scatterSymbols.map((symbol) => symbol.reel).sort()).toEqual([0, 1, 2]);
    expect(feature.baseMultiplierSymbols).toEqual([]);
    expect(feature.freeSpinMultiplierBank).toBe(0);
    let displayedTotal = 0;
    for (const round of feature.freeSpinRounds) {
      const evaluated = hotlineEvaluate(round.initialGrid, 'h5-yu-pu-tuan');
      expect(round.initialGrid).toEqual(round.finalGrid);
      expect(round.lines).toEqual(evaluated.lines);
      expect(round.totalMultiplier).toBe(evaluated.totalMultiplier);
      expect(round.appliedMultiplier).toBe(1);
      expect(round.multiplierSymbols).toEqual([]);
      expect(round.initialGrid.flat()).not.toContain(5);
      displayedTotal = roundTestMultiplier(displayedTotal + evaluated.totalMultiplier);
    }
    expect(feature.freeSpinWinMultiplier).toBe(displayedTotal);
    expect(feature.totalMultiplier).toBe(displayedTotal);
    expect(feature.totalMultiplier).toBeLessThanOrEqual(4);
  });

  it('builds Caishen Fa Fa Fa control output from ten visible expanded-Wild rounds', () => {
    const gameId = 'h5-caishen-fa-fa-fa';
    const feature = __hotlineServiceTestHooks.buildControlledMegaFeature(
      12,
      true,
      24,
      undefined,
      gameId,
    );

    expect(feature.freeSpinsAwarded).toBe(10);
    expect(feature.freeSpinRounds).toHaveLength(10);
    expect(feature.scatterSymbols.map((symbol) => symbol.reel)).toEqual([0, 1, 2]);
    expect(feature.sourceFreeWinMultiplier).toBe(1);
    expect(feature.baseMultiplierSymbols).toEqual([]);
    expect(feature.freeSpinMultiplierBank).toBe(0);
    let displayedTotal = 0;
    for (const round of feature.freeSpinRounds) {
      const expandedColumns = round.initialGrid.filter((column) =>
        column.every((symbol) => symbol === 10),
      );
      expect(expandedColumns.length).toBeGreaterThanOrEqual(1);
      expect(expandedColumns.length).toBeLessThanOrEqual(3);
      expect(round.initialGrid).toEqual(round.finalGrid);
      expect(round.cascades).toEqual([]);
      expect(round.multiplierSymbols).toEqual([]);
      expect(round.appliedMultiplier).toBe(1);
      const evaluated = hotlineEvaluate(round.initialGrid, gameId);
      expect(round.lines).toEqual(evaluated.lines);
      expect(round.totalMultiplier).toBe(evaluated.totalMultiplier);
      displayedTotal = roundTestMultiplier(displayedTotal + evaluated.totalMultiplier);
    }
    expect(feature.freeSpinWinMultiplier).toBe(displayedTotal);
    expect(feature.totalMultiplier).toBe(displayedTotal);
    expect(feature.totalMultiplier).toBeLessThanOrEqual(12);
  });

  it('persists Star 97 cherry and bell gifts and settles each free board from its visible result', () => {
    const gameId = 'h5-star-97';
    const cherryTrigger = __hotlineServiceTestHooks.roundFromClassicGrid(
      [
        [0, 1, 2],
        [0, 2, 3],
        [0, 3, 4],
      ],
      gameId,
    );
    const decoratedCherry = __hotlineServiceTestHooks.decorateStar97Round(
      cherryTrigger,
      { cherryLineWins: 6, bellLineWins: 0 },
      'star-97-server',
      'star-97-client',
      97,
    );
    expect(decoratedCherry.features?.freeSpinsAwarded).toBeGreaterThanOrEqual(1);
    expect(decoratedCherry.features?.freeSpinRounds.length).toBe(
      decoratedCherry.features?.freeSpinsAwarded,
    );
    expect(decoratedCherry.star97Progress?.cherryLineWins).toBeLessThan(7);

    let displayedTotal = cherryTrigger.totalMultiplier;
    for (const freeRound of decoratedCherry.features?.freeSpinRounds ?? []) {
      const evaluated = hotlineEvaluate(freeRound.initialGrid, gameId);
      expect(freeRound.initialGrid).toEqual(freeRound.finalGrid);
      expect(freeRound.lines).toEqual(evaluated.lines);
      expect(freeRound.totalMultiplier).toBe(evaluated.totalMultiplier);
      expect(freeRound.sourceFeature).toMatchObject({
        type: 'star-97-seven-multiplier',
        sevenCount: freeRound.initialGrid.flat().filter((symbol) => symbol === 8).length,
      });
      expect(
        freeRound.sourceFeature?.type === 'star-97-seven-multiplier'
          ? freeRound.sourceFeature.multiplier
          : 0,
      ).toBeGreaterThanOrEqual(1);
      displayedTotal = roundTestMultiplier(displayedTotal + evaluated.totalMultiplier);
    }
    expect(decoratedCherry.totalMultiplier).toBe(displayedTotal);

    const bellTrigger = __hotlineServiceTestHooks.roundFromClassicGrid(
      [
        [3, 1, 2],
        [3, 2, 4],
        [3, 4, 1],
      ],
      gameId,
    );
    const decoratedBell = __hotlineServiceTestHooks.decorateStar97Round(
      bellTrigger,
      { cherryLineWins: 0, bellLineWins: 4 },
      'star-97-server',
      'star-97-client',
      98,
    );
    expect(decoratedBell.features?.freeSpinsAwarded).toBeGreaterThanOrEqual(1);
    expect(decoratedBell.star97Progress?.bellLineWins).toBeLessThan(5);
  });

  it('builds Fruit Little Mary control output from one visible source-paytable draw', () => {
    const freeMode = __hotlineServiceTestHooks.buildControlledFruitLittleMaryFreeSpins(2, 12);

    expect(freeMode.freeSpinsAwarded).toBe(1);
    expect(freeMode.freeSpinRounds).toHaveLength(1);
    expect(freeMode.freeSpinMultiplierBank).toBe(0);
    const [round] = freeMode.freeSpinRounds;
    expect(round).toBeDefined();
    const evaluated = hotlineEvaluate(round!.initialGrid, 'h5-fruit-little-mary');
    expect(round!.initialGrid).toEqual(round!.finalGrid);
    expect(round!.lines).toEqual(evaluated.lines);
    expect(round!.totalMultiplier).toBe(evaluated.totalMultiplier);
    expect(round!.appliedMultiplier).toBe(1);
    expect(round!.multiplierSymbols).toEqual([]);
    expect(round!.initialGrid.flat().every((symbol) => symbol < 8)).toBe(true);
    expect(freeMode.freeSpinWinMultiplier).toBe(evaluated.totalMultiplier);
    expect(freeMode.freeSpinWinMultiplier).toBeLessThanOrEqual(2);

    const trigger = __hotlineServiceTestHooks.buildControlledScatterSymbols(
      12,
      'h5-fruit-little-mary',
    );
    expect(trigger.map((symbol) => symbol.reel)).toEqual([0, 1, 2]);
    expect(trigger.every((symbol) => symbol.type === 'scatter')).toBe(true);
  });

  it('awards Fruit Little Mary pool only for three red sevens at the source max bet', () => {
    const gameId = 'h5-fruit-little-mary';
    const grid = __hotlineServiceTestHooks.blankHotlineGrid(gameId, 91);
    grid[0]![0] = 9;
    grid[2]![1] = 9;
    grid[4]![2] = 9;
    const features = __hotlineServiceTestHooks.buildControlledMegaFeature(
      0,
      false,
      91,
      undefined,
      gameId,
    );
    const sourceRound = {
      grid,
      lines: [],
      cascades: [],
      totalMultiplier: features.totalMultiplier,
      features,
    };

    const belowMax = __hotlineServiceTestHooks.resolveFruitLittleMaryJackpotAward(
      sourceRound,
      new Prisma.Decimal(250_000),
      new Prisma.Decimal(2000),
    );
    expect(belowMax).toBe(sourceRound);

    const awarded = __hotlineServiceTestHooks.resolveFruitLittleMaryJackpotAward(
      sourceRound,
      new Prisma.Decimal(250_000),
      new Prisma.Decimal(5000),
    );
    expect(awarded.totalMultiplier).toBe(50);
    expect(awarded.features?.baseTotalMultiplier).toBe(50);
    expect(awarded.features?.sourceJackpot).toEqual({
      type: 'fruit-little-mary-jackpot',
      positions: [
        { reel: 0, row: 0 },
        { reel: 2, row: 1 },
        { reel: 4, row: 2 },
      ],
      payoutMultiplier: 50,
    });
  });

  it('keeps controlled Aztec Gems payouts tied to its visible fourth-reel multiplier', () => {
    const gameId = 'h5-aztec-treasure';
    const round = __hotlineServiceTestHooks.strictWinningHotlineRound(
      gameId,
      new Prisma.Decimal(100),
      {
        flipReason: 'deposit_control',
        minMultiplier: new Prisma.Decimal(2),
        maxMultiplier: new Prisma.Decimal(3),
        maxPayout: new Prisma.Decimal(300),
      },
      712,
    );
    expect(round).not.toBeNull();
    expect(round!.sourceFeature).toMatchObject({ type: 'aztec-gems-multiplier' });
    const wheel =
      round!.sourceFeature?.type === 'aztec-gems-multiplier' ? round!.sourceFeature.multiplier : 0;
    expect([1, 2, 3, 5, 10, 15]).toContain(wheel);
    const base = hotlineEvaluate(round!.grid, gameId);
    expect(round!.lines.map((line) => line.payout)).toEqual(
      base.lines.map((line) => roundTestMultiplier(line.payout * wheel)),
    );
    expect(round!.totalMultiplier).toBe(roundTestMultiplier(base.totalMultiplier * wheel));
    expect(round!.totalMultiplier).toBeGreaterThanOrEqual(2);
    expect(round!.totalMultiplier).toBeLessThanOrEqual(3);
  });

  it('does not cap naturally-triggered mega free games without a control hit', () => {
    const features = __hotlineServiceTestHooks.buildControlledMegaFeature(120, false, 12);

    expect(
      __hotlineServiceTestHooks.shouldApplyMegaFreeGameSettlementCap(5, features, false, {
        controlled: false,
      }),
    ).toBe(false);
    expect(
      __hotlineServiceTestHooks.shouldApplyMegaFreeGameSettlementCap(5, features, true, {
        controlled: false,
      }),
    ).toBe(true);
    expect(
      __hotlineServiceTestHooks.shouldApplyMegaFreeGameSettlementCap(5, features, false, {
        controlled: true,
      }),
    ).toBe(true);
  });

  it('settles imported fixed-line buy-free rounds with the requested feature price', () => {
    const baseAmount = new Prisma.Decimal(20);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount, 50, null);
    const round = __hotlineServiceTestHooks.buildHotlineRound(
      'server',
      'client',
      7,
      'h5-caishen-wins',
      6,
      5,
      true,
    );

    expect(stakeAmount.toFixed(2)).toBe('1000.00');
    expect(round.grid).toHaveLength(6);
    expect(round.grid.every((column) => column.length === 5)).toBe(true);
    expect(round.features?.freeSpinsAwarded).toBeGreaterThan(0);
    expect(round.features?.freeSpinRounds.length).toBe(round.features?.freeSpinsPlayed);
  });

  it('keeps Queen free-mode control fallbacks inside the selected source mode', () => {
    const stake = new Prisma.Decimal(100);
    const scatterSymbols = [0, 1, 2].map((reel) => ({
      reel,
      row: 0,
      type: 'scatter' as const,
    }));

    for (const [modeType, minimumSpins] of [
      [1, 20],
      [2, 10],
      [3, 5],
    ] as const) {
      const natural = hotlineSelectBountyFreeMode(
        'queen-control-server',
        'queen-control-client',
        71,
        'h5-queen-of-bounty',
        modeType,
      );
      const selection = __hotlineServiceTestHooks.selectBountyFreeFeaturesForControl(
        natural,
        {
          won: true,
          multiplier: new Prisma.Decimal(1_000_001),
          payout: new Prisma.Decimal(100_000_100),
          controlled: true,
          flipReason: 'deposit_control',
          controlId: 'queen-unreachable',
          minMultiplier: new Prisma.Decimal(1_000_001),
          maxMultiplier: new Prisma.Decimal(1_000_002),
          maxPayout: new Prisma.Decimal(100_000_200),
        },
        'queen-control-server',
        'queen-control-client',
        71,
        'h5-queen-of-bounty',
        modeType,
        stake,
        stake,
        scatterSymbols,
      );

      expect(selection.control.controlled).toBe(true);
      expect(selection.control.won).toBe(false);
      expect(selection.control.flipReason).toBe('control_bounds_guard');
      expect(selection.features.sourceFreeModeType).toBe(modeType);
      expect(selection.features.freeSpinsAwarded).toBe(minimumSpins);
      expect(selection.features.freeSpinRounds).toHaveLength(minimumSpins);
      expect(selection.features.totalMultiplier).toBe(0);
      expect(
        selection.features.freeSpinRounds.every(
          (round) => round.totalMultiplier === 0 && round.multiplierSymbols.length === 0,
        ),
      ).toBe(true);
    }
  });

  it('keeps Lucky 777 control fallbacks inside the selected 28/14/7-spin mode', () => {
    const stake = new Prisma.Decimal(12);
    const triggerSymbols = [0, 1, 2].map((reel) => ({
      reel,
      row: reel,
      type: 'scatter' as const,
    }));

    for (const [modeType, spins, multiplier] of [
      [1, 28, 1],
      [2, 14, 2],
      [3, 7, 4],
    ] as const) {
      const natural = hotlineSelectLucky777FreeMode(
        'lucky-control-server',
        'lucky-control-client',
        93,
        modeType,
      );
      expect(natural).toMatchObject({
        sourceFreeModeType: modeType,
        sourceFreeWinMultiplier: multiplier,
        freeSpinsAwarded: spins,
      });
      const selection = __hotlineServiceTestHooks.selectBountyFreeFeaturesForControl(
        natural,
        {
          won: true,
          multiplier: new Prisma.Decimal(1_000_001),
          payout: new Prisma.Decimal(12_000_012),
          controlled: true,
          flipReason: 'principal_control',
          controlId: 'lucky-unreachable',
          minMultiplier: new Prisma.Decimal(1_000_001),
          maxMultiplier: new Prisma.Decimal(1_000_002),
          maxPayout: new Prisma.Decimal(12_000_024),
        },
        'lucky-control-server',
        'lucky-control-client',
        93,
        'h5-lucky-777',
        modeType,
        stake,
        stake,
        triggerSymbols,
      );

      expect(selection.control).toMatchObject({
        controlled: true,
        won: false,
        flipReason: 'control_bounds_guard',
      });
      expect(selection.features.sourceFreeModeType).toBe(modeType);
      expect(selection.features.freeSpinsAwarded).toBe(spins);
      expect(selection.features.freeSpinRounds).toHaveLength(spins);
      expect(selection.features.totalMultiplier).toBe(0);
    }
  });

  it('keeps normal mega buy-feature payout and displayed free-game total capped at 1x stake', () => {
    const baseAmount = new Prisma.Decimal(10);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);
    const features = {
      scatterSymbols: [],
      scatterCount: 4,
      freeSpinsAwarded: 15,
      freeSpinsPlayed: 1,
      baseWinMultiplier: 0,
      baseMultiplierSymbols: [],
      baseMultiplierTotal: 0,
      baseAppliedMultiplier: 1,
      baseTotalMultiplier: 0,
      freeSpinRounds: [],
      freeSpinMultiplierBank: 0,
      freeSpinWinMultiplier: 400,
      totalMultiplier: 400,
    };

    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      features,
      true,
      baseAmount,
      stakeAmount,
      2,
    );

    expect(capped.payout.lessThanOrEqualTo(stakeAmount)).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(1)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(100);
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });

  it('allows controlled winning mega free games to exceed 1x while staying capped at 2x stake', () => {
    const baseAmount = new Prisma.Decimal(10);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);
    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(400, true, 2),
      true,
      baseAmount,
      stakeAmount,
      2,
      undefined,
      true,
    );

    expect(capped.payout.lessThanOrEqualTo(stakeAmount.mul(2))).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(2)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(200);
    expect(capped.features.totalMultiplier).toBeGreaterThan(100);
  });

  it('caps mega buy-feature payout from capped stake for high base bets', () => {
    const baseAmount = new Prisma.Decimal(500);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);

    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(400, true, 2),
      true,
      baseAmount,
      stakeAmount,
      2,
    );

    expect(stakeAmount.toNumber()).toBe(30000);
    expect(capped.payout.lessThanOrEqualTo(30000)).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(1)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(60);
  });

  it('does not let controlled mega buy-feature settlement exceed burst max payout', () => {
    const baseAmount = new Prisma.Decimal(200);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);
    const maxPayout = new Prisma.Decimal(25000);

    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(500, true, 2),
      true,
      baseAmount,
      stakeAmount,
      2,
      maxPayout,
      true,
    );

    expect(capped.payout.lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(maxPayout.div(stakeAmount))).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(
      maxPayout.div(baseAmount).toNumber(),
    );
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });

  it('preserves burst-controlled mega buy-feature targets up to the configured max payout', () => {
    const baseAmount = new Prisma.Decimal(200);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);
    const maxPayout = new Prisma.Decimal(100000);

    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(500, true, 2),
      true,
      baseAmount,
      stakeAmount,
      2,
      maxPayout,
      true,
      true,
    );

    expect(stakeAmount.toFixed(2)).toBe('20000.00');
    expect(capped.payout.toFixed(2)).toBe('100000.00');
    expect(capped.multiplier.toFixed(4)).toBe('5.0000');
    expect(capped.features.totalMultiplier).toBe(500);
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });

  it('keeps controlled mega buy-feature rounds visually populated after capping', () => {
    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(180, true, 12),
      true,
      new Prisma.Decimal(10),
      new Prisma.Decimal(1000),
      2,
      undefined,
      true,
    );

    const winningRounds = capped.features.freeSpinRounds.filter(
      (round) => round.totalMultiplier > 0,
    );
    const multiplierSignatures = new Set(
      winningRounds.map((round) => round.multiplierSymbols.map((symbol) => symbol.value).join('+')),
    );

    expect(capped.features.freeSpinsAwarded).toBe(15);
    expect(capped.features.freeSpinRounds).toHaveLength(15);
    expect(winningRounds.length).toBeGreaterThanOrEqual(4);
    expect(winningRounds.some((round) => round.cascades.length > 0)).toBe(true);
    expect(multiplierSignatures.size).toBeGreaterThan(1);
    expect(
      new Set(winningRounds.map((round) => JSON.stringify(round.initialGrid))).size,
    ).toBeGreaterThan(1);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(200);
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });

  it('keeps capped mega free-game line payouts on the paytable', () => {
    const baseAmount = new Prisma.Decimal(10);
    const stakeAmount = __hotlineServiceTestHooks.megaBuyFeatureStakeAmount(baseAmount);
    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(400, true, 2),
      true,
      baseAmount,
      stakeAmount,
      2,
    );

    expectMegaFeatureUsesPaytable(capped.features);
    expect(capped.payout.toFixed(2)).toBe(
      baseAmount.mul(capped.features.totalMultiplier).toDecimalPlaces(2).toFixed(2),
    );
  });
});

function expectMegaFeatureUsesPaytable(
  features: ReturnType<typeof __hotlineServiceTestHooks.buildControlledMegaFeature>,
): void {
  let freeSpinWinMultiplier = 0;
  for (const round of features.freeSpinRounds) {
    const expectedLines = round.cascades.flatMap((step) => step.lines);
    expect(round.lines).toEqual(expectedLines);
    let symbolWinMultiplier = 0;

    for (const step of round.cascades) {
      const evaluated = hotlineEvaluate(step.grid);
      expect(step.lines).toEqual(evaluated.lines);
      expect(step.multiplier).toBeCloseTo(evaluated.totalMultiplier, 4);
      symbolWinMultiplier = roundTestMultiplier(symbolWinMultiplier + step.multiplier);
    }

    const scatterMultiplier = megaScatterPayout(round.scatterSymbols.length);
    expect(round.baseMultiplier).toBeCloseTo(
      roundTestMultiplier(symbolWinMultiplier + scatterMultiplier),
      4,
    );
    expect(round.totalMultiplier).toBeCloseTo(
      roundTestMultiplier(
        scatterMultiplier + symbolWinMultiplier * Math.max(1, round.appliedMultiplier),
      ),
      4,
    );
    freeSpinWinMultiplier = roundTestMultiplier(freeSpinWinMultiplier + round.totalMultiplier);
  }
  expect(features.freeSpinWinMultiplier).toBeCloseTo(freeSpinWinMultiplier, 3);
}

function expectControlledRoundMatchesGameRules(
  gameId: string,
  round: ReturnType<typeof __hotlineServiceTestHooks.lossHotlineRound>,
): void {
  const reelCount = getHotlineReelCount(gameId);
  const rowCount = getHotlineRowCount(gameId);
  const reelRows = getHotlineReelRowCounts(gameId, reelCount, rowCount);
  expect(round.grid, `${gameId}/reels`).toHaveLength(reelCount);
  expect(
    round.grid.every((column, reel) => column.length === reelRows[reel]),
    `${gameId}/rows`,
  ).toBe(true);

  if ((round.cascades?.length ?? 0) > 0) {
    for (const step of round.cascades ?? []) {
      if (gameId === 'h5-golden-empire') {
        expect(
          (step.sourceStacks ?? []).length,
          `${gameId}/cascade-${step.index}/source-stacks`,
        ).toBeGreaterThan(0);
      }
      const evaluated = hotlineEvaluate(step.grid, gameId, step.sourceStacks);
      expect(step.lines, `${gameId}/cascade-${step.index}/lines`).toEqual(evaluated.lines);
      expect(step.multiplier, `${gameId}/cascade-${step.index}/multiplier`).toBeCloseTo(
        evaluated.totalMultiplier,
        4,
      );
    }
    expect(round.lines, `${gameId}/all-cascade-lines`).toEqual(
      (round.cascades ?? []).flatMap((step) => step.lines),
    );
  } else if (round.lines.length > 0) {
    const evaluated = hotlineEvaluate(round.grid, gameId);
    if (gameId === 'h5-aztec-treasure') {
      const wheel =
        round.sourceFeature?.type === 'aztec-gems-multiplier' ? round.sourceFeature.multiplier : 1;
      expect(round.lines, `${gameId}/lines`).toEqual(
        evaluated.lines.map((line) => ({
          ...line,
          payout: roundTestMultiplier(line.payout * wheel),
        })),
      );
      expect(round.totalMultiplier, `${gameId}/multiplier`).toBeCloseTo(
        evaluated.totalMultiplier * wheel,
        4,
      );
    } else {
      expect(round.lines, `${gameId}/lines`).toEqual(evaluated.lines);
      expect(round.totalMultiplier, `${gameId}/multiplier`).toBeCloseTo(
        evaluated.totalMultiplier,
        4,
      );
    }
  }

  if (!round.features) return;
  expect(round.features.totalMultiplier, `${gameId}/feature-total`).toBeCloseTo(
    round.totalMultiplier,
    4,
  );
  const specialSymbols = [
    ...round.features.scatterSymbols,
    ...round.features.baseMultiplierSymbols,
    ...round.features.freeSpinRounds.flatMap((freeRound) => [
      ...freeRound.scatterSymbols,
      ...freeRound.multiplierSymbols,
    ]),
  ];
  for (const symbol of specialSymbols) {
    expect(symbol.reel, `${gameId}/special-reel`).toBeGreaterThanOrEqual(0);
    expect(symbol.reel, `${gameId}/special-reel`).toBeLessThan(reelCount);
    expect(symbol.row, `${gameId}/special-row`).toBeGreaterThanOrEqual(0);
    expect(symbol.row, `${gameId}/special-row`).toBeLessThan(reelRows[symbol.reel]!);
  }

  let freeSpinWinMultiplier = 0;
  let persistentFreeMultiplier = 1;
  for (const freeRound of round.features.freeSpinRounds) {
    const fixedSourceMultiplier = Number(round.features.sourceFreeWinMultiplier || 1);
    expect(freeRound.initialGrid, `${gameId}/free-${freeRound.index}/reels`).toHaveLength(
      reelCount,
    );
    expect(
      freeRound.initialGrid.every((column, reel) => column.length === reelRows[reel]),
      `${gameId}/free-${freeRound.index}/rows`,
    ).toBe(true);
    expect(freeRound.lines, `${gameId}/free-${freeRound.index}/all-lines`).toEqual(
      freeRound.cascades.flatMap((step) => step.lines),
    );
    let symbolWinMultiplier = 0;
    for (const step of freeRound.cascades) {
      const evaluated = hotlineEvaluate(step.grid, gameId, step.sourceStacks);
      const sourceMultiplier =
        gameId === 'h5-golden-empire' || gameId === 'h5-gates-of-olympus'
          ? persistentFreeMultiplier
          : fixedSourceMultiplier;
      expect(step.lines, `${gameId}/free-${freeRound.index}/cascade-${step.index}`).toEqual(
        evaluated.lines.map((line) => ({
          ...line,
          payout: roundTestMultiplier(line.payout * sourceMultiplier),
        })),
      );
      expect(step.multiplier).toBeCloseTo(evaluated.totalMultiplier * sourceMultiplier, 4);
      symbolWinMultiplier = roundTestMultiplier(symbolWinMultiplier + step.multiplier);
      if (
        (gameId === 'h5-golden-empire' || gameId === 'h5-gates-of-olympus') &&
        step.multiplier > 0
      ) {
        persistentFreeMultiplier += 1;
      }
    }
    const scatterMultiplier = megaScatterPayout(freeRound.scatterSymbols.length);
    expect(freeRound.baseMultiplier).toBeCloseTo(
      roundTestMultiplier(symbolWinMultiplier + scatterMultiplier),
      4,
    );
    expect(freeRound.totalMultiplier).toBeCloseTo(
      roundTestMultiplier(
        scatterMultiplier + symbolWinMultiplier * Math.max(1, freeRound.appliedMultiplier),
      ),
      4,
    );
    freeSpinWinMultiplier = roundTestMultiplier(freeSpinWinMultiplier + freeRound.totalMultiplier);
  }
  expect(round.features.freeSpinWinMultiplier, `${gameId}/free-total`).toBeCloseTo(
    freeSpinWinMultiplier,
    3,
  );
  if (gameId === 'h5-golden-empire' || gameId === 'h5-gates-of-olympus') {
    expect(round.features.freeSpinMultiplierBank, `${gameId}/free-bank`).toBe(
      round.features.freeSpinRounds.length > 0 ? persistentFreeMultiplier : 0,
    );
  }
}

function roundTestMultiplier(value: number): number {
  return Number(value.toFixed(4));
}

function megaScatterPayout(count: number): number {
  if (count >= 6) return 100;
  if (count === 5) return 5;
  if (count === 4) return 3;
  return 0;
}
