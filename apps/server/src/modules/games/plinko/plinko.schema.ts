import { z } from 'zod';
import { PLINKO_MIN_ROWS, PLINKO_MAX_ROWS } from '@bg/provably-fair';
import { MIN_BET_AMOUNT } from '@bg/shared';

export const plinkoBetSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(100000),
  rows: z.number().int().min(PLINKO_MIN_ROWS).max(PLINKO_MAX_ROWS),
  risk: z.enum(['low', 'medium', 'high']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type PlinkoBetInput = z.infer<typeof plinkoBetSchema>;
