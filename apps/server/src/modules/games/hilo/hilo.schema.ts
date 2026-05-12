import { z } from 'zod';
import { MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const hiloStartSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const hiloGuessSchema = z.object({
  roundId: z.string().min(1),
  guess: z.enum(['higher', 'lower']),
});

export const hiloSkipSchema = z.object({
  roundId: z.string().min(1),
});

export const hiloCashoutSchema = z.object({
  roundId: z.string().min(1),
});

export type HiLoStartInput = z.infer<typeof hiloStartSchema>;
export type HiLoGuessInput = z.infer<typeof hiloGuessSchema>;
export type HiLoCashoutInput = z.infer<typeof hiloCashoutSchema>;
