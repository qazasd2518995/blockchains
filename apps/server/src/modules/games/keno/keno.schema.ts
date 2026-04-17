import { z } from 'zod';
import { KENO_POOL_SIZE, KENO_MIN_PICKS, KENO_MAX_PICKS } from '@bg/provably-fair';

export const kenoBetSchema = z.object({
  amount: z.number().positive().max(100000),
  selected: z
    .array(z.number().int().min(1).max(KENO_POOL_SIZE))
    .min(KENO_MIN_PICKS)
    .max(KENO_MAX_PICKS),
  risk: z.enum(['low', 'medium', 'high']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type KenoBetInput = z.infer<typeof kenoBetSchema>;
