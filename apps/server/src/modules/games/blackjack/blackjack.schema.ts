import { z } from 'zod';
import { MIN_BET_AMOUNT } from '@bg/shared';

export const blackjackStartSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(100000),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const blackjackActionSchema = z.object({
  roundId: z.string().min(1),
});

export type BlackjackStartInput = z.infer<typeof blackjackStartSchema>;
export type BlackjackActionInput = z.infer<typeof blackjackActionSchema>;
