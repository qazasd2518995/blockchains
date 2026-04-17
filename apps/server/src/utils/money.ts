import { Prisma } from '@prisma/client';

export type Money = Prisma.Decimal;

export function money(value: number | string): Money {
  return new Prisma.Decimal(value);
}

export function toMoneyString(value: Prisma.Decimal): string {
  return value.toFixed(2);
}

export function toMultiplierString(value: Prisma.Decimal | number): string {
  if (typeof value === 'number') return value.toFixed(4);
  return value.toFixed(4);
}
