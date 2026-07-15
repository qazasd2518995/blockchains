import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rouletteEvaluate, type RouletteBet } from '@bg/provably-fair';
import { __rouletteServiceTestHooks } from './roulette.service.js';

describe('roulette controlled slot shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('prefers the half-back slot for the soft-loss band', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const bets: RouletteBet[] = [{ type: 'red', amount: 10 }];
    const amount = new Prisma.Decimal(10);
    const slot = __rouletteServiceTestHooks.chooseRouletteSlot(bets, 10, false, amount, {
      multiplier: new Prisma.Decimal(0),
    });

    expect(slot).toBe(0);
    expect(rouletteEvaluate(slot, bets).totalPayout).toBe(5);
  });

  it('still produces a full loss from the full-loss band', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.95).mockReturnValueOnce(0.2);

    const bets: RouletteBet[] = [{ type: 'red', amount: 10 }];
    const amount = new Prisma.Decimal(10);
    const slot = __rouletteServiceTestHooks.chooseRouletteSlot(bets, 10, false, amount, {
      multiplier: new Prisma.Decimal(0),
    });

    expect(slot).not.toBe(0);
    expect(rouletteEvaluate(slot, bets).totalPayout).toBe(0);
  });

  it('uses half-back loss shaping when a capped win has no legal slot', () => {
    vi.spyOn(Math, 'random').mockReturnValueOnce(0.1).mockReturnValueOnce(0.2);

    const bets: RouletteBet[] = [{ type: 'red', amount: 1000 }];
    const amount = new Prisma.Decimal(1000);
    const slot = __rouletteServiceTestHooks.chooseRouletteSlot(bets, 1000, true, amount, {
      multiplier: new Prisma.Decimal(1.01),
      maxPayout: new Prisma.Decimal(500),
    });

    expect(slot).toBe(0);
    expect(rouletteEvaluate(slot, bets).totalPayout).toBe(500);
  });
});
