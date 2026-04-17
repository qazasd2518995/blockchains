import { z } from 'zod';
import { PLINKO_MIN_ROWS, PLINKO_MAX_ROWS } from '@bg/provably-fair';

export const plinkoBetSchema = z.object({
  amount: z.number().positive().max(100000),
  rows: z.number().int().min(PLINKO_MIN_ROWS).max(PLINKO_MAX_ROWS),
  risk: z.enum(['low', 'medium', 'high']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type PlinkoBetInput = z.infer<typeof plinkoBetSchema>;
