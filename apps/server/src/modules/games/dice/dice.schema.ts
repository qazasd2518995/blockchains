import { z } from 'zod';
import { DICE_MIN_TARGET, DICE_MAX_TARGET } from '@bg/provably-fair';

export const diceBetSchema = z.object({
  amount: z.number().positive().max(100000),
  target: z.number().min(DICE_MIN_TARGET).max(DICE_MAX_TARGET),
  direction: z.enum(['under', 'over']),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type DiceBetInput = z.infer<typeof diceBetSchema>;
