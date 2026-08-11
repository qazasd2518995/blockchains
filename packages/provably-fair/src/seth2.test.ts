import { describe, expect, it } from 'vitest';
import {
  SETH2_FREE_RETRIGGER_PROBABILITY,
  SETH2_GRID_SIZE,
  SETH2_MATH,
  SETH2_MAX_SYMBOL_MULTIPLIER,
  SETH2_MULTIPLIER_DROP_VALUES,
  SETH2_MULTIPLIER_VALUES,
  SETH2_PAYTABLE,
  SETH2_RETRIGGER_SPINS,
  SETH2_SCATTER_PAYTABLE,
  SETH2_SKILL_SYMBOL_PAY,
  isSeth2MultiplierValue,
  seth2BuyFeatureEntry,
  seth2Spin,
  seth2SpinForFactor,
  splitSeth2MultiplierTotal,
  type Seth2Outcome,
  type Seth2SpinMode,
} from './seth2.js';

const BET = 18;

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function findSpin(
  mode: Seth2SpinMode,
  predicate: (outcome: Seth2Outcome) => boolean,
  limit = 20_000,
  seed = 'seth2-search',
): Seth2Outcome {
  for (let nonce = 0; nonce < limit; nonce += 1) {
    const outcome = seth2Spin(seed, 'client', nonce, BET, mode);
    if (predicate(outcome)) return outcome;
  }
  throw new Error(`Unable to find expected ${mode} outcome within ${limit} spins`);
}

function finalMultiplier(outcome: Seth2Outcome): number {
  const firstRound = outcome.returnData.list[0]!;
  const upgrades = outcome.returnData.list.flatMap((round) => round.upgrade_mul_list);
  const multipliers = firstRound.start_data
    .filter((current) => current.type === 10)
    .map((current) => ({ ...current, upgraded: false }));
  for (const upgrade of upgrades) {
    const target = multipliers.find(
      (current) =>
        current.mul_type === 0 && current.mul === upgrade.mul && current.upgraded === false,
    );
    if (target) {
      target.mul = upgrade.new_mul;
      target.upgraded = true;
    }
  }
  const currentMultiplier =
    multipliers.reduce((total, current) => total + current.mul, 0) +
    outcome.returnData.type17_mul_list.reduce((total, current) => total + current.mul, 0);
  return currentMultiplier > 0 ? currentMultiplier + outcome.returnData.multiplierBankBefore : 0;
}

function removedCellCount(outcome: Seth2Outcome): number {
  const round = outcome.returnData.list[0]!;
  return round.start_data.filter((current) => round.remove_type.includes(current.type)).length;
}

