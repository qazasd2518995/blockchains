import { Prisma } from '@prisma/client';
import { describe, expect, it } from 'vitest';
import { thor2ActionCostMultiplier, thor2Payout } from './thor2.economics.js';

describe('Thor 2 one-credit economics', () => {
  it('charges the observed feature prices from a base bet of 1', () => {
    const baseBet = new Prisma.Decimal(1);
    expect(baseBet.mul(thor2ActionCostMultiplier('spin')).toFixed(2)).toBe('1.00');
    expect(baseBet.mul(thor2ActionCostMultiplier('extra')).toFixed(2)).toBe('1.25');
    expect(baseBet.mul(thor2ActionCostMultiplier('regular')).toFixed(2)).toBe('100.00');
    expect(baseBet.mul(thor2ActionCostMultiplier('super')).toFixed(2)).toBe('500.00');
    expect(baseBet.mul(thor2ActionCostMultiplier('lucky')).toFixed(2)).toBe('4000.00');
  });

  it('settles from the base bet rather than the feature purchase cost', () => {
    expect(thor2Payout(new Prisma.Decimal(1), 29).toFixed(2)).toBe('29.00');
    expect(thor2Payout(new Prisma.Decimal(1), 2066.25).toFixed(2)).toBe('2066.25');
    expect(thor2Payout(new Prisma.Decimal(1), 25_000).toFixed(2)).toBe('25000.00');
  });
});
