import { afterEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { GameId, H5_GAMES, SLOT_GAME_IDS } from '@bg/shared';
import { getHotlineReelCount, getHotlineRowCount, hotlineEvaluate } from '@bg/provably-fair';
import { __hotlineServiceTestHooks } from './hotline.service.js';

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
  expect(round.grid, `${gameId}/reels`).toHaveLength(reelCount);
  expect(
    round.grid.every((column) => column.length === rowCount),
    `${gameId}/rows`,
  ).toBe(true);

  if ((round.cascades?.length ?? 0) > 0) {
    for (const step of round.cascades ?? []) {
      const evaluated = hotlineEvaluate(step.grid, gameId);
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
    expect(round.lines, `${gameId}/lines`).toEqual(evaluated.lines);
    expect(round.totalMultiplier, `${gameId}/multiplier`).toBeCloseTo(evaluated.totalMultiplier, 4);
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
    expect(symbol.row, `${gameId}/special-row`).toBeLessThan(rowCount);
  }

  let freeSpinWinMultiplier = 0;
  for (const freeRound of round.features.freeSpinRounds) {
    expect(freeRound.initialGrid, `${gameId}/free-${freeRound.index}/reels`).toHaveLength(
      reelCount,
    );
    expect(
      freeRound.initialGrid.every((column) => column.length === rowCount),
      `${gameId}/free-${freeRound.index}/rows`,
    ).toBe(true);
    expect(freeRound.lines, `${gameId}/free-${freeRound.index}/all-lines`).toEqual(
      freeRound.cascades.flatMap((step) => step.lines),
    );
    let symbolWinMultiplier = 0;
    for (const step of freeRound.cascades) {
      const evaluated = hotlineEvaluate(step.grid, gameId);
      expect(step.lines, `${gameId}/free-${freeRound.index}/cascade-${step.index}`).toEqual(
        evaluated.lines,
      );
      expect(step.multiplier).toBeCloseTo(evaluated.totalMultiplier, 4);
      symbolWinMultiplier = roundTestMultiplier(symbolWinMultiplier + step.multiplier);
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
