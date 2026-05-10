import { z } from 'zod';
import { MIN_BET_AMOUNT } from '@bg/shared';

export const wheelBetSchema = z.object({
  amount: z.number().min(MIN_BET_AMOUNT).max(100000),
  risk: z.enum(['low', 'medium', 'high']),
  segments: z.union([z.literal(10), z.literal(20), z.literal(30), z.literal(40), z.literal(50)]),
  clientSeed: z.string().min(4).max(64).optional(),
});

export type WheelBetInput = z.infer<typeof wheelBetSchema>;