describe('Storm of Seth 2 provably-fair engine', () => {
  it('is deterministic in every settlement mode', () => {
    for (const mode of [
      'base',
      'standard_free',
      'awakening_free',
      'bought_standard_free',
    ] as const) {
      expect(seth2Spin('server', 'client', 77, BET, mode)).toEqual(
        seth2Spin('server', 'client', 77, BET, mode),
      );
    }
  });

  it('uses the standard free-game table for a purchased standard feature', () => {
    for (let nonce = 0; nonce < 500; nonce += 1) {
      expect(seth2Spin('standard-buy', 'client', nonce, BET, 'bought_standard_free')).toEqual(
        seth2Spin('standard-buy', 'client', nonce, BET, 'standard_free'),
      );
    }
  });

  it('preserves the source paytable and the 96.89% target math with retriggers', () => {
    expect(SETH2_PAYTABLE[1]).toEqual({ eight: 200, ten: 500, twelve: 1000 });
    expect(SETH2_PAYTABLE[9]).toEqual({ eight: 5, ten: 15, twelve: 40 });
    expect(SETH2_FREE_RETRIGGER_PROBABILITY).toBe(0.01);
    expect(SETH2_MATH.standardFree).toBeCloseTo(1.007, 8);
    expect(SETH2_MATH.standardFeatureTotal).toBeCloseTo(15.9, 8);
    expect(SETH2_MATH.awakeningFeatureTotal).toBeCloseTo(193.78, 6);
    expect(SETH2_MATH.expectedFeatureSpins).toBeCloseTo(15 / 0.95, 8);
    expect(SETH2_MATH.theoreticalRtp).toBeCloseTo(0.9689, 8);
    expect(SETH2_MATH.buyFeatureRtp).toBeCloseTo(0.9689, 8);
  });

  it('separates direct multiplier values from the 6x and 8x upgrade steps', () => {
    expect(SETH2_MULTIPLIER_DROP_VALUES).toEqual([2, 3, 4, 5, 10, 15, 25, 50, 100, 200, 300, 500]);
    expect(SETH2_MULTIPLIER_VALUES).toEqual([2, 3, 4, 5, 6, 8, 10, 15, 25, 50, 100, 200, 300, 500]);
    for (const total of [
      2, 3, 4, 5, 6, 8, 10, 20, 109, 218, 501, 999, 2015, 5000, 10_000, 15_000,
    ]) {
      const parts = splitSeth2MultiplierTotal(total, SETH2_GRID_SIZE);
      expect(parts, `official split for ${total}x`).not.toBeNull();
      expect(parts!.reduce((sum, value) => sum + value, 0)).toBe(total);
      expect(
        parts!.every((value) =>
          (SETH2_MULTIPLIER_DROP_VALUES as readonly number[]).includes(value),
        ),
      ).toBe(true);
      expect(parts!.length).toBeLessThanOrEqual(SETH2_GRID_SIZE);
    }
  });

  it('emits all nine regular symbols and prices each 8/10/12-symbol win correctly', () => {
    const seen = new Set<number>();
    const factors = [0.5, 1, 2, 4, 5, 8, 10, 20, 45, 50, 100, 205, 500, 2015];
    for (const factor of factors) {
      for (let nonce = 0; nonce < 80; nonce += 1) {
        const outcome = seth2SpinForFactor('regular-symbols', 'client', nonce, BET, factor, 'base');
        for (let roundIndex = 0; roundIndex < outcome.returnData.list.length; roundIndex += 1) {
          const round = outcome.returnData.list[roundIndex]!;
          const symbolType = round.remove_type.find((type) => type >= 1 && type <= 9)!;
          seen.add(symbolType);
          const source =
            roundIndex === 0
              ? round.start_data
              : outcome.returnData.list[roundIndex - 1]!.round_data;
          const count = source.filter((current) => current.type === symbolType).length as
            | 8
            | 10
            | 12;
          const key = count === 8 ? 'eight' : count === 10 ? 'ten' : 'twelve';
          expect(round.scoreList[0]).toBe(money((BET * SETH2_PAYTABLE[symbolType]![key]) / 20));
        }
      }
    }
    expect([...seen].sort((left, right) => left - right)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it('keeps every cascade grid and refill aligned', () => {
    const outcome = findSpin('base', (current) => current.returnData.list.length === 2);
    const [first, second] = outcome.returnData.list;
    expect(first!.start_data).toHaveLength(SETH2_GRID_SIZE);
    expect(first!.is_over).toBe(0);
    expect(second!.is_over).toBe(1);
    expect(first!.round_data).toHaveLength(removedCellCount(outcome));
    expect(second!.round_data).toHaveLength(first!.round_data.length);
    expect(second!.remove_type[0]).not.toBe(first!.remove_type[0]);
  });

  it.each([
    [4, SETH2_SCATTER_PAYTABLE.four / 20],
    [5, SETH2_SCATTER_PAYTABLE.five / 20],
    [6, SETH2_SCATTER_PAYTABLE.six / 20],
  ] as const)('pays %i SCATTER symbols at the original rate', (count, factor) => {
    const outcome = findSpin(
      'base',
      (current) =>
        current.triggeredFreeSpins &&
        current.returnData.list[0]!.start_data.filter(
          (cell) => cell.type === 15 || cell.type === 16,
        ).length === count,
      50_000,
      'scatter-counts',
    );
    expect(outcome.payoutFactor).toBe(factor);
    expect(outcome.returnData.total_gold).toBe(money(BET * factor));
    expect(outcome.returnData.freeGameCount).toBe(15);
  });

  it('uses a golden SCATTER to enter awakening free games', () => {
    const outcome = findSpin(
      'base',
      (current) => current.triggeredFreeSpins && current.featureMode === 'awakening',
      50_000,
      'golden-scatter',
    );
    const scatterTypes = outcome.returnData.list[0]!.start_data.filter(
      (current) => current.type === 15 || current.type === 16,
    ).map((current) => current.type);
    expect(scatterTypes).toContain(16);
    expect(outcome.returnData.is_sjc).toBe(1);
    expect(outcome.returnData.freeGameCount).toBe(15);
  });

  it.each(['standard', 'awakening'] as const)(
    'uses a four-SCATTER entry board and preserves all 15 spins for a %s feature purchase',
    (featureMode) => {
      const outcome = seth2BuyFeatureEntry('buy-entry', 'client', 7, featureMode);
      const scatterTypes = outcome.returnData.list[0]!.start_data.filter(
        (current) => current.type === 15 || current.type === 16,
      ).map((current) => current.type);

      expect(scatterTypes).toHaveLength(4);
      expect(scatterTypes.includes(16)).toBe(featureMode === 'awakening');
      expect(outcome.triggeredFreeSpins).toBe(true);
      expect(outcome.featureMode).toBe(featureMode);
      expect(outcome.returnData.is_sjc).toBe(1);
      expect(outcome.returnData.freeGameCount).toBe(15);
      expect(outcome.payoutFactor).toBe(0);
      expect(outcome.returnData.total_gold).toBe(0);
    },
  );

  it.each(['standard_free', 'awakening_free', 'bought_standard_free'] as const)(
    'adds five games for a three-SCATTER retrigger in %s',
    (mode) => {
      const outcome = findSpin(mode, (current) => current.returnData.addGameCiShu > 0);
      const round = outcome.returnData.list[0]!;
      expect(round.start_data.filter((current) => current.type === 15)).toHaveLength(3);
      expect(round.remove_type).toEqual([15]);
      expect(outcome.returnData.addGameCiShu).toBe(SETH2_RETRIGGER_SPINS);
      expect(outcome.payoutFactor).toBe(0);
    },
  );

  it('never emits a multiplier ball above 500x and supports normal and rare balls', () => {
    const multiplierTypes = new Set<number>();
    for (const mode of ['base', 'awakening_free'] as const) {
      for (const factor of [20, 45, 100, 205, 500, 1000, 2015, 5000, 81_000]) {
        for (let nonce = 0; nonce < 80; nonce += 1) {
          const outcome = seth2SpinForFactor(
            'multiplier-balls',
            'client',
            nonce,
            BET,
            factor,
            mode,
          );
          const balls = [
            ...outcome.returnData.list[0]!.start_data.filter((current) => current.type === 10),
            ...outcome.returnData.type17_mul_list,
          ];
          for (const ball of balls) {
            expect(ball.mul).toBeLessThanOrEqual(SETH2_MAX_SYMBOL_MULTIPLIER);
            expect(ball.mul).toBeGreaterThanOrEqual(2);
            expect(isSeth2MultiplierValue(ball.mul)).toBe(true);
            if (ball.mul === 6 || ball.mul === 8) expect(ball.mul_type).toBe(0);
            multiplierTypes.add(ball.mul_type ?? -1);
          }
          for (const upgrade of outcome.returnData.list.flatMap(
            (round) => round.upgrade_mul_list,
          )) {
            expect(upgrade.new_mul).toBeLessThanOrEqual(SETH2_MAX_SYMBOL_MULTIPLIER);
            expect(upgrade.new_mul).toBeGreaterThan(upgrade.mul);
            expect(isSeth2MultiplierValue(upgrade.mul)).toBe(true);
            expect(isSeth2MultiplierValue(upgrade.new_mul)).toBe(true);
            const oldIndex = (SETH2_MULTIPLIER_VALUES as readonly number[]).indexOf(upgrade.mul);
            expect(upgrade.new_mul).toBe(SETH2_MULTIPLIER_VALUES[oldIndex + 1]);
          }
        }
      }
    }
    expect(multiplierTypes).toEqual(new Set([0, 1]));
  });

  it('animates the source 6x → 8x → 10x upgrade steps instead of skipping them', () => {
    const observed = new Set<string>();
    for (let nonce = 0; nonce < 5_000 && observed.size < 2; nonce += 1) {
      for (const factor of [4, 5]) {
        const outcome = seth2SpinForFactor(
          'official-upgrade-chain',
          'client',
          nonce,
          BET,
          factor,
          'base',
        );
        for (const upgrade of outcome.returnData.list.flatMap((round) => round.upgrade_mul_list)) {
          if (upgrade.mul === 6 && upgrade.new_mul === 8) observed.add('6→8');
          if (upgrade.mul === 8 && upgrade.new_mul === 10) observed.add('8→10');
        }
      }
    }
    expect(observed).toEqual(new Set(['6→8', '8→10']));
  });

  it('can throw multiplier balls on a non-winning spin without collecting them', () => {
    const animationTypes = new Set<number>();
    let observed = 0;
    for (let nonce = 0; nonce < 2_000 && animationTypes.size < 2; nonce += 1) {
      const outcome = seth2SpinForFactor('dead-multiplier', 'client', nonce, BET, 0, 'base');
      const round = outcome.returnData.list[0]!;
      const balls = round.start_data.filter((current) => current.type === 10);
      if (balls.length === 0) continue;
      observed += 1;
      expect(round.remove_type).toEqual([]);
      expect(round.total_mul).toBe(0);
      expect(outcome.payoutFactor).toBe(0);
      expect(outcome.returnData.total_gold).toBe(0);
      for (const ball of balls) {
        expect(ball.mul).toBeGreaterThanOrEqual(2);
        expect(ball.mul).toBeLessThanOrEqual(SETH2_MAX_SYMBOL_MULTIPLIER);
        expect(isSeth2MultiplierValue(ball.mul)).toBe(true);
        expect(SETH2_MULTIPLIER_DROP_VALUES).toContain(ball.mul);
        animationTypes.add(ball.mul_type ?? -1);
      }
    }
    expect(observed).toBeGreaterThan(0);
    expect(animationTypes).toEqual(new Set([0, 1]));
  });

  it.each([
    [20, 1],
    [100, 2],
    [500, 6],
    [5000, 6],
  ] as const)('male skill creates %i x result with %i split copies', (factor, copyCount) => {
    let outcome: Seth2Outcome | undefined;
    for (let nonce = 0; nonce < 500; nonce += 1) {
      const candidate = seth2SpinForFactor(
        'male-skill-levels',
        'client',
        nonce,
        BET,
        factor,
        'awakening_free',
      );
      if (
        candidate.returnData.list[0]!.remove_type.includes(17) &&
        candidate.returnData.type17_mul_list.length === copyCount
      ) {
        outcome = candidate;
        break;
      }
    }
    expect(outcome).toBeDefined();
    const round = outcome!.returnData.list[0]!;
    const source = round.start_data.find(
      (current) => current.type === 10 && current.mul === outcome!.returnData.type17_beishu.mul,
    )!;
    expect(
      round.start_data.filter(
        (current) => current.type === 10 && current.mul === outcome!.returnData.type17_beishu.mul,
      ),
    ).toHaveLength(1);
    expect(outcome!.returnData.type17_mul_list).toHaveLength(copyCount);
    expect(outcome!.returnData.type17_mul_list).toEqual(
      Array.from({ length: copyCount }, () => ({ ...source })),
    );
    expect(isSeth2MultiplierValue(source.mul)).toBe(true);
    expect(
      outcome!.returnData.type17_mul_list.every((ball) => isSeth2MultiplierValue(ball.mul)),
    ).toBe(true);
    expect(round.round_data.length + copyCount).toBe(removedCellCount(outcome!));
    expect(round.scoreList[1]).toBe(money((BET * SETH2_SKILL_SYMBOL_PAY) / 20));
    expect(finalMultiplier(outcome!)).toBe(round.total_mul);
  });

  it('female skill selects 1, 2-5 and 6 multiplier balls while keeping refill complete', () => {
    const tiers = new Set<'single' | 'middle' | 'max'>();
    for (let nonce = 0; nonce < 2_000 && tiers.size < 3; nonce += 1) {
      const outcome = seth2SpinForFactor(
        'female-skill-levels',
        'client',
        nonce,
        BET,
        205,
        'awakening_free',
      );
      const round = outcome.returnData.list[0]!;
      if (!round.remove_type.includes(18)) continue;
      const locked = outcome.returnData.type18_start_mul_list;
      tiers.add(locked.length === 1 ? 'single' : locked.length === 6 ? 'max' : 'middle');
      const available = round.start_data
        .filter((current) => current.type === 10)
        .map((current) => current.mul);
      for (const selected of locked) {
        expect(isSeth2MultiplierValue(selected.mul)).toBe(true);
        const index = available.indexOf(selected.mul);
        expect(index).toBeGreaterThanOrEqual(0);
        available.splice(index, 1);
      }
      expect(outcome.returnData.type18_mul_count).toBe(1);
      expect(round.round_data).toHaveLength(removedCellCount(outcome));
      expect(round.scoreList[1]).toBe(money((BET * SETH2_SKILL_SYMBOL_PAY) / 20));
      expect(finalMultiplier(outcome)).toBe(round.total_mul);
    }
    expect(tiers).toEqual(new Set(['single', 'middle', 'max']));
  });

  it('limits both character skills to awakening mode', () => {
    for (const mode of ['base', 'standard_free', 'bought_standard_free'] as const) {
      for (let nonce = 0; nonce < 100; nonce += 1) {
        const outcome = seth2SpinForFactor('no-awakening-skill', 'client', nonce, BET, 205, mode);
        expect(outcome.returnData.list[0]!.remove_type).not.toContain(17);
        expect(outcome.returnData.list[0]!.remove_type).not.toContain(18);
      }
    }
  });

  it.each([
    [20, 14, 2],
    [45, 13, 3],
    [100, 12, 4],
    [500, 11, 5],
  ] as const)('maps a %sx base win to the original JP tier', (factor, type, count) => {
    const outcome = seth2SpinForFactor('jackpots', 'client', factor, BET, factor, 'base');
    expect(outcome.returnData.JPtype).toBe(type);
    expect(outcome.returnData.JPGold).toBe(money(BET * factor));
    expect(
      outcome.returnData.list[0]!.start_data.filter((current) => current.type === type),
    ).toHaveLength(count);
  });

  it('collects a saved free-game multiplier only when the current winning board has a ball', () => {
    let withoutBank: Seth2Outcome | undefined;
    let nonce = 0;
    for (; nonce < 10_000; nonce += 1) {
      const candidate = seth2Spin('free-bank-natural', 'client', nonce, BET, 'standard_free');
      if (candidate.returnData.score > 0 && finalMultiplier(candidate) > 0) {
        withoutBank = candidate;
        break;
      }
    }
    expect(withoutBank).toBeDefined();

    const bank = 25;
    const withBank = seth2Spin('free-bank-natural', 'client', nonce, BET, 'standard_free', bank);
    const currentMultiplier = finalMultiplier(withoutBank!);
    expect(withBank.returnData.multiplierBankBefore).toBe(bank);
    expect(withBank.returnData.multiplierBankAdded).toBe(currentMultiplier);
    expect(withBank.returnData.multiplierBankAfter).toBe(bank + currentMultiplier);
    expect(finalMultiplier(withBank)).toBe(bank + currentMultiplier);
    expect(withBank.returnData.total_gold).toBe(
      money(withBank.returnData.score * (bank + currentMultiplier)),
    );
  });

  it('generates a controlled low win without showing or collecting a large saved multiplier', () => {
    const outcome = seth2SpinForFactor(
      'controlled-low-with-bank',
      'client',
      0,
      BET,
      2,
      'standard_free',
      40,
    );
    const round = outcome.returnData.list[0]!;
    expect(round.start_data.filter((current) => current.type === 10)).toHaveLength(0);
    expect(round.total_mul).toBe(0);
    expect(outcome.returnData.score).toBe(BET * 2);
    expect(outcome.returnData.total_gold).toBe(BET * 2);
    expect(outcome.returnData.multiplierBankBefore).toBe(40);
    expect(outcome.returnData.multiplierBankAdded).toBe(0);
    expect(outcome.returnData.multiplierBankAfter).toBe(40);
  });

  it('builds a controlled multiplier result whose animation already equals its final payout', () => {
    const outcome = seth2SpinForFactor(
      'controlled-win-with-bank',
      'client',
      7,
      BET,
      100,
      'standard_free',
      10,
    );
    const multiplier = finalMultiplier(outcome);
    expect(outcome.returnData.multiplierBankAdded).toBeGreaterThan(0);
    expect(outcome.returnData.list.at(-1)!.total_mul).toBe(multiplier);
    expect(outcome.returnData.total_gold).toBe(money(outcome.returnData.score * multiplier));
    expect(outcome.returnData.total_gold).toBe(BET * 100);
  });

  it('keeps raw scores, final multipliers and authoritative payouts mathematically consistent', () => {
    const modes: Seth2SpinMode[] = [
      'base',
      'standard_free',
      'awakening_free',
      'bought_standard_free',
    ];
    const factors = [0.5, 1, 2, 4, 5, 8, 10, 20, 45, 100, 205, 500, 2015, 5000, 81_000];
    for (const mode of modes) {
      for (const factor of factors) {
        for (let nonce = 0; nonce < 25; nonce += 1) {
          const outcome = seth2SpinForFactor(
            'settlement-contract',
            'client',
            nonce,
            BET,
            factor,
            mode,
          );
          const multiplier = finalMultiplier(outcome);
          const expectedTotal = money(outcome.returnData.score * (multiplier > 0 ? multiplier : 1));
          expect(outcome.returnData.total_gold).toBe(money(BET * factor));
          expect(expectedTotal).toBe(outcome.returnData.total_gold);
          expect(outcome.returnData.list[0]!.start_data).toHaveLength(SETH2_GRID_SIZE);
        }
      }
    }
  });
});
