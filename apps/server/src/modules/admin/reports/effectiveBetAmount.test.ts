import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { GameId } from '@bg/shared';
import {
  calculateRouletteEffectiveTurnover,
  effectiveBetAmountForReport,
} from './effectiveBetAmount.js';

describe('calculateRouletteEffectiveTurnover', () => {
  it('removes matched odd/even turnover from valid amount', () => {
    const effective = calculateRouletteEffectiveTurnover([
      { type: 'odd', amount: 10 },
      { type: 'even', amount: 10 },
    ]);

    expect(effective.toFixed(2)).toBe('0.00');
  });

  it('keeps only unmatched exposure when opposite bets differ', () => {
    const effective = calculateRouletteEffectiveTurnover([
      { type: 'red', amount: 100 },
      { type: 'black', amount: 25 },
    ]);

    expect(effective.toFixed(2)).toBe('75.00');
  });

  it('removes all-column coverage from valid amount', () => {
    const effective = calculateRouletteEffectiveTurnover([
      { type: 'column', value: 1, amount: 50 },
      { type: 'column', value: 2, amount: 50 },
      { type: 'column', value: 3, amount: 50 },
    ]);

    expect(effective.toFixed(2)).toBe('0.00');
  });

  it('removes full straight-number coverage from valid amount', () => {
    const effective = calculateRouletteEffectiveTurnover(
      Array.from({ length: 13 }, (_, value) => ({
        type: 'straight',
        value,
        amount: 10,
      })),
    );

    expect(effective.toFixed(2)).toBe('0.00');
  });

  it('does not reduce ordinary one-sided bets', () => {
    const effective = calculateRouletteEffectiveTurnover([
      { type: 'straight', value: 7, amount: 10 },
      { type: 'high', amount: 20 },
    ]);

    expect(effective.toFixed(2)).toBe('30.00');
  });
});

describe('effectiveBetAmountForReport', () => {
  it('uses stored roulette lines and clamps to the original amount', () => {
    const effective = effectiveBetAmountForReport({
      gameId: GameId.MINI_ROULETTE,
      amount: new Prisma.Decimal(20),
      resultData: {
        slot: 1,
        bets: [
          { type: 'low', amount: 10 },
          { type: 'high', amount: 10 },
        ],
      },
    });

    expect(effective.toFixed(2)).toBe('0.00');
  });

  it('leaves non-roulette games unchanged', () => {
    const effective = effectiveBetAmountForReport({
      gameId: GameId.PLINKO,
      amount: new Prisma.Decimal(20),
      resultData: null,
    });

    expect(effective.toFixed(2)).toBe('20.00');
  });
});
