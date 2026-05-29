import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { GameId } from '@bg/shared';
import {
  __controlsTestHooks,
  isBurstControlEligible,
  passesControlInterventionRate,
} from './controls.js';

const prediction = (multiplier: number) => ({
  multiplier: new Prisma.Decimal(multiplier),
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
