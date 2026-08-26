import { describe, expect, it } from 'vitest';
import {
  THOR2_LEGAL_MULTIPLIERS,
  THOR2_MAX_FREE_SPINS,
  THOR2_MAX_WIN_MULTIPLIER,
  evaluateThor2AnywherePays,
  thor2Spin,
} from './thor2.js';

describe('Power of Thor II observed-rules engine', () => {
  it('evaluates anywhere-pays at 8, 10, and 12 matching symbols', () => {
    for (const [count, expected] of [
      [8, 2],
      [10, 5],
      [12, 10],
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

  it('collects the final screen once and applies it to the complete tumble win', () => {
    let checkedRounds = 0;
    let observedLastRefillMultiplier = false;
    for (let nonce = 1; nonce <= 64; nonce += 1) {
      const result = thor2Spin('final-screen-server', `final-screen-${nonce}`, nonce, {
        buyFeature: 'super',
      });
      let accumulatedMultiplier = 0;
      for (const round of result.feature?.rounds ?? []) {
        if (round.cascades.length === 0) continue;
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

        const beforeCount = finalCascade.before.filter((cell) => cell.multiplier).length;
        const afterCount = finalCascade.after.filter((cell) => cell.multiplier).length;
        if (afterCount > beforeCount) observedLastRefillMultiplier = true;
      }
    }
    expect(checkedRounds).toBeGreaterThan(0);
    expect(observedLastRefillMultiplier).toBe(true);
  });

  it('caps the presentation and settlement at 25,000x', () => {
    for (let nonce = 1; nonce <= 24; nonce += 1) {
      const result = thor2Spin('cap-server', 'cap-client', nonce, { buyFeature: 'super' });
      expect(result.totalMultiplier).toBeLessThanOrEqual(THOR2_MAX_WIN_MULTIPLIER);
      expect(result.feature?.totalMultiplier).toBe(result.totalMultiplier);
    }
  });

  it('is deterministic for the same seeds and nonce', () => {
    expect(thor2Spin('same-server', 'same-client', 99, { buyFeature: 'regular' })).toEqual(
      thor2Spin('same-server', 'same-client', 99, { buyFeature: 'regular' }),
    );
  });

  it('models Lucky Strike as one all-1000x spin with either no win or max win', () => {
    const payouts: number[] = [];
    for (let nonce = 1; nonce <= 128; nonce += 1) {
      const result = thor2Spin('lucky-server', 'lucky-client', nonce, { buyFeature: 'lucky' });
      expect(result.feature?.kind).toBe('lucky');
      expect(result.feature?.spinsAwarded).toBe(1);
      expect(result.feature?.spinsPlayed).toBe(1);
      expect(result.feature?.rounds).toHaveLength(1);
      expect([0, THOR2_MAX_WIN_MULTIPLIER]).toContain(result.totalMultiplier);
      payouts.push(result.totalMultiplier);
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
  });
});
