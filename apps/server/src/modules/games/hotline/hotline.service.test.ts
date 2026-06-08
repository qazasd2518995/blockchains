import { describe, expect, it } from 'vitest';
import { Prisma } from '@prisma/client';
import { GameId } from '@bg/shared';
import { hotlineEvaluate } from '@bg/provably-fair';
import { __hotlineServiceTestHooks } from './hotline.service.js';

describe('hotline controlled round shaping', () => {
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

  it('keeps 3x3 burst wins inside the mini-slot paytable', () => {
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

    expect(round.totalMultiplier).toBeGreaterThanOrEqual(20);
    expect(round.totalMultiplier).toBeLessThanOrEqual(30);
    expect(amount.mul(round.totalMultiplier).lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(hotlineEvaluate(round.grid).totalMultiplier).toBeCloseTo(round.totalMultiplier, 4);
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
      expect(new Set(controlledCase.rounds.map(openingSignature)).size).toBeGreaterThan(
        controlledCase.minUnique,
      );
    }
  });

  it('shapes mega buy-feature accounting into two low results and one capped high result', () => {
    const picks = [0, 1, 2].map((nonce) =>
      __hotlineServiceTestHooks.chooseMegaFreeGameAccountingMultiplier(nonce),
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

  it('keeps mega buy-feature payout and displayed free-game total capped at 2x stake', () => {
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

    expect(capped.payout.lessThanOrEqualTo(stakeAmount.mul(2))).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(2)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(200);
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
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
    expect(capped.payout.lessThanOrEqualTo(60000)).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(2)).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(120);
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
    );

    expect(capped.payout.lessThanOrEqualTo(maxPayout)).toBe(true);
    expect(capped.multiplier.lessThanOrEqualTo(maxPayout.div(stakeAmount))).toBe(true);
    expect(capped.features.totalMultiplier).toBeLessThanOrEqual(
      maxPayout.div(baseAmount).toNumber(),
    );
    expect(capped.features.freeSpinWinMultiplier).toBe(capped.features.totalMultiplier);
  });

  it('keeps controlled mega buy-feature rounds visually populated after capping', () => {
    const capped = __hotlineServiceTestHooks.capMegaFreeGameSettlement(
      __hotlineServiceTestHooks.buildControlledMegaFeature(180, true, 12),
      true,
      new Prisma.Decimal(10),
      new Prisma.Decimal(1000),
      2,
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
});
