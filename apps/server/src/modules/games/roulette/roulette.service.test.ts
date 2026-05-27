import { Prisma } from '@prisma/client';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { rouletteEvaluate, type RouletteBet } from '@bg/provably-fair';
import { __rouletteServiceTestHooks } from './roulette.service.js';

describe('roulette controlled slot shaping', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('varies controlled loss slots instead of always picking the softest loss', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0.01)
      .mockReturnValueOnce(0.99)
      .mockReturnValueOnce(0.45);

    const bets: RouletteBet[] = [{ type: 'red', amount: 10 }];
    const amount = new Prisma.Decimal(10);
    const picks = Array.from({ length: 3 }, () =>
      __rouletteServiceTestHooks.chooseRouletteSlot(bets, 10, false, amount, {
        multiplier: new Prisma.Decimal(0),
      }),
    );

    expect(new Set(picks).size).toBeGreaterThan(1);
    expect(picks.every((slot) => rouletteEvaluate(slot, bets).totalPayout < 10)).toBe(true);
  });
});
