import { Prisma } from '@prisma/client';
import { THOR2_BUY_COST_MULTIPLIERS, type Thor2SpinAction } from '@bg/shared';

export function thor2ActionCostMultiplier(action: Thor2SpinAction): number {
  if (action === 'regular' || action === 'super' || action === 'lucky') {
    return THOR2_BUY_COST_MULTIPLIERS[action];
  }
  return action === 'extra' ? 1.25 : 1;
}

export function thor2Payout(baseBet: Prisma.Decimal, totalMultiplier: number): Prisma.Decimal {
  return baseBet
    .mul(new Prisma.Decimal(totalMultiplier.toFixed(4)))
    .toDecimalPlaces(2, Prisma.Decimal.ROUND_DOWN);
}
