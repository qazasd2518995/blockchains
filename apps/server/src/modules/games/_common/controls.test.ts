import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { GameId } from '@bg/shared';
import { isBurstControlEligible } from './controls.js';

const prediction = (multiplier: number) => ({
  multiplier: new Prisma.Decimal(multiplier),
});

describe('isBurstControlEligible', () => {
  it('keeps burst control enabled for high-volatility games', () => {
    expect(isBurstControlEligible(GameId.PLINKO, prediction(0))).toBe(true);
    expect(isBurstControlEligible(GameId.ROCKET, prediction(1))).toBe(true);
    expect(isBurstControlEligible(GameId.DRAGON_MEGA_SLOT, prediction(0))).toBe(true);
    expect(isBurstControlEligible(GameId.MINES, prediction(0))).toBe(true);
  });

  it('does not apply burst control to table and anti-wash roulette games', () => {
    expect(isBurstControlEligible(GameId.BLACKJACK, prediction(2.5))).toBe(false);
    expect(isBurstControlEligible(GameId.MINI_ROULETTE, prediction(12))).toBe(false);
    expect(isBurstControlEligible(GameId.CARNIVAL, prediction(12))).toBe(false);
  });

  it('only applies burst control to configurable games when the potential payout is high', () => {
    expect(isBurstControlEligible(GameId.DICE, prediction(10))).toBe(false);
    expect(isBurstControlEligible(GameId.DICE, prediction(24.125))).toBe(true);
    expect(
      isBurstControlEligible(GameId.WHEEL, prediction(0), { burstPotentialMultiplier: 19.3 }),
    ).toBe(false);
    expect(
      isBurstControlEligible(GameId.WHEEL, prediction(0), { burstPotentialMultiplier: 48.25 }),
    ).toBe(true);
  });

  it('allows individual game paths to explicitly opt in or out', () => {
    expect(
      isBurstControlEligible(GameId.MINI_ROULETTE, prediction(1), { burstEligible: true }),
    ).toBe(true);
    expect(isBurstControlEligible(GameId.PLINKO, prediction(100), { burstEligible: false })).toBe(
      false,
    );
  });
});
