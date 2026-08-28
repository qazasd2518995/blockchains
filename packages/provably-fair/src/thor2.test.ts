import { describe, expect, it } from 'vitest';
import {
  THOR2_LEGAL_MULTIPLIERS,
  THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
  THOR2_MAX_FREE_SPINS,
  THOR2_MAX_WIN_MULTIPLIER,
  THOR2_REGULAR_FEATURE_BALL_CELL_RATE,
  THOR2_SUPER_FEATURE_BALL_CELL_RATE,
  evaluateThor2AnywherePays,
  isThor2FactorRepresentable,
  splitThor2MultiplierTotal,
  thor2ControlFactorCandidates,
  thor2Spin,
  thor2SpinForFactor,
} from './thor2.js';

describe('Power of Thor II observed-rules engine', () => {
  it('evaluates anywhere-pays at 8, 10, and 12 matching symbols', () => {
    for (const [count, expected] of [
      [8, 10],
      [10, 25],
      [12, 50],
    ] as const) {
      const grid = Array.from({ length: 30 }, (_, index) => ({ symbol: index < count ? 3 : 13 }));
      expect(evaluateThor2AnywherePays(grid).find((win) => win.symbol === 3)?.payMultiplier).toBe(
        expected,
      );
    }
  });

  it('guarantees 15 free spins for both paid feature entries', () => {
    for (const buyFeature of ['regular', 'super'] as const) {
      const result = thor2Spin('server', 'client', 7, { buyFeature });
      expect(result.feature?.kind).toBe(buyFeature);
      expect(result.feature?.spinsAwarded).toBeGreaterThanOrEqual(15);
      expect(result.feature?.spinsAwarded).toBeLessThanOrEqual(THOR2_MAX_FREE_SPINS);
      expect(result.feature?.spinsPlayed).toBeGreaterThanOrEqual(15);
      expect(result.totalMultiplier).toBeGreaterThanOrEqual(3);
      expect(result.grid.filter((cell) => cell.symbol === 1)).toHaveLength(4);
      for (const round of result.feature?.rounds ?? []) {
        expect(round.grid).toHaveLength(30);
        expect(round.finalGrid).toHaveLength(30);
      }
    }
  });

  it('uses only the legal observed multiplier ladder', () => {
    const result = thor2Spin('server-2', 'client-2', 11, { buyFeature: 'super' });
    const values = result.feature?.rounds.flatMap((round) =>
      round.cascades.flatMap((cascade) => [
        ...cascade.before.flatMap((cell) => (cell.multiplier ? [cell.multiplier] : [])),
        ...cascade.after.flatMap((cell) => (cell.multiplier ? [cell.multiplier] : [])),
        ...cascade.upgrades.map((upgrade) => upgrade.to),
      ]),
    );
    for (const value of values ?? []) expect(THOR2_LEGAL_MULTIPLIERS).toContain(value);
  });

  it('upgrades every eligible multiplier by one shared screen level', () => {
    let checkedUpgrade = false;
    for (let nonce = 1; nonce <= 32; nonce += 1) {
      const result = thor2Spin('upgrade-server', 'upgrade-client', nonce, {
        buyFeature: 'super',
      });
      for (const round of result.feature?.rounds ?? []) {
        for (const [cascadeIndex, cascade] of round.cascades.entries()) {
          if (cascade.upgrades.length === 0) continue;
          checkedUpgrade = true;
          expect(cascadeIndex).toBe(round.cascades.length - 1);
          expect(cascade.after.filter((cell) => cell.multiplier)).toHaveLength(
            THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
          );
          for (const upgrade of cascade.upgrades) {
            expect(upgrade.to).toBeGreaterThan(upgrade.from);
            expect(cascade.after[upgrade.position]?.multiplier).toBe(upgrade.to);
          }
          expect(new Set(cascade.upgrades.map((upgrade) => upgrade.level)).size).toBe(1);
        }
      }
    }
    expect(checkedUpgrade).toBe(true);
  });

  it('limits feature screens to three multiplier balls and keeps the hammer out of regular free games', () => {
    for (const buyFeature of ['regular', 'super'] as const) {
      for (let nonce = 1; nonce <= 80; nonce += 1) {
        const result = thor2Spin('feature-ball-cap', `${buyFeature}-${nonce}`, nonce, {
          buyFeature,
        });
        for (const round of result.feature?.rounds ?? []) {
          const screens = [
            round.grid,
            round.finalGrid,
            ...round.cascades.flatMap((cascade) => [cascade.before, cascade.after]),
          ];
          expect(
            screens.every(
              (screen) =>
                screen.filter((cell) => cell.multiplier).length <=
                THOR2_MAX_FEATURE_MULTIPLIER_BALLS,
            ),
          ).toBe(true);
          if (buyFeature === 'regular') {
            expect(round.cascades.every((cascade) => cascade.upgrades.length === 0)).toBe(true);
          }
          for (const cascade of round.cascades) {
            if (cascade.upgrades.length > 0) {
              expect(buyFeature).toBe('super');
              expect(cascade.after.filter((cell) => cell.multiplier).length).toBe(3);
            }
          }
        }
      }
    }
  });

  it('uses independent low-density multiplier drops instead of an all-or-nothing round gate', () => {
    const observedRates = new Map<string, number>();
    let uncollectedBallRounds = 0;
    let refillBallRounds = 0;
    for (const buyFeature of ['regular', 'super'] as const) {
      let ballRounds = 0;
      let totalRounds = 0;
      for (let nonce = 1; nonce <= 160; nonce += 1) {
        const result = thor2Spin('feature-ball-cadence', `${buyFeature}-${nonce}`, nonce, {
          buyFeature,
        });
        for (const round of result.feature?.rounds ?? []) {
          totalRounds += 1;
          const openingHasBall = round.grid.some((cell) => cell.multiplier);
          if (openingHasBall) ballRounds += 1;
          if (openingHasBall && round.cascades.length === 0) {
            uncollectedBallRounds += 1;
            expect(round.payoutMultiplier).toBe(0);
          }
          if (
            !openingHasBall &&
            round.cascades.some((cascade) => cascade.after.some((cell) => cell.multiplier))
          ) {
            refillBallRounds += 1;
          }
        }
      }
      const rate = ballRounds / totalRounds;
      observedRates.set(buyFeature, rate);
      expect(rate).toBeGreaterThan(0.12);
      expect(rate).toBeLessThan(0.5);
    }
    expect(observedRates.get('super')!).toBeGreaterThan(observedRates.get('regular')!);
    expect(uncollectedBallRounds).toBeGreaterThan(0);
    expect(refillBallRounds).toBeGreaterThan(0);
    expect(THOR2_REGULAR_FEATURE_BALL_CELL_RATE).toBe(0.008);
    expect(THOR2_SUPER_FEATURE_BALL_CELL_RATE).toBe(0.014);
  });

  it('keeps SUPER BONUS out of paid entries and every free-game screen', () => {
    for (const buyFeature of ['regular', 'super'] as const) {
      for (let nonce = 1; nonce <= 64; nonce += 1) {
        const result = thor2Spin('super-bonus-scope', `${buyFeature}-${nonce}`, nonce, {
          buyFeature,
        });
        const screens = [
          result.grid,
          ...(result.feature?.rounds.flatMap((round) => [
            round.grid,
            round.finalGrid,
            ...round.cascades.flatMap((cascade) => [cascade.before, cascade.after]),
          ]) ?? []),
        ];
        expect(screens.every((screen) => screen.every((cell) => cell.symbol !== 20))).toBe(true);
      }
    }
  });

  it('collects the final screen once and applies it to the complete tumble win', () => {
    let checkedRounds = 0;
    let observedLastRefillMultiplier = false;
    let observedAccumulatedOnlyRound = false;
    for (let nonce = 1; nonce <= 64; nonce += 1) {
      const result = thor2Spin('final-screen-server', `final-screen-${nonce}`, nonce, {
        buyFeature: 'super',
      });
      let accumulatedMultiplier = 0;
      for (const round of result.feature?.rounds ?? []) {
        if (round.cascades.length === 0) continue;
        const multiplierBeforeRound = accumulatedMultiplier;
        checkedRounds += 1;
        const finalCascade = round.cascades.at(-1)!;
        const earlierCascades = round.cascades.slice(0, -1);
        expect(earlierCascades.every((cascade) => cascade.collectedMultiplier === 0)).toBe(true);
        expect(earlierCascades.every((cascade) => cascade.payoutMultiplier === 0)).toBe(true);
        expect(earlierCascades.every((cascade) => cascade.upgrades.length === 0)).toBe(true);

        const collectedMultiplier = round.finalGrid.reduce(
          (sum, cell) => sum + (cell.multiplier ?? 0),
          0,
        );
        accumulatedMultiplier += collectedMultiplier;
        const baseWinMultiplier = round.cascades.reduce(
          (sum, cascade) => sum + cascade.baseWinMultiplier,
          0,
        );
        expect(finalCascade.collectedMultiplier).toBe(collectedMultiplier);
        expect(finalCascade.accumulatedMultiplier).toBe(accumulatedMultiplier);
        expect(finalCascade.payoutMultiplier).toBeCloseTo(
          baseWinMultiplier * Math.max(1, accumulatedMultiplier),
          10,
        );
        expect(round.payoutMultiplier).toBeCloseTo(
          finalCascade.payoutMultiplier + round.superBonusMultiplier,
          10,
        );
        if (collectedMultiplier === 0 && multiplierBeforeRound > 0) {
          observedAccumulatedOnlyRound = true;
          expect(finalCascade.payoutMultiplier).toBeCloseTo(
            baseWinMultiplier * multiplierBeforeRound,
            10,
          );
        }

        const beforeCount = finalCascade.before.filter((cell) => cell.multiplier).length;
        const afterCount = finalCascade.after.filter((cell) => cell.multiplier).length;
        if (afterCount > beforeCount) observedLastRefillMultiplier = true;
      }
    }
    expect(checkedRounds).toBeGreaterThan(0);
    expect(observedLastRefillMultiplier).toBe(true);
    expect(observedAccumulatedOnlyRound).toBe(true);
  });

  it('caps the presentation and settlement at the shared 5,000x cycle ceiling', () => {
    for (let nonce = 1; nonce <= 24; nonce += 1) {
      const result = thor2Spin('cap-server', 'cap-client', nonce, { buyFeature: 'super' });
      expect(result.totalMultiplier).toBeLessThanOrEqual(THOR2_MAX_WIN_MULTIPLIER);
      expect(result.feature?.totalMultiplier).toBe(result.totalMultiplier);
    }
  });

  it('keeps every visible packet total aligned with the capped settlement', () => {
    const options = [
      {},
      { extraBet: true },
      { buyFeature: 'regular' as const },
      { buyFeature: 'super' as const },
      { buyFeature: 'lucky' as const },
    ];
    for (const currentOptions of options) {
      for (let nonce = 1; nonce <= 96; nonce += 1) {
        const result = thor2Spin('visible-cap-server', 'visible-cap-client', nonce, currentOptions);
        const feature = result.feature;
        const bonusCount = result.grid.filter((cell) => cell.symbol === 1).length;
        const entryBonus =
          feature && feature.kind !== 'lucky'
            ? bonusCount >= 6
              ? 100
              : bonusCount === 5
                ? 5
                : bonusCount === 4
                  ? 3
                  : 0
            : 0;
        const visibleTotal =
          feature?.kind === 'lucky'
            ? (feature.rounds[0]?.payoutMultiplier ?? 0)
            : result.cascades.reduce(
                (total, cascade) => total + cascade.payoutMultiplier,
                entryBonus,
              ) +
              (feature?.rounds.reduce((total, round) => total + round.payoutMultiplier, 0) ?? 0);
        expect(visibleTotal).toBeLessThanOrEqual(THOR2_MAX_WIN_MULTIPLIER);
        expect(visibleTotal).toBeCloseTo(result.totalMultiplier, 8);
      }
    }
  });

  it('is deterministic for the same seeds and nonce', () => {
    expect(thor2Spin('same-server', 'same-client', 99, { buyFeature: 'regular' })).toEqual(
      thor2Spin('same-server', 'same-client', 99, { buyFeature: 'regular' }),
    );
  });

  it('constructs exact visible control targets for every paid action', () => {
    const cases = [
      { options: {}, factors: [0, 0.25, 1, 20, 1_000, 5_000] },
      { options: { extraBet: true }, factors: [0, 1.25, 20, 1_000] },
      { options: { buyFeature: 'regular' as const }, factors: [3, 53, 103, 503, 4_963] },
      { options: { buyFeature: 'super' as const }, factors: [3, 503, 1_003, 4_963] },
      { options: { buyFeature: 'lucky' as const }, factors: [0, 400, 4_000, 4_400, 5_000] },
    ];
    for (const { options, factors } of cases) {
      for (const factor of factors) {
        expect(isThor2FactorRepresentable(factor, options)).toBe(true);
        const result = thor2SpinForFactor(
          'controlled-server',
          `controlled-${options.buyFeature ?? 'base'}-${factor}`,
          19,
          factor,
          options,
        );
        expect(result.totalMultiplier).toBe(factor);
        if (options.buyFeature === 'regular' || options.buyFeature === 'super') {
          expect(result.grid.filter((current) => current.symbol === 1)).toHaveLength(4);
          expect(result.feature?.rounds).toHaveLength(15);
          const visibleTotal =
            3 +
            (result.feature?.rounds.reduce((total, round) => total + round.payoutMultiplier, 0) ??
              0);
          expect(visibleTotal).toBeCloseTo(factor, 8);
        } else if (options.buyFeature === 'lucky') {
          expect(result.feature?.rounds).toHaveLength(1);
          expect(result.feature?.rounds[0]?.payoutMultiplier).toBe(factor);
          for (const current of result.feature?.rounds[0]?.grid ?? []) {
            if (current.multiplier) expect(current.multiplier).toBe(1_000);
          }
        } else {
          expect(result.cascades.reduce((total, round) => total + round.payoutMultiplier, 0)).toBe(
            factor,
          );
        }
      }
    }
  });

  it('offers nearby legal factors instead of relying on random rerolls', () => {
    const regular = thor2ControlFactorCandidates(103, { buyFeature: 'regular' });
    expect(regular).toContain(103);
    expect(
      regular.every((factor) => isThor2FactorRepresentable(factor, { buyFeature: 'regular' })),
    ).toBe(true);
    const lucky = thor2ControlFactorCandidates(4_040, { buyFeature: 'lucky' });
    expect(lucky[0]).toBe(4_000);
    expect(lucky).not.toContain(4_080);
    expect(lucky).toContain(4_250);
    expect(lucky).toContain(4_400);
  });

  it('splits controlled multiplier totals into legal visible balls within board capacity', () => {
    for (const total of [2, 5, 21, 101, 999, 5_001, 22_000]) {
      const values = splitThor2MultiplierTotal(total, 22);
      expect(values).not.toBeNull();
      expect(values?.reduce((sum, value) => sum + value, 0)).toBe(total);
      expect(values?.every((value) => THOR2_LEGAL_MULTIPLIERS.includes(value as never))).toBe(true);
    }
    expect(splitThor2MultiplierTotal(22_001, 22)).toBeNull();
  });

  it('models Lucky Strike as one all-1000x spin with either no win or max win', () => {
    const payouts: number[] = [];
    const losingBallCounts: number[] = [];
    for (let nonce = 1; nonce <= 128; nonce += 1) {
      const result = thor2Spin('lucky-server', 'lucky-client', nonce, { buyFeature: 'lucky' });
      expect(result.feature?.kind).toBe('lucky');
      expect(result.feature?.spinsAwarded).toBe(1);
      expect(result.feature?.spinsPlayed).toBe(1);
      expect(result.feature?.rounds).toHaveLength(1);
      expect([0, THOR2_MAX_WIN_MULTIPLIER]).toContain(result.totalMultiplier);
      payouts.push(result.totalMultiplier);
      const round = result.feature!.rounds[0]!;
      const initialBallCount = round.grid.filter((cell) => cell.multiplier).length;
      if (result.totalMultiplier === 0) {
        losingBallCounts.push(initialBallCount);
        expect(round.cascades).toHaveLength(0);
      } else {
        expect(initialBallCount).toBeGreaterThanOrEqual(1);
        expect(initialBallCount).toBeLessThanOrEqual(20);
        expect(round.cascades.length).toBeGreaterThan(0);
      }
      const cells = [
        result.grid,
        ...result.cascades.flatMap((cascade) => [cascade.before, cascade.after]),
      ].flat();
      for (const cell of cells) {
        if (cell.multiplier) expect(cell.multiplier).toBe(1_000);
      }
    }
    const maxWins = payouts.filter((payout) => payout === THOR2_MAX_WIN_MULTIPLIER).length;
    expect(payouts).toContain(0);
    expect(payouts).toContain(THOR2_MAX_WIN_MULTIPLIER);
    expect(maxWins).toBeGreaterThanOrEqual(8);
    expect(maxWins).toBeLessThanOrEqual(32);
    const averageLosingBallCount =
      losingBallCounts.reduce((sum, count) => sum + count, 0) / losingBallCounts.length;
    expect(averageLosingBallCount).toBeGreaterThan(8.5);
    expect(averageLosingBallCount).toBeLessThan(10.75);
  });
});
