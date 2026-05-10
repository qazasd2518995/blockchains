import { z } from 'zod';
import { MIN_BET_AMOUNT } from '@bg/shared';

const rouletteAmountSchema = z.number().min(MIN_BET_AMOUNT).max(100000);
const rouletteBetItemSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('straight'),
    value: z.number().int().min(0).max(12),
    amount: rouletteAmountSchema,
  }),
  z.object({
    type: z.literal('column'),
    value: z.number().int().min(1).max(3),
    amount: rouletteAmountSchema,
  }),
  z.object({ type: z.literal('red'), value: z.never().optional(), amount: rouletteAmountSchema }),
  z.object({ type: z.literal('black'), value: z.never().optional(), amount: rouletteAmountSchema }),
  z.object({ type: z.literal('odd'), value: z.never().optional(), amount: rouletteAmountSchema }),
  z.object({ type: z.literal('even'), value: z.never().optional(), amount: rouletteAmountSchema }),
  z.object({ type: z.literal('low'), value: z.never().optional(), amount: rouletteAmountSchema }),
  z.object({ type: z.literal('high'), value: z.never().optional(), amount: rouletteAmountSchema }),
]);

export const rouletteBetSchema = z.object({
  bets: z.array(rouletteBetItemSchema).min(1).max(10),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type RouletteBetInput = z.infer<typeof rouletteBetSchema>;
