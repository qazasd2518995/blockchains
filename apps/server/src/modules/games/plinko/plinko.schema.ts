import { z } from 'zod';
import { PLINKO_MIN_ROWS, PLINKO_MAX_ROWS } from '@bg/provably-fair';
import { MAX_BET_AMOUNT, MIN_BET_AMOUNT, PLINKO_MAX_BALLS } from '@bg/shared';

export const plinkoBetSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  rows: z.number().int().min(PLINKO_MIN_ROWS).max(PLINKO_MAX_ROWS),
  risk: z.enum(['low', 'medium', 'high']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const plinkoBatchBetSchema = plinkoBetSchema.extend({
  balls: z.number().int().min(1).max(PLINKO_MAX_BALLS),
});

export type PlinkoBetInput = z.infer<typeof plinkoBetSchema>;
export type PlinkoBatchBetInput = z.infer<typeof plinkoBatchBetSchema>;
