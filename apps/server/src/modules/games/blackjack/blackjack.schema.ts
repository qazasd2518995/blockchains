import { z } from 'zod';
import { BLACKJACK_TABLE_IDS, MAX_BET_AMOUNT, MIN_BET_AMOUNT } from '@bg/shared';

export const blackjackTableIdSchema = z.enum(BLACKJACK_TABLE_IDS);

export const blackjackStartSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(MAX_BET_AMOUNT),
  tableId: blackjackTableIdSchema.default('royal'),
  clientSeed: z.string().min(4).max(64).optional(),
});

export const blackjackActionSchema = z.object({
  roundId: z.string().min(1),
  tableId: blackjackTableIdSchema.default('royal'),
});

export const blackjackActiveQuerySchema = z.object({
  tableId: blackjackTableIdSchema.default('royal'),
});

export type BlackjackStartInput = z.infer<typeof blackjackStartSchema>;
export type BlackjackActionInput = z.infer<typeof blackjackActionSchema>;
